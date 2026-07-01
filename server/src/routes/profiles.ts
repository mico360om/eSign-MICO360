import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, notFound, ok } from "../lib/http";
import { audit } from "../lib/audit";
import { authenticate, requirePermission } from "../middleware/auth";
import { profileThumbUpload } from "../lib/upload";
import { rel } from "../lib/storage";

const router = Router();
router.use(authenticate, requirePermission("MANAGE_PROFILES"));

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const profiles = await prisma.profile.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { members: true, documents: true, signatureGroups: true } } },
    });
    ok(res, profiles);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const profile = await prisma.profile.findUnique({
      where: { id: req.params.id },
      include: {
        members: { include: { user: { select: { id: true, fullName: true, email: true, isActive: true } } } },
        signatureGroups: { select: { id: true, name: true, approvalMode: true } },
      },
    });
    if (!profile) throw notFound("Company not found");
    ok(res, profile);
  }),
);

const upsertSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = upsertSchema.parse(req.body);
    const profile = await prisma.profile.create({ data: body });
    await audit({ actorId: req.user!.id, action: "CREATE_PROFILE", entity: "Profile", entityId: profile.id, detail: profile.name });
    ok(res, profile);
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = upsertSchema.partial().parse(req.body);
    const profile = await prisma.profile.update({ where: { id: req.params.id }, data: body });
    await audit({ actorId: req.user!.id, action: "UPDATE_PROFILE", entity: "Profile", entityId: profile.id });
    ok(res, profile);
  }),
);

// Upload/replace the profile's thumbnail image.
router.post(
  "/:id/thumbnail",
  profileThumbUpload.single("image"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("An image (png/jpg) is required");
    const profile = await prisma.profile.update({ where: { id: req.params.id }, data: { thumbnailPath: rel(req.file.path) } });
    await audit({ actorId: req.user!.id, action: "SET_PROFILE_THUMBNAIL", entity: "Profile", entityId: profile.id });
    ok(res, profile);
  }),
);

// Replace the profile's member list.
router.put(
  "/:id/members",
  asyncHandler(async (req, res) => {
    const userIds = z.array(z.string()).parse(req.body?.userIds ?? []);
    await prisma.$transaction([
      prisma.profileMember.deleteMany({ where: { profileId: req.params.id } }),
      prisma.profileMember.createMany({
        data: userIds.map((userId) => ({ userId, profileId: req.params.id })),
      }),
    ]);
    await audit({ actorId: req.user!.id, action: "SET_PROFILE_MEMBERS", entity: "Profile", entityId: req.params.id });
    ok(res, { userIds });
  }),
);

export default router;
