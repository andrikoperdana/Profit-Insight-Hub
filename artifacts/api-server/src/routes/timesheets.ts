import { Router, type IRouter } from "express";
import { prisma, type TimesheetStatus, type Prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { notifyUser } from "../lib/notifications.js";
import { validateWorkstreamId } from "../lib/workstreams.js";
import { getAppSettings } from "../lib/app-settings.js";
import { validateBody } from "../middlewares/validate.js";
import { CreateTimesheetBody, CreateBulkTimesheetsBody } from "@workspace/api-zod";
import { assertProjectWritable } from "../lib/projectAccess.js";

const MAX_HOURS_PER_ENTRY = 24;

const router: IRouter = Router();
router.use(requireAuth);

// HR is people-ops only and has no timesheet read/write access.
router.use("/timesheets", (req, res, next) => {
  if (req.user?.role === "HR") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
});

function serialize(
  ts: Prisma.TimesheetGetPayload<{
    include: { user: true; project: true; approvedBy: true; task: true };
  }>,
) {
  return {
    id: ts.id,
    projectId: ts.projectId,
    workstreamId: ts.workstreamId ?? null,
    projectName: ts.project.name,
    userId: ts.userId,
    userName: ts.user.name,
    taskId: ts.taskId,
    taskTitle: ts.task?.title ?? null,
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

const tsInclude = { user: true, project: true, approvedBy: true, task: true } as const;

type TimesheetWithRelations = Prisma.TimesheetGetPayload<{ include: typeof tsInclude }>;

const HOURS_PER_MANDAY = 8;

/**
 * Serialize a timesheet list, enriching each row with consumed-vs-planned
 * mandays (per-person on the project AND project-wide) so an approver can see
 * how an entry affects the budget before approving.
 *
 * Consumption is APPROVER-ONLY to avoid leaking whole-team totals: it is
 * computed for the approval scope (already restricted to the caller's
 * projects) or when a single project is requested by someone who can approve
 * it (MANAGEMENT/SUPER_ADMIN, or the project's PM). Everyone else gets nulls.
 */
async function serializeTimesheets(
  list: TimesheetWithRelations[],
  ctx: { scope: string; projectId?: string; role: string; userId: string },
) {
  const base = list.map(serialize);
  if (list.length === 0) return base;

  const isMgmt = ctx.role === "MANAGEMENT" || ctx.role === "SUPER_ADMIN";
  let enrich = false;
  if (ctx.scope === "approval") {
    enrich = true;
  } else if (ctx.projectId) {
    enrich =
      isMgmt ||
      (ctx.role === "PROJECT_MANAGER" && list[0].project.pmId === ctx.userId);
  }
  if (!enrich) return base;

  const pids = Array.from(new Set(list.map((t) => t.projectId)));
  const [resources, byUser, byProject] = await Promise.all([
    prisma.projectResource.findMany({
      where: { projectId: { in: pids } },
      select: { projectId: true, userId: true, plannedMandays: true },
    }),
    prisma.timesheet.groupBy({
      by: ["projectId", "userId"],
      where: { projectId: { in: pids }, status: "APPROVED" },
      _sum: { hours: true },
    }),
    prisma.timesheet.groupBy({
      by: ["projectId"],
      where: { projectId: { in: pids }, status: "APPROVED" },
      _sum: { hours: true },
    }),
  ]);

  const plannedByUser = new Map<string, number>();
  for (const r of resources) plannedByUser.set(`${r.projectId}:${r.userId}`, r.plannedMandays);
  const consumedByUser = new Map<string, number>();
  for (const g of byUser) consumedByUser.set(`${g.projectId}:${g.userId}`, (g._sum.hours ?? 0) / HOURS_PER_MANDAY);
  const consumedByProject = new Map<string, number>();
  for (const g of byProject) consumedByProject.set(g.projectId, (g._sum.hours ?? 0) / HOURS_PER_MANDAY);

  return base.map((s, i) => {
    const t = list[i];
    const key = `${t.projectId}:${t.userId}`;
    return {
      ...s,
      userPlannedMandays: plannedByUser.has(key) ? plannedByUser.get(key)! : null,
      userConsumedMandays: consumedByUser.get(key) ?? 0,
      projectPlannedMandays: t.project.plannedMandays,
      projectConsumedMandays: consumedByProject.get(t.projectId) ?? 0,
    };
  });
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
    if (role !== "MANAGEMENT" && role !== "SUPER_ADMIN") {
      where.project = { pmId: req.user!.sub };
    }
  } else {
    // "all" — restrict by role. Default-deny: any role not explicitly granted
    // a broader view is forced down to their own entries so PRINCIPAL_*,
    // FINANCE, SITE_ADMIN and any future role cannot read cross-team
    // timesheets by passing ?scope=all.
    if (role === "MANAGEMENT" || role === "SUPER_ADMIN") {
      // MANAGEMENT and SUPER_ADMIN see all
    } else if (role === "PROJECT_MANAGER") {
      where.OR = [
        { userId: req.user!.sub },
        { project: { pmId: req.user!.sub } },
      ];
    } else {
      where.userId = req.user!.sub;
    }
  }

  const list = await prisma.timesheet.findMany({
    where,
    include: tsInclude,
    orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  const enriched = await serializeTimesheets(list, {
    scope,
    projectId,
    role,
    userId: req.user!.sub,
  });
  res.json(enriched);
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

// F4: delivery roles must clock hours against a specific task, and a task
// with plannedHours set caps total logged hours (all users, non-REJECTED).
const MANDATORY_TASK_ROLES = new Set(["KONSULTAN", "TECHNICAL_WRITER", "ADMIN_PROJECT"]);

async function checkTaskHoursCap(
  taskId: string,
  plannedHours: number | null,
  addHours: number,
): Promise<{ ok: true } | { ok: false; remainingHours: number; plannedHours: number }> {
  if (plannedHours == null) return { ok: true };
  const agg = await prisma.timesheet.aggregate({
    where: { taskId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
    _sum: { hours: true },
  });
  const used = agg._sum.hours ?? 0;
  const remaining = Math.max(0, plannedHours - used);
  if (addHours > remaining + 1e-9) {
    return { ok: false, remainingHours: Math.round(remaining * 100) / 100, plannedHours };
  }
  return { ok: true };
}

router.post("/timesheets", validateBody(CreateTimesheetBody), async (req, res) => {
  const { projectId, workDate, hours, description, taskId, workstreamId } = req.body || {};
  // Zod guarantees presence + types; reject empty/whitespace strings before DB use.
  if (!String(projectId).trim() || !String(workDate).trim()) {
    res.status(400).json({ error: "projectId, workDate required" });
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
  const backdateDays = (await getAppSettings()).timesheetBackdateDays;
  const earliest = earliestAllowedWorkDate(today, backdateDays);
  if (work < earliest) {
    res.status(400).json({
      error: `workDate must be within the last ${backdateDays} working days (on or after ${earliest.toISOString().slice(0, 10)})`,
    });
    return;
  }
  if (!(await assertProjectWritable(String(projectId), res))) return;

  const role = req.user!.role;
  // PMs don't need timesheet approval: their own hours are auto-approved on any
  // project, the same as MGMT (PMs are approvers themselves).
  const isAutoApprove =
    role === "MANAGEMENT" || role === "SUPER_ADMIN" || role === "PROJECT_MANAGER";
  const status = isAutoApprove ? "APPROVED" : "SUBMITTED";

  // Optional task linkage: validate the task belongs to this project AND the
  // current user is one of its assignees (legacy or join-table). Reject early
  // so we never attach an unrelated/unauthorized task.
  let resolvedTaskId: string | null = null;
  let resolvedWorkstreamId: string | null = null;
  if (!taskId && MANDATORY_TASK_ROLES.has(role)) {
    res.status(400).json({
      error: "You must select a task to log hours against",
      code: "TASK_REQUIRED",
    });
    return;
  }
  if (taskId) {
    const t = await prisma.task.findUnique({
      where: { id: String(taskId) },
      select: {
        id: true,
        projectId: true,
        workstreamId: true,
        assigneeId: true,
        plannedHours: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!t || t.projectId !== String(projectId)) {
      res.status(400).json({ error: "task does not belong to this project" });
      return;
    }
    const userId = req.user!.sub;
    const isAssignee =
      t.assigneeId === userId || t.assignees.some((a) => a.userId === userId);
    if (!isAssignee) {
      res.status(403).json({ error: "you are not an assignee of this task" });
      return;
    }
    const cap = await checkTaskHoursCap(t.id, t.plannedHours ?? null, hoursNum);
    if (!cap.ok) {
      res.status(400).json({
        error: `Task hour cap exceeded: only ${cap.remainingHours}h of ${cap.plannedHours}h planned remain on this task`,
        code: "TASK_HOURS_CAP_EXCEEDED",
        remainingHours: cap.remainingHours,
        plannedHours: cap.plannedHours,
      });
      return;
    }
    resolvedTaskId = t.id;
    // Auto-derive workstream from the linked task; explicit body value
    // overrides below.
    resolvedWorkstreamId = t.workstreamId ?? null;
  }
  if (workstreamId !== undefined) {
    const wsCheck = await validateWorkstreamId(String(projectId), workstreamId);
    if (!wsCheck.ok) {
      res.status(400).json({ error: wsCheck.error });
      return;
    }
    resolvedWorkstreamId = wsCheck.workstreamId;
  }

  const ts = await prisma.timesheet.create({
    data: {
      projectId: String(projectId),
      workstreamId: resolvedWorkstreamId,
      userId: req.user!.sub,
      taskId: resolvedTaskId,
      workDate: new Date(workDate),
      hours: hoursNum,
      description: description || null,
      status,
      approvedById: isAutoApprove ? req.user!.sub : null,
      approvedAt: isAutoApprove ? new Date() : null,
    },
    include: tsInclude,
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

  if (!isAutoApprove && ts.project.pmId && ts.project.pmId !== req.user!.sub) {
    await notifyUser({
      userId: ts.project.pmId,
      type: "timesheet.submitted",
      title: "Timesheet awaiting approval",
      message: `${ts.user.name} submitted ${ts.hours}h on ${ts.project.name} for your approval.`,
      link: "/approvals",
    });
  }

  res.status(201).json(serialize(ts));
});

router.post("/timesheets/bulk", validateBody(CreateBulkTimesheetsBody), async (req, res) => {
  const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;
  if (!entries || entries.length === 0) {
    res.status(400).json({ error: "entries[] required" });
    return;
  }
  if (entries.length > 50) {
    res.status(400).json({ error: "maximum 50 entries per batch" });
    return;
  }
  const role = req.user!.role;
  const userId = req.user!.sub;
  const isMgmt = role === "MANAGEMENT" || role === "SUPER_ADMIN";
  const isPm = role === "PROJECT_MANAGER";
  // Pre-fetch each referenced project's pmId/name for submission notifications.
  // (PMs auto-approve their own hours on any project, so this no longer gates
  // PM approval — it's only used to notify the project PM about others' entries.)
  const projectIds: string[] = Array.from(new Set(entries.map((e: any) => String(e?.projectId || "")).filter(Boolean)));
  // Archived projects are read-only: reject the whole batch if any referenced
  // project is archived (or deleted) rather than silently dropping entries.
  for (const pid of projectIds) {
    if (!(await assertProjectWritable(pid, res))) return;
  }
  const projectPmMap = new Map<string, string | null>();
  const projectNameMap = new Map<string, string>();
  if (projectIds.length > 0) {
    const projs = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, pmId: true, name: true },
    });
    projs.forEach((p) => {
      projectPmMap.set(p.id, p.pmId);
      projectNameMap.set(p.id, p.name);
    });
  }
  const todayStart = startOfDay(new Date());
  const backdateDays = (await getAppSettings()).timesheetBackdateDays;
  const earliest = earliestAllowedWorkDate(todayStart, backdateDays);
  const results: Array<{ index: number; ok: boolean; id?: string | null; error?: string | null }> = [];
  let created = 0;
  let failed = 0;
  const submittedByProject = new Map<string, number>();
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    try {
      const projectId = e?.projectId ? String(e.projectId) : "";
      const workDateStr = e?.workDate ? String(e.workDate) : "";
      const hoursNum = Number(e?.hours);
      if (!projectId || !workDateStr || !isFinite(hoursNum)) {
        results.push({ index: i, ok: false, error: "projectId, workDate, hours required" });
        failed++;
        continue;
      }
      if (hoursNum <= 0 || hoursNum > MAX_HOURS_PER_ENTRY) {
        results.push({ index: i, ok: false, error: `hours must be 0 < h <= ${MAX_HOURS_PER_ENTRY}` });
        failed++;
        continue;
      }
      const work = startOfDay(new Date(workDateStr));
      if (work > todayStart || work < earliest) {
        results.push({ index: i, ok: false, error: "workDate out of allowed range" });
        failed++;
        continue;
      }
      let resolvedTaskId: string | null = null;
      let resolvedWsId: string | null = null;
      if (!e.taskId && MANDATORY_TASK_ROLES.has(role)) {
        results.push({ index: i, ok: false, error: "task selection is required for your role" });
        failed++;
        continue;
      }
      if (e.taskId) {
        const t = await prisma.task.findUnique({
          where: { id: String(e.taskId) },
          select: { id: true, projectId: true, workstreamId: true, assigneeId: true, plannedHours: true, assignees: { select: { userId: true } } },
        });
        if (!t || t.projectId !== projectId) {
          results.push({ index: i, ok: false, error: "task does not belong to project" });
          failed++;
          continue;
        }
        const isAssignee = t.assigneeId === userId || t.assignees.some((a) => a.userId === userId);
        if (!isAssignee) {
          results.push({ index: i, ok: false, error: "not an assignee of task" });
          failed++;
          continue;
        }
        const cap = await checkTaskHoursCap(t.id, t.plannedHours ?? null, hoursNum);
        if (!cap.ok) {
          results.push({
            index: i,
            ok: false,
            error: `task hour cap exceeded: only ${cap.remainingHours}h of ${cap.plannedHours}h planned remain`,
          });
          failed++;
          continue;
        }
        resolvedTaskId = t.id;
        resolvedWsId = t.workstreamId ?? null;
      }
      if (e.workstreamId !== undefined) {
        const wsCheck = await validateWorkstreamId(projectId, e.workstreamId);
        if (!wsCheck.ok) {
          results.push({ index: i, ok: false, error: wsCheck.error });
          failed++;
          continue;
        }
        resolvedWsId = wsCheck.workstreamId;
      }
      const entryAutoApprove = isMgmt || isPm;
      const ts = await prisma.timesheet.create({
        data: {
          projectId,
          workstreamId: resolvedWsId,
          userId,
          taskId: resolvedTaskId,
          workDate: new Date(workDateStr),
          hours: hoursNum,
          description: e.description || null,
          status: entryAutoApprove ? "APPROVED" : "SUBMITTED",
          approvedById: entryAutoApprove ? userId : null,
          approvedAt: entryAutoApprove ? new Date() : null,
        },
      });
      results.push({ index: i, ok: true, id: ts.id });
      created++;
      if (!entryAutoApprove) {
        submittedByProject.set(projectId, (submittedByProject.get(projectId) ?? 0) + 1);
      }
    } catch (err) {
      results.push({ index: i, ok: false, error: err instanceof Error ? err.message : "Unknown error" });
      failed++;
    }
  }
  await recordAudit(req, {
    action: "timesheet.bulk_created",
    entityType: "Timesheet",
    entityId: userId,
    description: `Bulk timesheet entry: ${created} created, ${failed} failed`,
  });
  await Promise.all(
    Array.from(submittedByProject.entries()).map(([pid, count]) => {
      const pmId = projectPmMap.get(pid);
      if (!pmId || pmId === userId) return Promise.resolve();
      const name = projectNameMap.get(pid) ?? "a project";
      return notifyUser({
        userId: pmId,
        type: "timesheet.submitted",
        title: "Timesheets awaiting approval",
        message: `${count} timesheet ${count === 1 ? "entry was" : "entries were"} submitted on ${name} for your approval.`,
        link: "/approvals",
      });
    }),
  );
  res.status(201).json({ created, failed, results });
});

router.post("/timesheets/:id/submit", async (req, res) => {
  const existing = await prisma.timesheet.findUnique({
    where: { id: req.params.id },
  });
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (existing.userId !== req.user!.sub && req.user!.role !== "MANAGEMENT" && req.user!.role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // Only DRAFT/REJECTED entries can be (re)submitted. An APPROVED entry must
  // never revert to SUBMITTED — that would drag already-approved hours back
  // into the approval flow (e.g. a PM's own auto-approved timesheet).
  if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
    res.status(409).json({ error: "Only draft or rejected timesheets can be submitted" });
    return;
  }
  if (!(await assertProjectWritable(existing.projectId, res))) return;
  const ts = await prisma.timesheet.update({
    where: { id: req.params.id },
    data: { status: "SUBMITTED", rejectionReason: null, approvedById: null, approvedAt: null },
    include: tsInclude,
  });
  // Notify the project PM about the (re)submission. Compare the PM against the
  // actor, not the entry owner, so MGMT submitting on behalf of a PM-owned entry
  // still notifies that PM, but the PM submitting their own entry does not.
  if (ts.project.pmId && ts.project.pmId !== req.user!.sub) {
    await notifyUser({
      userId: ts.project.pmId,
      type: "timesheet.submitted",
      title: "Timesheet awaiting approval",
      message: `${ts.user.name} resubmitted ${ts.hours}h on ${ts.project.name} for your approval.`,
      link: "/approvals",
    });
  }
  res.json(serialize(ts));
});

router.post("/timesheets/bulk-approve", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "PROJECT_MANAGER" && role !== "SUPER_ADMIN") {
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
    select: { id: true, projectId: true, userId: true },
  });
  const allowedIds = candidates.map((c) => c.id);
  if (allowedIds.length === 0) {
    res.json({ approved: 0, ids: [] });
    return;
  }
  // Archived projects are read-only — block the batch if any selected entry
  // belongs to an archived (or deleted) project.
  for (const pid of Array.from(new Set(candidates.map((c) => c.projectId)))) {
    if (!(await assertProjectWritable(pid, res))) return;
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
  const approvedByUser = new Map<string, number>();
  for (const c of candidates) {
    if (c.userId === req.user!.sub) continue;
    approvedByUser.set(c.userId, (approvedByUser.get(c.userId) ?? 0) + 1);
  }
  await Promise.all(
    Array.from(approvedByUser.entries()).map(([uid, count]) =>
      notifyUser({
        userId: uid,
        type: "timesheet.approved",
        title: "Timesheets approved",
        message: `${count} of your timesheet ${count === 1 ? "entry was" : "entries were"} approved.`,
        link: "/timesheets",
      }),
    ),
  );
  res.json({ approved: allowedIds.length, ids: allowedIds });
});

router.post("/timesheets/:id/approve", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "PROJECT_MANAGER" && role !== "SUPER_ADMIN") {
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
  if (existing.status !== "SUBMITTED") {
    res.status(409).json({ error: `Cannot approve a timesheet in ${existing.status} state` });
    return;
  }
  if (!(await assertProjectWritable(existing.projectId, res))) return;
  const ts = await prisma.timesheet.update({
    where: { id: req.params.id },
    data: {
      status: "APPROVED",
      approvedById: req.user!.sub,
      approvedAt: new Date(),
    },
    include: tsInclude,
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
  if (ts.userId !== req.user!.sub) {
    await notifyUser({
      userId: ts.userId,
      type: "timesheet.approved",
      title: "Timesheet approved",
      message: `Your ${ts.hours}h entry on ${ts.project.name} was approved.`,
      link: "/timesheets",
    });
  }
  res.json(serialize(ts));
});

router.post("/timesheets/:id/reject", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "PROJECT_MANAGER" && role !== "SUPER_ADMIN") {
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
  if (existing.status !== "SUBMITTED") {
    res.status(409).json({ error: `Cannot reject a timesheet in ${existing.status} state` });
    return;
  }
  if (!(await assertProjectWritable(existing.projectId, res))) return;
  const ts = await prisma.timesheet.update({
    where: { id: req.params.id },
    data: {
      status: "REJECTED",
      approvedById: req.user!.sub,
      approvedAt: new Date(),
      rejectionReason: reason,
    },
    include: tsInclude,
  });
  await recordAudit(req, {
    action: "timesheet.rejected",
    entityType: "Timesheet",
    entityId: ts.id,
    description: `Rejected ${ts.hours}h by ${ts.user.name} on ${ts.project.name} — ${reason}`,
    before: { status: existing.status },
    after: { status: ts.status, rejectionReason: reason },
  });
  if (ts.userId !== req.user!.sub) {
    await notifyUser({
      userId: ts.userId,
      type: "timesheet.rejected",
      title: "Timesheet rejected",
      message: `Your ${ts.hours}h entry on ${ts.project.name} was rejected: ${reason}`,
      link: "/timesheets",
    });
  }
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
    req.user!.role !== "MANAGEMENT" &&
    req.user!.role !== "SUPER_ADMIN"
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (existing.status === "APPROVED" && req.user!.role !== "MANAGEMENT" && req.user!.role !== "SUPER_ADMIN") {
    res.status(400).json({ error: "Cannot delete approved timesheet" });
    return;
  }
  if (!(await assertProjectWritable(existing.projectId, res))) return;
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
