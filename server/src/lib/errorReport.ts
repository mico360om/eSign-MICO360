import { prisma } from "./prisma";

export interface ErrorInput {
  source: "server" | "client" | "desktop";
  message: string;
  stack?: string | null;
  url?: string | null;
  method?: string | null;
  status?: number | null;
  userId?: string | null;
  userEmail?: string | null;
  userAgent?: string | null;
  appVersion?: string | null;
}

const trunc = (s: string | null | undefined, n: number) => (s ? String(s).slice(0, n) : null);

/**
 * Persist an auto-captured error report. Fire-and-forget: never throws into the
 * caller (an error logger must not itself break the request or crash the app).
 */
export async function recordError(input: ErrorInput): Promise<void> {
  try {
    await prisma.errorReport.create({
      data: {
        source: input.source,
        message: trunc(input.message, 2000) || "(no message)",
        stack: trunc(input.stack, 8000),
        url: trunc(input.url, 500),
        method: trunc(input.method, 10),
        status: input.status ?? null,
        userId: input.userId ?? null,
        userEmail: trunc(input.userEmail, 200),
        userAgent: trunc(input.userAgent, 400),
        appVersion: trunc(input.appVersion, 40),
      },
    });
    // Keep the table bounded — prune the oldest resolved rows past a soft cap.
    const total = await prisma.errorReport.count();
    if (total > 2000) {
      const old = await prisma.errorReport.findMany({
        where: { resolved: true },
        orderBy: { createdAt: "asc" },
        take: total - 2000,
        select: { id: true },
      });
      if (old.length) await prisma.errorReport.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    }
  } catch {
    /* never throw from the error logger */
  }
}
