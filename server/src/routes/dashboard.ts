import { Router } from "express";
import { DocumentStatus } from "../constants";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { authenticate, requirePermission } from "../middleware/auth";
import { getEmailFailureCount } from "../lib/email";

const router = Router();
router.use(authenticate);

// Personal stats — available to all authenticated users.
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const pendingStatuses = [DocumentStatus.PENDING_APPROVAL, DocumentStatus.PARTIALLY_APPROVED, DocumentStatus.PENDING_SIGNATURE];

    const [pendingMyApproval, myDocsPending, completedThisMonth, overdueApprovals] = await Promise.all([
      prisma.approvalStep.count({ where: { signatoryId: userId, status: "PENDING" } }),
      prisma.document.count({ where: { uploadedById: userId, status: { in: pendingStatuses } } }),
      prisma.document.count({
        where: {
          status: DocumentStatus.COMPLETED,
          completedAt: { gte: startOfMonth },
          OR: [{ uploadedById: userId }, { steps: { some: { signatoryId: userId } } }],
        },
      }),
      prisma.document.count({
        where: {
          dueDate: { lt: now },
          status: { notIn: [DocumentStatus.COMPLETED, DocumentStatus.CANCELLED, DocumentStatus.REJECTED] },
          OR: [{ uploadedById: userId }, { steps: { some: { signatoryId: userId } } }],
        },
      }),
    ]);

    ok(res, { pendingMyApproval, myDocsPending, completedThisMonth, overdueApprovals });
  }),
);

// Admin dashboard — requires VIEW_REPORTS.
router.get(
  "/",
  requirePermission("VIEW_REPORTS"),
  asyncHandler(async (req, res) => {
    const pendingStatuses = [DocumentStatus.PENDING_APPROVAL, DocumentStatus.PARTIALLY_APPROVED, DocumentStatus.PENDING_SIGNATURE];

    // ── Admin stats ───────────────────────────────────────────────
    const [
      totalUsers,
      activeUsers,
      totalProfiles,
      totalDocuments,
      pendingApprovals,
      completed,
      rejected,
      recentDocs,
      recentActivity,
      monthlyUploads,
      avgApproval,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.profile.count(),
      prisma.document.count(),
      prisma.document.count({ where: { status: { in: pendingStatuses } } }),
      prisma.document.count({ where: { status: DocumentStatus.COMPLETED } }),
      prisma.document.count({ where: { status: DocumentStatus.REJECTED } }),
      prisma.document.findMany({
        orderBy: { updatedAt: "desc" },
        take: 8,
        include: {
          uploadedBy: { select: { id: true, fullName: true } },
          profile: { select: { id: true, name: true } },
          steps: {
            where: { status: "PENDING" },
            orderBy: { order: "asc" },
            take: 1,
            include: { signatory: { select: { fullName: true } } },
          },
        },
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { actor: { select: { fullName: true } } },
      }),
      prisma.$queryRaw<{ month: string; count: bigint }[]>`
        SELECT strftime('%Y-%m', createdAt) AS month, COUNT(*) AS count
        FROM Document
        WHERE createdAt >= date('now', '-6 months')
        GROUP BY month
        ORDER BY month ASC
      `,
      prisma.$queryRaw<{ avg_hours: number | null }[]>`
        SELECT AVG(CAST((julianday(e2.createdAt) - julianday(e1.createdAt)) * 24 AS REAL)) AS avg_hours
        FROM DocumentEvent e1
        JOIN DocumentEvent e2 ON e1.documentId = e2.documentId
        WHERE e1.action = 'SUBMITTED' AND e2.action = 'COMPLETED'
      `,
    ]);

    const grouped = await prisma.document.groupBy({ by: ["status"], _count: { _all: true } });
    const statusBreakdown = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));

    ok(res, {
      cards: {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        totalProfiles,
        totalDocuments,
        pendingApprovals,
        completed,
        rejected,
        failedEmails: getEmailFailureCount(),
      },
      statusBreakdown,
      recentDocs,
      recentActivity,
      monthlyUploads: monthlyUploads.map((r) => ({ month: r.month, count: Number(r.count) })),
      avgApprovalHours: avgApproval[0]?.avg_hours ?? null,
    });
  }),
);

export default router;
