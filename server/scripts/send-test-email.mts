// Send a test email to any address using the configured provider.
//   npx tsx scripts/send-test-email.mts someone@example.com
import { sendTestEmail, getEmailOutbox, getEmailFailures } from "../src/lib/email";
import { prisma } from "../src/lib/prisma";

const to = process.argv[2];
if (!to) { console.error("usage: npx tsx scripts/send-test-email.mts <to>"); process.exit(1); }

async function main() {
  try {
    const r = await sendTestEmail(to);
    if (r.simulated) {
      console.log("❌ SIMULATED — no provider configured; nothing was sent.");
      process.exitCode = 1;
    } else {
      console.log(`✅ SENT via ${r.provider.toUpperCase()} to ${to}`);
      const last = getEmailOutbox()[0];
      console.log("outbox record:", JSON.stringify(last));
    }
  } catch (e: any) {
    console.error("FAILED:", e?.message || e);
    const f = getEmailFailures()[0];
    if (f) console.error("failure record:", JSON.stringify(f));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
main();
