// Integration test for the pending-item email reminder sweep.
// Run: DATABASE_URL="<dev db>" npx tsx test/qa-reminders.mts
import { prisma } from "../src/lib/prisma";
import { runReminderSweep, buildDigest } from "../src/services/reminders";
import { getEmailOutbox } from "../src/lib/email";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗ FAIL:", m); } };
const setSetting = (key: string, value: string) =>
  prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } });

async function main() {
  console.log("\n== pending-item email reminder test ==\n");

  // ── Rich digest content (pure buildDigest) ──
  const dg = buildDigest("Jane Approver", [
    { title: "Late Contract", company: "Ops", stage: "Approval", priority: "URGENT", dueDate: new Date(Date.now() - 2 * 86400000), overdue: true, waitingDays: 5 },
    { title: "Normal Doc", company: "HR", stage: "Signature", priority: "NORMAL", dueDate: null, overdue: false, waitingDays: 1 },
  ]);
  ok(dg.subject.includes("2 documents") && dg.subject.includes("1 overdue"), `digest subject: "${dg.subject}"`);
  ok(dg.html.includes("Late Contract") && dg.html.includes("Ops") && dg.html.includes("URGENT"), "digest shows title, company, priority");
  ok(dg.html.includes("⚠ Overdue"), "digest flags overdue item");
  ok(dg.html.includes("Signature") && dg.html.includes("Approval"), "digest shows stage per item");
  ok(dg.html.includes("5 days"), "digest shows how long an item has waited");
  ok(dg.html.indexOf("Late Contract") < dg.html.indexOf("Normal Doc"), "overdue/urgent item is sorted first");

  // Reminders on, daily default, email delivery OFF → sendEmail captures to the outbox.
  // Remember the real value so a configured provider (e.g. Mailjet) is restored after.
  const prevEmail = (await prisma.systemSetting.findUnique({ where: { key: "notifications.email" } }))?.value ?? "false";
  await setSetting("reminders.enabled", "true");
  await setSetting("reminders.frequencyDays", "1");
  await setSetting("notifications.email", "false");

  // Seed an isolated scenario: a user with one document awaiting their action.
  const t = Date.now();
  const profile = await prisma.profile.create({ data: { name: `TestCo ${t}` } });
  const user = await prisma.user.create({ data: { fullName: "Test Approver", email: `rem_${t}@test.local`, passwordHash: "x" } });
  const doc = await prisma.document.create({ data: { title: `Pending Doc ${t}`, status: "PENDING_APPROVAL", priority: "URGENT", dueDate: new Date(Date.now() - 3 * 86400000), profileId: profile.id, uploadedById: user.id } });
  await prisma.approvalStep.create({ data: { documentId: doc.id, signatoryId: user.id, status: "PENDING" } });
  const mine = () => getEmailOutbox().filter((e) => e.to === user.email);

  // 1) First sweep → user gets a digest, lastReminderAt set, in-app notification created.
  const base = mine().length;
  const sent1 = await runReminderSweep();
  const after1 = mine();
  ok(after1.length === base + 1, `digest emailed to ${user.email} (sweep reminded ${sent1} user[s])`);
  ok(!!after1[0]?.subject?.includes("awaiting your action"), `subject: "${after1[0]?.subject}"`);
  ok(!!after1[0]?.subject?.includes("overdue"), "subject flags the overdue document");
  const u1 = await prisma.user.findUnique({ where: { id: user.id }, select: { lastReminderAt: true } });
  ok(!!u1?.lastReminderAt, "lastReminderAt recorded");
  ok((await prisma.notification.count({ where: { userId: user.id, type: "APPROVAL_REMINDER" } })) >= 1, "in-app reminder notification created");

  // 2) Immediate re-run → throttled (daily window not elapsed).
  await runReminderSweep();
  ok(mine().length === after1.length, "throttled: not reminded again within the window");

  // 3) Per-user OFF (reminderFreqDays=0) → skipped even when due.
  await prisma.user.update({ where: { id: user.id }, data: { reminderFreqDays: 0, lastReminderAt: null } });
  let c = mine().length;
  await runReminderSweep();
  ok(mine().length === c, "per-user OFF (0): opted-out user is not emailed");

  // 4) Custom weekly (7), last reminded 8 days ago → overdue → reminded.
  await prisma.user.update({ where: { id: user.id }, data: { reminderFreqDays: 7, lastReminderAt: new Date(Date.now() - 8 * 86400000) } });
  c = mine().length;
  await runReminderSweep();
  ok(mine().length === c + 1, "custom weekly frequency: reminded when overdue");

  // 5) Not yet due for a custom frequency (reminded 2 days ago, weekly) → skipped.
  await prisma.user.update({ where: { id: user.id }, data: { reminderFreqDays: 7, lastReminderAt: new Date(Date.now() - 2 * 86400000) } });
  c = mine().length;
  await runReminderSweep();
  ok(mine().length === c, "custom frequency not yet due: skipped");

  // 6) Master switch OFF → sweep sends nothing.
  await prisma.user.update({ where: { id: user.id }, data: { reminderFreqDays: null, lastReminderAt: null } });
  await setSetting("reminders.enabled", "false");
  c = mine().length;
  const sentOff = await runReminderSweep();
  ok(mine().length === c && sentOff === 0, "master switch OFF: nothing sent");

  // Cleanup
  await prisma.approvalStep.deleteMany({ where: { documentId: doc.id } });
  await prisma.notification.deleteMany({ where: { userId: user.id } });
  await prisma.document.delete({ where: { id: doc.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.profile.delete({ where: { id: profile.id } });
  await setSetting("reminders.enabled", "true"); // restore default
  await setSetting("notifications.email", prevEmail); // restore real email delivery (e.g. Mailjet)

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
