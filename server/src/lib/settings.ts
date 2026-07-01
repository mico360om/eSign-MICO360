import { prisma } from "./prisma";
import { badRequest } from "./http";

// System settings with sensible defaults (password policy, upload rules, etc.).
export const DEFAULT_SETTINGS: Record<string, string> = {
  // ── Password Policy ──────────────────────────────────────────────
  "password.minLength": "8",
  "password.requireNumber": "true",
  "password.requireUppercase": "true",
  "password.requireLowercase": "true",
  "password.requireSpecial": "false",
  "password.expiryDays": "0", // 0 = never
  // ── Upload Settings ──────────────────────────────────────────────
  "upload.maxFileSizeMb": "25",
  "upload.allowedExtensions": "pdf,doc,docx,xls,xlsx,ppt,pptx,png,jpg,jpeg,txt",
  "pdf.autoConvert": "true",
  // ── Signature & Stamp ────────────────────────────────────────────
  "signature.allowResize": "true",
  "signature.method": "IMAGE",
  // ── Approval Workflow ────────────────────────────────────────────
  "workflow.defaultMode": "SEQUENTIAL",
  "workflow.allowDownloadBeforeCompletion": "true",
  "workflow.watermarkUnsigned": "false",
  "workflow.documentRetentionDays": "0", // 0 = keep forever
  // ── Email Notifications ──────────────────────────────────────────
  "notifications.email": "false",
  "notifications.reminderHours": "24",
  "email.provider": "smtp", // "smtp" | "mailjet"
  "smtp.host": "",
  "smtp.port": "587",
  "smtp.secure": "false",
  "smtp.user": "",
  "smtp.pass": "",
  "smtp.from": "eSign MICO360 <noreply@mico360.com>",
  // Mailjet Send API (used when email.provider = "mailjet")
  "mailjet.apiKey": "",
  "mailjet.apiSecret": "",
  "mailjet.fromEmail": "",
  "mailjet.fromName": "eSign MICO360",
  // ── Security ─────────────────────────────────────────────────────
  "security.maxFailedLogins": "5",
  "security.lockoutMinutes": "15",
  "security.sessionTimeoutMinutes": "480", // 8 hours
  "security.autoLogoutInactiveMinutes": "0", // 0 = disabled
};

export const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** Merged settings (DB overrides defaults). */
export async function getSettings(): Promise<Record<string, string>> {
  const rows = await prisma.systemSetting.findMany();
  const merged = { ...DEFAULT_SETTINGS };
  for (const r of rows) merged[r.key] = r.value;
  return merged;
}

/** Enforce the configured password policy; throws 400 if not met. */
export function validatePassword(pw: string, settings: Record<string, string>) {
  const min = num(settings["password.minLength"], 8);
  if (pw.length < min) throw badRequest(`Password must be at least ${min} characters`);
  if (settings["password.requireNumber"] === "true" && !/[0-9]/.test(pw))
    throw badRequest("Password must contain at least one number");
  if (settings["password.requireUppercase"] === "true" && !/[A-Z]/.test(pw))
    throw badRequest("Password must contain at least one uppercase letter");
  if (settings["password.requireLowercase"] === "true" && !/[a-z]/.test(pw))
    throw badRequest("Password must contain at least one lowercase letter");
  if (settings["password.requireSpecial"] === "true" && !/[^A-Za-z0-9]/.test(pw))
    throw badRequest("Password must contain at least one special character");
}
