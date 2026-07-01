import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { hashPassword, signToken, verifyPassword } from "../lib/auth";
import { asyncHandler, badRequest, ok, unauthorized } from "../lib/http";
import { audit } from "../lib/audit";
import { authenticate } from "../middleware/auth";
import { parsePermissions } from "../constants";
import { getSettings, num, validatePassword } from "../lib/settings";
import { sendEmail } from "../lib/email";

const router = Router();

// Throttle login attempts per IP to blunt brute-force / credential-stuffing.
// (Per-account lockout below is the primary control; this is a coarse IP net.)
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: Number(process.env.AUTH_RATE_MAX) || 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait a minute and try again." },
});

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const settings = await getSettings();
    const maxFail = num(settings["security.maxFailedLogins"], 5);
    const lockMin = num(settings["security.lockoutMinutes"], 15);

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: email.toLowerCase() }, { username: email }] },
      include: { role: true },
    });

    // Account temporarily locked from prior failures.
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      await audit({ actorId: user.id, action: "FAILED_LOGIN", entity: "User", entityId: user.id, detail: "locked", ip: req.ip });
      throw unauthorized("Account temporarily locked due to failed attempts. Try again later.");
    }

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      if (user) {
        const count = user.failedLoginCount + 1;
        const locking = count >= maxFail;
        await prisma.user.update({
          where: { id: user.id },
          data: locking
            ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + lockMin * 60_000) }
            : { failedLoginCount: count },
        });
        if (locking) {
          await audit({ actorId: user.id, action: "ACCOUNT_LOCKED", entity: "User", entityId: user.id, detail: `after ${maxFail} failures`, ip: req.ip });
        }
      }
      await audit({ actorId: user?.id ?? null, action: "FAILED_LOGIN", entity: "User", entityId: user?.id, detail: email, ip: req.ip });
      throw unauthorized("Invalid email or password");
    }
    if (!user.isActive) {
      await audit({ actorId: user.id, action: "FAILED_LOGIN", entity: "User", entityId: user.id, detail: "inactive account", ip: req.ip });
      throw unauthorized("Account is deactivated");
    }

    // Success — reset failure counters.
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
    await audit({ actorId: user.id, action: "LOGIN", entity: "User", entityId: user.id, ip: req.ip });

    const token = signToken({ sub: user.id, email: user.email, role: user.role?.name });
    ok(res, {
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role?.name ?? null,
        permissions: parsePermissions(user.role?.permissions),
      },
    });
  }),
);

// ── Email OTP login ──────────────────────────────────────────────────────
// One-time codes are kept in-memory (single-instance desktop/server). Requires
// SMTP to be configured (Settings → Email) so the code can actually be sent.
const otpStore = new Map<string, { code: string; expires: number; attempts: number }>();

const userResponse = (user: any) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  role: user.role?.name ?? null,
  permissions: parsePermissions(user.role?.permissions),
});

router.post(
  "/request-otp",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const key = email.toLowerCase();
    const user = await prisma.user.findFirst({ where: { email: key } });
    // Only send when the email is registered & active — but always respond the
    // same way so the endpoint can't be used to enumerate accounts.
    if (user && user.isActive) {
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      otpStore.set(key, { code, expires: Date.now() + 10 * 60_000, attempts: 0 });
      await sendEmail(
        user.email,
        "Your eSign MICO360 login code",
        `<p>Your one-time login code is <b style="font-size:22px;letter-spacing:2px">${code}</b>.</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
      );
      await audit({ actorId: user.id, action: "OTP_REQUESTED", entity: "User", entityId: user.id });
    }
    ok(res, { sent: true, message: "If that email is registered, a login code has been sent." });
  }),
);

router.post(
  "/verify-otp",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, otp } = z.object({ email: z.string().email(), otp: z.string().min(4).max(8) }).parse(req.body);
    const key = email.toLowerCase();
    const rec = otpStore.get(key);
    if (!rec || rec.expires < Date.now()) { otpStore.delete(key); throw unauthorized("Code expired or not requested. Please request a new code."); }
    rec.attempts += 1;
    if (rec.attempts > 5) { otpStore.delete(key); throw unauthorized("Too many attempts. Please request a new code."); }
    if (rec.code !== otp.trim()) throw unauthorized("Incorrect code. Please try again.");
    otpStore.delete(key);

    const user = await prisma.user.findFirst({ where: { email: key }, include: { role: true } });
    if (!user || !user.isActive) throw unauthorized("Account is not available.");
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null } });
    await audit({ actorId: user.id, action: "LOGIN_OTP", entity: "User", entityId: user.id });
    const token = signToken({ sub: user.id, email: user.email, role: user.role?.name });
    ok(res, { token, user: userResponse(user) });
  }),
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        role: true,
        profileLinks: { include: { profile: true } },
      },
    });
    if (!user) throw unauthorized();
    ok(res, {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role?.name ?? null,
      permissions: parsePermissions(user.role?.permissions),
      hasSignature: !!user.signatureImg,
      profiles: user.profileLinks.map((l) => ({ id: l.profile.id, name: l.profile.name, isActive: l.profile.isActive })),
    });
  }),
);

const changePwSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

router.post(
  "/change-password",
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePwSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw badRequest("Current password is incorrect");
    }
    validatePassword(newPassword, await getSettings());
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
    await audit({ actorId: user.id, action: "CHANGE_PASSWORD", entity: "User", entityId: user.id });
    ok(res, { success: true });
  }),
);

export default router;
