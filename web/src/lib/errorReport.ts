import { APP_INFO } from "../pages/legal/content";

// Client-side auto bug reporting. Sends crashes / unhandled errors to the server
// (public endpoint) so they can be reviewed later in the Error Log. Best-effort:
// never throws, and de-dupes bursts of the same message.
let lastKey = "";
let lastAt = 0;

export function reportClientError(message: string, stack?: string) {
  try {
    const key = String(message).slice(0, 120);
    const now = Date.now();
    if (key === lastKey && now - lastAt < 5000) return; // throttle duplicate bursts
    lastKey = key; lastAt = now;

    fetch("/api/error-reports/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        message: String(message || "Unknown error").slice(0, 2000),
        stack: stack ? String(stack).slice(0, 8000) : undefined,
        url: location.href,
        appVersion: APP_INFO.appVersion,
        userEmail: localStorage.getItem("userEmail") || undefined,
        userId: localStorage.getItem("userId") || undefined,
      }),
    }).catch(() => {});
  } catch {
    /* never throw from the reporter */
  }
}

// Attach global handlers once (unhandled errors + promise rejections).
export function installGlobalErrorReporting() {
  if ((window as any).__esignErrHooked) return;
  (window as any).__esignErrHooked = true;
  window.addEventListener("error", (e) => {
    reportClientError(e.message || String(e.error?.message || "window.onerror"), e.error?.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r: any = e.reason;
    reportClientError("Unhandled promise rejection: " + String(r?.message || r), r?.stack);
  });
}
