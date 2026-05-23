import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth);

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

router.get("/capacity/calendar", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "PROJECT_MANAGER" && role !== "HR") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const startStr = String(req.query.start ?? "");
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? 14), 10) || 14, 7), 42);
  const start = startStr ? new Date(startStr) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  // PM scoping: only resources tied to projects they own
  let pmIds: string[] | null = null;
  if (role === "PROJECT_MANAGER") {
    const own = await prisma.project.findMany({
      where: { pmId: req.user!.sub, deletedAt: null },
      select: { id: true },
    });
    pmIds = own.map((p) => p.id);
  }

  const userWhere: any = {
    isActive: true,
    deletedAt: null,
    role: { in: ["KONSULTAN", "TECHNICAL_WRITER", "ADMIN_PROJECT", "PROJECT_MANAGER"] },
  };
  if (pmIds) {
    userWhere.OR = [
      { resources: { some: { projectId: { in: pmIds } } } },
      { timesheets: { some: { projectId: { in: pmIds }, workDate: { gte: start, lt: end } } } },
    ];
  }

  const users = await prisma.user.findMany({
    where: userWhere,
    include: {
      resources: {
        where: pmIds ? { projectId: { in: pmIds } } : undefined,
        include: { project: { include: { client: true } } },
      },
      timesheets: {
        where: {
          status: { in: ["APPROVED", "SUBMITTED"] },
          workDate: { gte: start, lt: end },
          ...(pmIds ? { projectId: { in: pmIds } } : {}),
        },
        include: { project: true },
      },
      leaves: {
        where: {
          startDate: { lt: end },
          endDate: { gte: start },
        },
        select: { startDate: true, endDate: true, type: true, note: true },
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  // Build day list (working days flag included)
  const dayList: { date: string; isWorkday: boolean }[] = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    dayList.push({ date: dayKey(d), isWorkday: dow !== 0 && dow !== 6 });
  }

  type CellStatus = "AVAILABLE" | "ASSIGNED" | "OVERLOADED" | "IDLE" | "WEEKEND" | "ON_LEAVE";

  const principals = new Map<string, string>();
  const specializations = new Set<string>();

  const rows = users.map((u) => {
    // Project assignment windows for this user
    const assignments = u.resources
      .filter((r) => r.project.startDate && r.project.endDate)
      .map((r) => ({
        projectId: r.projectId,
        projectName: r.project.name,
        clientId: r.project.clientId,
        clientName: r.project.client.name,
        status: r.project.status,
        from: r.project.startDate!.getTime(),
        to: r.project.endDate!.getTime(),
      }));

    // Hours per day from timesheets
    const hoursMap = new Map<string, number>();
    const projectsByDay = new Map<string, Set<string>>();
    for (const t of u.timesheets) {
      const k = dayKey(t.workDate);
      hoursMap.set(k, (hoursMap.get(k) ?? 0) + t.hours);
      if (!projectsByDay.has(k)) projectsByDay.set(k, new Set());
      projectsByDay.get(k)!.add(t.project.name);
    }

    // Track principals/specializations for filters
    for (const a of assignments) principals.set(a.clientId, a.clientName);
    if (u.title) specializations.add(u.title);

    // Build leave-day map
    const leaveMap = new Map<string, string>();
    for (const lv of u.leaves) {
      const lvStart = new Date(lv.startDate);
      lvStart.setHours(0, 0, 0, 0);
      const lvEnd = new Date(lv.endDate);
      lvEnd.setHours(0, 0, 0, 0);
      for (let t = lvStart.getTime(); t <= lvEnd.getTime(); t += 86400000) {
        leaveMap.set(dayKey(new Date(t)), String(lv.type));
      }
    }

    const cells = dayList.map((d) => {
      if (!d.isWorkday) {
        return { date: d.date, status: "WEEKEND" as CellStatus, hours: 0, projects: [] as string[], leaveType: null as string | null };
      }
      const leaveType = leaveMap.get(d.date) ?? null;
      if (leaveType) {
        return { date: d.date, status: "ON_LEAVE" as CellStatus, hours: 0, projects: [], leaveType };
      }
      const ts = new Date(d.date).getTime();
      const isAssigned = assignments.some(
        (a) => ts >= a.from && ts <= a.to && (a.status === "ACTIVE" || a.status === "PAUSE" || a.status === "OBSERVATION"),
      );
      const hours = hoursMap.get(d.date) ?? 0;
      const projects = Array.from(projectsByDay.get(d.date) ?? []);
      let status: CellStatus = "AVAILABLE";
      if (hours > 8) status = "OVERLOADED";
      else if (isAssigned || hours > 0) status = "ASSIGNED";
      else status = "AVAILABLE";
      return { date: d.date, status, hours, projects, leaveType: null };
    });

    // Weekly totals (Mon–Sun chunks), warning if >40h
    const weeklyTotals: { weekStart: string; hours: number; warning: boolean }[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      const chunk = cells.slice(i, i + 7);
      const totalH = chunk.reduce((s, c) => s + (c.hours || 0), 0);
      weeklyTotals.push({ weekStart: chunk[0]?.date ?? "", hours: totalH, warning: totalH > 40 });
    }

    return {
      userId: u.id,
      userName: u.name,
      role: u.role,
      title: u.title,
      currentClientId: assignments[0]?.clientId ?? null,
      currentClientName: assignments[0]?.clientName ?? null,
      cells,
      weeklyTotals,
    };
  });

  // Summary per role per day
  type DaySummary = { date: string; isWorkday: boolean; available: number; assigned: number; overloaded: number; byRole: Record<string, { available: number; assigned: number; overloaded: number }> };
  const ROLES = ["KONSULTAN", "TECHNICAL_WRITER", "ADMIN_PROJECT", "PROJECT_MANAGER"];
  const summary: DaySummary[] = dayList.map((d) => {
    const init = () => ({ available: 0, assigned: 0, overloaded: 0 });
    const byRole: Record<string, ReturnType<typeof init>> = {};
    for (const r of ROLES) byRole[r] = init();
    let available = 0;
    let assigned = 0;
    let overloaded = 0;
    if (d.isWorkday) {
      for (const row of rows) {
        const cell = row.cells.find((c) => c.date === d.date)!;
        const bucket = byRole[row.role] ?? (byRole[row.role] = init());
        if (cell.status === "AVAILABLE") {
          available += 1;
          bucket.available += 1;
        } else if (cell.status === "ASSIGNED") {
          assigned += 1;
          bucket.assigned += 1;
        } else if (cell.status === "OVERLOADED") {
          overloaded += 1;
          bucket.overloaded += 1;
        }
      }
    }
    return { date: d.date, isWorkday: d.isWorkday, available, assigned, overloaded, byRole };
  });

  res.json({
    start: dayKey(start),
    days,
    rows,
    summary,
    filters: {
      principals: Array.from(principals.entries()).map(([id, name]) => ({ id, name })),
      specializations: Array.from(specializations).sort(),
    },
  });
});

export default router;
