// One-time setup: configure Mailjet email sending (SMTP relay) and send a real
// test email to verify. Credentials land in the SystemSetting DB table (never
// in git). Re-run safe — it upserts.
//   npx tsx scripts/configure-mailjet.mts <apiKey> <secretKey> [fromEmail] [testTo]
import { prisma } from "../src/lib/prisma";
import { sendTestEmail } from "../src/lib/email";

const [apiKey, secretKey, fromEmail = "admin@mico360.com", testTo = "admin@mico360.com"] = process.argv.slice(2);
if (!apiKey || !secretKey) {
  console.error("usage: npx tsx scripts/configure-mailjet.mts <apiKey> <secretKey> [fromEmail] [testTo]");
  process.exit(1);
}

const settings: Record<string, string> = {
  // Master switch + provider: SMTP relay (user chose SMTP over the HTTPS API).
  "notifications.email": "true",
  "email.provider": "smtp",
  // Mailjet SMTP relay — username is the API key, password is the secret key.
  "smtp.host": "in-v3.mailjet.com",
  "smtp.port": "25",
  "smtp.secure": "false", // STARTTLS is negotiated automatically when offered
  "smtp.user": apiKey,
  "smtp.pass": secretKey,
  "smtp.from": `eSign MICO360 <${fromEmail}>`,
  // Also fill the Mailjet API keys so switching email.provider to "mailjet"
  // later (e.g. if the host blocks outbound SMTP) needs no re-entry.
  "mailjet.apiKey": apiKey,
  "mailjet.apiSecret": secretKey,
  "mailjet.fromEmail": fromEmail,
  "mailjet.fromName": "eSign MICO360",
};

async function main() {
  for (const [key, value] of Object.entries(settings))
    await prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  console.log(`Saved ${Object.entries(settings).length} settings (provider=smtp, host=in-v3.mailjet.com:25, from=${fromEmail}).`);

  console.log(`Sending a real test email to ${testTo} ...`);
  const r = await sendTestEmail(testTo);
  console.log(r.simulated
    ? "❌ UNEXPECTED: send was simulated — configuration did not take effect."
    : `✅ Test email SENT via ${r.provider.toUpperCase()} — check the ${testTo} inbox.`);
  await prisma.$disconnect();
  process.exit(r.simulated ? 1 : 0);
}
main().catch(async (e) => { console.error("FAILED:", e?.message || e); await prisma.$disconnect(); process.exit(1); });
