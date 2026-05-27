import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth);

// Self always. HR/MGMT/SITE_ADMIN org-wide. PM scoped to direct reports
// (managerId === actor). Principal scoped to direct supervisees
// (principalId === actor).
async function canManageGoals(actor: { sub: string; role: string }, subjectUserId: string): Promise<boolean> {
  if (actor.sub === subjectUserId) return true;
  if (["MANAGEMENT", "HR", "SITE_ADMIN"].includes(actor.role)) return true;
  if (actor.role === "PROJECT_MANAGER") {
    const subj = await prisma.user.findUnique({ where: { id: subjectUserId }, select: { managerId: true } });
    return subj?.managerId === actor.sub;
  }
  if (["PRINCIPAL_KONSULTAN", "PRINCIPAL_TECHNICAL_WRITER", "PRINCIPAL_ADMIN_PROJECT"].includes(actor.role)) {
    const subj = await prisma.user.findUnique({ where: { id: subjectUserId }, select: { principalId: true } });
    return subj?.principalId === actor.sub;
  }
  return false;
}

function serializeGoal(g: any) {
  return {
    id: g.id,
    userId: g.userId,
    userName: g.user?.name ?? null,
    skillId: g.skillId,
    skillName: g.skill?.name ?? null,
    currentLevel: g.currentLevel,
    targetLevel: g.targetLevel,
    targetDate: g.targetDate ? g.targetDate.toISOString() : null,
    status: g.status,
    notes: g.notes,
    createdById: g.createdById,
    createdByName: g.createdBy?.name ?? null,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    completedAt: g.completedAt ? g.completedAt.toISOString() : null,
  };
}

function serializeLog(l: any) {
  return {
    id: l.id,
    userId: l.userId,
    userName: l.user?.name ?? null,
    skillId: l.skillId,
    skillName: l.skill?.name ?? null,
    fromLevel: l.fromLevel,
    toLevel: l.toLevel,
    changedById: l.changedById,
    changedByName: l.changedBy?.name ?? null,
    note: l.note,
    createdAt: l.createdAt.toISOString(),
  };
}

router.get("/skill-development/goals", async (req, res) => {
  const me = req.user!;
  const userId = req.query.userId ? String(req.query.userId) : null;
  const status = req.query.status ? String(req.query.status) : null;
  const where: any = {};
  if (userId) {
    if (!(await canManageGoals(me, userId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    where.userId = userId;
  } else if (!["MANAGEMENT", "HR", "SITE_ADMIN"].includes(me.role)) {
    where.userId = me.sub;
  }
  if (status) where.status = status;
  const goals = await prisma.skillDevelopmentGoal.findMany({
    where,
    include: { user: true, skill: true, createdBy: true },
    orderBy: [{ status: "asc" }, { targetDate: "asc" }],
  });
  res.json(goals.map(serializeGoal));
});

router.post("/skill-development/goals", async (req, res) => {
  const me = req.user!;
  const { userId, skillId, currentLevel, targetLevel, targetDate, notes } = req.body || {};
  const subject = userId || me.sub;
  if (!(await canManageGoals(me, subject))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!skillId) {
    res.status(400).json({ error: "skillId is required" });
    return;
  }
  const cur = Number(currentLevel ?? 1);
  const tgt = Number(targetLevel ?? 3);
  if (cur < 1 || cur > 5 || tgt < 1 || tgt > 5) {
    res.status(400).json({ error: "Levels must be between 1 and 5" });
    return;
  }
  if (tgt <= cur) {
    res.status(400).json({ error: "Target level must be higher than current level" });
    return;
  }
  try {
    const goal = await prisma.skillDevelopmentGoal.create({
      data: {
        userId: subject,
        skillId: String(skillId),
        currentLevel: cur,
        targetLevel: tgt,
        targetDate: targetDate ? new Date(String(targetDate)) : null,
        notes: notes || null,
        status: "ACTIVE",
        createdById: me.sub,
      },
      include: { user: true, skill: true, createdBy: true },
    });
    res.status(201).json(serializeGoal(goal));
  } catch (e: any) {
    if (e.code === "P2002") {
      res.status(409).json({ error: "A goal already exists for this skill." });
      return;
    }
    throw e;
  }
});

router.patch("/skill-development/goals/:id", async (req, res) => {
  const me = req.user!;
  const goal = await prisma.skillDevelopmentGoal.findUnique({ where: { id: String(req.params.id) } });
  if (!goal) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!(await canManageGoals(me, goal.userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { currentLevel, targetLevel, targetDate, notes, status } = req.body || {};
  const data: any = {};
  if (currentLevel !== undefined) data.currentLevel = Number(currentLevel);
  if (targetLevel !== undefined) data.targetLevel = Number(targetLevel);
  if (targetDate !== undefined) data.targetDate = targetDate ? new Date(String(targetDate)) : null;
  if (notes !== undefined) data.notes = notes || null;
  if (status !== undefined) {
    if (!["ACTIVE", "COMPLETED", "PAUSED", "CANCELLED"].includes(String(status))) {
      res.status(400).json({ error: "invalid status" });
      return;
    }
    data.status = status;
    if (status === "COMPLETED") data.completedAt = new Date();
  }
  const updated = await prisma.skillDevelopmentGoal.update({
    where: { id: goal.id },
    data,
    include: { user: true, skill: true, createdBy: true },
  });
  res.json(serializeGoal(updated));
});

router.delete("/skill-development/goals/:id", async (req, res) => {
  const me = req.user!;
  const goal = await prisma.skillDevelopmentGoal.findUnique({ where: { id: String(req.params.id) } });
  if (!goal) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!(await canManageGoals(me, goal.userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await prisma.skillDevelopmentGoal.delete({ where: { id: goal.id } });
  res.json({ success: true });
});

router.get("/skill-development/progression", async (req, res) => {
  const me = req.user!;
  const userId = req.query.userId ? String(req.query.userId) : null;
  const where: any = {};
  if (userId) {
    if (!(await canManageGoals(me, userId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    where.userId = userId;
  } else if (!["MANAGEMENT", "HR", "SITE_ADMIN"].includes(me.role)) {
    where.userId = me.sub;
  }
  const logs = await prisma.skillProgressionLog.findMany({
    where,
    include: { user: true, skill: true, changedBy: true },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  res.json(logs.map(serializeLog));
});

// Convenience: log skill update + progression atomically
router.post("/skill-development/progression", async (req, res) => {
  const me = req.user!;
  const { userId, skillId, toLevel, note } = req.body || {};
  const subject = userId || me.sub;
  if (!(await canManageGoals(me, subject))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!skillId || toLevel == null) {
    res.status(400).json({ error: "skillId and toLevel required" });
    return;
  }
  const newLevel = Number(toLevel);
  if (newLevel < 1 || newLevel > 5) {
    res.status(400).json({ error: "toLevel must be 1..5" });
    return;
  }
  const existing = await prisma.userSkill.findUnique({
    where: { userId_skillId: { userId: subject, skillId: String(skillId) } },
  });
  const fromLevel = existing?.proficiency ?? null;
  await prisma.userSkill.upsert({
    where: { userId_skillId: { userId: subject, skillId: String(skillId) } },
    update: { proficiency: newLevel },
    create: { userId: subject, skillId: String(skillId), proficiency: newLevel },
  });
  const log = await prisma.skillProgressionLog.create({
    data: {
      userId: subject,
      skillId: String(skillId),
      fromLevel,
      toLevel: newLevel,
      changedById: me.sub,
      note: note || null,
    },
    include: { user: true, skill: true, changedBy: true },
  });
  // Auto-complete any matching goal if targetLevel reached
  const matchingGoal = await prisma.skillDevelopmentGoal.findUnique({
    where: { userId_skillId: { userId: subject, skillId: String(skillId) } },
  });
  if (matchingGoal && matchingGoal.status === "ACTIVE" && newLevel >= matchingGoal.targetLevel) {
    await prisma.skillDevelopmentGoal.update({
      where: { id: matchingGoal.id },
      data: { status: "COMPLETED", completedAt: new Date(), currentLevel: newLevel },
    });
  } else if (matchingGoal && matchingGoal.status === "ACTIVE") {
    await prisma.skillDevelopmentGoal.update({
      where: { id: matchingGoal.id },
      data: { currentLevel: newLevel },
    });
  }
  res.status(201).json(serializeLog(log));
});

export default router;
