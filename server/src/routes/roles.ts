import { Router } from "express";
import { z } from "zod";
import { PERMISSIONS, parsePermissions } from "../constants";
import { prisma } from "../lib/prisma";
import { asyncHandler, conflict, notFound, ok } from "../lib/http";
import { audit } from "../lib/audit";
import { authenticate, requirePermission } from "../middleware/auth";

const router = Router();
router.use(authenticate, requirePermission("MANAGE_ROLES"));

// Serialize a role row, exposing permissions as an array (stored as JSON text).
const present = (role: any) => ({ ...role, permissions: parsePermissions(role.permissions) });

router.get(
  "/permissions",
  asyncHandler(async (_req, res) => ok(res, PERMISSIONS)),
);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { users: true } } },
    });
    ok(res, roles.map(present));
  }),
);

const upsertSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  permissions: z.array(z.enum(PERMISSIONS)).default([]),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = upsertSchema.parse(req.body);
    const role = await prisma.role.create({
      data: { name: body.name, description: body.description, permissions: JSON.stringify(body.permissions) },
    });
    await audit({ actorId: req.user!.id, action: "CREATE_ROLE", entity: "Role", entityId: role.id, detail: role.name });
    ok(res, present(role));
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = upsertSchema.partial().parse(req.body);
    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: {
        name: body.name,
        description: body.description,
        ...(body.permissions ? { permissions: JSON.stringify(body.permissions) } : {}),
      },
    });
    await audit({ actorId: req.user!.id, action: "UPDATE_ROLE", entity: "Role", entityId: role.id });
    ok(res, present(role));
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const role = await prisma.role.findUnique({ where: { id: req.params.id }, include: { _count: { select: { users: true } } } });
    if (!role) throw notFound("Role not found");
    if (role.isSystem) throw conflict("Built-in roles cannot be deleted");
    if (role._count.users > 0) throw conflict("Reassign users before deleting this role");
    await prisma.role.delete({ where: { id: req.params.id } });
    await audit({ actorId: req.user!.id, action: "DELETE_ROLE", entity: "Role", entityId: req.params.id });
    ok(res, { success: true });
  }),
);

export default router;
