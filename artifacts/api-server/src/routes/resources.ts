import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth);

const writeRoles = ["MANAGEMENT", "PROJECT_MANAGER"] as const;

router.get("/projects/:id/resources", async (req, res) => {
  const projectId = req.params.id;
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
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
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
    await prisma.projectResource.delete({
      where: { id: req.params.resourceId },
    });
    res.json({ success: true });
  },
);

export default router;
