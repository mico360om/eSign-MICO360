import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler, ok } from "../lib/http";
import { authenticate } from "../middleware/auth";

const router = Router();
router.use(authenticate);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const unread = await prisma.notification.count({ where: { userId: req.user!.id, isRead: false } });
    ok(res, { notifications, unread });
  }),
);

router.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user!.id }, data: { isRead: true } });
    ok(res, { success: true });
  }),
);

router.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({ where: { userId: req.user!.id, isRead: false }, data: { isRead: true } });
    ok(res, { success: true });
  }),
);

// Register (or clear) this user's mobile push device token.
router.post(
  "/register-device",
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token : null;
    await prisma.user.update({ where: { id: req.user!.id }, data: { pushToken: token } });
    ok(res, { registered: !!token });
  }),
);

export default router;
