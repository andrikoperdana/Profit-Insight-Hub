import { Router, type IRouter } from "express";
import { prisma, type ProjectStatus } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { validateBody } from "../middlewares/validate.js";
import { CreateProjectBody, UpdateProjectBody } from "@workspace/api-zod";
import {
  serializeProject,
  projectInclude,
  computeMetrics,
  computeProfitOutlook,
  computeEvm,
  canViewProjectFinancials,
  canViewDailyRate,
} from "../lib/serializers.js";
import { recordAudit } from "../lib/audit.js";
import { getAppSettings } from "../lib/app-settings.js";
import { issueSurveyTokenIfMissing } from "../lib/surveyDefaults.js";
import { notifyUser, notifyUsers } from "../lib/notifications.js";
import {
  createFeedback360PairsIfMissing,
  checkCloseRequirements,
  projectCloseReadinessWhere,
} from "../lib/feedback360.js";
import { assertProjectWritable, userCanAccessProject } from "../lib/projectAccess.js";
import { nextProjectId } from "../lib/projectIds.js";
import {
  writeRoles,
  validatePdfDataUrl,
  sanitizeFileName,
  parseSafeDate,
} from "../lib/projectValidators.js";
import { parsePagination, setTotalCount } from "../lib/pagination.js";
import { splitVat } from "../lib/invoicing.js";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/projects", async (req, res) => {
  const status = req.query.status as ProjectStatus | undefined;
  const role = req.user!.role;
  const userId = req.user!.sub;
  const includeDeleted = req.query.includeDeleted === "true" && (role === "MANAGEMENT" || role === "SUPER_ADMIN");
  const includeArchived = req.query.includeArchived === "true" && (role === "MANAGEMENT" || role === "SUPER_ADMIN");
  const where: any = includeDeleted ? {} : { deletedAt: null };
  if (!includeDeleted && !includeArchived) where.archivedAt = null;
  if (status) where.status = status;
  // Role-based scoping: PM sees own projects; Sales sees own projects.
  // Consultant/TW see projects they are assigned to OR have logged time on.
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
    // Principal Consultant: in-flight engagements (ACTIVE or PAUSE) where the
    // principal is on the resource list themselves or supervises an assigned
    // resource, plus all OBSERVATION projects (no involvement filter — they
    // need to see what's in the pipeline so they can propose supervisees).
    // DRAFT/COMPLETE/CLOSED are hidden.
    where.OR = [
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
    // Principal TW: OBSERVATION + in-flight (ACTIVE/PAUSE) engagements.
    where.status = { in: ["OBSERVATION", "ACTIVE", "PAUSE"] };
  } else if (role === "PRINCIPAL_ADMIN_PROJECT") {
    // Principal AP: OBSERVATION + in-flight (ACTIVE/PAUSE) + COMPLETE
    // (COMPLETE projects may still be missing an assigned Admin Project for
    // closing documents).
    where.status = { in: ["OBSERVATION", "ACTIVE", "PAUSE", "COMPLETE"] };
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

router.post("/projects", requireRole(...writeRoles), validateBody(CreateProjectBody), async (req, res) => {
  const b = req.body || {};
  // Zod guarantees these are present strings; reject empty/whitespace-only values
  // before they reach Prisma (clientId is an FK).
  if (!String(b.name).trim() || !String(b.clientId).trim()) {
    res.status(400).json({ error: "name, clientId required" });
    return;
  }
  const cv = Number(b.contractValue || 0);
  const ec = Number(b.estimatedCost || 0);
  const pm = Number(b.plannedMandays || 0);
  if (cv < 0 || ec < 0 || pm < 0) {
    res.status(400).json({ error: "contractValue, estimatedCost, plannedMandays must be non-negative" });
    return;
  }
  let vatPercent = (await getAppSettings()).defaultVatPercent;
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
  // Sales can no longer create projects directly. Every Sales project must
  // originate from a won lead via the Sales Pipeline lead-convert flow
  // (POST /api/leads/:id/convert, which creates the project directly). Hard-block
  // the manual create path here so the rule cannot be bypassed via the API.
  if (isSales) {
    res.status(403).json({ error: "Sales must create projects from a won lead in the Sales Pipeline." });
    return;
  }
  // Sales intake must capture initial resource requirements so the project has
  // an initial estimated cost/profit at creation time. Enforce server-side so
  // the requirement cannot be bypassed by calling the API directly.
  if (isSales && !(pm > 0)) {
    res.status(400).json({ error: "Resource requirements are required: planned mandays must be greater than 0" });
    return;
  }
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
  // Only MANAGEMENT can flag a project as non-commercial
  // (INTERNAL / PRESALES / TRAINING). Sales & PM intake always = CLIENT.
  const kind: "CLIENT" | "INTERNAL" | "PRESALES" | "TRAINING" =
    ((req.user!.role === "MANAGEMENT" || req.user!.role === "SUPER_ADMIN") &&
      (b.kind === "INTERNAL" || b.kind === "PRESALES" || b.kind === "TRAINING"))
      ? b.kind
      : "CLIENT";
  // Non-CLIENT projects don't have commercial VAT, SPK, or contract docs —
  // enforce server-side so the data stays consistent regardless of caller.
  const isNonCommercial = kind !== "CLIENT";
  const finalVatPercent = isNonCommercial ? 0 : vatPercent;
  const finalIncludesVat = isNonCommercial ? false : contractValueIncludesVat;
  const finalSpkFileUrl = isNonCommercial ? null : spkFileUrl;
  const finalContractFileUrl = isNonCommercial ? null : contractFileUrl;
  const spkCode = b.code ? String(b.code).trim() || null : null;

  // Auto-generate a read-only Project ID (PRJ/YYYY/NNN), retrying on unique-constraint
  // collisions the same way invoice numbers are allocated.
  let created: Awaited<ReturnType<typeof prisma.project.create>> | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const projectIdVal = await nextProjectId(new Date());
    try {
      created = await prisma.project.create({
        data: {
          projectId: projectIdVal,
          code: spkCode,
          name: String(b.name),
          description: b.description || null,
          clientId: String(b.clientId),
          salesId,
          pmId,
          status,
          kind,
          startDate,
          endDate,
          contractValue: Number(b.contractValue || 0),
          currency: (b.currency ? String(b.currency).toUpperCase() : "IDR").slice(0, 8),
          exchangeRate: Number(b.exchangeRate ?? 1) > 0 ? Number(b.exchangeRate ?? 1) : 1,
          vatPercent: finalVatPercent,
          contractValueIncludesVat: finalIncludesVat,
          estimatedCost: Number(b.estimatedCost || 0),
          plannedMandays: Number(b.plannedMandays || 0),
          useWorkstreams: b.useWorkstreams === true,
          spkFileUrl: finalSpkFileUrl,
          spkFileName: finalSpkFileUrl ? sanitizeFileName(b.spkFileName) ?? null : null,
          contractFileUrl: finalContractFileUrl,
          contractFileName: finalContractFileUrl ? sanitizeFileName(b.contractFileName) ?? null : null,
        },
        include: projectInclude,
      });
      break;
    } catch (e: unknown) {
      const pe = e as { code?: string };
      if (pe?.code === "P2002" && attempt < 4) continue; // unique collision → retry
      throw e;
    }
  }
  if (!created) {
    res.status(500).json({ error: "Failed to allocate a Project ID after multiple attempts" });
    return;
  }
  await prisma.activity.create({
    data: {
      type: "project.created",
      message: `Project ${created.projectId ?? created.code ?? created.id} created`,
      userId: req.user!.sub,
      projectId: created.id,
    },
  });
  await recordAudit(req, {
    action: "project.created",
    entityType: "Project",
    entityId: created.id,
    description: `Created project ${created.projectId ?? created.code ?? created.id} — ${created.name}`,
    after: serializeProject(created as any),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.status(201).json(serializeProject(created as any, req.user?.role));
});

router.patch("/projects/:id", requireRole(...writeRoles), validateBody(UpdateProjectBody), async (req, res) => {
  const b = req.body || {};
  const beforeProj = await prisma.project.findUnique({
    where: { id: String(req.params.id) },
    include: projectInclude,
  });
  if (!beforeProj) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (beforeProj.archivedAt) {
    res.status(400).json({ error: "This project is archived and read-only. Unarchive it first to make changes." });
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

  // Non-DRAFT PM changes must go through the dedicated Replace PM flow so the
  // handover reason, audit trail, and notifications are always recorded.
  if (
    b.pmId !== undefined &&
    beforeProj.status !== "DRAFT" &&
    (b.pmId || null) !== beforeProj.pmId
  ) {
    res.status(400).json({
      error: "Use the Replace PM action to change the Project Manager on a non-draft project",
    });
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

  const effectiveKindForStatusGate =
    b.kind !== undefined &&
    (role === "MANAGEMENT" || role === "SUPER_ADMIN") &&
    ["CLIENT", "INTERNAL", "PRESALES", "TRAINING"].includes(String(b.kind))
      ? String(b.kind)
      : beforeProj.kind;

  // CLOSED transition gate: enforce closing checklist completion. All checklist
  // items must be DONE or NA (no PENDING) before a project can be closed manually.
  // This does NOT apply when status is already CLOSED, and is bypassed for the
  // BAST+INVOICE auto-close flow in routes/documents.ts (which writes directly).
  if (b.status === "CLOSED" && beforeProj.status !== "CLOSED") {
    if (beforeProj.status !== "COMPLETE") {
      res.status(400).json({
        error: "Project must be COMPLETE before it can be closed.",
        code: "PROJECT_NOT_COMPLETE",
      });
      return;
    }
    const pendingItems = await prisma.projectClosingChecklistItem.count({
      where: { projectId: String(req.params.id), status: "PENDING" },
    });
    // If checklist hasn't been initialized yet, treat as required-but-pending.
    const totalItems = await prisma.projectClosingChecklistItem.count({
      where: { projectId: String(req.params.id) },
    });
    if (totalItems === 0 || pendingItems > 0) {
      res.status(400).json({
        error: "Closing checklist is incomplete. Resolve all items (DONE/NA) before closing the project.",
        code: "CLOSING_CHECKLIST_INCOMPLETE",
        pendingItems,
      });
      return;
    }
    // F6: beyond the checklist, CLIENT projects need at least one client
    // survey response, and every 360 feedback entry must be submitted.
    const closeMissing = await checkCloseRequirements(
      String(req.params.id),
      effectiveKindForStatusGate,
    );
    if (closeMissing.length > 0) {
      res.status(400).json({
        error: `Cannot close this project yet. Please resolve the following first: ${closeMissing.join("; ")}.`,
        code: "CLOSE_REQUIREMENTS_INCOMPLETE",
        missing: closeMissing,
      });
      return;
    }
  }

  // Non-commercial projects (INTERNAL / PRESALES / TRAINING) run internally
  // with no client invoice, so they are exempt from the billing- and
  // BAST-related lifecycle requirements. Use the EFFECTIVE kind so a PATCH
  // that flips kind (MGMT/SUPER_ADMIN only) and status in one call is honoured.
  const effKindForGate = effectiveKindForStatusGate;
  const isNonCommercialProject = effKindForGate !== "CLIENT";

  // ACTIVE transition gate: a project may only be activated once it is fully
  // set up. We validate the EFFECTIVE state (incoming body overrides stored
  // values) so a PATCH that fills fields and flips status in one call still
  // works. Applies to every role (MANAGEMENT included) and to any non-ACTIVE
  // -> ACTIVE move. Required: core Overview fields, an assigned PM, at least
  // one staffed team member, billing milestones totalling 100%, at least one
  // task, and at least one RAID item. Non-commercial projects skip the
  // revenue and billing-milestone checks.
  if (b.status === "ACTIVE" && beforeProj.status !== "ACTIVE") {
    const pid = String(req.params.id);
    const missing: string[] = [];

    // Surface the same explicit date-format errors used later in the handler,
    // so a malformed date isn't masked as a generic "missing" requirement.
    if (b.startDate !== undefined && b.startDate && parseSafeDate(b.startDate) === null) {
      res.status(400).json({ error: "startDate must be a valid YYYY-MM-DD date" });
      return;
    }
    if (b.endDate !== undefined && b.endDate && parseSafeDate(b.endDate) === null) {
      res.status(400).json({ error: "endDate must be a valid YYYY-MM-DD date" });
      return;
    }

    const effClientId = b.clientId !== undefined ? b.clientId : beforeProj.clientId;
    const effDescription =
      b.description !== undefined ? b.description : beforeProj.description;
    const effStartDate =
      b.startDate !== undefined ? parseSafeDate(b.startDate) : beforeProj.startDate;
    const effEndDate =
      b.endDate !== undefined ? parseSafeDate(b.endDate) : beforeProj.endDate;
    const effContractValue =
      b.contractValue !== undefined ? Number(b.contractValue) : beforeProj.contractValue;
    const effPlannedMandays =
      b.plannedMandays !== undefined ? Number(b.plannedMandays) : beforeProj.plannedMandays;
    const effEstimatedCost =
      b.estimatedCost !== undefined ? Number(b.estimatedCost) : beforeProj.estimatedCost;
    const effPmId = b.pmId !== undefined ? b.pmId : beforeProj.pmId;

    if (!effClientId) missing.push("Client");
    if (!effDescription || !String(effDescription).trim()) missing.push("Description");
    if (!effStartDate) missing.push("Start date");
    if (!effEndDate) missing.push("End date");
    if (!isNonCommercialProject && !(Number(effContractValue) > 0)) missing.push("Revenue (contract value)");
    if (!(Number(effPlannedMandays) > 0)) missing.push("Planned mandays");
    if (!(Number(effEstimatedCost) > 0)) missing.push("Estimated cost");
    if (!effPmId) missing.push("Project Manager");

    const [resourceCount, taskCount, raidCount, milestones] = await Promise.all([
      prisma.projectResource.count({ where: { projectId: pid } }),
      prisma.task.count({ where: { projectId: pid } }),
      prisma.projectRaidItem.count({ where: { projectId: pid } }),
      prisma.billingMilestone.findMany({
        where: { projectId: pid },
        select: { percentage: true },
      }),
    ]);

    if (resourceCount === 0) missing.push("At least one team member in Resources");
    if (taskCount === 0) missing.push("At least one task");
    if (raidCount === 0) missing.push("At least one RAID item");

    if (!isNonCommercialProject) {
      const totalPct = milestones.reduce((sum, m) => sum + (m.percentage || 0), 0);
      if (milestones.length === 0) {
        missing.push("Billing milestones (Terms of Payment)");
      } else if (Math.abs(totalPct - 100) > 0.01) {
        missing.push(`Billing milestones must total 100% (currently ${+totalPct.toFixed(2)}%)`);
      }
    }

    if (missing.length > 0) {
      res.status(400).json({
        error: `Cannot activate this project yet. Please complete the following first: ${missing.join("; ")}.`,
        code: "ACTIVATION_REQUIREMENTS_INCOMPLETE",
        missing,
      });
      return;
    }
  }

  // COMPLETE transition gate: a project may only be marked complete once
  // delivery and its operational/financial data are wrapped up. Applies to
  // every role and to any non-COMPLETE -> COMPLETE move. (statusChangeReason
  // is already enforced above.) Required: all tasks Done, no timesheets
  // awaiting approval, no pending expenses, every billing milestone at least
  // invoiced (none still PLANNED), no open RAID items, and an uploaded BAST.
  if (b.status === "COMPLETE" && beforeProj.status !== "COMPLETE") {
    const pid = String(req.params.id);
    const missing: string[] = [];

    const [openTasks, pendingTimesheets, pendingExpenses, plannedMilestones, openRaid, bastCount] =
      await Promise.all([
        prisma.task.count({ where: { projectId: pid, status: { not: "DONE" } } }),
        prisma.timesheet.count({ where: { projectId: pid, status: "SUBMITTED" } }),
        prisma.projectExpense.count({ where: { projectId: pid, status: "PENDING" } }),
        prisma.billingMilestone.count({ where: { projectId: pid, status: "PLANNED" } }),
        prisma.projectRaidItem.count({ where: { projectId: pid, status: "OPEN" } }),
        prisma.document.count({ where: { projectId: pid, type: "BAST", isLatest: true } }),
      ]);

    if (openTasks > 0) missing.push(`All tasks must be Done (${openTasks} not yet Done)`);
    if (pendingTimesheets > 0)
      missing.push(`No timesheets awaiting approval (${pendingTimesheets} still pending)`);
    if (pendingExpenses > 0)
      missing.push(`No pending expenses (${pendingExpenses} still pending)`);
    if (!isNonCommercialProject && plannedMilestones > 0)
      missing.push(`All billing milestones must be invoiced (${plannedMilestones} still planned)`);
    if (openRaid > 0) missing.push(`All RAID items must be resolved (${openRaid} still open)`);
    if (!isNonCommercialProject && bastCount === 0)
      missing.push("A signed handover document (BAST) must be uploaded");

    if (missing.length > 0) {
      res.status(400).json({
        error: `Cannot mark this project as complete yet. Please resolve the following first: ${missing.join("; ")}.`,
        code: "COMPLETION_REQUIREMENTS_INCOMPLETE",
        missing,
      });
      return;
    }
  }

  const data: Record<string, unknown> = {};
  if (b.code !== undefined) data.code = b.code ? String(b.code) : null;
  if (b.name !== undefined) data.name = String(b.name);
  if (b.description !== undefined) data.description = b.description || null;
  if (b.clientId !== undefined) data.clientId = String(b.clientId);
  if (b.salesId !== undefined) data.salesId = b.salesId || null;
  if (b.pmId !== undefined) data.pmId = b.pmId || null;
  if (b.technicalWriterId !== undefined) data.technicalWriterId = b.technicalWriterId || null;
  if (b.adminProjectId !== undefined) data.adminProjectId = b.adminProjectId || null;
  if (b.status !== undefined) {
    data.status = b.status as ProjectStatus;
    // Track when the project enters/leaves CLOSED — drives the auto-archive
    // retention policy for stale CLOSED projects.
    if (b.status === "CLOSED" && beforeProj.status !== "CLOSED") {
      data.closedAt = new Date();
    } else if (b.status !== "CLOSED" && beforeProj.status === "CLOSED") {
      data.closedAt = null;
    }
  }
  if (b.kind !== undefined && (role === "MANAGEMENT" || role === "SUPER_ADMIN")) {
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
  // currency / exchangeRate only editable while project is still DRAFT to keep financials stable
  if (b.currency !== undefined && beforeProj.status === "DRAFT") {
    data.currency = String(b.currency || "IDR").toUpperCase().slice(0, 8);
  }
  if (b.exchangeRate !== undefined && beforeProj.status === "DRAFT") {
    const r = Number(b.exchangeRate);
    if (Number.isFinite(r) && r > 0) data.exchangeRate = r;
  }
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
  // statusChangeReason doubles as the editable "Last status change reason" note.
  // It is written when provided alongside a status change AND when sent on its
  // own (no status field), so MGMT/PM can edit or clear the note at any time
  // without forcing a status transition. Field-level auth above already limits
  // this field to MANAGEMENT / PROJECT_MANAGER / SUPER_ADMIN.
  if (b.statusChangeReason !== undefined) {
    data.lastStatusReason =
      String(b.statusChangeReason ?? "").trim().slice(0, 500) || null;
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
  let updated;
  if (b.status === "CLOSED" && beforeProj.status !== "CLOSED") {
    const closeResult = await prisma.project.updateMany({
      where: projectCloseReadinessWhere(
        String(req.params.id),
        effectiveKindForStatusGate,
      ),
      data,
    });
    if (closeResult.count !== 1) {
      res.status(409).json({
        error:
          "Project closing requirements changed while this request was being processed. Refresh and try again.",
        code: "CLOSE_REQUIREMENTS_CHANGED",
      });
      return;
    }
    updated = await prisma.project.findUnique({
      where: { id: String(req.params.id) },
      include: projectInclude,
    });
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
  } else {
    updated = await prisma.project.update({
      where: { id: String(req.params.id) },
      data,
      include: projectInclude,
    });
  }
  // Capture the initial project baseline the first time it is activated. The
  // baseline is the scope/schedule/cost commitment that EVM's Planned Value and
  // the variance panel measure against. We auto-create the ACTIVATION baseline
  // only once — re-activating after a PAUSE keeps the original commitment;
  // later versions come from applied Change Requests.
  if (updated.status === "ACTIVE" && beforeProj.status !== "ACTIVE") {
    const existingBaselines = await prisma.projectBaseline.count({
      where: { projectId: updated.id },
    });
    if (existingBaselines === 0) {
      await prisma.projectBaseline.create({
        data: {
          projectId: updated.id,
          version: 1,
          isCurrent: true,
          source: "ACTIVATION",
          startDate: updated.startDate,
          endDate: updated.endDate,
          plannedMandays: updated.plannedMandays,
          estimatedCost: updated.estimatedCost,
          contractValue: updated.contractValue,
          createdById: req.user?.sub ?? null,
        },
      });
    }
  }
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
  // F6: on COMPLETE, release the client satisfaction survey early (CLIENT
  // projects only) and seed 360 feedback pairs (PM <-> each accepted resource).
  if (b.status === "COMPLETE" && beforeProj.status !== "COMPLETE" && updated.status === "COMPLETE") {
    if (updated.kind === "CLIENT") {
      await issueSurveyTokenIfMissing(updated.id);
      if (updated.pmId) {
        await notifyUser({
          userId: updated.pmId,
          type: "survey.released",
          title: "Client survey ready to send",
          message: `${updated.code} — ${updated.name} is complete. Share the client satisfaction survey link from the Closing tab.`,
          link: `/projects/${updated.id}`,
        });
      }
    }
    const { created, reviewerIds } = await createFeedback360PairsIfMissing(updated.id);
    if (created > 0) {
      await notifyUsers(reviewerIds, {
        type: "feedback360.requested",
        title: "360 feedback requested",
        message: `${updated.code} — ${updated.name} is complete. Please submit your 360 feedback for the project team.`,
        link: `/projects/${updated.id}`,
      });
    }
  }
  // CLOSED backstop: projects that reach CLOSED without ever passing through
  // the COMPLETE side effects still get a survey token issued.
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

// Replace the PM on a running (non-DRAFT) project. MANAGEMENT only.
// Records a project activity entry + audit trail and notifies both PMs.
router.post("/projects/:id/replace-pm", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Only Management can replace a Project Manager" });
    return;
  }
  const id = String(req.params.id);
  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true, code: true, name: true, status: true, deletedAt: true, archivedAt: true,
      pmId: true, pm: { select: { id: true, name: true } },
    },
  });
  if (!project || project.deletedAt) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if ((project as any).archivedAt) {
    res.status(400).json({ error: "This project is archived and read-only. Unarchive it first to make changes." });
    return;
  }
  if (project.status === "DRAFT") {
    res.status(400).json({
      error: "Draft projects use the PM assignment flow on the Management dashboard",
    });
    return;
  }
  const newPmId = String(req.body?.pmId ?? "").trim();
  const reason = String(req.body?.reason ?? "").trim();
  if (!newPmId) {
    res.status(400).json({ error: "pmId is required" });
    return;
  }
  if (!reason) {
    res.status(400).json({ error: "A handover reason is required" });
    return;
  }
  if (reason.length > 500) {
    res.status(400).json({ error: "reason must be at most 500 characters" });
    return;
  }
  if (newPmId === project.pmId) {
    res.status(400).json({ error: "This user is already the Project Manager of this project" });
    return;
  }
  const newPm = await prisma.user.findUnique({
    where: { id: newPmId },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!newPm || !newPm.isActive) {
    res.status(400).json({ error: "Selected user not found or inactive" });
    return;
  }
  if (newPm.role !== "PROJECT_MANAGER" && newPm.role !== "MANAGEMENT") {
    res.status(400).json({ error: "The new PM must have the Project Manager or Management role" });
    return;
  }

  const oldPm = project.pm;
  const reasonNote = ` — Reason: ${reason.slice(0, 200)}`;
  const updated = await prisma.$transaction(async (tx) => {
    const proj = await tx.project.update({
      where: { id },
      data: { pmId: newPmId },
      include: projectInclude,
    });
    await tx.activity.create({
      data: {
        type: "project.pm_replaced",
        message: `Project ${proj.code} PM replaced: ${oldPm?.name ?? "(none)"} → ${newPm.name}${reasonNote}`,
        userId: req.user!.sub,
        projectId: proj.id,
      },
    });
    return proj;
  });
  await recordAudit(req, {
    action: "project.pm_replaced",
    entityType: "Project",
    entityId: updated.id,
    description: `${updated.code}: PM ${oldPm?.name ?? "(none)"} → ${newPm.name}${reasonNote}`,
    before: { pmId: project.pmId, pmName: oldPm?.name ?? null },
    after: { pmId: newPm.id, pmName: newPm.name, reason },
  });
  await notifyUser({
    userId: newPm.id,
    type: "project.pm_assigned",
    title: "You are now the Project Manager",
    message: `${updated.code} — ${updated.name}. Handover from ${oldPm?.name ?? "previous PM"}. Reason: ${reason.slice(0, 200)}`,
    link: `/projects/${updated.id}`,
  });
  if (oldPm && oldPm.id !== newPm.id) {
    await notifyUser({
      userId: oldPm.id,
      type: "project.pm_handover",
      title: "Project handed over",
      message: `${updated.code} — ${updated.name} has been handed over to ${newPm.name}. Reason: ${reason.slice(0, 200)}`,
      link: `/projects/${updated.id}`,
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
    role === "SUPER_ADMIN" ||
    (role === "PROJECT_MANAGER" && project.pmId === userId) ||
    (role === "TECHNICAL_WRITER" && project.technicalWriterId === userId);
  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  // Archived projects are read-only, including report metadata.
  if (!(await assertProjectWritable(project.id, res))) return;
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
  // Base forecast comes from the shared Profit Outlook so the What-If "base"
  // always matches the Forecasted Final Profit shown elsewhere in Financials
  // (including the no-actuals fallback to the intake estimate).
  const outlook = computeProfitOutlook(p, m);
  // Marginal labor rate uses ONLY resource (timesheet) cost so that fixed
  // one-off additional expenses (software/hardware purchases) are not
  // converted into a pseudo daily-rate and double-extrapolated across
  // future mandays. Added mandays are charged at this rate on top of the base.
  const avgRate =
    m.actualMandays > 0
      ? m.resourceCost / m.actualMandays
      : p.resources.length > 0
        ? p.resources.reduce((s, r) => s + r.dailyRate, 0) / p.resources.length
        : 0;

  const baseProjectedMandays = Math.max(p.plannedMandays, m.actualMandays);
  const baseForecastCost = outlook.forecastCost;
  const baseForecastProfit = outlook.forecastProfit;
  const baseMarginPct = outlook.forecastMarginPct;

  const scenarioMandays = baseProjectedMandays + addMandays;
  const scenarioCost = baseForecastCost + addMandays * avgRate;
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

// Archive / unarchive — MANAGEMENT only (SUPER_ADMIN bypasses via requireRole).
// Archiving takes the project out of dashboards, reports, and financial
// calculations and makes it read-only. It is reversible via /unarchive.
// Delete is only allowed for archived projects (see DELETE below).
router.post("/projects/:id/archive", requireRole("MANAGEMENT"), async (req, res) => {
  const id = String(req.params.id);
  const project = await prisma.project.findUnique({ where: { id }, include: projectInclude });
  if (!project || project.deletedAt) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (project.archivedAt) {
    res.status(400).json({ error: "Project is already archived" });
    return;
  }
  const updated = await prisma.project.update({
    where: { id },
    data: { archivedAt: new Date() },
    include: projectInclude,
  });
  await recordAudit(req, {
    action: "project.archived",
    entityType: "Project",
    entityId: id,
    description: `Archived project ${project.projectId ?? project.code ?? id} — ${project.name}`,
    before: { archivedAt: null },
    after: { archivedAt: updated.archivedAt },
  });
  res.json(serializeProject(updated, req.user?.role));
});

router.post("/projects/:id/unarchive", requireRole("MANAGEMENT"), async (req, res) => {
  const id = String(req.params.id);
  const project = await prisma.project.findUnique({ where: { id }, include: projectInclude });
  if (!project || project.deletedAt) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!project.archivedAt) {
    res.status(400).json({ error: "Project is not archived" });
    return;
  }
  const updated = await prisma.project.update({
    where: { id },
    data: { archivedAt: null },
    include: projectInclude,
  });
  await recordAudit(req, {
    action: "project.unarchived",
    entityType: "Project",
    entityId: id,
    description: `Unarchived project ${project.projectId ?? project.code ?? id} — ${project.name}`,
    before: { archivedAt: project.archivedAt },
    after: { archivedAt: null },
  });
  res.json(serializeProject(updated, req.user?.role));
});

// Auto-archive exemption — MANAGEMENT only (SUPER_ADMIN bypasses via requireRole).
// Marks a CLOSED project as exempt from the auto-archive retention rule so it
// stays visible indefinitely (e.g. reference engagements). Reversible via
// /auto-archive-unexempt.
router.post("/projects/:id/auto-archive-exempt", requireRole("MANAGEMENT"), async (req, res) => {
  const id = String(req.params.id);
  const project = await prisma.project.findUnique({ where: { id }, include: projectInclude });
  if (!project || project.deletedAt) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (project.archivedAt) {
    res.status(400).json({ error: "Project is already archived. Unarchive it first, then exempt it." });
    return;
  }
  if (project.status !== "CLOSED") {
    res.status(400).json({ error: "Only CLOSED projects can be exempted from auto-archiving" });
    return;
  }
  if ((project as any).autoArchiveExempt) {
    res.status(400).json({ error: "Project is already exempt from auto-archiving" });
    return;
  }
  const updated = await prisma.project.update({
    where: { id },
    data: { autoArchiveExempt: true },
    include: projectInclude,
  });
  await recordAudit(req, {
    action: "project.auto_archive_exempted",
    entityType: "Project",
    entityId: id,
    description: `Exempted project ${project.projectId ?? project.code ?? id} — ${project.name} from auto-archiving`,
    before: { autoArchiveExempt: false },
    after: { autoArchiveExempt: true },
  });
  res.json(serializeProject(updated, req.user?.role));
});

router.post("/projects/:id/auto-archive-unexempt", requireRole("MANAGEMENT"), async (req, res) => {
  const id = String(req.params.id);
  const project = await prisma.project.findUnique({ where: { id }, include: projectInclude });
  if (!project || project.deletedAt) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!(project as any).autoArchiveExempt) {
    res.status(400).json({ error: "Project is not exempt from auto-archiving" });
    return;
  }
  const updated = await prisma.project.update({
    where: { id },
    data: { autoArchiveExempt: false },
    include: projectInclude,
  });
  await recordAudit(req, {
    action: "project.auto_archive_unexempted",
    entityType: "Project",
    entityId: id,
    description: `Removed auto-archive exemption from project ${project.projectId ?? project.code ?? id} — ${project.name}`,
    before: { autoArchiveExempt: true },
    after: { autoArchiveExempt: false },
  });
  res.json(serializeProject(updated, req.user?.role));
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
    if (!before.archivedAt) {
      res.status(400).json({
        error: "Only archived projects can be deleted. Archive the project first.",
      });
      return;
    }
    // Soft delete — keep historical timesheets, documents, financials intact.
    // If this project came from a lead conversion, unlock the lead so it can be
    // converted again: clear convertedProjectId/wonAt and move it back from WON
    // to NEGOTIATION. (There is no project-restore endpoint; if one is ever
    // added, it must not re-attach the lead automatically since it may have
    // been re-converted to a different project in the meantime.)
    const { updated, unlockedLead } = await prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({
        where: { id: String(req.params.id) },
        data: { deletedAt: new Date() },
      });
      const linkedLead = await tx.lead.findUnique({
        where: { convertedProjectId: updated.id },
      });
      let unlockedLead = null;
      if (linkedLead) {
        unlockedLead = await tx.lead.update({
          where: { id: linkedLead.id },
          data: {
            convertedProjectId: null,
            wonAt: null,
            ...(linkedLead.stage === "WON" ? { stage: "NEGOTIATION" } : {}),
          },
        });
      }
      return { updated, unlockedLead };
    });
    await recordAudit(req, {
      action: "project.deleted",
      entityType: "Project",
      entityId: updated.id,
      description: `Soft-deleted project ${before.code} — ${before.name}${
        unlockedLead ? ` (unlocked lead "${unlockedLead.title}" for re-conversion)` : ""
      }`,
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

  // Earned Value Management — needs task-level progress/dates, which projectInclude
  // does not load, so fetch the lean task slice EVM requires separately. EV is a
  // duration-weighted roll-up of leaf-task physical completion (see computeEvm).
  const evmTasks = await prisma.task.findMany({
    where: { projectId: p.id },
    select: {
      id: true,
      parentTaskId: true,
      startDate: true,
      endDate: true,
      progressPercent: true,
      status: true,
    },
  });
  // Baseline (the project's committed scope/schedule/cost). When a current
  // baseline with dates exists, EVM's Planned Value is measured against the
  // baseline schedule window rather than the (possibly re-planned) live dates.
  const currentBaseline = await prisma.projectBaseline.findFirst({
    where: { projectId: p.id, isCurrent: true },
    orderBy: { version: "desc" },
  });
  const hasBaselineDates = !!(currentBaseline?.startDate && currentBaseline?.endDate);
  const evm = computeEvm({
    // BAC is the committed budget: the current baseline's estimatedCost when a
    // baseline exists, so EVM measures against the commitment even if the live
    // project estimatedCost drifts (re-planning before a formal re-baseline).
    bac: currentBaseline ? currentBaseline.estimatedCost : p.estimatedCost,
    ac: m.actualCost,
    tasks: evmTasks,
    scheduleStart: hasBaselineDates ? currentBaseline!.startDate : (p.startDate ?? null),
    scheduleEnd: hasBaselineDates ? currentBaseline!.endDate : (p.endDate ?? null),
    pvBasis: hasBaselineDates ? "BASELINE" : "PROJECT",
  });

  const baseline = currentBaseline
    ? {
        version: currentBaseline.version,
        source: currentBaseline.source,
        capturedAt: currentBaseline.createdAt.toISOString(),
        startDate: currentBaseline.startDate ? currentBaseline.startDate.toISOString() : null,
        endDate: currentBaseline.endDate ? currentBaseline.endDate.toISOString() : null,
        plannedMandays: currentBaseline.plannedMandays,
        estimatedCost: currentBaseline.estimatedCost,
        contractValue: currentBaseline.contractValue,
      }
    : null;
  const baselineDayDiff = (a: Date | null, b: Date | null): number | null => {
    if (!a || !b) return null;
    return Math.round((a.getTime() - b.getTime()) / 86_400_000);
  };
  const baselineVariance = currentBaseline
    ? {
        startDateDays: baselineDayDiff(p.startDate ?? null, currentBaseline.startDate),
        endDateDays: baselineDayDiff(p.endDate ?? null, currentBaseline.endDate),
        plannedMandays: p.plannedMandays - currentBaseline.plannedMandays,
        estimatedCost: p.estimatedCost - currentBaseline.estimatedCost,
        contractValue: p.contractValue - currentBaseline.contractValue,
      }
    : null;

  // Forecast & plain-language profit outlook share one source of truth. The
  // outlook projects forward from the burn rate once work is logged, and falls
  // back to the intake estimate before any actuals exist.
  const profitOutlook = computeProfitOutlook(p, m);
  const forecastCost = profitOutlook.forecastCost;
  const forecastProfit = profitOutlook.forecastProfit;

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
  const revenueNet = splitVat(p.contractValue, vatPct, includesVat).dpp;
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
    profitOutlook,
    evm,
    baseline,
    baselineVariance,
    monthly,
  });
});

export default router;
