import { Router, type IRouter } from "express";
import { prisma, type UserRole } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { serializeProject, projectInclude } from "../lib/serializers.js";

const router: IRouter = Router();
router.use(requireAuth);

const PRINCIPAL_TO_REPORT_ROLE: Record<string, UserRole> = {
  PRINCIPAL_KONSULTAN: "KONSULTAN",
  PRINCIPAL_TECHNICAL_WRITER: "TECHNICAL_WRITER",
  PRINCIPAL_ADMIN_PROJECT: "ADMIN_PROJECT",
};

// Lists in-flight projects that need a resource of the calling Principal's
// supervised role. Used by the PrincipalDashboard to surface staffing gaps.
router.get("/principal/projects-needing-resource", async (req, res) => {
  const callerRole = req.user!.role;
  if (!callerRole.startsWith("PRINCIPAL_")) {
    res.status(403).json({ error: "Only Principal roles may use this endpoint" });
    return;
  }
  const reportRole = PRINCIPAL_TO_REPORT_ROLE[callerRole];
  let projects;
  if (reportRole === "KONSULTAN") {
    // Projects in OBSERVATION/ACTIVE without any KONSULTAN resource
    projects = await prisma.project.findMany({
      where: {
        deletedAt: null, archivedAt: null,
        status: { in: ["OBSERVATION", "ACTIVE"] },
        NOT: { resources: { some: { user: { role: "KONSULTAN" } } } },
      },
      include: projectInclude,
      orderBy: { createdAt: "desc" },
    });
  } else if (reportRole === "TECHNICAL_WRITER") {
    // Multi-pick: list projects with no TECHNICAL_WRITER ProjectResource
    // (mirrors the KONSULTAN branch). The legacy single-pick technicalWriterId
    // field is no longer used to determine staffing gaps.
    projects = await prisma.project.findMany({
      where: {
        deletedAt: null, archivedAt: null,
        status: { in: ["OBSERVATION", "ACTIVE"] },
        NOT: { resources: { some: { user: { role: "TECHNICAL_WRITER" } } } },
      },
      include: projectInclude,
      orderBy: { createdAt: "desc" },
    });
  } else {
    // ADMIN_PROJECT
    projects = await prisma.project.findMany({
      where: {
        deletedAt: null, archivedAt: null,
        status: { in: ["OBSERVATION", "ACTIVE", "COMPLETE"] },
        adminProjectId: null,
      },
      include: projectInclude,
      orderBy: { createdAt: "desc" },
    });
  }
  res.json(projects.map((p) => serializeProject(p, req.user?.role)));
});

// Per-supervisee project assignment view for Principals.
// Returns each supervisee (users where principalId === caller.id) with the
// list of projects they are currently assigned to, including project start /
// end dates so the Principal can see when each assignment wraps up.
router.get("/principal/team-projects", async (req, res) => {
  const callerRole = req.user!.role;
  const callerId = req.user!.sub;
  if (!callerRole.startsWith("PRINCIPAL_")) {
    res.status(403).json({ error: "Only Principal roles may use this endpoint" });
    return;
  }
  const reportRole = PRINCIPAL_TO_REPORT_ROLE[callerRole];

  const supervisees = await prisma.user.findMany({
    where: { principalId: callerId, deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      title: true,
      seniority: true,
      isActive: true,
    },
  });
  if (supervisees.length === 0) {
    res.json([]);
    return;
  }

  const userIds = supervisees.map((u) => u.id);
  const activeStatuses = ["OBSERVATION", "ACTIVE", "PAUSE", "COMPLETE"] as const;

  // Resource-based assignments (KONSULTAN / TECHNICAL_WRITER, and any
  // ADMIN_PROJECT rows that exist in ProjectResource).
  const resources = await prisma.projectResource.findMany({
    where: {
      userId: { in: userIds },
      project: { deletedAt: null, archivedAt: null, status: { in: [...activeStatuses] } },
    },
    select: {
      userId: true,
      plannedMandays: true,
      dailyRate: true,
      roleInProject: true,
      acceptedAt: true,
      project: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          pmId: true,
          pm: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Admin-project single-pick assignments (ADMIN_PROJECT supervisees only).
  let adminAssignments: typeof resources = [];
  if (reportRole === "ADMIN_PROJECT") {
    const adminProjects = await prisma.project.findMany({
      where: {
        deletedAt: null, archivedAt: null,
        status: { in: [...activeStatuses] },
        adminProjectId: { in: userIds },
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        adminProjectId: true,
        pmId: true,
        pm: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
    });
    adminAssignments = adminProjects.map((p) => ({
      userId: p.adminProjectId!,
      plannedMandays: 0,
      dailyRate: 0,
      roleInProject: "Admin Project",
      acceptedAt: new Date(),
      project: {
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        pmId: p.pmId,
        pm: p.pm,
        client: p.client,
      },
    }));
  }

  const allAssignments = [...resources, ...adminAssignments];
  const byUser = new Map<string, typeof allAssignments>();
  for (const a of allAssignments) {
    const arr = byUser.get(a.userId) ?? [];
    arr.push(a);
    byUser.set(a.userId, arr);
  }

  const result = supervisees.map((u) => {
    const items = (byUser.get(u.id) ?? []).map((a) => ({
      projectId: a.project.id,
      projectCode: a.project.code,
      projectName: a.project.name,
      status: a.project.status,
      clientName: a.project.client?.name ?? null,
      pmName: a.project.pm?.name ?? null,
      startDate: a.project.startDate ? a.project.startDate.toISOString() : null,
      endDate: a.project.endDate ? a.project.endDate.toISOString() : null,
      roleInProject: a.roleInProject,
      plannedMandays: a.plannedMandays,
      proposed: a.acceptedAt == null,
    }));
    // Sort by endDate (nulls last, soonest first) so the Principal sees
    // assignments wrapping up sooner at the top.
    items.sort((x, y) => {
      if (x.endDate == null && y.endDate == null) return 0;
      if (x.endDate == null) return 1;
      if (y.endDate == null) return -1;
      return x.endDate.localeCompare(y.endDate);
    });
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      title: u.title,
      seniority: u.seniority,
      isActive: u.isActive,
      assignments: items,
    };
  });

  res.json(result);
});

// Lists ProjectResource rows awaiting the calling Principal's approval — i.e.
// PM-added supervised users (KONSULTAN / TECHNICAL_WRITER) where the resource
// user's principalId === caller. Backs the PrincipalDashboard approvals card.
router.get("/principal/pending-resource-approvals", async (req, res) => {
  const callerRole = req.user!.role;
  const callerId = req.user!.sub;
  if (callerRole !== "PRINCIPAL_KONSULTAN" && callerRole !== "PRINCIPAL_TECHNICAL_WRITER") {
    res.status(403).json({ error: "Only Principal roles may use this endpoint" });
    return;
  }
  const rows = await prisma.projectResource.findMany({
    where: {
      pendingPrincipalApproval: true,
      user: { principalId: callerId },
      project: { deletedAt: null, archivedAt: null },
    },
    orderBy: { proposedAt: "desc" },
    select: {
      id: true,
      plannedMandays: true,
      dailyRate: true,
      roleInProject: true,
      proposedAt: true,
      user: { select: { id: true, name: true, role: true } },
      proposedBy: { select: { id: true, name: true } },
      project: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          client: { select: { id: true, name: true } },
        },
      },
    },
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      userId: r.user.id,
      userName: r.user.name,
      userRole: r.user.role,
      roleInProject: r.roleInProject,
      plannedMandays: r.plannedMandays,
      proposedAt: r.proposedAt ? r.proposedAt.toISOString() : null,
      proposedById: r.proposedBy?.id ?? null,
      proposedByName: r.proposedBy?.name ?? null,
      projectId: r.project.id,
      projectCode: r.project.code,
      projectName: r.project.name,
      projectStatus: r.project.status,
      clientName: r.project.client?.name ?? null,
    })),
  );
});

export default router;
