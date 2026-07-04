import { prisma } from "../lib/prisma";
import { getSettings, num } from "../lib/settings";
import { sendEmail } from "../lib/email";

// Document states in which a signatory still has an outstanding action.
const PENDING_STATES = ["PENDING_APPROVAL", "PARTIALLY_APPROVED", "PENDING_SIGNATURE"];

const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
const fmtDate = (d: Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const daysSince = (d: Date, now: number) => Math.max(0, Math.floor((now - new Date(d).getTime()) / 86_400_000));

const PRI_RANK: Record<string, number> = { CRITICAL: 0, URGENT: 1, NORMAL: 2 };
const PRI_COLOR: Record<string, string> = { CRITICAL: "#b3261e", URGENT: "#c77700" };

export interface Item { title: string; company: string; stage: string; priority: string; dueDate: Date | null; overdue: boolean; waitingDays: number; }

/** Build the reminder digest email (pure — no DB/IO), so it can be unit-tested. */
export function buildDigest(fullName: string, items: Item[]): { subject: string; html: string; overdue: number } {
  // Triage order: overdue first, then higher priority, then longest waiting.
  const sorted = [...items].sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      (PRI_RANK[a.priority] ?? 2) - (PRI_RANK[b.priority] ?? 2) ||
      b.waitingDays - a.waitingDays,
  );
  const n = sorted.length;
  const overdue = sorted.filter((i) => i.overdue).length;
  const cell = "padding:8px 10px;border-bottom:1px solid #eee";
  const th = "padding:6px 10px;border-bottom:2px solid #ddd";

  const rows = sorted
    .map((i) => {
      const pri =
        i.priority !== "NORMAL"
          ? `<span style="color:${PRI_COLOR[i.priority] || "#6a6c6a"};font-weight:600">${esc(i.priority)}</span>`
          : `<span style="color:#8a8c8a">Normal</span>`;
      const due = i.dueDate
        ? i.overdue
          ? `<span style="color:#b3261e;font-weight:600">⚠ Overdue (due ${fmtDate(i.dueDate)})</span>`
          : `Due ${fmtDate(i.dueDate)}`
        : `<span style="color:#8a8c8a">—</span>`;
      return (
        `<tr>` +
        `<td style="${cell}"><b>${esc(i.title)}</b></td>` +
        `<td style="${cell}">${esc(i.company)}</td>` +
        `<td style="${cell}">${esc(i.stage)}</td>` +
        `<td style="${cell}">${pri}</td>` +
        `<td style="${cell}">${i.waitingDays} day${i.waitingDays === 1 ? "" : "s"}</td>` +
        `<td style="${cell}">${due}</td>` +
        `</tr>`
      );
    })
    .join("");

  const subject = `You have ${n} document${n === 1 ? "" : "s"} awaiting your action${overdue ? ` (${overdue} overdue)` : ""}`;
  const html =
    `<p>Hello ${esc(fullName)},</p>` +
    `<p>You have <b>${n}</b> document${n === 1 ? "" : "s"} waiting for you in <b>eSign MICO360</b>` +
    `${overdue ? `, including <b style="color:#b3261e">${overdue} overdue</b>` : ""}:</p>` +
    `<table style="border-collapse:collapse;width:100%;font-size:14px">` +
    `<thead><tr style="text-align:left;color:#6a6c6a;font-size:11px;text-transform:uppercase;letter-spacing:.04em">` +
    `<th style="${th}">Document</th><th style="${th}">Company</th><th style="${th}">Stage</th>` +
    `<th style="${th}">Priority</th><th style="${th}">Waiting</th><th style="${th}">Due</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>` +
    `<p style="margin-top:14px">Please open eSign MICO360 to review and act on ${n === 1 ? "it" : "them"}.</p>` +
    `<p style="color:#8a8c8a;font-size:12px">You're receiving this because pending-item reminders are enabled. ` +
    `You can change how often you're reminded — or turn this off — under <b>My Account</b>.</p>`;
  return { subject, html, overdue };
}

/**
 * Email each user a digest of ALL documents still awaiting their action, at the
 * frequency they (or the admin) configured.
 *
 *  - reminders.enabled ......... master on/off (admin)
 *  - reminders.frequencyDays ... default days between reminders (admin)
 *  - User.reminderFreqDays ..... per-user override: null = use default, 0 = off, N = every N days
 *  - User.lastReminderAt ....... throttles so each user is reminded at most once per window
 *
 * Actual email delivery still depends on notifications.email + a configured
 * provider (otherwise sendEmail captures to the outbox for inspection/testing).
 * Returns the number of users reminded.
 */
export async function runReminderSweep(): Promise<number> {
  const s = await getSettings();
  if (s["reminders.enabled"] !== "true") return 0;
  const globalFreq = num(s["reminders.frequencyDays"], 1);
  const now = Date.now();

  const steps = await prisma.approvalStep.findMany({
    where: { status: "PENDING", document: { status: { in: PENDING_STATES } } },
    include: {
      document: { select: { id: true, title: true, status: true, priority: true, dueDate: true, profile: { select: { name: true } } } },
      signatory: {
        select: { id: true, fullName: true, email: true, isActive: true, reminderFreqDays: true, lastReminderAt: true },
      },
    },
  });

  // Group the pending documents by the user who must act on them.
  const byUser = new Map<string, { user: (typeof steps)[number]["signatory"]; items: Item[] }>();
  for (const st of steps) {
    const u = st.signatory;
    if (!u || !u.isActive || !u.email) continue;
    const d = st.document;
    const dueDate = d.dueDate ? new Date(d.dueDate) : null;
    const item: Item = {
      title: d.title,
      company: d.profile?.name || "—",
      stage: d.status === "PENDING_SIGNATURE" ? "Signature" : "Approval",
      priority: d.priority || "NORMAL",
      dueDate,
      overdue: !!(dueDate && dueDate.getTime() < now),
      waitingDays: daysSince(st.createdAt, now),
    };
    const g = byUser.get(u.id) ?? { user: u, items: [] };
    g.items.push(item);
    byUser.set(u.id, g);
  }

  let sent = 0;
  for (const { user, items } of byUser.values()) {
    const eff = user.reminderFreqDays == null ? globalFreq : user.reminderFreqDays;
    if (eff <= 0) continue; // user (or default) opted out
    if (user.lastReminderAt && now - new Date(user.lastReminderAt).getTime() < eff * 86_400_000) continue; // not due yet

    const n = items.length;
    const { subject, html, overdue } = buildDigest(user.fullName, items);
    await sendEmail(user.email!, `[eSign MICO360] ${subject}`, html);

    // Also record an in-app notification linking to the pending queue.
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: "APPROVAL_REMINDER",
        title: subject,
        body: `You have ${n} pending document${n === 1 ? "" : "s"} to review${overdue ? ` (${overdue} overdue)` : ""}.`,
        link: "/documents?status=PENDING_APPROVAL",
      },
    });

    await prisma.user.update({ where: { id: user.id }, data: { lastReminderAt: new Date() } });
    sent++;
  }
  return sent;
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
