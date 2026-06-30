// Mobile push via Firebase Cloud Messaging (FCM). Set FCM_SERVER_KEY to deliver
// to real devices; without it, pushes are captured for inspection/testing.
const pushOutbox: { userId: string; title: string; at: string; delivered: boolean }[] = [];
export const getPushOutbox = () => pushOutbox.slice(-50).reverse();

export async function sendPush(user: { id: string; pushToken?: string | null }, title: string, body: string) {
  if (!user?.pushToken) return;
  const key = process.env.FCM_SERVER_KEY;
  let delivered = false;
  if (key) {
    try {
      await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: { Authorization: `key=${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: user.pushToken, notification: { title, body }, priority: "high" }),
      });
      delivered = true;
    } catch {
      /* ignore delivery errors */
    }
  }
  pushOutbox.push({ userId: user.id, title, at: new Date().toISOString(), delivered });
}
