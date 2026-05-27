import { prisma } from "@workspace/db";

export const ALLOWED_STATUSES = new Set(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]);
export const PM_ROLES = new Set(["MANAGEMENT", "PROJECT_MANAGER"]);

export type TaskWithRelations = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: string;
  progressPercent: number;
  billable?: boolean;
  startDate: Date | null;
  endDate: Date | null;
  assigneeId: string | null;
  parentTaskId?: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignee?: { id: string; name: string } | null;
  createdBy?: { name: string } | null;
  project?: { code: string; name: string; pmId: string | null } | null;
  workstreamId?: string | null;
  timeLogs?: { hours: number }[];
  assignees?: { userId: string; user?: { id: string; name: string } | null }[];
  dependencies?: { id: string; dependsOnTaskId: string; dependsOnTask?: { title: string } | null }[];
  _count?: { subtasks?: number };
};

export function serializeTask(t: TaskWithRelations) {
  const loggedHours = (t.timeLogs ?? []).reduce((s, l) => s + l.hours, 0);
  // Build the canonical assignees list: prefer the join table; if it's empty
  // (legacy task created before multi-assignee), fall back to the legacy
  // single assigneeId field so existing data still renders.
  const joinAssignees = (t.assignees ?? [])
    .filter((a) => a.user)
    .map((a) => ({ userId: a.userId, name: a.user!.name }));
  const assignees =
    joinAssignees.length > 0
      ? joinAssignees
      : t.assigneeId && t.assignee
        ? [{ userId: t.assigneeId, name: t.assignee.name }]
        : [];
  // Backward-compat single-assignee fields = first entry of canonical list.
  const primary = assignees[0] ?? null;
  const dependencies = (t.dependencies ?? []).map((d) => ({
    id: d.id,
    dependsOnTaskId: d.dependsOnTaskId,
    dependsOnTitle: d.dependsOnTask?.title ?? null,
  }));
  return {
    id: t.id,
    projectId: t.projectId,
    workstreamId: t.workstreamId ?? null,
    projectCode: t.project?.code ?? null,
    projectName: t.project?.name ?? null,
    title: t.title,
    description: t.description,
    status: t.status,
    progressPercent: t.progressPercent ?? 0,
    billable: t.billable ?? true,
    startDate: t.startDate ? t.startDate.toISOString() : null,
    endDate: t.endDate ? t.endDate.toISOString() : null,
    assigneeId: primary?.userId ?? null,
    assigneeName: primary?.name ?? null,
    assignees,
    parentTaskId: t.parentTaskId ?? null,
    subtaskCount: t._count?.subtasks ?? 0,
    dependencies,
    createdById: t.createdById,
    createdByName: t.createdBy?.name ?? null,
    loggedHours,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

export const taskInclude = {
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  project: { select: { code: true, name: true, pmId: true } },
  timeLogs: { select: { hours: true } },
  assignees: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  },
  dependencies: {
    include: { dependsOnTask: { select: { title: true } } },
  },
  _count: { select: { subtasks: true } },
} as const;

// Validate parentTaskId: must belong to the same project, must not equal the
// task's own id, and must not introduce a cycle. Returns an error message or
// null if valid. `selfId` may be undefined for create.
export async function validateParentTaskId(
  projectId: string,
  parentId: string,
  selfId: string | undefined,
): Promise<string | null> {
  if (selfId && parentId === selfId) return "parentTaskId cannot equal the task itself";
  const parent = await prisma.task.findUnique({
    where: { id: parentId },
    select: { id: true, projectId: true, parentTaskId: true },
  });
  if (!parent || parent.projectId !== projectId) {
    return "parentTaskId must reference a task on the same project";
  }
  if (selfId) {
    let cursor = parent.parentTaskId;
    const visited = new Set<string>([parentId]);
    while (cursor) {
      if (cursor === selfId) return "parentTaskId would create a cycle";
      if (visited.has(cursor)) break;
      visited.add(cursor);
      const next: { parentTaskId: string | null } | null = await prisma.task.findUnique({
        where: { id: cursor },
        select: { parentTaskId: true },
      });
      cursor = next?.parentTaskId ?? null;
    }
  }
  return null;
}

// Validate dependencyTaskIds: each must belong to the same project, none may
// equal selfId, and none may transitively depend on selfId (cycle prevention).
export async function validateDependencyIds(
  projectId: string,
  depIds: string[],
  selfId: string | undefined,
): Promise<string | null> {
  if (depIds.length === 0) return null;
  if (selfId && depIds.includes(selfId)) return "task cannot depend on itself";
  const rows = await prisma.task.findMany({
    where: { id: { in: depIds }, projectId },
    select: { id: true },
  });
  if (rows.length !== depIds.length) {
    return "all dependencyTaskIds must reference tasks on the same project";
  }
  if (!selfId) return null;
  // BFS forward through dependencies of each candidate to ensure none reach selfId
  const visited = new Set<string>();
  const queue = [...depIds];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    if (cur === selfId) return "dependency would create a cycle";
    const next = await prisma.taskDependency.findMany({
      where: { taskId: cur },
      select: { dependsOnTaskId: true },
    });
    for (const n of next) if (!visited.has(n.dependsOnTaskId)) queue.push(n.dependsOnTaskId);
  }
  return null;
}

export function normalizeStringIdArray(input: unknown): string[] | null | "INVALID" {
  if (input === undefined) return null;
  if (input === null) return [];
  if (!Array.isArray(input)) return "INVALID";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string" || !v) return "INVALID";
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

// Helper: returns true if userId is an assignee of the task (via join table OR
// legacy single assigneeId). Used for permission checks.
export async function isTaskAssignee(taskId: string, userId: string): Promise<boolean> {
  const found = await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId, userId } },
    select: { id: true },
  });
  if (found) return true;
  const legacy = await prisma.task.findFirst({
    where: { id: taskId, assigneeId: userId },
    select: { id: true },
  });
  return !!legacy;
}

// Validate every userId is a ProjectResource of the project. Returns
// the list of bad userIds (empty if all valid).
export async function validateAssigneeIds(projectId: string, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await prisma.projectResource.findMany({
    where: { projectId, userId: { in: userIds } },
    select: { userId: true },
  });
  const validSet = new Set(rows.map((r) => r.userId));
  return userIds.filter((id) => !validSet.has(id));
}

// Sentinel returned when the caller sent `assigneeIds` but it was not a valid
// array of non-empty strings. We surface this as a 400 instead of silently
// coercing to "unassign all", which would be destructive on PATCH.
export const ASSIGNEE_IDS_INVALID = Symbol("ASSIGNEE_IDS_INVALID");
export type NormalizedAssignees = string[] | null | typeof ASSIGNEE_IDS_INVALID;

export function normalizeAssigneeIds(input: unknown): NormalizedAssignees {
  if (input === undefined) return null;
  // Explicit null clears all assignees (legitimate caller intent).
  if (input === null) return [];
  if (!Array.isArray(input)) return ASSIGNEE_IDS_INVALID;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string" || !v) return ASSIGNEE_IDS_INVALID;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function parseDateOrNull(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const raw = String(value);
  // Reject extended-year ISO strings (e.g. "+062026-05-05" or "82026-05-05")
  // up front: HTML <input type="date"> uses YYYY-MM-DD, so the year must be
  // exactly 4 digits. Anything else is a typo we should refuse cleanly
  // instead of letting Prisma 500 on it.
  const ymd = /^(\d{4})-\d{2}-\d{2}/.exec(raw);
  if (!ymd) return undefined;
  const year = Number(ymd[1]);
  if (year < 1900 || year > 9999) return undefined;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  return d;
}

export function canManageProjectTasks(role: string, project: { pmId: string | null }, userId: string): boolean {
  if (role === "MANAGEMENT") return true;
  if (role === "PROJECT_MANAGER" && project.pmId === userId) return true;
  return false;
}

export async function canViewProject(
  role: string | undefined,
  userId: string | undefined,
  project: { pmId: string | null; salesId: string | null; id: string },
): Promise<boolean> {
  if (role === "MANAGEMENT" || role === "ADMIN_PROJECT" || role === "FINANCE") return true;
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
