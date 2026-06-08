import { Router, type IRouter } from "express";
import { prisma, type UserRole } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { canViewDailyRate } from "../lib/serializers.js";
import { validateWorkstreamId } from "../lib/workstreams.js";
import { notifyUser } from "../lib/notifications.js";

const router: IRouter = Router();
router.use(requireAuth);

const PRINCIPAL_TO_REPORT_ROLE: Record<string, UserRole> = {
  PRINCIPAL_KONSULTAN: "KONSULTAN",
  PRINCIPAL_TECHNICAL_WRITER: "TECHNICAL_WRITER",
  PRINCIPAL_ADMIN_PROJECT: "ADMIN_PROJECT",
};

// Delivery roles whose ProjectResource assignment, when added by a PM, must be
// approved by the user's Principal before becoming active. ADMIN_PROJECT is
// excluded because Admin Project staffing uses Project.adminProjectId, not
// ProjectResource rows.
const PRINCIPAL_APPROVAL_ROLES = new Set<UserRole>(["KONSULTAN", "TECHNICAL_WRITER"]);

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
  if (callerRole === "MANAGEMENT" || callerRole === "SUPER_ADMIN") return { ok: true };
  if (callerRole === "PROJECT_MANAGER") {
    const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { pmId: true } });
    if (!proj) return { ok: false, status: 404, error: "Project not found" };
    if (proj.pmId !== callerId) return { ok: false, status: 403, error: "Only the assigned PM may modify resources on this project" };
    return { ok: true };
  }
  if (callerRole === "PRINCIPAL_KONSULTAN" || callerRole === "PRINCIPAL_TECHNICAL_WRITER") {
    // Consultant + Technical Writer principals interact with ProjectResource rows
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
  const broad = role === "MANAGEMENT" || role === "SUPER_ADMIN" || role === "ADMIN_PROJECT" || (role && role.startsWith("PRINCIPAL_"));
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
      workstreamId: r.workstreamId ?? null,
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
      pendingPrincipalApproval: r.pendingPrincipalApproval,
    })),
  );
});

async function upsertResource(req: any, res: any, opts: { propose: boolean }) {
  const projectId = req.params.id;
  const { userId, roleInProject, plannedMandays, dailyRate, workstreamId } = req.body || {};
  const workstreamIdProvided = Object.prototype.hasOwnProperty.call(req.body || {}, "workstreamId");
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  const wsCheck = await validateWorkstreamId(projectId, workstreamId);
  if (!wsCheck.ok) {
    res.status(400).json({ error: wsCheck.error });
    return;
  }
  const wsId = wsCheck.workstreamId;
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
  // TECHNICAL_WRITER / ADMIN_PROJECT — typically the "Other Resource" flow
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
  // PM/MGMT writes count as accepted, EXCEPT when a PROJECT_MANAGER adds a
  // delivery user (KONSULTAN / TECHNICAL_WRITER) who has a Principal — those
  // must be approved by that Principal first (pendingPrincipalApproval=true,
  // acceptedAt=null). Principal writes via /propose are proposed (awaiting PM).
  const callerRole = req.user!.role as UserRole;
  const isPmOrMgmt = callerRole === "MANAGEMENT" || callerRole === "SUPER_ADMIN" || callerRole === "PROJECT_MANAGER";
  const needsPrincipalApproval =
    !opts.propose &&
    callerRole === "PROJECT_MANAGER" &&
    !existing &&
    PRINCIPAL_APPROVAL_ROLES.has(user.role) &&
    !!user.principalId;
  const r = await prisma.projectResource.upsert({
    where: { projectId_userId: { projectId, userId } },
    update: {
      roleInProject: roleInProject || null,
      plannedMandays: pm,
      dailyRate: dr,
      // Omitting workstreamId in the request preserves the existing value;
      // pass an explicit null to clear it.
      ...(workstreamIdProvided ? { workstreamId: wsId } : {}),
      // If PM/MGMT touches a row that a Principal previously *proposed* (awaiting
      // PM acceptance), mark accepted now. Do NOT auto-accept a row that is
      // pending the Principal's own approval (PM-added) — that defeats the gate.
      ...(isPmOrMgmt && existing && existing.proposedAt && !existing.acceptedAt && !existing.pendingPrincipalApproval
        ? { acceptedAt: now }
        : {}),
    },
    create: {
      projectId,
      userId,
      roleInProject: roleInProject || null,
      plannedMandays: pm,
      dailyRate: dr,
      workstreamId: wsId,
      // For a PM-added row awaiting Principal approval, record the PM as the
      // requester (proposedById) so the audit/UI can show who initiated it.
      proposedById: opts.propose ? req.user!.sub : (needsPrincipalApproval ? req.user!.sub : null),
      proposedAt: opts.propose || needsPrincipalApproval ? now : null,
      acceptedAt: opts.propose || needsPrincipalApproval ? null : now,
      pendingPrincipalApproval: needsPrincipalApproval,
    },
    include: { user: true, proposedBy: true },
  });
  await recordAudit(req, {
    action: opts.propose
      ? "resource.proposed"
      : needsPrincipalApproval
        ? "resource.approval_requested"
        : (existing ? "resource.updated" : "resource.assigned"),
    entityType: "ProjectResource",
    entityId: r.id,
    description: opts.propose
      ? `Proposed ${user.name} for project ${projectId} (Principal)`
      : needsPrincipalApproval
        ? `Requested Principal approval to assign ${user.name} to project ${projectId}`
        : (existing
          ? `Updated ${user.name} on project ${projectId}: rate=${r.dailyRate}, mandays=${r.plannedMandays}`
          : `Assigned ${user.name} to project ${projectId} (rate=${r.dailyRate}, mandays=${r.plannedMandays})`),
    before: existing ?? undefined,
    after: { id: r.id, projectId: r.projectId, userId: r.userId, roleInProject: r.roleInProject, plannedMandays: r.plannedMandays, dailyRate: r.dailyRate, proposedById: r.proposedById, acceptedAt: r.acceptedAt, pendingPrincipalApproval: r.pendingPrincipalApproval },
  });
  // Notify the resource's Principal that an assignment awaits their approval.
  if (needsPrincipalApproval && user.principalId) {
    await notifyUser({
      userId: user.principalId,
      type: "RESOURCE_APPROVAL_PENDING",
      title: `Approval needed: ${user.name}`,
      message: `A project manager wants to assign ${user.name} to a project. Review and approve or decline.`,
      link: `/projects/${projectId}?tab=resources`,
    });
  }
  res.status(existing ? 200 : 201).json({
    id: r.id,
    projectId: r.projectId,
    workstreamId: r.workstreamId ?? null,
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
    pendingPrincipalApproval: r.pendingPrincipalApproval,
  });
}

router.post(
  "/projects/:id/resources",
  requireRole("MANAGEMENT", "PROJECT_MANAGER"),
  async (req, res) => upsertResource(req, res, { propose: false }),
);

// Bulk add — partial mode: valid rows are created, invalid rows are reported
// in `errors`. Each row goes through the same validation as POST /resources
// (userId, non-negative numbers, roleInProject required for non-implied
// system roles, workstream check, dedupe against existing assignment).
// PM-of-project / MGMT only — Principal proposals stay single-pick.
router.post(
  "/projects/:id/resources/bulk",
  requireRole("MANAGEMENT", "PROJECT_MANAGER"),
  async (req, res) => {
    const projectId = String(req.params.id);
    const body = (req.body ?? {}) as { resources?: unknown };
    const items = Array.isArray(body.resources) ? body.resources : [];
    if (items.length === 0) {
      res.status(400).json({ error: "resources array required" });
      return;
    }
    if (items.length > 100) {
      res.status(400).json({ error: "Maximum 100 resources per bulk request" });
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, pmId: true },
    });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const callerRole = req.user!.role as UserRole;
    if (callerRole === "PROJECT_MANAGER" && project.pmId !== req.user!.sub) {
      res.status(403).json({ error: "Only the assigned PM may add resources to this project" });
      return;
    }

    const IMPLIED_ROLE = new Set<UserRole>(["KONSULTAN", "TECHNICAL_WRITER", "ADMIN_PROJECT"]);
    const created: Array<Record<string, unknown>> = [];
    const errors: Array<{ userId: string; userName: string | null; reason: string }> = [];
    const seen = new Set<string>();
    const now = new Date();

    for (const raw of items) {
      const item = (raw ?? {}) as Record<string, unknown>;
      const userId = typeof item.userId === "string" ? item.userId : "";
      if (!userId) {
        errors.push({ userId: String(item.userId ?? ""), userName: null, reason: "userId required" });
        continue;
      }
      if (seen.has(userId)) {
        errors.push({ userId, userName: null, reason: "Duplicate userId in request" });
        continue;
      }
      seen.add(userId);

      const pm = Number(item.plannedMandays ?? 0);
      const dr = Number(item.dailyRate ?? 0);
      if (pm < 0 || dr < 0 || !isFinite(pm) || !isFinite(dr)) {
        errors.push({ userId, userName: null, reason: "plannedMandays and dailyRate must be non-negative numbers" });
        continue;
      }

      const wsCheck = await validateWorkstreamId(projectId, item.workstreamId);
      if (!wsCheck.ok) {
        errors.push({ userId, userName: null, reason: wsCheck.error });
        continue;
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        errors.push({ userId, userName: null, reason: "User not found" });
        continue;
      }

      const roleInProjectRaw = typeof item.roleInProject === "string" ? item.roleInProject.trim() : "";
      if (!IMPLIED_ROLE.has(user.role) && !roleInProjectRaw) {
        errors.push({
          userId,
          userName: user.name,
          reason: `roleInProject required for ${user.name} (system role ${user.role})`,
        });
        continue;
      }

      const existing = await prisma.projectResource.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      if (existing) {
        errors.push({ userId, userName: user.name, reason: `${user.name} is already assigned to this project` });
        continue;
      }

      // PM-added delivery user (KON/TW) who has a Principal must be approved
      // by that Principal before the assignment becomes active. MGMT stays
      // auto-accepted.
      const needsPrincipalApproval =
        callerRole === "PROJECT_MANAGER" &&
        PRINCIPAL_APPROVAL_ROLES.has(user.role) &&
        !!user.principalId;

      try {
        const r = await prisma.projectResource.create({
          data: {
            projectId,
            userId,
            roleInProject: roleInProjectRaw || null,
            plannedMandays: pm,
            dailyRate: dr,
            workstreamId: wsCheck.workstreamId,
            proposedById: needsPrincipalApproval ? req.user!.sub : null,
            proposedAt: needsPrincipalApproval ? now : null,
            acceptedAt: needsPrincipalApproval ? null : now,
            pendingPrincipalApproval: needsPrincipalApproval,
          },
          include: { user: true },
        });
        await recordAudit(req, {
          action: needsPrincipalApproval ? "resource.approval_requested" : "resource.assigned",
          entityType: "ProjectResource",
          entityId: r.id,
          description: needsPrincipalApproval
            ? `Requested Principal approval to assign ${user.name} to project ${projectId} [bulk]`
            : `Assigned ${user.name} to project ${projectId} (rate=${r.dailyRate}, mandays=${r.plannedMandays}) [bulk]`,
          after: {
            id: r.id, projectId: r.projectId, userId: r.userId,
            roleInProject: r.roleInProject, plannedMandays: r.plannedMandays,
            dailyRate: r.dailyRate, acceptedAt: r.acceptedAt,
            pendingPrincipalApproval: r.pendingPrincipalApproval,
          },
        });
        if (needsPrincipalApproval && user.principalId) {
          await notifyUser({
            userId: user.principalId,
            type: "RESOURCE_APPROVAL_PENDING",
            title: `Approval needed: ${user.name}`,
            message: `A project manager wants to assign ${user.name} to a project. Review and approve or decline.`,
            link: `/projects/${projectId}?tab=resources`,
          });
        }
        created.push({
          id: r.id,
          projectId: r.projectId,
          workstreamId: r.workstreamId ?? null,
          userId: r.userId,
          userName: r.user.name,
          userRole: r.user.role,
          roleInProject: r.roleInProject,
          plannedMandays: r.plannedMandays,
          actualMandays: 0,
          dailyRate: canViewDailyRate(req.user?.role) ? r.dailyRate : 0,
          proposedById: r.proposedById ?? null,
          proposedByName: null,
          proposedAt: r.proposedAt?.toISOString() ?? null,
          acceptedAt: r.acceptedAt?.toISOString() ?? null,
          pendingPrincipalApproval: r.pendingPrincipalApproval,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Database error";
        errors.push({ userId, userName: user.name, reason: msg });
      }
    }

    res.status(201).json({
      createdCount: created.length,
      errorCount: errors.length,
      created,
      errors,
    });
  },
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

// Accept a resource that is awaiting a decision. There are two distinct
// awaiting states, each with its own approver:
//  - pendingPrincipalApproval=true (PM-added supervised user) → only the
//    resource user's Principal (or MGMT) may accept.
//  - principal-proposed (proposedAt set, flag false) → only the project's PM
//    (or MGMT) may accept (existing behavior).
router.post(
  "/resources/:resourceId/accept",
  requireRole("MANAGEMENT", "PROJECT_MANAGER", "PRINCIPAL_KONSULTAN", "PRINCIPAL_TECHNICAL_WRITER"),
  async (req, res) => {
    const resourceId = String(req.params.resourceId);
    const before = await prisma.projectResource.findUnique({ where: { id: resourceId } });
    if (!before) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const project = await prisma.project.findUnique({ where: { id: before.projectId } });
    const user = await prisma.user.findUnique({ where: { id: before.userId } });
    const callerRole = req.user!.role as UserRole;

    if (before.pendingPrincipalApproval) {
      // Principal-approval row: only the resource user's Principal or MGMT.
      const isThisPrincipal =
        (callerRole === "PRINCIPAL_KONSULTAN" || callerRole === "PRINCIPAL_TECHNICAL_WRITER") &&
        user?.principalId === req.user!.sub;
      if (callerRole !== "MANAGEMENT" && callerRole !== "SUPER_ADMIN" && !isThisPrincipal) {
        res.status(403).json({ error: "Only this resource's Principal may approve this assignment" });
        return;
      }
      await prisma.projectResource.update({
        where: { id: before.id },
        data: { acceptedAt: new Date(), pendingPrincipalApproval: false },
      });
      await recordAudit(req, {
        action: "resource.accepted",
        entityType: "ProjectResource",
        entityId: before.id,
        description: `Principal approved ${user?.name ?? before.userId} on project ${before.projectId}`,
      });
      // Notify the PM who requested the assignment.
      if (before.proposedById) {
        await notifyUser({
          userId: before.proposedById,
          type: "RESOURCE_APPROVAL_DECIDED",
          title: `Approved: ${user?.name ?? "resource"}`,
          message: `The assignment of ${user?.name ?? "the resource"} has been approved by their Principal.`,
          link: `/projects/${before.projectId}?tab=resources`,
        });
      }
      res.json({ success: true });
      return;
    }

    // Principal-proposed row: PM-of-project or MGMT (existing behavior).
    if (callerRole !== "MANAGEMENT" && callerRole !== "SUPER_ADMIN" && callerRole !== "PROJECT_MANAGER") {
      res.status(403).json({ error: "Only the assigned PM may accept this proposal" });
      return;
    }
    if (callerRole === "PROJECT_MANAGER" && project?.pmId !== req.user!.sub) {
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
  },
);

// Reject a resource that is awaiting a decision. Symmetric to /accept:
//  - pendingPrincipalApproval row → resource user's Principal or MGMT declines.
//  - principal-proposed row → project's PM or MGMT declines.
// In both cases the row is deleted (the assignment never becomes active).
router.post(
  "/resources/:resourceId/reject",
  requireRole("MANAGEMENT", "PROJECT_MANAGER", "PRINCIPAL_KONSULTAN", "PRINCIPAL_TECHNICAL_WRITER"),
  async (req, res) => {
    const resourceId = String(req.params.resourceId);
    const before = await prisma.projectResource.findUnique({
      where: { id: resourceId },
      include: { user: true },
    });
    if (!before) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const project = await prisma.project.findUnique({ where: { id: before.projectId } });
    const callerRole = req.user!.role as UserRole;

    if (before.pendingPrincipalApproval) {
      const isThisPrincipal =
        (callerRole === "PRINCIPAL_KONSULTAN" || callerRole === "PRINCIPAL_TECHNICAL_WRITER") &&
        before.user.principalId === req.user!.sub;
      if (callerRole !== "MANAGEMENT" && callerRole !== "SUPER_ADMIN" && !isThisPrincipal) {
        res.status(403).json({ error: "Only this resource's Principal may decline this assignment" });
        return;
      }
    } else if (before.proposedAt && !before.acceptedAt) {
      // Principal-proposed row → PM-of-project or MGMT declines.
      if (callerRole !== "MANAGEMENT" && callerRole !== "SUPER_ADMIN" && callerRole !== "PROJECT_MANAGER") {
        res.status(403).json({ error: "Only the assigned PM may decline this proposal" });
        return;
      }
      if (callerRole === "PROJECT_MANAGER" && project?.pmId !== req.user!.sub) {
        res.status(403).json({ error: "Only the assigned PM may decline this proposal" });
        return;
      }
    } else {
      res.status(409).json({ error: "This resource is not awaiting a decision" });
      return;
    }

    await prisma.projectResource.delete({ where: { id: before.id } });
    await recordAudit(req, {
      action: "resource.rejected",
      entityType: "ProjectResource",
      entityId: before.id,
      description: `Declined ${before.user.name} on project ${before.projectId}`,
      before: { id: before.id, projectId: before.projectId, userId: before.userId, roleInProject: before.roleInProject, plannedMandays: before.plannedMandays, dailyRate: before.dailyRate, pendingPrincipalApproval: before.pendingPrincipalApproval },
    });
    // Notify the requester (PM for principal-approval rows; principal for proposals).
    if (before.pendingPrincipalApproval && before.proposedById) {
      await notifyUser({
        userId: before.proposedById,
        type: "RESOURCE_APPROVAL_DECIDED",
        title: `Declined: ${before.user.name}`,
        message: `The assignment of ${before.user.name} was declined by their Principal.`,
        link: `/projects/${before.projectId}?tab=resources`,
      });
    } else if (before.proposedById) {
      await notifyUser({
        userId: before.proposedById,
        type: "RESOURCE_APPROVAL_DECIDED",
        title: `Declined: ${before.user.name}`,
        message: `Your proposed resource ${before.user.name} was declined.`,
        link: `/projects/${before.projectId}?tab=resources`,
      });
    }
    res.json({ success: true });
  },
);

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
