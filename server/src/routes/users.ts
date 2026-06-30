import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";
import { asyncHandler, notFound, ok } from "../lib/http";
import { audit } from "../lib/audit";
import { authenticate, requirePermission } from "../middleware/auth";
import { getSettings, validatePassword } from "../lib/settings";

const router = Router();
router.use(authenticate, requirePermission("MANAGE_USERS"));

const publicUser = {
  id: true,
  fullName: true,
  email: true,
  username: true,
  phone: true,
  isActive: true,
  department: true,
  designation: true,
  forcePasswordChange: true,
  createdAt: true,
  lastLoginAt: true,
  role: { select: { id: true, name: true } },
} as const;

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string)?.trim();
    const users = await prisma.user.findMany({
      where: q ? { OR: [{ fullName: { contains: q } }, { email: { contains: q } }] } : undefined,
      select: { ...publicUser, _count: { select: { profileLinks: true, uploads: true } } },
      orderBy: { createdAt: "desc" },
    });
    ok(res, users);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { ...publicUser, profileLinks: { include: { profile: { select: { id: true, name: true } } } } },
    });
    if (!user) throw notFound("User not found");
    ok(res, user);
  }),
);

const createSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  username: z.string().optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
  password: z.string().min(1),
  roleId: z.string().optional(),
  profileIds: z.array(z.string()).optional(),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    validatePassword(body.password, await getSettings());
    const user = await prisma.user.create({
      data: {
        fullName: body.fullName,
        email: body.email.toLowerCase(),
        username: body.username,
        phone: body.phone,
        department: body.department,
        designation: body.designation,
        passwordHash: await hashPassword(body.password),
        roleId: body.roleId,
        profileLinks: body.profileIds?.length
          ? { create: body.profileIds.map((profileId) => ({ profileId })) }
          : undefined,
      },
      select: publicUser,
    });
    await audit({ actorId: req.user!.id, action: "CREATE_USER", entity: "User", entityId: user.id, detail: user.email });
    ok(res, user);
  }),
);

const updateSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
  roleId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  forcePasswordChange: z.boolean().optional(),
});

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.params.id }, data: body, select: publicUser });
    await audit({ actorId: req.user!.id, action: "UPDATE_USER", entity: "User", entityId: user.id });
    ok(res, user);
  }),
);

router.post(
  "/:id/activate",
  asyncHandler(async (req, res) => {
    const active = req.body?.isActive !== false;
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: active }, select: publicUser });
    await audit({ actorId: req.user!.id, action: active ? "ACTIVATE_USER" : "DEACTIVATE_USER", entity: "User", entityId: user.id });
    ok(res, user);
  }),
);

router.post(
  "/:id/reset-password",
  asyncHandler(async (req, res) => {
    const newPassword = z.string().min(1).parse(req.body?.newPassword);
    validatePassword(newPassword, await getSettings());
    await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash: await hashPassword(newPassword), failedLoginCount: 0, lockedUntil: null } });
    await audit({ actorId: req.user!.id, action: "RESET_PASSWORD", entity: "User", entityId: req.params.id });
    ok(res, { success: true });
  }),
);

// Replace the user's profile assignments.
router.put(
  "/:id/profiles",
  asyncHandler(async (req, res) => {
    const profileIds = z.array(z.string()).parse(req.body?.profileIds ?? []);
    await prisma.$transaction([
      prisma.profileMember.deleteMany({ where: { userId: req.params.id } }),
      prisma.profileMember.createMany({
        data: profileIds.map((profileId) => ({ profileId, userId: req.params.id })),
      }),
    ]);
    await audit({ actorId: req.user!.id, action: "ASSIGN_PROFILES", entity: "User", entityId: req.params.id });
    ok(res, { profileIds });
  }),
);

router.get(
  "/:id/activity",
  asyncHandler(async (req, res) => {
    const logs = await prisma.auditLog.findMany({
      where: { actorId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    ok(res, logs);
  }),
);

export default router;
