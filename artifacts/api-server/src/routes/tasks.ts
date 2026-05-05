import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";

const router: IRouter = Router();
router.use(requireAuth);

const ALLOWED_STATUSES = new Set(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]);
const PM_ROLES = new Set(["MANAGEMENT", "PROJECT_MANAGER"]);

type TaskWithRelations = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  assigneeId: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignee?: { id: string; name: string } | null;
  createdBy?: { name: string } | null;
  project?: { code: string; name: string; pmId: string | null } | null;
  timeLogs?: { hours: number }[];
};

function serializeTask(t: TaskWithRelations) {
  const loggedHours = (t.timeLogs ?? []).reduce((s, l) => s + l.hours, 0);
  return {
    id: t.id,
    projectId: t.projectId,
    projectCode: t.project?.code ?? null,
    projectName: t.project?.name ?? null,
    title: t.title,
    description: t.description,
    status: t.status,
    startDate: t.startDate ? t.startDate.toISOString() : null,
    endDate: t.endDate ? t.endDate.toISOString() : null,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? null,
    createdById: t.createdById,
    createdByName: t.createdBy?.name ?? null,
    loggedHours,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

const taskInclude = {
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  project: { select: { code: true, name: true, pmId: true } },
  timeLogs: { select: { hours: true } },
} as const;

function parseDateOrNull(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return undefined;
  return d;
}

function canManageProjectTasks(role: string, project: { pmId: string | null }, userId: string): boolean {
  if (role === "MANAGEMENT") return true;
  if (role === "PROJECT_MANAGER" && project.pmId === userId) return true;
  return false;
}

async function canViewProject(
  role: string | undefined,
  userId: string | undefined,
  project: { pmId: string | null; salesId: string | null; id: string },
): Promise<boolean> {
  if (role === "MANAGEMENT" || role === "ADMIN_PROJECT") return true;
  if (role === "PROJECT_MANAGER" && project.pmId === userId) return true;
  if (role === "SALES" && project.salesId === userId) return true;
  if (role === "KONSULTAN" || role === "TECHNICAL_WRITER") {
    const assigned = await prisma.projectResource.findFirst({
      where: { projectId: project.id, userId: userId ?? "" },
      select: { id: true },
    });
    return !!assigned;
  }
  return false;
}

router.get("/projects/:id/tasks", async (req, res) => {
  const projectId = req.params.id;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, pmId: true, salesId: true },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const allowed = await canViewProject(req.user?.role, req.user?.sub, project);
  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: taskInclude,
    orderBy: [{ status: "asc" }, { endDate: "asc" }, { createdAt: "desc" }],
  });
  res.json(tasks.map(serializeTask));
});

router.post("/projects/:id/tasks", async (req, res) => {
  const projectId = req.params.id;
  const userId = req.user!.sub;
  const role = req.user!.role;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, pmId: true },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!canManageProjectTasks(role, project, userId)) {
    res
      .status(403)
      .json({ error: "Only Management or the assigned PM can create tasks" });
    return;
  }
  const { title, description, status, startDate, endDate, assigneeId } =
    req.body || {};
  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  if (!trimmedTitle) {
    res.status(400).json({ error: "title required" });
    return;
  }
  const desc = typeof description === "string" ? description.trim() : null;
  let st = "TODO";
  if (status !== undefined && status !== null && status !== "") {
    if (!ALLOWED_STATUSES.has(String(status))) {
      res.status(400).json({ error: "invalid status" });
      return;
    }
    st = String(status);
  }
  const start = parseDateOrNull(startDate);
  const end = parseDateOrNull(endDate);
  if (start === undefined && startDate !== undefined && startDate !== null && startDate !== "") {
    res.status(400).json({ error: "startDate must be a valid date" });
    return;
  }
  if (end === undefined && endDate !== undefined && endDate !== null && endDate !== "") {
    res.status(400).json({ error: "endDate must be a valid date" });
    return;
  }

  if (assigneeId) {
    const assignment = await prisma.projectResource.findUnique({
      where: { projectId_userId: { projectId, userId: String(assigneeId) } },
      select: { id: true },
    });
    if (!assignment) {
      res
        .status(400)
        .json({ error: "assignee must be a resource on this project" });
      return;
    }
  }

  const task = await prisma.task.create({
    data: {
      projectId,
      title: trimmedTitle,
      description: desc,
      status: st as "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE",
      startDate: start ?? null,
      endDate: end ?? null,
      assigneeId: assigneeId ? String(assigneeId) : null,
      createdById: userId,
    },
    include: taskInclude,
  });
  await recordAudit(req, {
    action: "task.created",
    entityType: "Task",
    entityId: task.id,
    description: `Created task "${task.title}" on project ${projectId}`,
    after: {
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      status: task.status,
      assigneeId: task.assigneeId,
      startDate: task.startDate,
      endDate: task.endDate,
    },
  });
  res.status(201).json(serializeTask(task));
});

router.get("/tasks/mine", async (req, res) => {
  const userId = req.user!.sub;
  const tasks = await prisma.task.findMany({
    where: { assigneeId: userId },
    include: taskInclude,
    orderBy: [{ status: "asc" }, { endDate: "asc" }, { createdAt: "desc" }],
  });
  res.json(tasks.map(serializeTask));
});

router.patch("/tasks/:taskId", async (req, res) => {
  const userId = req.user!.sub;
  const role = req.user!.role;
  const before = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    include: taskInclude,
  });
  if (!before) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const isManager = canManageProjectTasks(role, { pmId: before.project?.pmId ?? null }, userId);
  const isAssignee = before.assigneeId === userId;
  if (!isManager && !isAssignee) {
    res.status(403).json({ error: "Not allowed to update this task" });
    return;
  }

  const { title, description, status, startDate, endDate, assigneeId } =
    req.body || {};

  const data: Record<string, unknown> = {};

  if (title !== undefined) {
    if (!isManager) {
      res.status(403).json({ error: "Only Management/PM can rename tasks" });
      return;
    }
    const t = String(title).trim();
    if (!t) {
      res.status(400).json({ error: "title cannot be empty" });
      return;
    }
    data.title = t;
  }
  if (description !== undefined) {
    if (!isManager) {
      res.status(403).json({ error: "Only Management/PM can edit description" });
      return;
    }
    data.description = description === null || description === "" ? null : String(description).trim();
  }
  if (status !== undefined) {
    if (!ALLOWED_STATUSES.has(String(status))) {
      res.status(400).json({ error: "invalid status" });
      return;
    }
    data.status = String(status);
  }
  if (startDate !== undefined) {
    if (!isManager) {
      res.status(403).json({ error: "Only Management/PM can change dates" });
      return;
    }
    const d = parseDateOrNull(startDate);
    if (d === undefined) {
      res.status(400).json({ error: "startDate must be a valid date" });
      return;
    }
    data.startDate = d;
  }
  if (endDate !== undefined) {
    if (!isManager) {
      res.status(403).json({ error: "Only Management/PM can change dates" });
      return;
    }
    const d = parseDateOrNull(endDate);
    if (d === undefined) {
      res.status(400).json({ error: "endDate must be a valid date" });
      return;
    }
    data.endDate = d;
  }
  if (assigneeId !== undefined) {
    if (!isManager) {
      res.status(403).json({ error: "Only Management/PM can reassign tasks" });
      return;
    }
    if (assigneeId === null || assigneeId === "") {
      data.assigneeId = null;
    } else {
      const assignment = await prisma.projectResource.findUnique({
        where: {
          projectId_userId: { projectId: before.projectId, userId: String(assigneeId) },
        },
        select: { id: true },
      });
      if (!assignment) {
        res
          .status(400)
          .json({ error: "assignee must be a resource on this project" });
        return;
      }
      data.assigneeId = String(assigneeId);
    }
  }

  if (Object.keys(data).length === 0) {
    res.json(serializeTask(before));
    return;
  }

  const updated = await prisma.task.update({
    where: { id: before.id },
    data,
    include: taskInclude,
  });
  await recordAudit(req, {
    action: "task.updated",
    entityType: "Task",
    entityId: updated.id,
    description: `Updated task "${updated.title}"`,
    before: {
      title: before.title,
      status: before.status,
      assigneeId: before.assigneeId,
      startDate: before.startDate,
      endDate: before.endDate,
    },
    after: {
      title: updated.title,
      status: updated.status,
      assigneeId: updated.assigneeId,
      startDate: updated.startDate,
      endDate: updated.endDate,
    },
  });
  res.json(serializeTask(updated));
});

router.delete("/tasks/:taskId", async (req, res) => {
  const userId = req.user!.sub;
  const role = req.user!.role;
  const before = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    include: taskInclude,
  });
  if (!before) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (!canManageProjectTasks(role, { pmId: before.project?.pmId ?? null }, userId)) {
    res
      .status(403)
      .json({ error: "Only Management or assigned PM can delete tasks" });
    return;
  }
  await prisma.task.delete({ where: { id: before.id } });
  await recordAudit(req, {
    action: "task.deleted",
    entityType: "Task",
    entityId: before.id,
    description: `Deleted task "${before.title}"`,
    before: {
      id: before.id,
      title: before.title,
      projectId: before.projectId,
      assigneeId: before.assigneeId,
    },
  });
  res.json({ success: true });
});

router.get("/tasks/:taskId/time-logs", async (req, res) => {
  const userId = req.user!.sub;
  const role = req.user!.role;
  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    select: { id: true, assigneeId: true, project: { select: { pmId: true } } },
  });
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const isManager = canManageProjectTasks(role, { pmId: task.project?.pmId ?? null }, userId);
  const isAssignee = task.assigneeId === userId;
  if (!isManager && !isAssignee) {
    res.status(403).json({ error: "Not allowed to view time logs" });
    return;
  }
  const logs = await prisma.taskTimeLog.findMany({
    where: { taskId: task.id },
    include: { user: { select: { name: true } } },
    orderBy: { loggedAt: "desc" },
  });
  res.json(
    logs.map((l) => ({
      id: l.id,
      taskId: l.taskId,
      userId: l.userId,
      userName: l.user?.name ?? null,
      hours: l.hours,
      note: l.note,
      loggedAt: l.loggedAt.toISOString(),
      createdAt: l.createdAt.toISOString(),
    })),
  );
});

router.post("/tasks/:taskId/time-logs", async (req, res) => {
  const userId = req.user!.sub;
  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    select: { id: true, title: true, assigneeId: true },
  });
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  if (task.assigneeId !== userId) {
    res
      .status(403)
      .json({ error: "Only the task assignee can log hours on this task" });
    return;
  }
  const { hours, note, loggedAt } = req.body || {};
  const h = Number(hours);
  if (!isFinite(h) || h <= 0 || h > 24) {
    res
      .status(400)
      .json({ error: "hours must be a positive number up to 24" });
    return;
  }
  let when: Date = new Date();
  if (loggedAt !== undefined && loggedAt !== null && loggedAt !== "") {
    const d = new Date(String(loggedAt));
    if (isNaN(d.getTime())) {
      res.status(400).json({ error: "loggedAt must be a valid date" });
      return;
    }
    when = d;
  }
  const noteStr = typeof note === "string" && note.trim() ? note.trim() : null;

  const log = await prisma.taskTimeLog.create({
    data: {
      taskId: task.id,
      userId,
      hours: h,
      note: noteStr,
      loggedAt: when,
    },
    include: { user: { select: { name: true } } },
  });
  await recordAudit(req, {
    action: "task.time_logged",
    entityType: "TaskTimeLog",
    entityId: log.id,
    description: `Logged ${h}h on task "${task.title}"`,
    after: {
      id: log.id,
      taskId: log.taskId,
      userId: log.userId,
      hours: log.hours,
      loggedAt: log.loggedAt,
    },
  });
  res.status(201).json({
    id: log.id,
    taskId: log.taskId,
    userId: log.userId,
    userName: log.user?.name ?? null,
    hours: log.hours,
    note: log.note,
    loggedAt: log.loggedAt.toISOString(),
    createdAt: log.createdAt.toISOString(),
  });
});

export default router;
