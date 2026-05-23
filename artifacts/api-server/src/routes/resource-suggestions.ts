import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth);

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

router.get(
  "/projects/:id/resource-suggestions",
  requireRole("MANAGEMENT", "PROJECT_MANAGER"),
  async (req: any, res) => {
    const projectId = String(req.params.id);
    const role = String(req.query.role || "KONSULTAN");
    const weekStartStr = req.query.weekStart ? String(req.query.weekStart) : "";
    const ALLOWED = ["KONSULTAN", "TECHNICAL_WRITER", "ADMIN_PROJECT"];
    if (!ALLOWED.includes(role)) {
      res.status(400).json({ error: "role must be KONSULTAN, TECHNICAL_WRITER, or ADMIN_PROJECT" });
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        pmId: true,
        pm: { select: { businessUnitId: true } },
        resources: { select: { userId: true } },
      },
    });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    if (req.user.role === "PROJECT_MANAGER" && project.pmId !== req.user.sub) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const weekStart = weekStartStr ? startOfDay(new Date(weekStartStr)) : startOfDay(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const assignedIds = new Set<string>(project.resources.map((r) => r.userId));
    const projectBuId = project.pm?.businessUnitId ?? null;

    const candidates = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        role: role as any,
        id: { notIn: Array.from(assignedIds) },
      },
      include: {
        skills: { include: { skill: true } },
        businessUnit: { select: { id: true, name: true } },
        timesheets: {
          where: {
            workDate: { gte: weekStart, lt: weekEnd },
            status: { in: ["APPROVED", "SUBMITTED"] },
          },
          select: { hours: true },
        },
        resources: {
          where: {
            project: {
              status: { in: ["ACTIVE", "OBSERVATION"] },
              deletedAt: null,
              startDate: { lte: weekEnd },
              endDate: { gte: weekStart },
            },
          },
          select: { plannedMandays: true, project: { select: { id: true, name: true } } },
        },
        leaves: {
          where: {
            startDate: { lt: weekEnd },
            endDate: { gte: weekStart },
          },
          select: { startDate: true, endDate: true, type: true },
        },
      },
      orderBy: [{ seniority: "desc" }, { name: "asc" }],
    });

    type Suggestion = {
      id: string;
      name: string;
      role: string;
      seniority: string | null;
      businessUnitId: string | null;
      businessUnitName: string | null;
      skills: { id: string; name: string; proficiency: number }[];
      assignedHoursThisWeek: number;
      activeProjectsCount: number;
      activeProjects: { id: string; name: string }[];
      onLeaveDays: number;
      sameBuAsProject: boolean;
      score: number;
    };

    const list: Suggestion[] = candidates.map((u) => {
      const hours = u.timesheets.reduce((s, t) => s + (t.hours || 0), 0);
      const activeProjects = u.resources.map((r) => r.project);
      // Count leave days that overlap this week
      let leaveDays = 0;
      for (const l of u.leaves) {
        const s = startOfDay(l.startDate) > weekStart ? startOfDay(l.startDate) : weekStart;
        const e = startOfDay(l.endDate) < weekEnd ? startOfDay(l.endDate) : new Date(weekEnd.getTime() - 86400000);
        const diff = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
        leaveDays += Math.max(0, diff);
      }
      const sameBu = !!(projectBuId && u.businessUnitId === projectBuId);

      // Score: prefer lower load, fewer leaves, matching BU, higher seniority
      const seniorityBonus =
        u.seniority === "PRINCIPAL" ? 6 : u.seniority === "SENIOR" ? 4 : u.seniority === "MID" ? 2 : 0;
      const score =
        seniorityBonus + (sameBu ? 5 : 0) - Math.min(20, hours) - leaveDays * 2 - activeProjects.length * 1.5;

      return {
        id: u.id,
        name: u.name,
        role: u.role,
        seniority: u.seniority,
        businessUnitId: u.businessUnitId,
        businessUnitName: u.businessUnit?.name ?? null,
        skills: u.skills.map((s) => ({ id: s.skill.id, name: s.skill.name, proficiency: s.proficiency })),
        assignedHoursThisWeek: hours,
        activeProjectsCount: activeProjects.length,
        activeProjects,
        onLeaveDays: leaveDays,
        sameBuAsProject: sameBu,
        score,
      };
    });

    list.sort((a, b) => b.score - a.score);
    res.json({
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
      role,
      total: list.length,
      candidates: list,
    });
  },
);

export default router;
