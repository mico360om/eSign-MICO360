/**
 * Domain enums as string-literal unions + value arrays.
 *
 * SQLite (used so the app is zero-setup and embeddable in the desktop .exe)
 * does not support Prisma enums or scalar lists, so these live in code instead
 * of the schema. All enum-typed columns are stored as TEXT; Role.permissions
 * is stored as a JSON string array.
 */

export const PERMISSIONS = [
  "UPLOAD",
  "APPROVE",
  "SIGN",
  "REJECT",
  "DOWNLOAD",
  "USE_STAMP",
  "MANAGE_USERS",
  "MANAGE_PROFILES",
  "MANAGE_ROLES",
  "MANAGE_SIGNATURE_GROUPS",
  "MANAGE_STAMPS",
  "MANAGE_SETTINGS",
  "VIEW_REPORTS",
  "EXPORT_REPORTS",
  "VIEW_AUDIT_LOG",
  "MANAGE_APPROVAL_TYPES",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// Groups for the permission matrix UI
export const PERMISSION_GROUPS: { label: string; perms: Permission[] }[] = [
  { label: "Documents", perms: ["UPLOAD", "APPROVE", "SIGN", "REJECT", "DOWNLOAD"] },
  { label: "Stamps & Signatures", perms: ["USE_STAMP"] },
  { label: "Administration", perms: ["MANAGE_USERS", "MANAGE_PROFILES", "MANAGE_ROLES", "MANAGE_SIGNATURE_GROUPS", "MANAGE_STAMPS", "MANAGE_SETTINGS", "MANAGE_APPROVAL_TYPES"] },
  { label: "Reports & Audit", perms: ["VIEW_REPORTS", "EXPORT_REPORTS", "VIEW_AUDIT_LOG"] },
];

export const DOCUMENT_STATUSES = [
  "DRAFT",
  "UPLOADED",
  "PDF_CONVERTED",
  "PENDING_APPROVAL",
  "PENDING_SIGNATURE",
  "PARTIALLY_APPROVED",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
// Convenience object so existing `DocumentStatus.PENDING_APPROVAL`-style refs keep working.
export const DocumentStatus = Object.fromEntries(DOCUMENT_STATUSES.map((s) => [s, s])) as {
  [K in DocumentStatus]: K;
};

export const APPROVAL_MODES = ["SEQUENTIAL", "PARALLEL"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];
export const ApprovalMode = { SEQUENTIAL: "SEQUENTIAL", PARALLEL: "PARALLEL" } as const;

export const STEP_STATUSES = ["PENDING", "APPROVED", "REJECTED", "SKIPPED"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];
export const StepStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  SKIPPED: "SKIPPED",
} as const;

export const NOTIFICATION_TYPES = [
  "DOCUMENT_UPLOADED",
  "SIGNATURE_REQUEST",
  "APPROVAL_REQUIRED",
  "SIGNATURE_REQUIRED",
  "DOCUMENT_APPROVED",
  "DOCUMENT_REJECTED",
  "DOCUMENT_COMPLETED",
  "REQUEST_CANCELLED",
  "COMMENT_ADDED",
  "APPROVAL_REMINDER",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Parse a JSON string permission array safely. */
export const parsePermissions = (raw: string | null | undefined): Permission[] => {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Permission[]) : [];
  } catch {
    return [];
  }
};
