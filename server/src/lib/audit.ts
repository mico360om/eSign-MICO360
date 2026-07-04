import { prisma } from "./prisma";
import { sha256 } from "./integrity";
import { getReqCtx } from "./requestContext";

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

// In-process mutex serializing all audit writes. The hash chain is a
// read-modify-write (read latest `prevHash` → append new entry), so two
// concurrent requests can otherwise both read the same `prevHash` and append
// siblings, forking the chain. A DB transaction alone does NOT prevent this on
// SQLite (default deferred transactions let both read before either commits).
// This server is single-process, so serializing in-process is sufficient and
// far cheaper than DB-level locking. Failures never poison the queue.
let auditTail: Promise<unknown> = Promise.resolve();
function serializeAudit<T>(fn: () => Promise<T>): Promise<T> {
  const run = auditTail.then(fn, fn);
  auditTail = run.catch(() => {});
  return run;
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
  device?: string;
}) {
  try {
    // Pull IP + device from the per-request context unless explicitly provided.
    const ctx = getReqCtx();
    const ip = params.ip ?? ctx.ip ?? undefined;
    const device = params.device ?? ctx.device ?? undefined;

    // Serialize the read-latest → append so concurrent requests can't fork the
    // chain; the transaction keeps the single append atomic.
    await serializeAudit(() =>
      prisma.$transaction(async (tx) => {
        const prev = await tx.auditLog.findFirst({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { hash: true },
        });
        const prevHash = prev?.hash ?? "";
        const createdAt = new Date();
        // NOTE: `device` is stored for context but intentionally NOT part of the
        // hash chain, so adding it doesn't invalidate historical entries.
        const hash = sha256(prevHash + canonicalAudit({ ...params, ip, createdAt }));
        await tx.auditLog.create({
          data: {
            actorId: params.actorId ?? null,
            action: params.action,
            entity: params.entity,
            entityId: params.entityId,
            detail: params.detail,
            ip,
            device,
            prevHash,
            hash,
            createdAt,
          },
        });
      }),
    );
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
