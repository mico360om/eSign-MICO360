import { prisma } from "../lib/prisma";
import { getSettings, num } from "../lib/settings";
import { notify } from "../lib/notify";

/**
 * Notify signatories whose pending approvals have been waiting longer than
 * `notifications.reminderHours`. Each step is reminded at most once per window
 * (tracked by remindedAt). Returns the number of reminders sent.
 */
export async function runReminderSweep(): Promise<number> {
  const s = await getSettings();
  const hours = num(s["notifications.reminderHours"], 24);
  const cutoff = new Date(Date.now() - hours * 3_600_000);

  const steps = await prisma.approvalStep.findMany({
    where: {
      status: "PENDING",
      createdAt: { lte: cutoff },
      OR: [{ remindedAt: null }, { remindedAt: { lte: cutoff } }],
      document: { status: { in: ["PENDING_APPROVAL", "PARTIALLY_APPROVED"] } },
    },
    include: { document: { select: { id: true, title: true } } },
  });

  for (const st of steps) {
    await notify({
      userId: st.signatoryId,
      type: "APPROVAL_REMINDER",
      title: `Reminder: "${st.document.title}" awaits your approval`,
      body: "This document has been pending your approval. Please review it.",
      link: `/documents/${st.document.id}`,
    });
    await prisma.approvalStep.update({ where: { id: st.id }, data: { remindedAt: new Date() } });
  }
  return steps.length;
}

let timer: NodeJS.Timeout | undefined;
/** Run the reminder sweep periodically (idempotent — safe to call once per process). */
export function startReminderScheduler(intervalMs = 30 * 60_000) {
  if (timer) return;
  timer = setInterval(() => {
    runReminderSweep().catch(() => {});
  }, intervalMs);
  timer.unref?.();
}
