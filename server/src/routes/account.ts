import fs from "fs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound, ok } from "../lib/http";
import { audit } from "../lib/audit";
import { authenticate } from "../middleware/auth";
import { signatureUpload } from "../lib/upload";
import { abs, rel } from "../lib/storage";

// Self-service account settings (own profile / out-of-office / delegation / marks).
const router = Router();
router.use(authenticate);

// ── Own profile: any user (admin or not) can view & edit their own details ──
router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const u = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, fullName: true, email: true, phone: true, department: true, designation: true, reminderFreqDays: true, role: { select: { name: true } } },
    });
    if (!u) throw notFound("User not found");
    ok(res, u);
  }),
);

router.put(
  "/profile",
  asyncHandler(async (req, res) => {
    // Email and role stay admin-controlled; users edit their own personal fields.
    const body = z
      .object({
        fullName: z.string().min(1).optional(),
        phone: z.string().nullable().optional(),
        department: z.string().nullable().optional(),
        designation: z.string().nullable().optional(),
        // Reminder frequency: null = use system default, 0 = off, N = every N days.
        reminderFreqDays: z.number().int().min(0).max(365).nullable().optional(),
      })
      .parse(req.body);
    const u = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(body.fullName !== undefined ? { fullName: body.fullName.trim() } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.department !== undefined ? { department: body.department } : {}),
        ...(body.designation !== undefined ? { designation: body.designation } : {}),
        ...(body.reminderFreqDays !== undefined ? { reminderFreqDays: body.reminderFreqDays } : {}),
      },
      select: { id: true, fullName: true, email: true, phone: true, department: true, designation: true, reminderFreqDays: true },
    });
    await audit({ actorId: req.user!.id, action: "UPDATE_OWN_PROFILE", entity: "User", entityId: req.user!.id });
    ok(res, u);
  }),
);

router.get(
  "/availability",
  asyncHandler(async (req, res) => {
    const u = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { outOfOffice: true, delegateToId: true, delegateTo: { select: { id: true, fullName: true } } },
    });
    ok(res, u);
  }),
);

router.put(
  "/availability",
  asyncHandler(async (req, res) => {
    const body = z.object({ outOfOffice: z.boolean(), delegateToId: z.string().nullable().optional() }).parse(req.body);
    if (body.delegateToId === req.user!.id) throw badRequest("You cannot delegate to yourself");
    const u = await prisma.user.update({
      where: { id: req.user!.id },
      data: { outOfOffice: body.outOfOffice, delegateToId: body.delegateToId ?? null },
      select: { outOfOffice: true, delegateToId: true },
    });
    await audit({ actorId: req.user!.id, action: "SET_AVAILABILITY", entity: "User", entityId: req.user!.id, detail: body.outOfOffice ? "out-of-office" : "available" });
    ok(res, u);
  }),
);

// ── Saved marks: a reusable library of signature/initials images + settings ──

router.get(
  "/marks",
  asyncHandler(async (req, res) => {
    const marks = await prisma.savedMark.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "asc" } });
    ok(res, marks);
  }),
);

router.post(
  "/marks",
  signatureUpload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("An image (png/jpg) is required");
    const body = z
      .object({
        label: z.string().min(1).default("Signature"),
        kind: z.enum(["SIGNATURE", "INITIALS"]).default("SIGNATURE"),
        approvalTypeId: z.string().optional(),
        posX: z.coerce.number().min(0).max(1).optional(),
        posY: z.coerce.number().min(0).max(1).optional(),
        width: z.coerce.number().min(0.02).max(1).optional(),
        height: z.coerce.number().min(0.02).max(1).optional(),
      })
      .parse(req.body);
    const mark = await prisma.savedMark.create({
      data: {
        userId: req.user!.id,
        label: body.label,
        kind: body.kind,
        imagePath: rel(req.file.path),
        approvalTypeId: body.approvalTypeId || null,
        ...(body.posX !== undefined ? { posX: body.posX } : {}),
        ...(body.posY !== undefined ? { posY: body.posY } : {}),
        ...(body.width !== undefined ? { width: body.width } : {}),
        ...(body.height !== undefined ? { height: body.height } : {}),
      },
    });
    await audit({ actorId: req.user!.id, action: "CREATE_SAVED_MARK", entity: "SavedMark", entityId: mark.id, detail: mark.label });
    ok(res, mark);
  }),
);

// Update a saved mark's preconfigured settings (label / default position+size).
router.patch(
  "/marks/:id",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        label: z.string().min(1).optional(),
        approvalTypeId: z.string().nullable().optional(),
        posX: z.number().min(0).max(1).optional(),
        posY: z.number().min(0).max(1).optional(),
        width: z.number().min(0.02).max(1).optional(),
        height: z.number().min(0.02).max(1).optional(),
      })
      .parse(req.body);
    const owned = await prisma.savedMark.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!owned) throw notFound("Saved mark not found");
    const mark = await prisma.savedMark.update({ where: { id: req.params.id }, data: body });
    ok(res, mark);
  }),
);

router.delete(
  "/marks/:id",
  asyncHandler(async (req, res) => {
    const owned = await prisma.savedMark.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!owned) throw notFound("Saved mark not found");
    await prisma.savedMark.delete({ where: { id: req.params.id } });
    ok(res, { success: true });
  }),
);

// Stream a saved mark's image (own marks only) for the gallery preview.
router.get(
  "/marks/:id/image",
  asyncHandler(async (req, res) => {
    const mark = await prisma.savedMark.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!mark) throw notFound("Saved mark not found");
    const p = abs(mark.imagePath);
    if (!fs.existsSync(p)) throw notFound("Image missing on disk");
    res.sendFile(p);
  }),
);

export default router;
