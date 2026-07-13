import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, notFound, ok } from "../lib/http";
import { authenticate } from "../middleware/auth";

// Saved Documents-list filters, private to each user.
const router = Router();
router.use(authenticate);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const filters = await prisma.savedFilter.findMany({
      where: { userId: req.user!.id },
      orderBy: { name: "asc" },
    });
    ok(res, filters.map((f) => ({ id: f.id, name: f.name, query: safeParse(f.query) })));
  }),
);

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  query: z.record(z.string()).default({}),
});

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, query } = schema.parse(req.body);
    // Upsert by (user, name) so re-saving a filter of the same name updates it.
    const existing = await prisma.savedFilter.findFirst({ where: { userId: req.user!.id, name } });
    const data = { userId: req.user!.id, name, query: JSON.stringify(query) };
    const saved = existing
      ? await prisma.savedFilter.update({ where: { id: existing.id }, data })
      : await prisma.savedFilter.create({ data });
    ok(res, { id: saved.id, name: saved.name, query });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const f = await prisma.savedFilter.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!f) throw notFound("Saved filter not found");
    await prisma.savedFilter.delete({ where: { id: f.id } });
    ok(res, { deleted: true });
  }),
);

function safeParse(s: string): Record<string, string> {
  try { const v = JSON.parse(s); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}

export default router;
