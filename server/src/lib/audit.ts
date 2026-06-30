import { prisma } from "./prisma";
import { sha256 } from "./integrity";

/** Canonical serialization of the hash-relevant fields of an audit entry. */
export function canonicalAudit(e: {
  actorId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  detail?: string | null;
  ip?: string | null;
  createdAt: Date | string;
}): string {
  return JSON.stringify({
    actorId: e.actorId ?? null,
    action: e.action,
    entity: e.entity ?? null,
    entityId: e.entityId ?? null,
    detail: e.detail ?? null,
    ip: e.ip ?? null,
    createdAt: typeof e.createdAt === "string" ? e.createdAt : e.createdAt.toISOString(),
  });
}

/**
 * Write a system-wide audit log entry into a tamper-evident hash chain:
 * hash = SHA-256(prevHash + canonicalFields). Any later edit/deletion of an
 * entry breaks every subsequent hash, which /api/audit/verify detects.
 */
export async function audit(params: {
  actorId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  detail?: string;
  ip?: string;
}) {
  try {
    // Run inside a serialized transaction so concurrent requests can't race
    // and read the same prevHash, which would break the hash chain.
    await prisma.$transaction(async (tx) => {
      const prev = await tx.auditLog.findFirst({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { hash: true },
      });
      const prevHash = prev?.hash ?? "";
      const createdAt = new Date();
      const hash = sha256(prevHash + canonicalAudit({ ...params, createdAt }));
      await tx.auditLog.create({
        data: {
          actorId: params.actorId ?? null,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          detail: params.detail,
          ip: params.ip,
          prevHash,
          hash,
          createdAt,
        },
      });
    });
  } catch {
    // Never let audit failures break the request.
  }
}

/** Append an event to a single document's history timeline. */
export async function docEvent(documentId: string, action: string, actorId?: string | null, detail?: string) {
  try {
    await prisma.documentEvent.create({
      data: { documentId, action, actorId: actorId ?? null, detail },
    });
  } catch {
    /* ignore */
  }
}
