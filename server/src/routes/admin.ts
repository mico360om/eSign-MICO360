import { Router } from "express";
import { z } from "zod";
import { asyncHandler, badRequest, ok } from "../lib/http";
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
    let result: { simulated: boolean; provider: string };
    try {
      result = await sendTestEmail(to);
    } catch (e: any) {
      // Surface the real provider error (Mailjet/SMTP) to the admin.
      throw badRequest(String(e?.message || e || "Email send failed"));
    }
    await audit({ actorId: req.user!.id, action: "TEST_EMAIL", detail: `${to} via ${result.provider}${result.simulated ? " (simulated)" : ""}` });
    ok(res, { sent: true, simulated: result.simulated, provider: result.provider, outbox: getEmailOutbox().slice(0, 5) });
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
