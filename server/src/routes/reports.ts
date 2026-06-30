import { Router } from "express";
import { DocumentStatus, StepStatus } from "../constants";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { authenticate, hasPermission, requirePermission } from "../middleware/auth";

const router = Router();
router.use(authenticate);

// ── Admin reports (require VIEW_REPORTS) ─────────────────────────────
router.get(
  "/admin",
  requirePermission("VIEW_REPORTS"),
  asyncHandler(async (_req, res) => {
    const [byStatus, byProfile, stampUsage, topUploaders] = await Promise.all([
      prisma.document.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.document.groupBy({ by: ["profileId"], _count: { _all: true } }),
      prisma.stampUsage.groupBy({ by: ["stampId"], _count: { _all: true } }),
      prisma.document.groupBy({ by: ["uploadedById"], _count: { _all: true }, orderBy: { _count: { uploadedById: "desc" } }, take: 10 }),
    ]);

    // Resolve names for the grouped IDs.
    const profiles = await prisma.profile.findMany({ select: { id: true, name: true } });
    const stamps = await prisma.stamp.findMany({ select: { id: true, name: true } });
    const uploaders = await prisma.user.findMany({
      where: { id: { in: topUploaders.map((u) => u.uploadedById) } },
      select: { id: true, fullName: true },
    });
    const nameOf = (list: { id: string; name?: string; fullName?: string }[], id: string) =>
      list.find((x) => x.id === id)?.name ?? list.find((x) => x.id === id)?.fullName ?? id;

    // Approval delay (avg hours between submit and completion) — computed in JS for portability.
    const completedDocs = await prisma.document.findMany({
      where: { status: DocumentStatus.COMPLETED, completedAt: { not: null } },
      select: { createdAt: true, completedAt: true },
    });
    const avgDelayHours =
      completedDocs.length === 0
        ? 0
        : completedDocs.reduce((sum, d) => sum + (d.completedAt!.getTime() - d.createdAt.getTime()), 0) /
          completedDocs.length /
          3_600_000;

    ok(res, {
      uploaded: byStatus.reduce((s, g) => s + g._count._all, 0),
      byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
      pendingApprovals: byStatus.filter((g) => ["PENDING_APPROVAL", "PARTIALLY_APPROVED", "PENDING_SIGNATURE"].includes(g.status)).reduce((s, g) => s + g._count._all, 0),
      completed: byStatus.find((g) => g.status === "COMPLETED")?._count._all ?? 0,
      rejected: byStatus.find((g) => g.status === "REJECTED")?._count._all ?? 0,
      byProfile: byProfile.map((g) => ({ profile: nameOf(profiles, g.profileId), count: g._count._all })),
      stampUsage: stampUsage.map((g) => ({ stamp: nameOf(stamps, g.stampId), count: g._count._all })),
      topUploaders: topUploaders.map((g) => ({ user: nameOf(uploaders, g.uploadedById), count: g._count._all })),
      avgApprovalDelayHours: Math.round(avgDelayHours * 10) / 10,
    });
  }),
);

// ── Per-user reports (any authenticated user) ────────────────────────
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const uid = req.user!.id;
    const [uploaded, pendingMine, signedByMe, rejectedByMe, completedMine] = await Promise.all([
      prisma.document.count({ where: { uploadedById: uid } }),
      prisma.document.count({ where: { steps: { some: { signatoryId: uid, status: StepStatus.PENDING } } } }),
      prisma.approvalStep.count({ where: { signatoryId: uid, status: StepStatus.APPROVED } }),
      prisma.approvalStep.count({ where: { signatoryId: uid, status: StepStatus.REJECTED } }),
      prisma.document.count({ where: { uploadedById: uid, status: DocumentStatus.COMPLETED } }),
    ]);
    ok(res, { uploaded, pendingMyApproval: pendingMine, signedByMe, rejectedByMe, completed: completedMine });
  }),
);

export default router;
