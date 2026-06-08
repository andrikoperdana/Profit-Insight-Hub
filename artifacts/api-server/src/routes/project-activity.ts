import { Router, type IRouter } from "express";
import { prisma, type Prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth);

// Audit-trail viewer is intentionally restricted to Management, Site Admin,
// and the assigned PM of the project (matches UI gating on the project page).
async function canViewActivity(req: any, projectId: string): Promise<boolean> {
  const role = req.user.role;
  if (role === "MANAGEMENT" || role === "SUPER_ADMIN" || role === "SITE_ADMIN") return true;
  if (role !== "PROJECT_MANAGER") return false;
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { pmId: true },
  });
  return !!p && p.pmId === req.user.sub;
}

router.get("/projects/:id/activity", async (req: any, res) => {
  const projectId = String(req.params.id);
  if (!(await canViewActivity(req, projectId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 30));
  const userId = req.query.userId ? String(req.query.userId) : null;
  const action = req.query.action ? String(req.query.action) : null;
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;

  // Collect task IDs belonging to this project (for entity_id matches against task.* actions)
  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: { id: true },
  });
  const taskIds = tasks.map((t) => t.id);

  // Collect resource/expense/milestone IDs belonging to this project
  const [resources, expenses, milestones] = await Promise.all([
    prisma.projectResource.findMany({ where: { projectId }, select: { id: true } }),
    prisma.projectExpense.findMany({ where: { projectId }, select: { id: true } }),
    prisma.billingMilestone.findMany({ where: { projectId }, select: { id: true } }),
  ]);

  const projectEntityIds = [
    projectId,
    ...taskIds,
    ...resources.map((r) => r.id),
    ...expenses.map((e) => e.id),
    ...milestones.map((m) => m.id),
  ];

  const where: Prisma.AuditLogWhereInput = {
    entityId: { in: projectEntityIds },
  };
  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (from || to) {
    where.createdAt = {};
    if (from && !isNaN(from.getTime())) (where.createdAt as Prisma.DateTimeFilter).gte = from;
    if (to && !isNaN(to.getTime())) (where.createdAt as Prisma.DateTimeFilter).lte = to;
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Distinct users + actions for filter dropdowns
  const distinctActions = await prisma.auditLog.findMany({
    where: { entityId: { in: projectEntityIds } },
    select: { action: true },
    distinct: ["action"],
    orderBy: { action: "asc" },
  });
  const distinctUsers = await prisma.auditLog.findMany({
    where: { entityId: { in: projectEntityIds }, userId: { not: null } },
    select: { userId: true, userName: true },
    distinct: ["userId"],
  });

  res.json({
    items: items.map((a) => ({
      id: a.id,
      userId: a.userId,
      userName: a.userName,
      userRole: a.userRole,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      description: a.description,
      createdAt: a.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    filters: {
      actions: distinctActions.map((a) => a.action),
      users: distinctUsers.map((u) => ({ id: u.userId, name: u.userName })),
    },
  });
});

export default router;
