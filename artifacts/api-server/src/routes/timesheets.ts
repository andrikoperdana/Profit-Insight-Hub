import { Router, type IRouter } from "express";
import { prisma, type TimesheetStatus, type Prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";

const MAX_HOURS_PER_ENTRY = 24;

const router: IRouter = Router();
router.use(requireAuth);

function serialize(
  ts: Prisma.TimesheetGetPayload<{
    include: { user: true; project: true; approvedBy: true };
  }>,
) {
  return {
    id: ts.id,
    projectId: ts.projectId,
    projectName: ts.project.name,
    userId: ts.userId,
    userName: ts.user.name,
    workDate: ts.workDate.toISOString(),
    hours: ts.hours,
    description: ts.description,
    status: ts.status,
    approvedById: ts.approvedById,
    approvedByName: ts.approvedBy?.name ?? null,
    approvedAt: ts.approvedAt?.toISOString() ?? null,
    rejectionReason: ts.rejectionReason,
    createdAt: ts.createdAt.toISOString(),
  };
}

router.get("/timesheets", async (req, res) => {
  const status = req.query.status as TimesheetStatus | undefined;
  const projectId = req.query.projectId as string | undefined;
  const scope = (req.query.scope as string | undefined) ?? "all";
  const role = req.user!.role;

  const where: Prisma.TimesheetWhereInput = {};
  if (status) where.status = status;
  if (projectId) where.projectId = projectId;

  if (scope === "mine") {
    where.userId = req.user!.sub;
  } else if (scope === "approval") {
    // PMs see SUBMITTED for projects where they are PM
    where.status = "SUBMITTED";
    if (role !== "MANAGEMENT") {
      where.project = { pmId: req.user!.sub };
    }
  } else {
    // "all" — restrict by role
    if (role === "KONSULTAN" || role === "TECHNICAL_WRITER") {
      where.userId = req.user!.sub;
    } else if (role === "PROJECT_MANAGER") {
      where.OR = [
        { userId: req.user!.sub },
        { project: { pmId: req.user!.sub } },
      ];
    }
    // MANAGEMENT, SALES, ADMIN_PROJECT see all
  }

  const list = await prisma.timesheet.findMany({
    where,
    include: { user: true, project: true, approvedBy: true },
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  res.json(list.map(serialize));
});

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function earliestAllowedWorkDate(today: Date, businessDays: number): Date {
  const d = startOfDay(today);
  let remaining = businessDays;
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return d;
}

router.post("/timesheets", async (req, res) => {
  const { projectId, workDate, hours, description } = req.body || {};
  if (!projectId || !workDate || hours == null) {
    res.status(400).json({ error: "projectId, workDate, hours required" });
    return;
  }
  const hoursNum = Number(hours);
  if (!isFinite(hoursNum) || hoursNum <= 0) {
    res.status(400).json({ error: "hours must be a positive number" });
    return;
  }
  if (hoursNum > MAX_HOURS_PER_ENTRY) {
    res.status(400).json({ error: `hours cannot exceed ${MAX_HOURS_PER_ENTRY} per entry` });
    return;
  }
  if (description && String(description).length > 1000) {
    res.status(400).json({ error: "description too long (max 1000 chars)" });
    return;
  }
  const work = startOfDay(new Date(workDate));
  const today = startOfDay(new Date());
  if (work > today) {
    res.status(400).json({ error: "workDate cannot be in the future" });
    return;
  }
  const earliest = earliestAllowedWorkDate(today, 5);
  if (work < earliest) {
    res.status(400).json({
      error: `workDate must be within the last 5 working days (on or after ${earliest.toISOString().slice(0, 10)})`,
    });
    return;
  }

  const role = req.user!.role;
  const isAutoApprove = role === "PROJECT_MANAGER" || role === "MANAGEMENT";
  const status = isAutoApprove ? "APPROVED" : "SUBMITTED";

  const ts = await prisma.timesheet.create({
    data: {
      projectId: String(projectId),
      userId: req.user!.sub,
      workDate: new Date(workDate),
      hours: hoursNum,
      description: description || null,
      status,
      approvedById: isAutoApprove ? req.user!.sub : null,
      approvedAt: isAutoApprove ? new Date() : null,
    },
    include: { user: true, project: true, approvedBy: true },
  });

  await prisma.activity.create({
    data: {
      type: isAutoApprove ? "timesheet.approved" : "timesheet.submitted",
      message: isAutoApprove
        ? `${ts.user.name} logged ${ts.hours}h on ${ts.project.name} (auto-approved)`
        : `${ts.user.name} submitted ${ts.hours}h on ${ts.project.name} for approval`,
      userId: req.user!.sub,
      projectId: ts.projectId,
    },
  });
  await recordAudit(req, {
    action: isAutoApprove ? "timesheet.approved" : "timesheet.created",
    entityType: "Timesheet",
    entityId: ts.id,
    description: isAutoApprove
      ? `${ts.user.name} logged ${ts.hours}h on ${ts.project.name} (auto-approved)`
      : `${ts.user.name} submitted ${ts.hours}h on ${ts.project.name}`,
    after: serialize(ts),
  });

  res.status(201).json(serialize(ts));
});

router.post("/timesheets/:id/submit", async (req, res) => {
  const existing = await prisma.timesheet.findUnique({
    where: { id: req.params.id },
  });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (existing.userId !== req.user!.sub && req.user!.role !== "MANAGEMENT") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const ts = await prisma.timesheet.update({
    where: { id: req.params.id },
    data: { status: "SUBMITTED", rejectionReason: null },
    include: { user: true, project: true, approvedBy: true },
  });
  res.json(serialize(ts));
});

router.post("/timesheets/bulk-approve", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "PROJECT_MANAGER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
  if (ids.length === 0) {
    res.status(400).json({ error: "ids[] required" });
    return;
  }
  const candidates = await prisma.timesheet.findMany({
    where: {
      id: { in: ids },
      status: "SUBMITTED",
      ...(role === "PROJECT_MANAGER"
        ? { project: { pmId: req.user!.sub } }
        : {}),
    },
    select: { id: true, projectId: true },
  });
  const allowedIds = candidates.map((c) => c.id);
  if (allowedIds.length === 0) {
    res.json({ approved: 0, ids: [] });
    return;
  }
  await prisma.timesheet.updateMany({
    where: { id: { in: allowedIds } },
    data: {
      status: "APPROVED",
      approvedById: req.user!.sub,
      approvedAt: new Date(),
    },
  });
  await prisma.activity.createMany({
    data: candidates.map((c) => ({
      type: "timesheet.approved",
      message: `Timesheet bulk approved`,
      userId: req.user!.sub,
      projectId: c.projectId,
    })),
  });
  await recordAudit(req, {
    action: "timesheet.bulk_approved",
    entityType: "Timesheet",
    description: `Bulk approved ${allowedIds.length} timesheet(s)`,
    after: { ids: allowedIds, count: allowedIds.length },
  });
  res.json({ approved: allowedIds.length, ids: allowedIds });
});

router.post("/timesheets/:id/approve", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "PROJECT_MANAGER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const existing = await prisma.timesheet.findUnique({
    where: { id: req.params.id },
    include: { project: { select: { pmId: true } } },
  });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (role === "PROJECT_MANAGER" && existing.project.pmId !== req.user!.sub) {
    res.status(403).json({ error: "Not your project" });
    return;
  }
  const ts = await prisma.timesheet.update({
    where: { id: req.params.id },
    data: {
      status: "APPROVED",
      approvedById: req.user!.sub,
      approvedAt: new Date(),
    },
    include: { user: true, project: true, approvedBy: true },
  });
  await prisma.activity.create({
    data: {
      type: "timesheet.approved",
      message: `Timesheet for ${ts.project.name} approved`,
      userId: req.user!.sub,
      projectId: ts.projectId,
    },
  });
  await recordAudit(req, {
    action: "timesheet.approved",
    entityType: "Timesheet",
    entityId: ts.id,
    description: `Approved ${ts.hours}h by ${ts.user.name} on ${ts.project.name}`,
    before: { status: existing.status },
    after: { status: ts.status, approvedAt: ts.approvedAt },
  });
  res.json(serialize(ts));
});

router.post("/timesheets/:id/reject", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "PROJECT_MANAGER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const reason = String(req.body?.reason || "");
  if (!reason) {
    res.status(400).json({ error: "reason required" });
    return;
  }
  const existing = await prisma.timesheet.findUnique({
    where: { id: req.params.id },
    include: { project: { select: { pmId: true } } },
  });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (role === "PROJECT_MANAGER" && existing.project.pmId !== req.user!.sub) {
    res.status(403).json({ error: "Not your project" });
    return;
  }
  const ts = await prisma.timesheet.update({
    where: { id: req.params.id },
    data: {
      status: "REJECTED",
      approvedById: req.user!.sub,
      approvedAt: new Date(),
      rejectionReason: reason,
    },
    include: { user: true, project: true, approvedBy: true },
  });
  await recordAudit(req, {
    action: "timesheet.rejected",
    entityType: "Timesheet",
    entityId: ts.id,
    description: `Rejected ${ts.hours}h by ${ts.user.name} on ${ts.project.name} — ${reason}`,
    before: { status: existing.status },
    after: { status: ts.status, rejectionReason: reason },
  });
  res.json(serialize(ts));
});

router.delete("/timesheets/:id", async (req, res) => {
  const existing = await prisma.timesheet.findUnique({
    where: { id: req.params.id },
  });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (
    existing.userId !== req.user!.sub &&
    req.user!.role !== "MANAGEMENT"
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (existing.status === "APPROVED" && req.user!.role !== "MANAGEMENT") {
    res.status(400).json({ error: "Cannot delete approved timesheet" });
    return;
  }
  await prisma.timesheet.delete({ where: { id: req.params.id } });
  await recordAudit(req, {
    action: "timesheet.deleted",
    entityType: "Timesheet",
    entityId: req.params.id,
    description: `Deleted timesheet (${existing.hours}h on ${existing.workDate.toISOString().slice(0, 10)})`,
    before: existing,
  });
  res.json({ success: true });
});

export default router;
