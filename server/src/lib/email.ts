import nodemailer from "nodemailer";
import { getSettings, num } from "./settings";

/** Escape user-supplied text before interpolating it into email HTML. */
export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// In-memory logs are hard-capped so unauthenticated inputs (e.g. the Mailjet
// webhook) can't grow server memory without bound.
const MEM_LOG_CAP = 200;

// Recent emails (real or simulated) for inspection/testing via /api/admin/outbox.
const outbox: { to: string; subject: string; at: string; simulated: boolean; provider: string }[] = [];
export const getEmailOutbox = () => outbox.slice(-50).reverse();
const pushOutbox = (e: (typeof outbox)[number]) => {
  outbox.push(e);
  if (outbox.length > MEM_LOG_CAP) outbox.splice(0, outbox.length - MEM_LOG_CAP);
};

// Failed email sends + Mailjet bounce/blocked events, surfaced on the dashboard.
const failures: { to: string; subject: string; at: string; error: string }[] = [];
export const getEmailFailures = () => failures.slice(-50).reverse();
export const getEmailFailureCount = () => failures.length;
export const recordEmailFailure = (to: string, subject: string, error: string) => {
  failures.push({ to, subject, at: new Date().toISOString(), error });
  if (failures.length > MEM_LOG_CAP) failures.splice(0, failures.length - MEM_LOG_CAP);
};

function provider(s: Record<string, string>) {
  return (s["email.provider"] || "smtp").toLowerCase();
}

/** Is a real email transport configured (and notifications enabled)? */
function isConfigured(s: Record<string, string>) {
  if (s["notifications.email"] !== "true") return false;
  if (provider(s) === "mailjet") return !!(s["mailjet.apiKey"] && s["mailjet.apiSecret"] && s["mailjet.fromEmail"]);
  return !!s["smtp.host"];
}

// ── Mailjet Send API (v3.1) ────────────────────────────────────────────────
async function mailjetSend(s: Record<string, string>, to: string, subject: string, html: string) {
  const auth = Buffer.from(`${s["mailjet.apiKey"]}:${s["mailjet.apiSecret"]}`).toString("base64");
  const res = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      Messages: [
        {
          From: { Email: s["mailjet.fromEmail"], Name: s["mailjet.fromName"] || "eSign MICO360" },
          To: [{ Email: to }],
          Subject: subject,
          HTMLPart: html,
        },
      ],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mailjet ${res.status}: ${text.slice(0, 300)}`);
  let data: any; try { data = JSON.parse(text); } catch { data = null; }
  const status = data?.Messages?.[0]?.Status;
  if (status !== "success") throw new Error(`Mailjet send failed: ${JSON.stringify(data?.Messages?.[0]?.Errors || data || text.slice(0, 300))}`);
}

// ── SMTP (nodemailer) ──────────────────────────────────────────────────────
function smtpTransport(s: Record<string, string>) {
  return nodemailer.createTransport({
    host: s["smtp.host"],
    port: num(s["smtp.port"], 587),
    secure: s["smtp.secure"] === "true",
    auth: s["smtp.user"] ? { user: s["smtp.user"], pass: s["smtp.pass"] } : undefined,
    // Fail fast when the SMTP host is unreachable/blocked (e.g. outbound port 25
    // firewalled) instead of hanging the request for ~20s on the OS TCP timeout.
    connectionTimeout: num(s["smtp.timeoutMs"], 10000),
    greetingTimeout: num(s["smtp.timeoutMs"], 10000),
    socketTimeout: num(s["smtp.timeoutMs"], 15000),
  });
}

/** Deliver via the configured provider. Throws on failure. */
async function deliver(s: Record<string, string>, to: string, subject: string, html: string) {
  if (provider(s) === "mailjet") {
    await mailjetSend(s, to, subject, html);
  } else {
    const from = s["smtp.from"] || "eSign MICO360 <noreply@mico360.com>";
    await smtpTransport(s).sendMail({ from, to, subject, html });
  }
}

/** Send (or capture) an email. Never throws into the caller. */
export async function sendEmail(to: string, subject: string, html: string) {
  if (!to) return;
  const s = await getSettings();
  const configured = isConfigured(s);
  try {
    if (configured) {
      await deliver(s, to, subject, html);
    }
    // When not configured we "simulate": capture without sending, so the app
    // still runs (and is testable) without email credentials.
    pushOutbox({ to, subject, at: new Date().toISOString(), simulated: !configured, provider: provider(s) });
  } catch (e: any) {
    recordEmailFailure(to, subject, String(e?.message || e));
  }
}

/**
 * Test-send used by Settings → "Send test email". THROWS on a real failure so
 * the admin sees the actual provider error; reports whether it was really sent
 * or only simulated (no provider configured).
 */
export async function sendTestEmail(to: string): Promise<{ simulated: boolean; provider: string }> {
  const s = await getSettings();
  const simulated = !isConfigured(s);
  const html = `<p>This is a test email from <b>eSign MICO360</b> via <b>${provider(s).toUpperCase()}</b>. If you received it, your email settings are working.</p>`;
  if (!simulated) {
    if (provider(s) === "smtp") await smtpTransport(s).verify(); // surfaces auth/host/port problems
    await deliver(s, to, "eSign MICO360 — test email", html);
  }
  pushOutbox({ to, subject: "eSign MICO360 — test email", at: new Date().toISOString(), simulated, provider: provider(s) });
  return { simulated, provider: provider(s) };
}
