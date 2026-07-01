import { Router } from "express";
import { asyncHandler, ok } from "../lib/http";
import { recordEmailFailure } from "../lib/email";

// Public webhooks (no auth — called by external providers).
const router = Router();

// Mailjet Event API (real-time notifications). Configure this URL in the Mailjet
// dashboard (Account → Event tracking). Mailjet POSTs an array of events (or a
// single event object). We record hard-failure events (bounce/blocked/spam) so
// the dashboard "failed email" metric reflects real deliverability.
//   Docs: https://dev.mailjet.com/email/guides/#event-api-real-time-notifications
// NOTE: the sender must be reachable from Mailjet — works for server
// deployments with a public URL, not for a localhost desktop install.
router.post(
  "/mailjet",
  asyncHandler(async (req, res) => {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    for (const e of events) {
      const type = String(e?.event || "").toLowerCase();
      const email = e?.email || "(unknown)";
      if (["bounce", "blocked", "spam"].includes(type)) {
        const reason = e?.error_related_to || e?.error || e?.comment || type;
        recordEmailFailure(email, `Mailjet ${type}`, String(reason));
      }
    }
    // Mailjet expects a 200 quickly.
    ok(res, { received: events.length });
  }),
);

export default router;
