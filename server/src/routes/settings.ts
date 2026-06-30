import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { audit } from "../lib/audit";
import { authenticate, requirePermission } from "../middleware/auth";
import { DEFAULT_SETTINGS } from "../lib/settings";

const router = Router();
router.use(authenticate);

// Anyone authenticated may READ settings (clients need upload rules etc.).
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.systemSetting.findMany();
    const merged = { ...DEFAULT_SETTINGS };
    for (const r of rows) merged[r.key] = r.value;
    ok(res, merged);
  }),
);

// Updating requires MANAGE_SETTINGS.
router.put(
  "/",
  requirePermission("MANAGE_SETTINGS"),
  asyncHandler(async (req, res) => {
    const body = z.record(z.string(), z.string()).parse(req.body);
    await prisma.$transaction(
      Object.entries(body).map(([key, value]) =>
        prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } }),
      ),
    );
    await audit({ actorId: req.user!.id, action: "UPDATE_SETTINGS", entity: "SystemSetting" });
    ok(res, { success: true });
  }),
);

export default router;
