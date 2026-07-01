import nodemailer from "nodemailer";
import { getSettings, num } from "./settings";

// Recent emails (real or simulated) for inspection/testing via /api/admin/outbox.
const outbox: { to: string; subject: string; at: string; simulated: boolean; provider: string }[] = [];
export const getEmailOutbox = () => outbox.slice(-50).reverse();

// Failed email sends + Mailjet bounce/blocked events, surfaced on the dashboard.
const failures: { to: string; subject: string; at: string; error: string }[] = [];
export const getEmailFailures = () => failures.slice(-50).reverse();
export const getEmailFailureCount = () => failures.length;
export const recordEmailFailure = (to: string, subject: string, error: string) =>
  failures.push({ to, subject, at: new Date().toISOString(), error });

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
    outbox.push({ to, subject, at: new Date().toISOString(), simulated: !configured, provider: provider(s) });
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
  outbox.push({ to, subject: "eSign MICO360 — test email", at: new Date().toISOString(), simulated, provider: provider(s) });
  return { simulated, provider: provider(s) };
}
