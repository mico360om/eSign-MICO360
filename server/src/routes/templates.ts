import { Router } from "express";
import { z } from "zod";
import { APPROVAL_MODES } from "../constants";
import { prisma } from "../lib/prisma";
import { asyncHandler, forbidden, notFound, ok } from "../lib/http";
import { audit } from "../lib/audit";
import { authenticate, requirePermission } from "../middleware/auth";
import { userProfileIds } from "../services/access";

// Reusable signature-request presets, scoped to the user's profiles.
const router = Router();
router.use(authenticate);

const present = (t: any) => ({ ...t, signatoryIds: JSON.parse(t.signatoryIds || "[]") });

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const mine = await userProfileIds(req.user!.id);
    const profileId = req.query.profileId as string | undefined;
    const where = profileId ? { profileId, isActive: true } : { profileId: { in: mine }, isActive: true };
    const templates = await prisma.template.findMany({ where, include: { profile: { select: { id: true, name: true } } }, orderBy: { name: "asc" } });
    ok(res, templates.map(present));
  }),
);

const upsert = z.object({
  name: z.string().min(2),
  profileId: z.string(),
  titlePrefix: z.string().optional(),
  signatoryIds: z.array(z.string()).default([]),
  signatureGroupId: z.string().optional(),
  signatureMethod: z.enum(["IMAGE", "DIGITAL"]).default("IMAGE"),
  approvalMode: z.enum(APPROVAL_MODES).default("SEQUENTIAL"),
});

// Creating a template requires UPLOAD and membership in the target profile.
router.post(
  "/",
  requirePermission("UPLOAD"),
  asyncHandler(async (req, res) => {
    const body = upsert.parse(req.body);
    const mine = await userProfileIds(req.user!.id);
    if (!mine.includes(body.profileId)) throw forbidden("You are not assigned to this profile");
    const t = await prisma.template.create({
      data: {
        name: body.name,
        profileId: body.profileId,
        titlePrefix: body.titlePrefix,
        signatoryIds: JSON.stringify(body.signatoryIds),
        signatureGroupId: body.signatureGroupId,
        signatureMethod: body.signatureMethod,
        approvalMode: body.approvalMode,
        createdById: req.user!.id,
      },
    });
    await audit({ actorId: req.user!.id, action: "CREATE_TEMPLATE", entity: "Template", entityId: t.id, detail: t.name });
    ok(res, present(t));
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const t = await prisma.template.findUnique({ where: { id: req.params.id } });
    if (!t) throw notFound("Template not found");
    const canManage = req.user!.permissions.includes("MANAGE_PROFILES");
    if (t.createdById !== req.user!.id && !canManage) throw forbidden("You cannot delete this template");
    await prisma.template.update({ where: { id: req.params.id }, data: { isActive: false } });
    await audit({ actorId: req.user!.id, action: "DELETE_TEMPLATE", entity: "Template", entityId: req.params.id });
    ok(res, { success: true });
  }),
);

export default router;
