import { Router, type IRouter } from "express";
import { prisma, type ProjectStatus } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  serializeProject,
  projectInclude,
  computeMetrics,
  canViewProjectFinancials,
} from "../lib/serializers.js";
import { recordAudit } from "../lib/audit.js";
import { issueSurveyTokenIfMissing } from "../lib/surveyDefaults.js";
import { notifyUsers } from "../lib/notifications.js";

const router: IRouter = Router();
router.use(requireAuth);

const writeRoles = [
  "MANAGEMENT",
  "PROJECT_MANAGER",
  "SALES",
  "PRINCIPAL_TECHNICAL_WRITER",
  "PRINCIPAL_ADMIN_PROJECT",
] as const;

// Safely parse a YYYY-MM-DD date string from a client.
// Returns:
//   - null      → empty/missing input (treat as "clear the field")
//   - null      → input is present but malformed (caller should 400 it)
//   - Date      → valid, in-range date
// Rejects extended-year ISO strings like "+062026-05-05" or "82026-05-05" that
// JS's Date accepts but Prisma cannot serialize, causing 500s.
// Validate a base64-encoded PDF data URL. Returns:
//   - undefined → input is empty (treat as "clear the field"; caller stores null)
//   - string    → valid data URL
//   - throws    → invalid (caller should 400)
const MAX_PDF_BYTES_SERVER = 4 * 1024 * 1024;
function validatePdfDataUrl(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value);
  const m = /^data:application\/pdf(?:;[^,]*)?;base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  if (!m) {
    const err: Error & { status?: number } = new Error(`${fieldName} must be a base64-encoded application/pdf data URL`);
    err.status = 400;
    throw err;
  }
  const b64 = m[1];
  // Decoded length = (b64.length * 3 / 4) - padding
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const decodedSize = Math.floor((b64.length * 3) / 4) - padding;
  if (decodedSize > MAX_PDF_BYTES_SERVER) {
    const err: Error & { status?: number } = new Error(`${fieldName} exceeds 4 MB size limit`);
    err.status = 400;
    throw err;
  }
  return raw;
}

function sanitizeFileName(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value).slice(0, 255);
}

function parseSafeDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const raw = String(value);
  const ymd = /^(\d{4})-\d{2}-\d{2}/.exec(raw);
  if (!ymd) return null;
  const year = Number(ymd[1]);
  if (year < 1900 || year > 9999) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

// One-time demo seed (MANAGEMENT only) — adds 9 sample projects
// across OBSERVATION/ACTIVE/PAUSE. Idempotent: skips codes that already exist.
const DEMO_PROJECTS: { status: ProjectStatus; name: string; value: number; mandays: number }[] = [
  { status: "OBSERVATION", name: "Penilaian Risiko Cyber Awal", value: 320_000_000, mandays: 35 },
  { status: "OBSERVATION", name: "Pre-Sales Penetration Test", value: 280_000_000, mandays: 28 },
  { status: "OBSERVATION", name: "Workshop Awareness Karyawan", value: 180_000_000, mandays: 18 },
  { status: "ACTIVE",      name: "Implementasi SOC Tier-1", value: 850_000_000, mandays: 90 },
  { status: "ACTIVE",      name: "Audit ISO 27001 Tahap 2", value: 620_000_000, mandays: 70 },
  { status: "ACTIVE",      name: "Penetration Test Aplikasi Mobile", value: 480_000_000, mandays: 55 },
  { status: "PAUSE",       name: "Migrasi SIEM Splunk", value: 920_000_000, mandays: 110 },
  { status: "PAUSE",       name: "Hardening Infrastruktur Cloud", value: 540_000_000, mandays: 60 },
  { status: "PAUSE",       name: "Review Kebijakan Keamanan TI", value: 240_000_000, mandays: 28 },
];

router.post("/projects/seed-demo", requireRole("MANAGEMENT"), async (req, res) => {
  const clients = await prisma.client.findMany({ take: 4, orderBy: { createdAt: "asc" } });
  const pm = await prisma.user.findFirst({ where: { role: "PROJECT_MANAGER" } });
  const sales = await prisma.user.findFirst({ where: { role: "SALES" } });
  if (!clients.length || !pm || !sales) {
    res.status(400).json({ error: "Seed prerequisites missing (clients/PM/Sales)" });
    return;
  }
  const last = await prisma.project.findFirst({
    where: { code: { startsWith: "SPH-2026-" } },
    orderBy: { code: "desc" },
  });
  let nextNum = 1;
  if (last) {
    const m = last.code.match(/SPH-2026-(\d+)/);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }
  const consultants = await prisma.user.findMany({
    where: { role: { in: ["KONSULTAN", "TECHNICAL_WRITER"] } },
  });
  const today = new Date();
  const created: string[] = [];
  const skipped: string[] = [];
  let resourcesCreated = 0;
  for (let i = 0; i < DEMO_PROJECTS.length; i += 1) {
    const p = DEMO_PROJECTS[i];
    const exists = await prisma.project.findFirst({ where: { name: p.name, status: p.status } });
    if (exists) { skipped.push(p.name); continue; }
    const code = `SPH-2026-${String(nextNum).padStart(3, "0")}`;
    nextNum += 1;
    const client = clients[i % clients.length];
    const startOffset = p.status === "OBSERVATION" ? 30 : p.status === "ACTIVE" ? -20 : -45;
    const startDate = new Date(today.getTime() + startOffset * 86400000);
    const endDate = new Date(startDate.getTime() + p.mandays * 86400000);
    const project = await prisma.project.create({
      data: {
        code,
        name: p.name,
        description: `${p.name} for ${client.name}.`,
        status: p.status,
        clientId: client.id,
        salesId: sales.id,
        pmId: pm.id,
        startDate,
        endDate,
        contractValue: p.value,
        estimatedCost: Math.round(p.value * 0.55),
        plannedMandays: p.mandays,
      },
    });
    created.push(project.code);

    // Assign PM + 2 consultants for ACTIVE/PAUSE; just PM for OBSERVATION
    const assignments: { userId: string; role: string; share: number; rate: number }[] = [
      { userId: pm.id, role: "Project Manager", share: 0.2, rate: 2_500_000 },
    ];
    if (p.status !== "OBSERVATION" && consultants.length > 0) {
      const c1 = consultants[i % consultants.length];
      const c2 = consultants[(i + 1) % consultants.length];
      assignments.push({ userId: c1.id, role: "Lead Consultant", share: 0.5, rate: 1_800_000 });
      if (c2.id !== c1.id) {
        assignments.push({ userId: c2.id, role: "Consultant", share: 0.3, rate: 1_500_000 });
      }
    }
    for (const a of assignments) {
      await prisma.projectResource.create({
        data: {
          projectId: project.id,
          userId: a.userId,
          roleInProject: a.role,
          plannedMandays: Math.round(p.mandays * a.share),
          dailyRate: a.rate,
        },
      });
      resourcesCreated += 1;
    }
  }
  await recordAudit(req, {
    action: "project.seed_demo",
    entityType: "Project",
    description: `Seeded ${created.length} demo projects (${resourcesCreated} resource assignments)`,
    after: { created, skipped, resourcesCreated },
  });
  res.json({ ok: true, created, skipped, resourcesCreated });
});

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
    where.pmId = userId;
  } else if (role === "SALES") {
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
    where.OR = [
      { adminProjectId: userId },
      { status: { in: ["COMPLETE", "CLOSED"] } },
    ];
  }
  const projects = await prisma.project.findMany({
    where,
    include: projectInclude,
    orderBy: { createdAt: "desc" },
  });
  res.json(projects.map((p) => serializeProject(p, req.user?.role)));
});

router.get("/projects/:id", async (req, res) => {
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
    resources: p.resources.map((r) => {
      let actualMandays = 0;
      for (const ts of p.timesheets) {
        if (ts.userId === r.userId && ts.status === "APPROVED") {
          actualMandays += ts.hours / 8;
        }
      }
      return {
        id: r.id,
        projectId: r.projectId,
        userId: r.userId,
        userName: r.user.name,
        userRole: r.user.role,
        roleInProject: r.roleInProject,
        plannedMandays: r.plannedMandays,
        actualMandays,
        dailyRate: showFinancials ? r.dailyRate : 0,
      };
    }),
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
      startDate,
      endDate,
      contractValue: Number(b.contractValue || 0),
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
    where: { id: req.params.id },
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
    if (!["OBSERVATION", "ACTIVE"].includes(beforeProj.status as string)) {
      res.status(403).json({
        error: "Principal can only assign on OBSERVATION or ACTIVE projects",
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
    where: { id: req.params.id },
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
      where: { id: req.params.id },
      include: projectInclude,
    });
    if (!before) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Soft delete — keep historical timesheets, documents, financials intact.
    const updated = await prisma.project.update({
      where: { id: req.params.id },
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
  const p = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: projectInclude,
  });
  if (!p) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const m = computeMetrics(p);

  const burnRatePct =
    p.plannedMandays > 0 ? (m.actualMandays / p.plannedMandays) * 100 : 0;

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
  const perMonthRev =
    months.length > 0 ? p.contractValue / months.length : 0;
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
    monthly,
  });
});

export default router;
