import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { authenticate, requirePermission } from "../middleware/auth";
import { recordError } from "../lib/errorReport";

const router = Router();

// Public client crash reporter — no auth required, so errors that happen on the
// login page or during auth failures are still captured. Rate-limited to blunt
// abuse; the client sends who it thinks it is (userEmail) for context only.
const reportLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

router.post(
  "/report",
  reportLimiter,
  asyncHandler(async (req, res) => {
    // Length caps: this endpoint is unauthenticated, so bound what it will store.
    const body = z
      .object({
        message: z.string().min(1).max(2000),
        stack: z.string().max(20000).optional(),
        url: z.string().max(500).optional(),
        userEmail: z.string().max(200).optional(),
        userId: z.string().max(64).optional(),
        appVersion: z.string().max(50).optional(),
      })
      .parse(req.body);
    await recordError({
      source: "client",
      message: body.message,
      stack: body.stack,
      url: body.url,
      userEmail: body.userEmail,
      userId: body.userId,
      appVersion: body.appVersion,
      userAgent: req.headers["user-agent"] as string,
    });
    ok(res, { received: true });
  }),
);

// ── Admin views (VIEW_REPORTS) ─────────────────────────────────────────────
router.use(authenticate, requirePermission("VIEW_REPORTS"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const resolved = req.query.resolved;
    const where = resolved === "true" ? { resolved: true } : resolved === "false" ? { resolved: false } : {};
    const [reports, openCount, total] = await Promise.all([
      prisma.errorReport.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.errorReport.count({ where: { resolved: false } }),
      prisma.errorReport.count(),
    ]);
    ok(res, { reports, openCount, total });
  }),
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = z.object({ resolved: z.boolean() }).parse(req.body);
    const r = await prisma.errorReport.update({ where: { id: req.params.id }, data: { resolved: body.resolved } });
    ok(res, r);
  }),
);

router.post(
  "/clear-resolved",
  requirePermission("MANAGE_SETTINGS"),
  asyncHandler(async (_req, res) => {
    const r = await prisma.errorReport.deleteMany({ where: { resolved: true } });
    ok(res, { deleted: r.count });
  }),
);

router.get(
  "/export",
  asyncHandler(async (_req, res) => {
    const reports = await prisma.errorReport.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
    const esc = (v: any) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const header = ["Date/Time", "Source", "Status", "Message", "URL", "Method", "User", "App Version", "Resolved", "Stack"];
    const rows = reports.map((r) => [
      new Date(r.createdAt).toISOString(), r.source, r.status ?? "", r.message, r.url ?? "", r.method ?? "",
      r.userEmail ?? r.userId ?? "", r.appVersion ?? "", r.resolved ? "yes" : "no", (r.stack ?? "").replace(/\s+/g, " ").slice(0, 500),
    ]);
    const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="error-reports-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }),
);

export default router;
