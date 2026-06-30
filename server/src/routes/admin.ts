import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ok } from "../lib/http";
import { audit } from "../lib/audit";
import { authenticate, requirePermission } from "../middleware/auth";
import { runReminderSweep } from "../services/reminders";
import { sendTestEmail, getEmailOutbox } from "../lib/email";
import { getPushOutbox } from "../lib/push";

const router = Router();
router.use(authenticate);

// Manually trigger the approval-reminder sweep (also runs on a schedule).
router.post(
  "/run-reminders",
  requirePermission("MANAGE_SETTINGS"),
  asyncHandler(async (req, res) => {
    const sent = await runReminderSweep();
    await audit({ actorId: req.user!.id, action: "RUN_REMINDERS", detail: `${sent} sent` });
    ok(res, { sent });
  }),
);

// Send a test email to verify SMTP configuration.
router.post(
  "/test-email",
  requirePermission("MANAGE_SETTINGS"),
  asyncHandler(async (req, res) => {
    const { to } = z.object({ to: z.string().email() }).parse(req.body);
    // Throws (→ 4xx/5xx with the real SMTP error) if delivery genuinely fails.
    const { simulated } = await sendTestEmail(to);
    await audit({ actorId: req.user!.id, action: "TEST_EMAIL", detail: `${to}${simulated ? " (simulated)" : ""}` });
    ok(res, { sent: true, simulated, outbox: getEmailOutbox().slice(0, 5) });
  }),
);

// Inspect captured/sent email + push (for testing & monitoring).
router.get(
  "/outbox",
  requirePermission("VIEW_REPORTS"),
  asyncHandler(async (_req, res) => {
    ok(res, { emails: getEmailOutbox(), push: getPushOutbox() });
  }),
);

export default router;
