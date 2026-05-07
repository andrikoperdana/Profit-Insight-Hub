import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth);

function serialize(n: {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

router.get("/notifications", async (req, res) => {
  const userId = req.user!.sub;
  const list = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(list.map(serialize));
});

router.post("/notifications/:id/read", async (req, res) => {
  const userId = req.user!.sub;
  const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!n || n.userId !== userId) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const updated = await prisma.notification.update({
    where: { id: n.id },
    data: { readAt: n.readAt ?? new Date() },
  });
  res.json(serialize(updated));
});

router.post("/notifications/read-all", async (req, res) => {
  const userId = req.user!.sub;
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ success: true });
});

export default router;
