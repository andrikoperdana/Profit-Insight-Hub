import { Router, type IRouter } from "express";
import { prisma, type Prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { canViewWorkHoursTeam, isWorkHoursRequiredRole } from "../lib/roles.js";
import {
  computeWorkHoursSummary,
  overallRange,
  type WorkHoursEntry,
  type WorkHoursLeave,
} from "../lib/work-hours.js";

const router: IRouter = Router();
router.use(requireAuth);

type MemberMeta = {
  id: string;
  name: string;
  role: string;
  businessUnitName: string | null;
};

function buildSummary(
  member: MemberMeta,
  entries: WorkHoursEntry[],
  leaves: WorkHoursLeave[],
  now: Date,
) {
  const required = isWorkHoursRequiredRole(member.role);
  const core = computeWorkHoursSummary(entries, leaves, now, required);
  return {
    userId: member.id,
    userName: member.name,
    role: member.role,
    businessUnitName: member.businessUnitName,
    required,
    ...core,
  };
}

// GET /api/work-hours/me — the caller's own weekly/monthly/yearly compliance.
router.get("/work-hours/me", async (req, res) => {
  const now = new Date();
  const { start, end } = overallRange(now);

  const [user, timesheets, leaves] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { id: true, name: true, role: true, businessUnit: { select: { name: true } } },
    }),
    prisma.timesheet.findMany({
      where: { userId: req.user!.sub, workDate: { gte: start, lte: end } },
      select: { workDate: true, hours: true, status: true },
    }),
    prisma.userLeave.findMany({
      where: { userId: req.user!.sub, startDate: { lte: end }, endDate: { gte: start } },
      select: { startDate: true, endDate: true },
    }),
  ]);

  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(
    buildSummary(
      { id: user.id, name: user.name, role: user.role, businessUnitName: user.businessUnit?.name ?? null },
      timesheets,
      leaves,
      now,
    ),
  );
});

// GET /api/work-hours/team — compliance for the people the caller supervises.
// HR sees all required-role staff, Management sees Project Managers, and each
// Principal sees their own supervisees.
router.get("/work-hours/team", async (req, res) => {
  const role = req.user!.role;
  if (!canViewWorkHoursTeam(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let scopeLabel: string;
  const where: Prisma.UserWhereInput = { deletedAt: null, isActive: true };
  if (role === "HR") {
    where.role = {
      in: [
        "PROJECT_MANAGER",
        "KONSULTAN",
        "TECHNICAL_WRITER",
        "PRINCIPAL_KONSULTAN",
        "PRINCIPAL_TECHNICAL_WRITER",
        "PRINCIPAL_ADMIN_PROJECT",
      ],
    };
    scopeLabel = "All required staff";
  } else if (role === "MANAGEMENT") {
    where.role = "PROJECT_MANAGER";
    scopeLabel = "Project Managers";
  } else {
    // Principal: only their direct supervisees.
    where.principalId = req.user!.sub;
    scopeLabel = "My team";
  }

  const members = await prisma.user.findMany({
    where,
    select: { id: true, name: true, role: true, businessUnit: { select: { name: true } } },
    orderBy: [{ name: "asc" }],
  });

  const now = new Date();
  if (members.length === 0) {
    res.json({ scopeLabel, members: [] });
    return;
  }

  const { start, end } = overallRange(now);
  const memberIds = members.map((m) => m.id);

  const [timesheets, leaves] = await Promise.all([
    prisma.timesheet.findMany({
      where: { userId: { in: memberIds }, workDate: { gte: start, lte: end } },
      select: { userId: true, workDate: true, hours: true, status: true },
    }),
    prisma.userLeave.findMany({
      where: { userId: { in: memberIds }, startDate: { lte: end }, endDate: { gte: start } },
      select: { userId: true, startDate: true, endDate: true },
    }),
  ]);

  const tsByUser = new Map<string, WorkHoursEntry[]>();
  for (const t of timesheets) {
    const arr = tsByUser.get(t.userId) ?? [];
    arr.push({ workDate: t.workDate, hours: t.hours, status: t.status });
    tsByUser.set(t.userId, arr);
  }
  const leaveByUser = new Map<string, WorkHoursLeave[]>();
  for (const l of leaves) {
    const arr = leaveByUser.get(l.userId) ?? [];
    arr.push({ startDate: l.startDate, endDate: l.endDate });
    leaveByUser.set(l.userId, arr);
  }

  const result = members.map((m) =>
    buildSummary(
      { id: m.id, name: m.name, role: m.role, businessUnitName: m.businessUnit?.name ?? null },
      tsByUser.get(m.id) ?? [],
      leaveByUser.get(m.id) ?? [],
      now,
    ),
  );

  res.json({ scopeLabel, members: result });
});

export default router;
