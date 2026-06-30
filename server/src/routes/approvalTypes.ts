import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound, ok } from "../lib/http";
import { audit } from "../lib/audit";
import { authenticate, requirePermission } from "../middleware/auth";

// Named kinds of approval (Approved / Reviewed / Verified …). Anyone signed in
// can read them (requesters pick one, approvers map signatures to them);
// managing them requires MANAGE_SETTINGS.
const router = Router();
router.use(authenticate);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const types = await prisma.approvalType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
    ok(res, types);
  }),
);

const upsert = z.object({ name: z.string().min(2), description: z.string().optional() });

router.post(
  "/",
  requirePermission("MANAGE_SETTINGS"),
  asyncHandler(async (req, res) => {
    const body = upsert.parse(req.body);
    const t = await prisma.approvalType.create({ data: body });
    await audit({ actorId: req.user!.id, action: "CREATE_APPROVAL_TYPE", entity: "ApprovalType", entityId: t.id, detail: t.name });
    ok(res, t);
  }),
);

router.patch(
  "/:id",
  requirePermission("MANAGE_SETTINGS"),
  asyncHandler(async (req, res) => {
    const body = upsert.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
    const t = await prisma.approvalType.update({ where: { id: req.params.id }, data: body });
    await audit({ actorId: req.user!.id, action: "UPDATE_APPROVAL_TYPE", entity: "ApprovalType", entityId: t.id });
    ok(res, t);
  }),
);

router.delete(
  "/:id",
  requirePermission("MANAGE_SETTINGS"),
  asyncHandler(async (req, res) => {
    const t = await prisma.approvalType.findUnique({ where: { id: req.params.id } });
    if (!t) throw notFound("Approval type not found");
    await prisma.approvalType.update({ where: { id: req.params.id }, data: { isActive: false } });
    await audit({ actorId: req.user!.id, action: "DELETE_APPROVAL_TYPE", entity: "ApprovalType", entityId: req.params.id });
    ok(res, { success: true });
  }),
);

export default router;
