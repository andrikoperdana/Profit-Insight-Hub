import { Router, type IRouter } from "express";
import { prisma, type Prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";

const router: IRouter = Router();
router.use(requireAuth);

const VALID_TYPES = ["ANNUAL", "SICK", "TRAINING", "UNPAID", "OTHER"] as const;
type LeaveType = (typeof VALID_TYPES)[number];

function serialize(l: {
  id: string;
  userId: string;
  user: { name: string };
  startDate: Date;
  endDate: Date;
  type: string;
  note: string | null;
  createdAt: Date;
}) {
  return {
    id: l.id,
    userId: l.userId,
    userName: l.user.name,
    startDate: l.startDate.toISOString(),
    endDate: l.endDate.toISOString(),
    type: l.type,
    note: l.note,
    createdAt: l.createdAt.toISOString(),
  };
}

router.get("/leaves", async (req, res) => {
  const userId = req.query.userId as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const role = req.user!.role;
  const where: Prisma.UserLeaveWhereInput = {};
  if (userId) where.userId = userId;
  if (startDate || endDate) {
    where.AND = [];
    if (endDate) (where.AND as Prisma.UserLeaveWhereInput[]).push({ startDate: { lte: new Date(endDate) } });
    if (startDate) (where.AND as Prisma.UserLeaveWhereInput[]).push({ endDate: { gte: new Date(startDate) } });
  }
  // Non-MGMT/PM can only see own leaves
  if (role !== "MANAGEMENT" && role !== "PROJECT_MANAGER") {
    where.userId = req.user!.sub;
  }
  const list = await prisma.userLeave.findMany({
    where,
    include: { user: { select: { name: true } } },
    orderBy: [{ startDate: "desc" }],
    take: 500,
  });
  res.json(list.map(serialize));
});

router.post("/leaves", async (req, res) => {
  const { userId, startDate, endDate, type, note } = req.body || {};
  if (!startDate || !endDate || !type) {
    res.status(400).json({ error: "startDate, endDate, type required" });
    return;
  }
  if (!VALID_TYPES.includes(type)) {
    res.status(400).json({ error: "invalid type" });
    return;
  }
  const sd = new Date(startDate);
  const ed = new Date(endDate);
  if (isNaN(sd.getTime()) || isNaN(ed.getTime()) || ed < sd) {
    res.status(400).json({ error: "invalid date range" });
    return;
  }
  const role = req.user!.role;
  let targetUserId = req.user!.sub;
  if (userId && userId !== req.user!.sub) {
    if (role !== "MANAGEMENT" && role !== "PROJECT_MANAGER") {
      res.status(403).json({ error: "cannot log leave for other users" });
      return;
    }
    targetUserId = String(userId);
  }
  const leave = await prisma.userLeave.create({
    data: {
      userId: targetUserId,
      startDate: sd,
      endDate: ed,
      type: type as LeaveType,
      note: note || null,
    },
    include: { user: { select: { name: true } } },
  });
  await recordAudit(req, {
    action: "leave.created",
    entityType: "UserLeave",
    entityId: leave.id,
    description: `Leave logged: ${leave.user.name} (${type}) ${sd.toISOString().slice(0, 10)} → ${ed.toISOString().slice(0, 10)}`,
    after: serialize(leave),
  });
  res.status(201).json(serialize(leave));
});

router.delete("/leaves/:id", async (req, res) => {
  const existing = await prisma.userLeave.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { name: true } } },
  });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const role = req.user!.role;
  if (existing.userId !== req.user!.sub && role !== "MANAGEMENT" && role !== "PROJECT_MANAGER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await prisma.userLeave.delete({ where: { id: req.params.id } });
  await recordAudit(req, {
    action: "leave.deleted",
    entityType: "UserLeave",
    entityId: existing.id,
    description: `Leave removed: ${existing.user.name}`,
    before: serialize(existing),
  });
  res.json({ message: "Deleted" });
});

export default router;
