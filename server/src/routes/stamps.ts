import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound, ok } from "../lib/http";
import { audit } from "../lib/audit";
import { authenticate, requirePermission } from "../middleware/auth";
import { stampUpload } from "../lib/upload";
import { rel } from "../lib/storage";

const router = Router();
router.use(authenticate);

// Listing is available to anyone authenticated (clients filter by profile);
// management actions require MANAGE_STAMPS.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const profileId = req.query.profileId as string | undefined;
    const stamps = await prisma.stamp.findMany({
      where: { isActive: true, ...(profileId ? { profileId } : {}) },
      orderBy: { name: "asc" },
      include: { profile: { select: { id: true, name: true } } },
    });
    ok(res, stamps);
  }),
);

router.post(
  "/",
  requirePermission("MANAGE_STAMPS"),
  stampUpload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("A stamp image (png/jpg) is required");
    const body = z.object({ name: z.string().min(2), profileId: z.string().optional() }).parse(req.body);
    const stamp = await prisma.stamp.create({
      data: { name: body.name, profileId: body.profileId || null, imagePath: rel(req.file.path) },
    });
    await audit({ actorId: req.user!.id, action: "CREATE_STAMP", entity: "Stamp", entityId: stamp.id, detail: stamp.name });
    ok(res, stamp);
  }),
);

router.patch(
  "/:id",
  requirePermission("MANAGE_STAMPS"),
  asyncHandler(async (req, res) => {
    const body = z.object({ name: z.string().optional(), profileId: z.string().nullable().optional(), isActive: z.boolean().optional() }).parse(req.body);
    const stamp = await prisma.stamp.update({ where: { id: req.params.id }, data: body });
    await audit({ actorId: req.user!.id, action: "UPDATE_STAMP", entity: "Stamp", entityId: stamp.id });
    ok(res, stamp);
  }),
);

router.delete(
  "/:id",
  requirePermission("MANAGE_STAMPS"),
  asyncHandler(async (req, res) => {
    await prisma.stamp.update({ where: { id: req.params.id }, data: { isActive: false } });
    await audit({ actorId: req.user!.id, action: "DELETE_STAMP", entity: "Stamp", entityId: req.params.id });
    ok(res, { success: true });
  }),
);

router.get(
  "/:id/usages",
  requirePermission("MANAGE_STAMPS"),
  asyncHandler(async (req, res) => {
    const stamp = await prisma.stamp.findUnique({ where: { id: req.params.id } });
    if (!stamp) throw notFound("Stamp not found");
    const usages = await prisma.stampUsage.findMany({
      where: { stampId: req.params.id },
      orderBy: { usedAt: "desc" },
      take: 100,
      include: { user: { select: { id: true, fullName: true } } },
    });
    ok(res, usages);
  }),
);

export default router;
