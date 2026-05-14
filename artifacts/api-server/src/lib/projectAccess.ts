import { prisma } from "@workspace/db";

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
  if (role === "MANAGEMENT" || role === "SITE_ADMIN") return true;
  const userId = user.sub;
  const where: { id: string; deletedAt: null; [key: string]: unknown } = {
    id: projectId,
    deletedAt: null,
  };
  if (role === "PROJECT_MANAGER") {
    where["pmId"] = userId;
  } else if (role === "SALES") {
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
    where["OR"] = [
      { adminProjectId: userId },
      { status: { in: ["COMPLETE", "CLOSED"] } },
    ];
  } else if (role.startsWith("PRINCIPAL_")) {
    where["resources"] = { some: { user: { principalId: userId } } };
  }
  const found = await prisma.project.findFirst({
    where,
    select: { id: true },
  });
  return !!found;
}

// Stricter check for write operations on a project's children (documents,
// expenses, etc). Only the assigned PM, MGMT, or the project's Admin Project
// may mutate. Returns true if allowed.
export async function userCanWriteProject(
  projectId: string,
  user: { sub: string; role: string },
): Promise<boolean> {
  const role = user.role;
  if (role === "MANAGEMENT") return true;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { pmId: true, adminProjectId: true, deletedAt: true },
  });
  if (!project || project.deletedAt) return false;
  if (role === "PROJECT_MANAGER") return project.pmId === user.sub;
  if (role === "ADMIN_PROJECT") return project.adminProjectId === user.sub;
  return false;
}
