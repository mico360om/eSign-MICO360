import nodemailer from "nodemailer";
import { getSettings, num } from "./settings";

// Recent emails (real or simulated) for inspection/testing via /api/admin/outbox.
const outbox: { to: string; subject: string; at: string; simulated: boolean }[] = [];
export const getEmailOutbox = () => outbox.slice(-50).reverse();

function isConfigured(s: Record<string, string>) {
  return s["notifications.email"] === "true" && !!s["smtp.host"];
}

function transportFor(s: Record<string, string>) {
  if (isConfigured(s)) {
    return nodemailer.createTransport({
      host: s["smtp.host"],
      port: num(s["smtp.port"], 587),
      secure: s["smtp.secure"] === "true",
      auth: s["smtp.user"] ? { user: s["smtp.user"], pass: s["smtp.pass"] } : undefined,
    });
  }
  // Capturing transport: serializes the message instead of sending. Lets the
  // system run (and be tested) with no SMTP credentials configured.
  return nodemailer.createTransport({ jsonTransport: true });
}

// Failed email sends, surfaced on the dashboard ("Failed email notifications").
const failures: { to: string; subject: string; at: string; error: string }[] = [];
export const getEmailFailures = () => failures.slice(-50).reverse();
export const getEmailFailureCount = () => failures.length;

/** Send (or capture) an email. Never throws into the caller. */
export async function sendEmail(to: string, subject: string, html: string) {
  if (!to) return;
  try {
    const s = await getSettings();
    const simulated = !isConfigured(s);
    const from = s["smtp.from"] || "eSign MICO360 <noreply@mico360.com>";
    await transportFor(s).sendMail({ from, to, subject, html });
    outbox.push({ to, subject, at: new Date().toISOString(), simulated });
  } catch (e: any) {
    // Email failures must not break the workflow, but they are now recorded so
    // the dashboard "Failed email notifications" metric reflects reality.
    failures.push({ to, subject, at: new Date().toISOString(), error: String(e?.message || e) });
  }
}

/**
 * Test-send used by Settings → "Send test email". Unlike sendEmail() this
 * THROWS on a real SMTP failure (so the admin sees the actual error) and reports
 * whether the message was really sent or only simulated (no SMTP configured).
 */
export async function sendTestEmail(to: string): Promise<{ simulated: boolean }> {
  const s = await getSettings();
  const simulated = !isConfigured(s);
  const from = s["smtp.from"] || "eSign MICO360 <noreply@mico360.com>";
  const transport = transportFor(s);
  if (!simulated) await transport.verify(); // surfaces auth/host/port problems
  await transport.sendMail({
    from,
    to,
    subject: "eSign MICO360 — test email",
    html: "<p>This is a test email from <b>eSign MICO360</b>. If you received it, your SMTP settings are working.</p>",
  });
  outbox.push({ to, subject: "eSign MICO360 — test email", at: new Date().toISOString(), simulated });
  return { simulated };
}
