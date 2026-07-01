import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { audit } from "../lib/audit";
import { authenticate, requirePermission } from "../middleware/auth";
import { DEFAULT_SETTINGS } from "../lib/settings";

const router = Router();
router.use(authenticate);

// Keys that must never be sent to the client (the admin UI edits them blind via
// a "(unchanged)" placeholder, so their real value is never needed there either).
const SECRET_SETTING_KEYS = ["smtp.pass", "mailjet.apiSecret"];

// Anyone authenticated may READ settings (clients need upload rules, the idle
// auto-logout interval, etc.). Secret values are redacted.
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.systemSetting.findMany();
    const merged = { ...DEFAULT_SETTINGS };
    for (const r of rows) merged[r.key] = r.value;
    for (const k of SECRET_SETTING_KEYS) if (merged[k]) merged[k] = ""; // redact
    ok(res, merged);
  }),
);

// Updating requires MANAGE_SETTINGS.
router.put(
  "/",
  requirePermission("MANAGE_SETTINGS"),
  asyncHandler(async (req, res) => {
    const body = z.record(z.string(), z.string()).parse(req.body);
    // An empty secret (e.g. redacted smtp.pass sent back unchanged) means
    // "keep the existing value" — don't overwrite it with a blank.
    const entries = Object.entries(body).filter(([k, v]) => !(SECRET_SETTING_KEYS.includes(k) && v === ""));
    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } }),
      ),
    );
    await audit({ actorId: req.user!.id, action: "UPDATE_SETTINGS", entity: "SystemSetting" });
    ok(res, { success: true });
  }),
);

export default router;
