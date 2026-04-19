import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";

const router: IRouter = Router();
router.use(requireAuth);

const writeRoles = ["MANAGEMENT", "PROJECT_MANAGER"] as const;

router.get("/projects/:id/resources", async (req, res) => {
  const projectId = req.params.id;
  const userId = req.user?.sub;
  const role = req.user?.role;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, pmId: true, salesId: true },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  // RBAC: management/admin/finance see all; PM only owned; Sales only owned;
  // Consultant/TechWriter only if assigned to this project.
  const broad = role === "MANAGEMENT" || role === "ADMIN_PROJECT";
  let allowed = broad;
  if (!allowed && role === "PROJECT_MANAGER" && project.pmId === userId) allowed = true;
  if (!allowed && role === "SALES" && project.salesId === userId) allowed = true;
  if (!allowed && (role === "KONSULTAN" || role === "TECHNICAL_WRITER")) {
    const assigned = await prisma.projectResource.findFirst({
      where: { projectId, userId: userId ?? "" },
      select: { id: true },
    });
    if (assigned) allowed = true;
  }
  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const resources = await prisma.projectResource.findMany({
    where: { projectId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  // Compute actual mandays per resource from approved timesheets
  const tsAgg = await prisma.timesheet.groupBy({
    by: ["userId"],
    where: { projectId, status: "APPROVED" },
    _sum: { hours: true },
  });
  const actualMap = new Map<string, number>();
  for (const a of tsAgg) {
    actualMap.set(a.userId, (a._sum.hours ?? 0) / 8);
  }
  res.json(
    resources.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      userId: r.userId,
      userName: r.user.name,
      userRole: r.user.role,
      roleInProject: r.roleInProject,
      plannedMandays: r.plannedMandays,
      actualMandays: actualMap.get(r.userId) ?? 0,
      dailyRate: r.dailyRate,
    })),
  );
});

router.post(
  "/projects/:id/resources",
  requireRole(...writeRoles),
  async (req, res) => {
    const projectId = req.params.id;
    const { userId, roleInProject, plannedMandays, dailyRate } = req.body || {};
    if (!userId) {
      res.status(400).json({ error: "userId required" });
      return;
    }
    const pm = Number(plannedMandays || 0);
    const dr = Number(dailyRate || 0);
    if (pm < 0 || dr < 0 || !isFinite(pm) || !isFinite(dr)) {
      res.status(400).json({ error: "plannedMandays and dailyRate must be non-negative numbers" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const existing = await prisma.projectResource.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    const r = await prisma.projectResource.upsert({
      where: { projectId_userId: { projectId, userId } },
      update: {
        roleInProject: roleInProject || null,
        plannedMandays: Number(plannedMandays || 0),
        dailyRate: Number(dailyRate || 0),
      },
      create: {
        projectId,
        userId,
        roleInProject: roleInProject || null,
        plannedMandays: Number(plannedMandays || 0),
        dailyRate: Number(dailyRate || 0),
      },
      include: { user: true },
    });
    await recordAudit(req, {
      action: existing ? "resource.updated" : "resource.assigned",
      entityType: "ProjectResource",
      entityId: r.id,
      description: existing
        ? `Updated ${user.name} on project ${projectId}: rate=${r.dailyRate}, mandays=${r.plannedMandays}`
        : `Assigned ${user.name} to project ${projectId} (rate=${r.dailyRate}, mandays=${r.plannedMandays})`,
      before: existing ?? undefined,
      after: { id: r.id, projectId: r.projectId, userId: r.userId, roleInProject: r.roleInProject, plannedMandays: r.plannedMandays, dailyRate: r.dailyRate },
    });
    res.status(201).json({
      id: r.id,
      projectId: r.projectId,
      userId: r.userId,
      userName: r.user.name,
      userRole: r.user.role,
      roleInProject: r.roleInProject,
      plannedMandays: r.plannedMandays,
      actualMandays: 0,
      dailyRate: r.dailyRate,
    });
  },
);

router.delete(
  "/resources/:resourceId",
  requireRole(...writeRoles),
  async (req, res) => {
    const before = await prisma.projectResource.findUnique({
      where: { id: req.params.resourceId },
      include: { user: true },
    });
    if (!before) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await prisma.projectResource.delete({
      where: { id: req.params.resourceId },
    });
    await recordAudit(req, {
      action: "resource.removed",
      entityType: "ProjectResource",
      entityId: before.id,
      description: `Removed ${before.user.name} from project`,
      before: { id: before.id, projectId: before.projectId, userId: before.userId, roleInProject: before.roleInProject, plannedMandays: before.plannedMandays, dailyRate: before.dailyRate },
    });
    res.json({ success: true });
  },
);

export default router;
