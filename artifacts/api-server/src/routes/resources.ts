import { Router, type IRouter } from "express";
import { prisma, type UserRole } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { canViewDailyRate } from "../lib/serializers.js";

const router: IRouter = Router();
router.use(requireAuth);

const PRINCIPAL_TO_REPORT_ROLE: Record<string, UserRole> = {
  PRINCIPAL_KONSULTAN: "KONSULTAN",
  PRINCIPAL_TECHNICAL_WRITER: "TECHNICAL_WRITER",
  PRINCIPAL_ADMIN_PROJECT: "ADMIN_PROJECT",
};

// Authorization for write operations on a single ProjectResource row.
// MGMT or the project's PM may always write. A Principal may write only when
// the target user is one of their direct supervisees AND the role matches their
// supervised role (e.g. PRINCIPAL_KONSULTAN -> KONSULTAN).
async function canWriteResourceFor(opts: {
  callerRole: UserRole;
  callerId: string;
  projectId: string;
  targetUserId: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { callerRole, callerId, projectId, targetUserId } = opts;
  if (callerRole === "MANAGEMENT") return { ok: true };
  if (callerRole === "PROJECT_MANAGER") {
    const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { pmId: true } });
    if (!proj) return { ok: false, status: 404, error: "Project not found" };
    if (proj.pmId !== callerId) return { ok: false, status: 403, error: "Only the assigned PM may modify resources on this project" };
    return { ok: true };
  }
  if (callerRole === "PRINCIPAL_KONSULTAN" || callerRole === "PRINCIPAL_TECHNICAL_WRITER") {
    // Konsultan + Technical Writer principals interact with ProjectResource rows
    // (multi-pick). PRINCIPAL_ADMIN_PROJECT still uses the single-pick adminProjectId
    // field on Project (PATCH /projects/:id) and must not write resource rows here.
    const expectedRole = PRINCIPAL_TO_REPORT_ROLE[callerRole];
    const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true, principalId: true } });
    if (!target) return { ok: false, status: 404, error: "Target user not found" };
    if (target.role !== expectedRole) return { ok: false, status: 403, error: "Principal can only manage resources of their supervised role" };
    if (target.principalId !== callerId) return { ok: false, status: 403, error: "Principal can only manage their own supervisees" };
    return { ok: true };
  }
  return { ok: false, status: 403, error: "Forbidden" };
}

router.get("/projects/:id/resources", async (req, res) => {
  const projectId = req.params.id;
  const userId = req.user?.sub;
  const role = req.user?.role;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, pmId: true, salesId: true, technicalWriterId: true, adminProjectId: true },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const broad = role === "MANAGEMENT" || role === "ADMIN_PROJECT" || role === "FINANCE" || (role && role.startsWith("PRINCIPAL_"));
  let allowed = !!broad;
  if (!allowed && role === "PROJECT_MANAGER" && project.pmId === userId) allowed = true;
  if (!allowed && role === "SALES" && project.salesId === userId) allowed = true;
  if (!allowed && role === "TECHNICAL_WRITER" && project.technicalWriterId === userId) allowed = true;
  if (!allowed && (role === "KONSULTAN" || role === "TECHNICAL_WRITER")) {
    const assigned = await prisma.projectResource.findFirst({
      where: { projectId, userId: userId ?? "" },
      select: { id: true },
    });
    if (assigned) allowed = true;
  }
  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const resources = await prisma.projectResource.findMany({
    where: { projectId },
    include: { user: true, proposedBy: true },
    orderBy: { createdAt: "asc" },
  });
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
      dailyRate: canViewDailyRate(role) ? r.dailyRate : 0,
      proposedById: r.proposedById ?? null,
      proposedByName: r.proposedBy?.name ?? null,
      proposedAt: r.proposedAt?.toISOString() ?? null,
      acceptedAt: r.acceptedAt?.toISOString() ?? null,
    })),
  );
});

async function upsertResource(req: any, res: any, opts: { propose: boolean }) {
  const projectId = req.params.id;
  const { userId, roleInProject, plannedMandays, dailyRate } = req.body || {};
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const pm = Number(plannedMandays || 0);
  const dr = Number(dailyRate || 0);
  if (pm < 0 || dr < 0 || !isFinite(pm) || !isFinite(dr)) {
    res.status(400).json({ error: "plannedMandays and dailyRate must be non-negative numbers" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  // Mirror the UI rule: when assigning a user whose system role doesn't already
  // imply their function on the project (i.e. anyone other than KONSULTAN /
  // TECHNICAL_WRITER / ADMIN_PROJECT — typically the "Resource Lainnya" flow
  // for Sales / SOC Manager / Security Engineer / Junior SE / etc.),
  // `roleInProject` must be filled so the row carries a meaningful position label.
  const IMPLIED_ROLE = new Set<UserRole>([
    "KONSULTAN",
    "TECHNICAL_WRITER",
    "ADMIN_PROJECT",
  ]);
  const roleInProjectClean =
    typeof roleInProject === "string" ? roleInProject.trim() : "";
  if (!IMPLIED_ROLE.has(user.role) && !roleInProjectClean) {
    res.status(400).json({
      error: "roleInProject required for non-Consultant/Writer/Admin resources (e.g. SOC Manager, Security Engineer)",
    });
    return;
  }
  const authz = await canWriteResourceFor({
    callerRole: req.user!.role as UserRole,
    callerId: req.user!.sub,
    projectId,
    targetUserId: userId,
  });
  if (!authz.ok) {
    res.status(authz.status).json({ error: authz.error });
    return;
  }
  const existing = await prisma.projectResource.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  const targetProject = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true },
  });
  // Note: previously enforced a hard cap of 2 active projects per KONSULTAN
  // (returned 409). Removed at user request — allocation overload is now a
  // warning surfaced in the UI (PM Allocation / Resource cards), but never
  // blocks assignment. PM has final say.
  const now = new Date();
  // PM/MGMT writes always count as accepted. Principal writes via /propose are
  // marked proposed (acceptedAt = null until PM acts).
  const callerRole = req.user!.role as UserRole;
  const isPmOrMgmt = callerRole === "MANAGEMENT" || callerRole === "PROJECT_MANAGER";
  const r = await prisma.projectResource.upsert({
    where: { projectId_userId: { projectId, userId } },
    update: {
      roleInProject: roleInProject || null,
      plannedMandays: pm,
      dailyRate: dr,
      // If PM/MGMT touches a previously-proposed row, mark accepted now.
      ...(isPmOrMgmt && existing && existing.proposedAt && !existing.acceptedAt
        ? { acceptedAt: now }
        : {}),
    },
    create: {
      projectId,
      userId,
      roleInProject: roleInProject || null,
      plannedMandays: pm,
      dailyRate: dr,
      proposedById: opts.propose ? req.user!.sub : null,
      proposedAt: opts.propose ? now : null,
      acceptedAt: opts.propose ? null : now,
    },
    include: { user: true, proposedBy: true },
  });
  await recordAudit(req, {
    action: opts.propose ? "resource.proposed" : (existing ? "resource.updated" : "resource.assigned"),
    entityType: "ProjectResource",
    entityId: r.id,
    description: opts.propose
      ? `Proposed ${user.name} for project ${projectId} (Principal)`
      : (existing
        ? `Updated ${user.name} on project ${projectId}: rate=${r.dailyRate}, mandays=${r.plannedMandays}`
        : `Assigned ${user.name} to project ${projectId} (rate=${r.dailyRate}, mandays=${r.plannedMandays})`),
    before: existing ?? undefined,
    after: { id: r.id, projectId: r.projectId, userId: r.userId, roleInProject: r.roleInProject, plannedMandays: r.plannedMandays, dailyRate: r.dailyRate, proposedById: r.proposedById, acceptedAt: r.acceptedAt },
  });
  res.status(existing ? 200 : 201).json({
    id: r.id,
    projectId: r.projectId,
    userId: r.userId,
    userName: r.user.name,
    userRole: r.user.role,
    roleInProject: r.roleInProject,
    plannedMandays: r.plannedMandays,
    actualMandays: 0,
    dailyRate: canViewDailyRate(req.user?.role) ? r.dailyRate : 0,
    proposedById: r.proposedById ?? null,
    proposedByName: r.proposedBy?.name ?? null,
    proposedAt: r.proposedAt?.toISOString() ?? null,
    acceptedAt: r.acceptedAt?.toISOString() ?? null,
  });
}

router.post(
  "/projects/:id/resources",
  requireRole("MANAGEMENT", "PROJECT_MANAGER"),
  async (req, res) => upsertResource(req, res, { propose: false }),
);

router.post("/projects/:id/resources/propose", requireRole("PRINCIPAL_KONSULTAN", "PRINCIPAL_TECHNICAL_WRITER"), async (req, res) => {
  // Status guard: proposals only allowed on assignable projects.
  const project = await prisma.project.findUnique({
    where: { id: String(req.params.id) },
    select: { status: true },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (project.status !== "OBSERVATION" && project.status !== "ACTIVE") {
    res.status(409).json({ error: "Resources can only be proposed on OBSERVATION or ACTIVE projects" });
    return;
  }
  await upsertResource(req, res, { propose: true });
});

// Allow PM/MGMT to "accept" a proposed resource explicitly (sets acceptedAt).
router.post("/resources/:resourceId/accept", requireRole("MANAGEMENT", "PROJECT_MANAGER"), async (req, res) => {
  const resourceId = String(req.params.resourceId);
  const before = await prisma.projectResource.findUnique({ where: { id: resourceId } });
  if (!before) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const project = await prisma.project.findUnique({ where: { id: before.projectId } });
  const user = await prisma.user.findUnique({ where: { id: before.userId } });
  if (req.user!.role === "PROJECT_MANAGER" && project?.pmId !== req.user!.sub) {
    res.status(403).json({ error: "Only the assigned PM may accept this proposal" });
    return;
  }
  await prisma.projectResource.update({
    where: { id: before.id },
    data: { acceptedAt: new Date() },
  });
  await recordAudit(req, {
    action: "resource.accepted",
    entityType: "ProjectResource",
    entityId: before.id,
    description: `Accepted proposed resource ${user?.name ?? before.userId} on project ${before.projectId}`,
  });
  res.json({ success: true });
});

router.delete("/resources/:resourceId", async (req, res) => {
  const before = await prisma.projectResource.findUnique({
    where: { id: req.params.resourceId },
    include: { user: true },
  });
  if (!before) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const authz = await canWriteResourceFor({
    callerRole: req.user!.role as UserRole,
    callerId: req.user!.sub,
    projectId: before.projectId,
    targetUserId: before.userId,
  });
  if (!authz.ok) {
    res.status(authz.status).json({ error: authz.error });
    return;
  }
  await prisma.projectResource.delete({ where: { id: req.params.resourceId } });
  await recordAudit(req, {
    action: "resource.removed",
    entityType: "ProjectResource",
    entityId: before.id,
    description: `Removed ${before.user.name} from project`,
    before: { id: before.id, projectId: before.projectId, userId: before.userId, roleInProject: before.roleInProject, plannedMandays: before.plannedMandays, dailyRate: before.dailyRate },
  });
  res.json({ success: true });
});

export default router;
