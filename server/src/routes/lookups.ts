import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, forbidden, ok } from "../lib/http";
import { authenticate } from "../middleware/auth";
import { userProfileIds } from "../services/access";

// Scoped lookups used by the requester UI (desktop/web/mobile) when building a
// signature request. Everything here is filtered to the caller's profiles.
const router = Router();
router.use(authenticate);

async function assertMember(userId: string, profileId: string) {
  const ids = await userProfileIds(userId);
  if (!ids.includes(profileId)) throw forbidden("You are not assigned to this profile");
}

// Users who share a given profile (eligible signatories per the access rules).
router.get(
  "/profiles/:profileId/signatories",
  asyncHandler(async (req, res) => {
    await assertMember(req.user!.id, req.params.profileId);
    const members = await prisma.profileMember.findMany({
      where: { profileId: req.params.profileId, user: { isActive: true } },
      include: { user: { select: { id: true, fullName: true, email: true, role: { select: { permissions: true } } } } },
    });
    ok(res, members
      .filter((m) => m.userId !== req.user!.id)
      .filter((m) => {
        const perms: string[] = JSON.parse((m.user as any).role?.permissions || "[]");
        return perms.includes("APPROVE");
      })
      .map((m) => ({ id: m.user.id, fullName: m.user.fullName, email: m.user.email })));
  }),
);

router.get(
  "/profiles/:profileId/groups",
  asyncHandler(async (req, res) => {
    await assertMember(req.user!.id, req.params.profileId);
    const groups = await prisma.signatureGroup.findMany({
      where: { profileId: req.params.profileId, isActive: true },
      include: { members: { orderBy: { order: "asc" }, include: { user: { select: { id: true, fullName: true } } } } },
    });
    ok(res, groups);
  }),
);

router.get(
  "/profiles/:profileId/stamps",
  asyncHandler(async (req, res) => {
    await assertMember(req.user!.id, req.params.profileId);
    const stamps = await prisma.stamp.findMany({
      where: { isActive: true, OR: [{ profileId: req.params.profileId }, { profileId: null }] },
      select: { id: true, name: true, imagePath: true },
    });
    ok(res, stamps);
  }),
);

export default router;
