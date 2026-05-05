import { Router, type IRouter } from "express";
import { prisma, type ProjectStatus } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  serializeProject,
  projectInclude,
  computeMetrics,
} from "../lib/serializers.js";
import { recordAudit } from "../lib/audit.js";
import { issueSurveyTokenIfMissing } from "../lib/surveyDefaults.js";

const router: IRouter = Router();
router.use(requireAuth);

const writeRoles = ["MANAGEMENT", "PROJECT_MANAGER", "SALES"] as const;

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
        description: `${p.name} untuk ${client.name}.`,
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
  } else if (role === "KONSULTAN" || role === "TECHNICAL_WRITER") {
    where.OR = [
      { resources: { some: { userId } } },
      { timesheets: { some: { userId } } },
    ];
  }
  const projects = await prisma.project.findMany({
    where,
    include: projectInclude,
    orderBy: { createdAt: "desc" },
  });
  res.json(projects.map(serializeProject));
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
  const base = serializeProject(p);
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
        dailyRate: r.dailyRate,
      };
    }),
    documents: p.documents.map((d) => ({
      id: d.id,
      projectId: d.projectId,
      type: d.type,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      invoiceNumber: d.invoiceNumber,
      invoiceAmount: d.invoiceAmount,
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
  const created = await prisma.project.create({
    data: {
      code: String(b.code),
      name: String(b.name),
      description: b.description || null,
      clientId: String(b.clientId),
      salesId,
      pmId,
      status,
      startDate: b.startDate ? new Date(b.startDate) : null,
      endDate: b.endDate ? new Date(b.endDate) : null,
      contractValue: Number(b.contractValue || 0),
      estimatedCost: Number(b.estimatedCost || 0),
      plannedMandays: Number(b.plannedMandays || 0),
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
  res.status(201).json(serializeProject(created));
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

  const SALES_ALLOWED = new Set(["code", "name", "description", "clientId", "contractValue"]);
  const PM_FORBIDDEN = new Set(["salesId", "pmId"]);

  if (role === "SALES") {
    if (beforeProj.salesId !== userId) {
      res.status(403).json({ error: "You can only update projects you submitted" });
      return;
    }
    if (beforeProj.status !== "DRAFT") {
      res.status(403).json({ error: "Sales can only edit projects while still in DRAFT" });
      return;
    }
    const violating = Object.keys(b).filter(
      (k) => b[k] !== undefined && !SALES_ALLOWED.has(k),
    );
    if (violating.length) {
      res.status(403).json({
        error: `Sales is not allowed to change: ${violating.join(", ")}`,
      });
      return;
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
  if (b.status !== undefined) data.status = b.status as ProjectStatus;
  if (b.startDate !== undefined)
    data.startDate = b.startDate ? new Date(b.startDate) : null;
  if (b.endDate !== undefined)
    data.endDate = b.endDate ? new Date(b.endDate) : null;
  if (b.contractValue !== undefined) data.contractValue = Number(b.contractValue);
  if (b.estimatedCost !== undefined) data.estimatedCost = Number(b.estimatedCost);
  if (b.plannedMandays !== undefined)
    data.plannedMandays = Number(b.plannedMandays);
  if (b.statusChangeReason !== undefined && b.status !== undefined) {
    data.lastStatusReason = String(b.statusChangeReason ?? "") || null;
  }
  const updated = await prisma.project.update({
    where: { id: req.params.id },
    data,
    include: projectInclude,
  });
  if (updated.status === "CLOSED" && !updated.surveyToken) {
    await issueSurveyTokenIfMissing(updated.id);
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
  res.json(serializeProject(updated));
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
  const avgRate =
    m.actualMandays > 0
      ? m.actualCost / m.actualMandays
      : p.resources.length > 0
        ? p.resources.reduce((s, r) => s + r.dailyRate, 0) / p.resources.length
        : 0;

  const baseProjectedMandays = Math.max(p.plannedMandays, m.actualMandays);
  const baseForecastCost = baseProjectedMandays * avgRate;
  const baseForecastProfit = p.contractValue - baseForecastCost;
  const baseMarginPct =
    p.contractValue > 0 ? (baseForecastProfit / p.contractValue) * 100 : 0;

  const scenarioMandays = baseProjectedMandays + addMandays;
  const scenarioCost = scenarioMandays * avgRate;
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
  const projectedMandays = Math.max(p.plannedMandays, m.actualMandays);
  const avgRate =
    m.actualMandays > 0
      ? m.actualCost / m.actualMandays
      : p.resources.length > 0
        ? p.resources.reduce((s, r) => s + r.dailyRate, 0) / p.resources.length
        : 0;
  const forecastCost = projectedMandays * avgRate;
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
