import { NotificationType } from "../constants";
import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { sendEmail } from "./email";
import { sendPush } from "./push";

/**
 * Create an in-app notification and fan out to email (if enabled) and mobile
 * push (if the user registered a device). Email/push are best-effort.
 */
export async function notify(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}) {
  const n = await prisma.notification.create({ data: params });
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, email: true, pushToken: true },
    });
    if (user) {
      const s = await getSettings();
      if (s["notifications.email"] === "true" && user.email) {
        void sendEmail(user.email, `[eSign MICO360] ${params.title}`, `<p>${params.body ?? params.title}</p>`);
      }
      if (user.pushToken) void sendPush(user, params.title, params.body ?? "");
    }
  } catch {
    /* fan-out is best-effort */
  }
  return n;
}

export async function notifyMany(userIds: string[], params: Omit<Parameters<typeof notify>[0], "userId">) {
  const unique = [...new Set(userIds)];
  await Promise.all(unique.map((userId) => notify({ userId, ...params })));
}

/**
 * Notify a signatory and, if they are out-of-office with a delegate, also notify
 * the delegate (who is allowed to act on their behalf).
 */
export async function notifyWithDelegate(userId: string, params: Omit<Parameters<typeof notify>[0], "userId">) {
  await notify({ userId, ...params });
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { outOfOffice: true, delegateToId: true } });
  if (u?.outOfOffice && u.delegateToId) {
    await notify({ userId: u.delegateToId, ...params, title: `(Delegated) ${params.title}` });
  }
}
