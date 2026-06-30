import { Router } from "express";
import { z } from "zod";
import { APPROVAL_MODES } from "../constants";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound, ok } from "../lib/http";
import { audit } from "../lib/audit";
import { authenticate, requirePermission } from "../middleware/auth";

const router = Router();
router.use(authenticate, requirePermission("MANAGE_SIGNATURE_GROUPS"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const profileId = req.query.profileId as string | undefined;
    const groups = await prisma.signatureGroup.findMany({
      where: profileId ? { profileId } : undefined,
      orderBy: { name: "asc" },
      include: {
        profile: { select: { id: true, name: true } },
        members: { orderBy: { order: "asc" }, include: { user: { select: { id: true, fullName: true, email: true } } } },
      },
    });
    ok(res, groups);
  }),
);

const memberSchema = z.object({ userId: z.string(), order: z.number().int().min(1).default(1) });
const upsertSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  profileId: z.string(),
  approvalMode: z.enum(APPROVAL_MODES).default("SEQUENTIAL"),
  members: z.array(memberSchema).default([]),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = upsertSchema.parse(req.body);
    const group = await prisma.signatureGroup.create({
      data: {
        name: body.name,
        description: body.description,
        profileId: body.profileId,
        approvalMode: body.approvalMode,
        members: { create: body.members.map((m) => ({ userId: m.userId, order: m.order })) },
      },
      include: { members: true },
    });
    await audit({ actorId: req.user!.id, action: "CREATE_SIGNATURE_GROUP", entity: "SignatureGroup", entityId: group.id, detail: group.name });
    ok(res, group);
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = upsertSchema.partial().parse(req.body);
    const group = await prisma.signatureGroup.update({
      where: { id: req.params.id },
      data: {
        name: body.name,
        description: body.description,
        approvalMode: body.approvalMode,
        ...(body.members
          ? {
              members: {
                deleteMany: {},
                create: body.members.map((m) => ({ userId: m.userId, order: m.order })),
              },
            }
          : {}),
      },
      include: { members: true },
    });
    await audit({ actorId: req.user!.id, action: "UPDATE_SIGNATURE_GROUP", entity: "SignatureGroup", entityId: group.id });
    ok(res, group);
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const group = await prisma.signatureGroup.findUnique({ where: { id: req.params.id } });
    if (!group) throw notFound("Signature group not found");
    await prisma.signatureGroup.delete({ where: { id: req.params.id } });
    await audit({ actorId: req.user!.id, action: "DELETE_SIGNATURE_GROUP", entity: "SignatureGroup", entityId: req.params.id });
    ok(res, { success: true });
  }),
);

export default router;
