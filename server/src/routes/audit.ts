import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { authenticate, requirePermission } from "../middleware/auth";
import { canonicalAudit } from "../lib/audit";
import { sha256 } from "../lib/integrity";

// System-wide audit log viewer with server-side search/filter (admin only).
const router = Router();
router.use(authenticate, requirePermission("VIEW_REPORTS"));

// Verify the tamper-evident hash chain end to end. Recomputes each entry's hash
// from the previous hash + its fields; reports the first broken link, if any.
router.get(
  "/verify",
  asyncHandler(async (_req, res) => {
    const all = await prisma.auditLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    // Only entries written since hash-chaining was enabled participate in the chain.
    const chained = all.filter((e) => e.hash);
    let prevHash = "";
    let brokenAt: number | null = null;
    for (let i = 0; i < chained.length; i++) {
      const e = chained[i];
      const expected = sha256(prevHash + canonicalAudit(e));
      if (e.prevHash !== prevHash || e.hash !== expected) {
        brokenAt = i;
        break;
      }
      prevHash = e.hash ?? "";
    }
    ok(res, {
      total: all.length,
      chainedEntries: chained.length,
      legacyUnhashed: all.length - chained.length,
      intact: brokenAt === null,
      brokenAtIndex: brokenAt,
    });
  }),
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string)?.trim();
    const action = (req.query.action as string)?.trim();
    const actorId = (req.query.actorId as string)?.trim();
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;
    const take = Math.min(Number(req.query.limit) || 500, 1000);

    const where: any = {};
    if (action) where.action = { contains: action };
    if (actorId) where.actorId = actorId;
    if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    if (q) where.OR = [{ action: { contains: q } }, { entity: { contains: q } }, { detail: { contains: q } }];

    const [logs, total, actions] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        include: { actor: { select: { id: true, fullName: true } } },
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    ]);

    ok(res, { logs, total, actions: actions.map((a) => a.action) });
  }),
);

// CSV export of the audit log (respects the same filters as the list).
router.get(
  "/export",
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string)?.trim();
    const action = (req.query.action as string)?.trim();
    const actorId = (req.query.actorId as string)?.trim();
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;

    const where: any = {};
    if (action) where.action = { contains: action };
    if (actorId) where.actorId = actorId;
    if (from || to) where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    if (q) where.OR = [{ action: { contains: q } }, { entity: { contains: q } }, { detail: { contains: q } }];

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10000,
      include: { actor: { select: { fullName: true } } },
    });

    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Date/Time", "User", "Action", "Entity", "Entity ID", "Detail", "IP", "Device"];
    const rows = logs.map((l) => [
      new Date(l.createdAt).toISOString(),
      (l as any).actor?.fullName ?? "System",
      l.action,
      l.entity ?? "",
      l.entityId ?? "",
      l.detail ?? "",
      l.ip ?? "",
      (l as any).device ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("﻿" + csv); // BOM so Excel detects UTF-8
  }),
);

export default router;
