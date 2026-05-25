import { Router, type IRouter } from "express";
import { prisma, type ProjectStatus } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  serializeProject,
  projectInclude,
  computeMetrics,
  canViewProjectFinancials,
  canViewDailyRate,
} from "../lib/serializers.js";
import { recordAudit } from "../lib/audit.js";
import { issueSurveyTokenIfMissing } from "../lib/surveyDefaults.js";
import { notifyUsers } from "../lib/notifications.js";
import { userCanAccessProject } from "../lib/projectAccess.js";
import {
  writeRoles,
  validatePdfDataUrl,
  sanitizeFileName,
  parseSafeDate,
} from "../lib/projectValidators.js";
import { parsePagination, setTotalCount } from "../lib/pagination.js";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/projects", async (req, res) => {
  const status = req.query.status as ProjectStatus | undefined;
  const role = req.user!.role;
  const userId = req.user!.sub;
  const includeDeleted = req.query.includeDeleted === "true" && role === "MANAGEMENT";
  const where: any = includeDeleted ? {} : { deletedAt: null };
  if (status) where.status = status;
  // Role-based scoping: PM sees own projects; Sales sees own projects.
  // Konsultan/TW see projects they are assigned to OR have logged time on.
  // Management/Admin Project see all.
  if (role === "PROJECT_MANAGER") {
    // PM only sees the projects they lead. PMs are never staffed as a
    // delivery resource in this organization.
    where.pmId = userId;
  } else if (role === "SALES") {
    // Sales only sees the projects they initiated. They are not staffed as
    // delivery resources, so resource-based visibility is intentionally
    // omitted to keep account ownership clean across the Sales team.
    where.salesId = userId;
  } else if (role === "KONSULTAN") {
    where.OR = [
      { resources: { some: { userId } } },
      { timesheets: { some: { userId } } },
    ];
  } else if (role === "TECHNICAL_WRITER") {
    where.OR = [
      { resources: { some: { userId } } },
      { timesheets: { some: { userId } } },
      { technicalWriterId: userId },
    ];
  } else if (role === "ADMIN_PROJECT") {
    // Admin Project only sees projects they are assigned to (as the project's
    // adminProjectId or listed on the resource roster). They cannot browse
    // other projects, including COMPLETE/CLOSED ones outside their scope.
    where.OR = [
      { adminProjectId: userId },
      { resources: { some: { userId } } },
    ];
  } else if (role === "PRINCIPAL_KONSULTAN") {
    // Principal Consultant: ACTIVE projects only, and only when the principal
    // is involved (themselves on the resource list) or one of their direct
    // supervisees is assigned. Other statuses are hidden entirely.
    where.status = "ACTIVE";
    where.OR = [
      { resources: { some: { userId } } },
      { resources: { some: { user: { principalId: userId } } } },
    ];
  } else if (role === "PRINCIPAL_TECHNICAL_WRITER" || role === "PRINCIPAL_ADMIN_PROJECT") {
    // Principal TW / Principal AP: ACTIVE projects only (no involvement
    // filter — they need visibility across all active engagements to plan
    // staffing). DRAFT/OBSERVATION/PAUSE/COMPLETE/CLOSED are hidden.
    where.status = "ACTIVE";
  } else if (role === "HR") {
    // HR has no project visibility. Return empty without leaking existence.
    res.json([]);
    return;
  }
  // FINANCE, MANAGEMENT, SITE_ADMIN: no scoping — see all projects.
  const { limit, offset, requested } = parsePagination(req.query, {
    defaultLimit: 500,
    maxLimit: 500,
  });
  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      include: projectInclude,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    }),
    requested ? prisma.project.count({ where }) : Promise.resolve(0),
  ]);
  if (requested) setTotalCount(res, total);
  res.json(projects.map((p) => serializeProject(p, req.user?.role)));
});

router.get("/projects/:id", async (req, res) => {
  if (!(await userCanAccessProject(req.params.id, req.user!))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const p = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      ...projectInclude,
      documents: { include: { uploadedBy: true } },
    },
  });
  if (!p) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const base = serializeProject(p, req.user?.role);
  const showFinancials = canViewProjectFinancials(req.user?.role);
  const showDailyRate = canViewDailyRate(req.user?.role);
  res.json({
    ...base,
    client: {
      id: p.client.id,
      name: p.client.name,
      contactPerson: p.client.contactPerson,
      email: p.client.email,
      phone: p.client.phone,
      industry: p.client.industry,
      createdAt: p.client.createdAt.toISOString(),
    },
    resources: (() => {
      const approvedHoursByUser = new Map<string, number>();
      for (const ts of p.timesheets) {
        if (ts.status === "APPROVED") {
          approvedHoursByUser.set(ts.userId, (approvedHoursByUser.get(ts.userId) ?? 0) + ts.hours);
        }
      }
      return p.resources.map((r) => {
        const actualMandays = (approvedHoursByUser.get(r.userId) ?? 0) / 8;
        return {
        id: r.id,
        projectId: r.projectId,
        userId: r.userId,
        userName: r.user.name,
        userRole: r.user.role,
        roleInProject: r.roleInProject,
        plannedMandays: r.plannedMandays,
        actualMandays,
        dailyRate: showDailyRate ? r.dailyRate : 0,
      };
    });
    })(),
    documents: p.documents.map((d) => ({
      id: d.id,
      projectId: d.projectId,
      type: d.type,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      invoiceNumber: d.invoiceNumber,
      invoiceAmount: showFinancials ? d.invoiceAmount : null,
      invoiceStatus: d.invoiceStatus,
      notes: d.notes,
      uploadedById: d.uploadedById,
      uploadedByName: d.uploadedBy?.name ?? null,
      uploadedAt: d.uploadedAt.toISOString(),
    })),
  });
});

router.post("/projects", requireRole(...writeRoles), async (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.name || !b.clientId) {
    res.status(400).json({ error: "code, name, clientId required" });
    return;
  }
  const cv = Number(b.contractValue || 0);
  const ec = Number(b.estimatedCost || 0);
  const pm = Number(b.plannedMandays || 0);
  if (cv < 0 || ec < 0 || pm < 0) {
    res.status(400).json({ error: "contractValue, estimatedCost, plannedMandays must be non-negative" });
    return;
  }
  let vatPercent = 11;
  if (b.vatPercent !== undefined && b.vatPercent !== null && b.vatPercent !== "") {
    const v = Number(b.vatPercent);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      res.status(400).json({ error: "vatPercent must be a number between 0 and 100" });
      return;
    }
    vatPercent = v;
  }
  const contractValueIncludesVat =
    b.contractValueIncludesVat === undefined ? true : Boolean(b.contractValueIncludesVat);
  // Sales-role submissions are always DRAFT, owned by the submitting Sales,
  // and cannot pre-assign a PM. PMO Director assigns the PM later.
  const isSales = req.user!.role === "SALES";
  const status: ProjectStatus = isSales
    ? "DRAFT"
    : ((b.status as ProjectStatus) || "DRAFT");
  const salesId = isSales ? req.user!.sub : (b.salesId || null);
  const pmId = isSales ? null : (b.pmId || null);
  const startDate = parseSafeDate(b.startDate);
  if (b.startDate && startDate === null) {
    res.status(400).json({ error: "startDate must be a valid YYYY-MM-DD date" });
    return;
  }
  const endDate = parseSafeDate(b.endDate);
  if (b.endDate && endDate === null) {
    res.status(400).json({ error: "endDate must be a valid YYYY-MM-DD date" });
    return;
  }
  let spkFileUrl: string | null = null;
  let contractFileUrl: string | null = null;
  try {
    spkFileUrl = validatePdfDataUrl(b.spkFileUrl, "spkFileUrl") ?? null;
    contractFileUrl = validatePdfDataUrl(b.contractFileUrl, "contractFileUrl") ?? null;
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 400).json({ error: err.message });
    return;
  }
  const created = await prisma.project.create({
    data: {
      code: String(b.code),
      name: String(b.name),
      description: b.description || null,
      clientId: String(b.clientId),
      salesId,
      pmId,
      status,
      // Sales intake is always for client engagements; only MGMT can flag a
      // project as INTERNAL/PRESALES/TRAINING.
      kind: (!isSales && (b.kind === "INTERNAL" || b.kind === "PRESALES" || b.kind === "TRAINING"))
        ? b.kind
        : "CLIENT",
      startDate,
      endDate,
      contractValue: Number(b.contractValue || 0),
      vatPercent,
      contractValueIncludesVat,
      estimatedCost: Number(b.estimatedCost || 0),
      plannedMandays: Number(b.plannedMandays || 0),
      spkFileUrl,
      spkFileName: spkFileUrl ? sanitizeFileName(b.spkFileName) ?? null : null,
      contractFileUrl,
      contractFileName: contractFileUrl ? sanitizeFileName(b.contractFileName) ?? null : null,
    },
    include: projectInclude,
  });
  await prisma.activity.create({
    data: {
      type: "project.created",
      message: `Project ${created.code} created`,
      userId: req.user!.sub,
      projectId: created.id,
    },
  });
  await recordAudit(req, {
    action: "project.created",
    entityType: "Project",
    entityId: created.id,
    description: `Created project ${created.code} — ${created.name}`,
    after: serializeProject(created),
  });
  res.status(201).json(serializeProject(created, req.user?.role));
});

router.patch("/projects/:id", requireRole(...writeRoles), async (req, res) => {
  const b = req.body || {};
  const beforeProj = await prisma.project.findUnique({
    where: { id: String(req.params.id) },
    include: projectInclude,
  });
  if (!beforeProj) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Field-level + ownership authorization.
  // SALES: only their own DRAFT projects, may update basic intake fields only.
  // PROJECT_MANAGER: only projects assigned to them; may update all detail fields.
  // MANAGEMENT: full access (PMO Director can assign PMs and edit anything).
  const role = req.user!.role;
  const userId = req.user!.sub;

  // Sales intake form (DRAFT only) — limited to the intake fields.
  const SALES_DRAFT_ALLOWED = new Set([
    "code", "name", "description", "clientId", "contractValue",
    "vatPercent", "contractValueIncludesVat",
    "spkFileUrl", "spkFileName", "contractFileUrl", "contractFileName",
  ]);
  // Sales editing the Overview of an in-flight project (own project, any status):
  // may update the same descriptive/financial fields PM can, but cannot reassign
  // people (salesId/pmId), reassign the client, or change project status.
  const SALES_ONGOING_FORBIDDEN = new Set([
    "salesId", "pmId", "clientId", "status", "statusChangeReason",
    "technicalWriterId", "adminProjectId",
  ]);
  // PMs may not reassign people (salesId/pmId) nor reassign the client (set during Sales intake).
  // PMs CAN assign TW and Admin Project for their own projects.
  const PM_FORBIDDEN = new Set(["salesId", "pmId", "clientId"]);

  if (role === "SALES") {
    if (beforeProj.salesId !== userId) {
      res.status(403).json({ error: "You can only update projects you submitted" });
      return;
    }
    if (beforeProj.status === "DRAFT") {
      const violating = Object.keys(b).filter(
        (k) => b[k] !== undefined && !SALES_DRAFT_ALLOWED.has(k),
      );
      if (violating.length) {
        res.status(403).json({
          error: `Sales is not allowed to change: ${violating.join(", ")}`,
        });
        return;
      }
    } else {
      const violating = Object.keys(b).filter(
        (k) => b[k] !== undefined && SALES_ONGOING_FORBIDDEN.has(k),
      );
      if (violating.length) {
        res.status(403).json({
          error: `Sales is not allowed to change: ${violating.join(", ")}`,
        });
        return;
      }
    }
  } else if (role === "PROJECT_MANAGER") {
    if (beforeProj.pmId !== userId) {
      res.status(403).json({ error: "You can only update projects assigned to you" });
      return;
    }
    const violating = Object.keys(b).filter(
      (k) => b[k] !== undefined && PM_FORBIDDEN.has(k),
    );
    if (violating.length) {
      res.status(403).json({
        error: `Project Manager is not allowed to reassign: ${violating.join(", ")}`,
      });
      return;
    }
  } else if (role === "PRINCIPAL_TECHNICAL_WRITER" || role === "PRINCIPAL_ADMIN_PROJECT") {
    // Principal TW / Principal AP may only assign their supervised single-pick
    // role on this project. They may not change anything else.
    const allowedField =
      role === "PRINCIPAL_TECHNICAL_WRITER" ? "technicalWriterId" : "adminProjectId";
    const targetRole =
      role === "PRINCIPAL_TECHNICAL_WRITER" ? "TECHNICAL_WRITER" : "ADMIN_PROJECT";
    const violating = Object.keys(b).filter(
      (k) => b[k] !== undefined && k !== allowedField,
    );
    if (violating.length) {
      res.status(403).json({
        error: `Principal may only set ${allowedField} on this project`,
      });
      return;
    }
    // Aligned with the new visibility rule: Principals only see ACTIVE
    // projects, so they may only assign on ACTIVE — never on hidden
    // OBSERVATION/PAUSE/etc.
    if (beforeProj.status !== "ACTIVE") {
      res.status(403).json({
        error: "Principal can only assign on ACTIVE projects",
      });
      return;
    }
    const newId = b[allowedField];
    if (newId) {
      const target = await prisma.user.findUnique({
        where: { id: String(newId) },
        select: { role: true, principalId: true },
      });
      if (!target || target.role !== targetRole) {
        res.status(400).json({ error: `Selected user is not a ${targetRole}` });
        return;
      }
      if (target.principalId !== userId) {
        res.status(403).json({
          error: "You may only assign your direct supervisees",
        });
        return;
      }
    }
  }

  // PMO PM-assignment invariant: when MANAGEMENT sets pmId on a DRAFT project
  // (the typical assignment path), the project must currently have no PM.
  if (role === "MANAGEMENT" && b.pmId && beforeProj.status === "DRAFT" && beforeProj.pmId && beforeProj.pmId !== b.pmId) {
    res.status(409).json({ error: "Project already has an assigned PM" });
    return;
  }

  if (b.contractValue !== undefined && Number(b.contractValue) < 0) {
    res.status(400).json({ error: "contractValue must be non-negative" });
    return;
  }
  if (b.estimatedCost !== undefined && Number(b.estimatedCost) < 0) {
    res.status(400).json({ error: "estimatedCost must be non-negative" });
    return;
  }
  if (b.plannedMandays !== undefined && Number(b.plannedMandays) < 0) {
    res.status(400).json({ error: "plannedMandays must be non-negative" });
    return;
  }

  // If status is changing to PAUSE or COMPLETE, require statusChangeReason
  if (b.status === "PAUSE" || b.status === "COMPLETE") {
    if (beforeProj.status !== b.status) {
      const reason = String(b.statusChangeReason ?? "").trim();
      if (!reason) {
        res.status(400).json({
          error: `statusChangeReason is required when changing status to ${b.status}`,
        });
        return;
      }
    }
  }

  const data: Record<string, unknown> = {};
  if (b.code !== undefined) data.code = String(b.code);
  if (b.name !== undefined) data.name = String(b.name);
  if (b.description !== undefined) data.description = b.description || null;
  if (b.clientId !== undefined) data.clientId = String(b.clientId);
  if (b.salesId !== undefined) data.salesId = b.salesId || null;
  if (b.pmId !== undefined) data.pmId = b.pmId || null;
  if (b.technicalWriterId !== undefined) data.technicalWriterId = b.technicalWriterId || null;
  if (b.adminProjectId !== undefined) data.adminProjectId = b.adminProjectId || null;
  if (b.status !== undefined) data.status = b.status as ProjectStatus;
  if (b.kind !== undefined && role === "MANAGEMENT") {
    if (b.kind !== "CLIENT" && b.kind !== "INTERNAL" && b.kind !== "PRESALES" && b.kind !== "TRAINING") {
      res.status(400).json({ error: "kind must be CLIENT, INTERNAL, PRESALES, or TRAINING" });
      return;
    }
    data.kind = b.kind;
  }
  if (b.startDate !== undefined) {
    const d = parseSafeDate(b.startDate);
    if (b.startDate && d === null) {
      res.status(400).json({ error: "startDate must be a valid YYYY-MM-DD date" });
      return;
    }
    data.startDate = d;
  }
  if (b.endDate !== undefined) {
    const d = parseSafeDate(b.endDate);
    if (b.endDate && d === null) {
      res.status(400).json({ error: "endDate must be a valid YYYY-MM-DD date" });
      return;
    }
    data.endDate = d;
  }
  if (b.contractValue !== undefined) data.contractValue = Number(b.contractValue);
  if (b.vatPercent !== undefined && b.vatPercent !== null && b.vatPercent !== "") {
    const v = Number(b.vatPercent);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      res.status(400).json({ error: "vatPercent must be a number between 0 and 100" });
      return;
    }
    data.vatPercent = v;
  }
  if (b.contractValueIncludesVat !== undefined) {
    data.contractValueIncludesVat = Boolean(b.contractValueIncludesVat);
  }
  if (b.estimatedCost !== undefined) data.estimatedCost = Number(b.estimatedCost);
  if (b.plannedMandays !== undefined)
    data.plannedMandays = Number(b.plannedMandays);
  if (b.statusChangeReason !== undefined && b.status !== undefined) {
    data.lastStatusReason = String(b.statusChangeReason ?? "") || null;
  }
  if (b.spkFileUrl !== undefined) {
    try {
      const v = validatePdfDataUrl(b.spkFileUrl, "spkFileUrl");
      data.spkFileUrl = v ?? null;
      if (!v) data.spkFileName = null;
    } catch (e) {
      const err = e as Error & { status?: number };
      res.status(err.status ?? 400).json({ error: err.message });
      return;
    }
  }
  if (b.spkFileName !== undefined) data.spkFileName = sanitizeFileName(b.spkFileName) ?? null;
  if (b.contractFileUrl !== undefined) {
    try {
      const v = validatePdfDataUrl(b.contractFileUrl, "contractFileUrl");
      data.contractFileUrl = v ?? null;
      if (!v) data.contractFileName = null;
    } catch (e) {
      const err = e as Error & { status?: number };
      res.status(err.status ?? 400).json({ error: err.message });
      return;
    }
  }
  if (b.contractFileName !== undefined) data.contractFileName = sanitizeFileName(b.contractFileName) ?? null;
  let updated = await prisma.project.update({
    where: { id: String(req.params.id) },
    data,
    include: projectInclude,
  });
  // NO_NEED_CONSULTANT cascade: when entering this status, release all
  // KONSULTAN resources and clear the assigned Technical Writer. Admin Project
  // remains so closing documents can still be uploaded.
  if (b.status === "NO_NEED_CONSULTANT" && beforeProj.status !== "NO_NEED_CONSULTANT") {
    await prisma.projectResource.deleteMany({
      where: {
        projectId: updated.id,
        user: { role: { in: ["KONSULTAN", "TECHNICAL_WRITER"] } },
      },
    });
    if (updated.technicalWriterId) {
      await prisma.project.update({
        where: { id: updated.id },
        data: { technicalWriterId: null },
      });
    }
    updated = await prisma.project.findUnique({
      where: { id: updated.id },
      include: projectInclude,
    }) as typeof updated;
  }
  if (updated.status === "CLOSED" && !updated.surveyToken) {
    await issueSurveyTokenIfMissing(updated.id);
  }
  // Notify newly assigned TW or Admin Project
  if (b.technicalWriterId !== undefined && updated.technicalWriterId && updated.technicalWriterId !== beforeProj.technicalWriterId) {
    await notifyUsers([updated.technicalWriterId], {
      type: "project.assigned_writer",
      title: "You've been assigned as Technical Writer",
      message: `${updated.code} — ${updated.name}`,
      link: `/projects/${updated.id}`,
    });
  }
  if (b.adminProjectId !== undefined && updated.adminProjectId && updated.adminProjectId !== beforeProj.adminProjectId) {
    await notifyUsers([updated.adminProjectId], {
      type: "project.assigned_admin",
      title: "You've been assigned as Admin Project",
      message: `${updated.code} — ${updated.name}`,
      link: `/projects/${updated.id}`,
    });
  }
  if (b.status !== undefined && beforeProj.status !== updated.status) {
    const reasonNote = b.statusChangeReason
      ? ` — Reason: ${String(b.statusChangeReason).slice(0, 200)}`
      : "";
    await prisma.activity.create({
      data: {
        type: "project.status_changed",
        message: `Project ${updated.code} status → ${updated.status}${reasonNote}`,
        userId: req.user!.sub,
        projectId: updated.id,
      },
    });
    await recordAudit(req, {
      action: "project.status_changed",
      entityType: "Project",
      entityId: updated.id,
      description: `${updated.code}: ${beforeProj.status} → ${updated.status}${reasonNote}`,
      before: { status: beforeProj.status },
      after: { status: updated.status, reason: b.statusChangeReason ?? null },
    });
  } else {
    await recordAudit(req, {
      action: "project.updated",
      entityType: "Project",
      entityId: updated.id,
      description: `Updated project ${updated.code}`,
      before: serializeProject(beforeProj),
      after: serializeProject(updated),
    });
  }
  res.json(serializeProject(updated, req.user?.role));
});

router.patch("/projects/:id/report", async (req, res) => {
  const role = req.user!.role;
  const userId = req.user!.sub;
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    select: { id: true, code: true, name: true, pmId: true, adminProjectId: true,
      technicalWriterId: true, reportCoverUrl: true, reportLink: true, reportSubmittedAt: true },
  });
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const allowed =
    role === "MANAGEMENT" ||
    (role === "PROJECT_MANAGER" && project.pmId === userId) ||
    (role === "TECHNICAL_WRITER" && project.technicalWriterId === userId);
  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const b = req.body || {};
  const data: Record<string, unknown> = {};
  if (b.reportCoverUrl !== undefined) data.reportCoverUrl = b.reportCoverUrl || null;
  if (b.reportLink !== undefined) data.reportLink = b.reportLink || null;
  const nextCover = data.reportCoverUrl !== undefined ? data.reportCoverUrl : project.reportCoverUrl;
  const nextLink = data.reportLink !== undefined ? data.reportLink : project.reportLink;
  const wasComplete = !!(project.reportCoverUrl && project.reportLink);
  const nowComplete = !!(nextCover && nextLink);
  if (nowComplete && !wasComplete) {
    data.reportSubmittedAt = new Date();
  } else if (!nowComplete) {
    data.reportSubmittedAt = null;
  }
  const updated = await prisma.project.update({
    where: { id: project.id },
    data,
    include: projectInclude,
  });
  await recordAudit(req, {
    action: "project.report_updated",
    entityType: "Project",
    entityId: updated.id,
    description: `Updated report on ${updated.code}`,
    after: { reportCoverUrl: updated.reportCoverUrl, reportLink: updated.reportLink },
  });
  if (nowComplete && !wasComplete) {
    await notifyUsers([updated.pmId, updated.adminProjectId], {
      type: "report.submitted",
      title: "Report submitted",
      message: `Report for ${updated.code} — ${updated.name} is ready for review`,
      link: `/projects/${updated.id}`,
    });
  }
  res.json(serializeProject(updated, req.user?.role));
});

router.get("/projects/:id/whatif", async (req, res) => {
  const role = req.user?.role ?? "";
  if (role === "KONSULTAN" || role === "TECHNICAL_WRITER" || role.startsWith("PRINCIPAL_")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!(await userCanAccessProject(req.params.id, req.user!))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const addMandays = Number(req.query.addMandays ?? 0);
  if (!isFinite(addMandays)) {
    res.status(400).json({ error: "addMandays must be a number" });
    return;
  }
  const p = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: projectInclude,
  });
  if (!p) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const m = computeMetrics(p);
  // Forecast labor rate uses ONLY resource (timesheet) cost so that fixed
  // one-off additional expenses (software/hardware purchases) are not
  // converted into a pseudo daily-rate and double-extrapolated across
  // future mandays. Additional expenses are added on top as a fixed term.
  const avgRate =
    m.actualMandays > 0
      ? m.resourceCost / m.actualMandays
      : p.resources.length > 0
        ? p.resources.reduce((s, r) => s + r.dailyRate, 0) / p.resources.length
        : 0;

  const baseProjectedMandays = Math.max(p.plannedMandays, m.actualMandays);
  const baseForecastCost = baseProjectedMandays * avgRate + m.additionalCost;
  const baseForecastProfit = p.contractValue - baseForecastCost;
  const baseMarginPct =
    p.contractValue > 0 ? (baseForecastProfit / p.contractValue) * 100 : 0;

  const scenarioMandays = baseProjectedMandays + addMandays;
  const scenarioCost = scenarioMandays * avgRate + m.additionalCost;
  const scenarioProfit = p.contractValue - scenarioCost;
  const scenarioMarginPct =
    p.contractValue > 0 ? (scenarioProfit / p.contractValue) * 100 : 0;

  res.json({
    projectId: p.id,
    addMandays,
    avgDailyRate: avgRate,
    base: {
      mandays: baseProjectedMandays,
      cost: baseForecastCost,
      profit: baseForecastProfit,
      marginPct: baseMarginPct,
    },
    scenario: {
      mandays: scenarioMandays,
      cost: scenarioCost,
      profit: scenarioProfit,
      marginPct: scenarioMarginPct,
    },
    deltaCost: scenarioCost - baseForecastCost,
    deltaProfit: scenarioProfit - baseForecastProfit,
  });
});

router.delete(
  "/projects/:id",
  requireRole("MANAGEMENT"),
  async (req, res) => {
    const before = await prisma.project.findUnique({
      where: { id: String(req.params.id) },
      include: projectInclude,
    });
    if (!before) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Soft delete — keep historical timesheets, documents, financials intact.
    const updated = await prisma.project.update({
      where: { id: String(req.params.id) },
      data: { deletedAt: new Date() },
    });
    await recordAudit(req, {
      action: "project.deleted",
      entityType: "Project",
      entityId: updated.id,
      description: `Soft-deleted project ${before.code} — ${before.name}`,
      before: serializeProject(before),
    });
    res.json({ success: true });
  },
);

router.get("/projects/:id/financials", async (req, res) => {
  const role = req.user?.role ?? "";
  if (role === "KONSULTAN" || role === "TECHNICAL_WRITER" || role.startsWith("PRINCIPAL_")) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!(await userCanAccessProject(req.params.id, req.user!))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const p = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: projectInclude,
  });
  if (!p) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const m = computeMetrics(p);

  const burnRatePct = m.burnRatePct;

  // Forecast: linear projection — if you've burned X% of mandays,
  // assume cost scales to fully consume planned mandays at current rate.
  // Use resourceCost (timesheet-derived) for rate so fixed additional
  // expenses (software/hardware) are not extrapolated; add them as a
  // fixed term to the forecast total.
  const projectedMandays = Math.max(p.plannedMandays, m.actualMandays);
  const avgRate =
    m.actualMandays > 0
      ? m.resourceCost / m.actualMandays
      : p.resources.length > 0
        ? p.resources.reduce((s, r) => s + r.dailyRate, 0) / p.resources.length
        : 0;
  const forecastCost = projectedMandays * avgRate + m.additionalCost;
  const forecastProfit = p.contractValue - forecastCost;

  // Monthly aggregation of approved timesheets
  const monthlyMap = new Map<string, { cost: number; revenue: number }>();
  const rateMap = new Map<string, number>();
  for (const r of p.resources) rateMap.set(r.userId, r.dailyRate);

  for (const ts of p.timesheets) {
    if (ts.status !== "APPROVED") continue;
    const d = ts.workDate;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const days = ts.hours / 8;
    const cost = days * (rateMap.get(ts.userId) ?? 0);
    const cur = monthlyMap.get(key) ?? { cost: 0, revenue: 0 };
    cur.cost += cost;
    monthlyMap.set(key, cur);
  }
  // Spread revenue evenly across project months for chart purposes
  const months = Array.from(monthlyMap.keys()).sort();
  const vatPct = (p as any).vatPercent ?? 11;
  const includesVat = (p as any).contractValueIncludesVat ?? true;
  const revenueNet = includesVat
    ? p.contractValue / (1 + vatPct / 100)
    : p.contractValue;
  const perMonthRev = months.length > 0 ? revenueNet / months.length : 0;
  const monthly = months.map((month) => ({
    month,
    cost: monthlyMap.get(month)!.cost,
    revenue: perMonthRev,
  }));

  res.json({
    projectId: p.id,
    contractValue: p.contractValue,
    estimatedCost: p.estimatedCost,
    estimatedProfit: m.estimatedProfit,
    actualCost: m.actualCost,
    actualProfit: m.actualProfit,
    forecastCost,
    forecastProfit,
    marginPct: m.marginPct,
    plannedMandays: p.plannedMandays,
    actualMandays: m.actualMandays,
    burnRatePct,
    vatPercent: m.vatPercent,
    contractValueIncludesVat: m.contractValueIncludesVat,
    revenueNet: m.revenueNet,
    vatAmount: m.vatAmount,
    recognizedRevenue: m.recognizedRevenue,
    accruedCost: m.accruedCost,
    loadedResourceCost: m.loadedResourceCost,
    netActualCost: m.netActualCost,
    netActualProfit: m.netActualProfit,
    netMarginPct: m.netMarginPct,
    overheadMultiplier: m.overheadMultiplier,
    monthly,
  });
});

export default router;
