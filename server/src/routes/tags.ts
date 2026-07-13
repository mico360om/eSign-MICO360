import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, badRequest, ok } from "../lib/http";
import { authenticate, requirePermission } from "../middleware/auth";
import { audit } from "../lib/audit";

// Tags = folders/labels applied to documents. Definitions are org-wide.
const router = Router();
router.use(authenticate);

// List all tags with how many documents carry each.
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const tags = await prisma.tag.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { documents: true } } },
    });
    ok(res, tags.map((t) => ({ id: t.id, name: t.name, color: t.color, count: t._count.documents })));
  }),
);

const tagSchema = z.object({
  name: z.string().trim().min(1, "Tag name is required").max(40),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a #rrggbb hex").optional(),
});

// Any authenticated user can create a tag (they are lightweight labels).
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, color } = tagSchema.parse(req.body);
    const existing = await prisma.tag.findUnique({ where: { name } });
    if (existing) throw badRequest("A tag with that name already exists");
    const tag = await prisma.tag.create({ data: { name, color: color || "#8A1A1C" } });
    await audit({ actorId: req.user!.id, action: "TAG_CREATED", entity: "Tag", entityId: tag.id, detail: name });
    ok(res, tag);
  }),
);

// Deleting a tag definition (and unlinking it everywhere) needs settings rights.
router.delete(
  "/:id",
  requirePermission("MANAGE_SETTINGS"),
  asyncHandler(async (req, res) => {
    await prisma.tag.delete({ where: { id: req.params.id } });
    await audit({ actorId: req.user!.id, action: "TAG_DELETED", entity: "Tag", entityId: req.params.id });
    ok(res, { deleted: true });
  }),
);

export default router;
