import { prisma } from "@workspace/db";
import { canViewAllProjects, canWriteAnyProject } from "./roles.js";

// Mirror of the role-based scoping in `GET /projects` for per-project endpoints.
// Returns true if the caller is allowed to see the given project (so callers
// can 404 instead of 200 to avoid leaking project existence). Without this
// check, any authenticated user could read any project by guessing/enumerating
// IDs (IDOR), exposing financials, resources, and documents across projects
// they were never assigned to.
export async function userCanAccessProject(
  projectId: string,
  user: { sub: string; role: string },
): Promise<boolean> {
  const role = user.role;
  if (canViewAllProjects(role)) return true;
  const userId = user.sub;
  const where: { id: string; deletedAt: null; [key: string]: unknown } = {
    id: projectId,
    deletedAt: null,
  };
  if (role === "PROJECT_MANAGER") {
    // Mirror of GET /projects: PM only sees projects they lead.
    where["pmId"] = userId;
  } else if (role === "SALES") {
    // Mirror of GET /projects: Sales only sees projects they initiated.
    where["salesId"] = userId;
  } else if (role === "KONSULTAN") {
    where["OR"] = [
      { resources: { some: { userId } } },
      { timesheets: { some: { userId } } },
    ];
  } else if (role === "TECHNICAL_WRITER") {
    where["OR"] = [
      { resources: { some: { userId } } },
      { timesheets: { some: { userId } } },
      { technicalWriterId: userId },
    ];
  } else if (role === "ADMIN_PROJECT") {
    // Mirror of GET /projects: assigned as adminProjectId or on resources.
    where["OR"] = [
      { adminProjectId: userId },
      { resources: { some: { userId } } },
    ];
  } else if (role === "PRINCIPAL_KONSULTAN") {
    // Mirror of GET /projects: in-flight (ACTIVE or PAUSE) projects where the
    // principal is on the resource list themselves or supervises an assigned
    // resource, PLUS all OBSERVATION projects (no involvement filter —
    // principals propose supervisees during observation, so they need
    // visibility before any of their reports are on the roster).
    where["OR"] = [
      {
        status: { in: ["ACTIVE", "PAUSE"] },
        OR: [
          { resources: { some: { userId } } },
          { resources: { some: { user: { principalId: userId } } } },
        ],
      },
      { status: "OBSERVATION" },
    ];
  } else if (role === "PRINCIPAL_TECHNICAL_WRITER") {
    // Mirror of GET /projects: OBSERVATION + in-flight (ACTIVE/PAUSE).
    where["status"] = { in: ["OBSERVATION", "ACTIVE", "PAUSE"] };
  } else if (role === "PRINCIPAL_ADMIN_PROJECT") {
    // Mirror of GET /projects: OBSERVATION + in-flight (ACTIVE/PAUSE) +
    // COMPLETE (matches the projects-needing-resource list, which includes
    // COMPLETE projects still missing an Admin Project for closing docs).
    where["status"] = { in: ["OBSERVATION", "ACTIVE", "PAUSE", "COMPLETE"] };
  } else {
    // HR and any future unrecognized role have no project access by default.
    return false;
  }
  const found = await prisma.project.findFirst({
    where,
    select: { id: true },
  });
  return !!found;
}

// Per-project ownership check for write operations on a project's children.
// Returns true only for: MGMT (full), the assigned PM, or the project's
// Admin Project. FINANCE is intentionally NOT short-circuited here — their
// cross-project document write right is narrow (INVOICE/CONTRACT only) and
// must be enforced explicitly at the call site (see `routes/documents.ts`).
export async function userCanWriteProject(
  projectId: string,
  user: { sub: string; role: string },
): Promise<boolean> {
  const role = user.role;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { pmId: true, adminProjectId: true, deletedAt: true, archivedAt: true },
  });
  // Archived projects are read-only for EVERYONE (including MGMT); the only
  // allowed mutations are unarchive/delete, which live in routes/projects.ts
  // and do not go through this helper.
  if (!project || project.deletedAt || project.archivedAt) return false;
  if (canWriteAnyProject(role)) return true;
  if (role === "PROJECT_MANAGER") return project.pmId === user.sub;
  if (role === "ADMIN_PROJECT") return project.adminProjectId === user.sub;
  return false;
}

// Central read-only guard for archived projects. Every mutating endpoint on a
// project or its children (resources, tasks, expenses, reports, RAID, billing
// milestones, change requests, documents, workstreams, timesheets, ...) must
// call this before writing. Sends the error response itself and returns false
// when the write must be blocked.
export async function assertProjectWritable(
  projectId: string,
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { deletedAt: true, archivedAt: true },
  });
  if (!project || project.deletedAt) {
    res.status(404).json({ error: "Project not found" });
    return false;
  }
  if (project.archivedAt) {
    res.status(400).json({ error: "Project is archived and read-only. Unarchive it first." });
    return false;
  }
  return true;
}
