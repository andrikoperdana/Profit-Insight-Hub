import { Router, type IRouter } from "express";
import { prisma, type ProjectStatus } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  serializeProject,
  projectInclude,
  computeMetrics,
} from "../lib/serializers.js";

const router: IRouter = Router();
router.use(requireAuth);

const writeRoles = ["MANAGEMENT", "PROJECT_MANAGER", "SALES"] as const;

router.get("/projects", async (req, res) => {
  const status = req.query.status as ProjectStatus | undefined;
  const role = req.user!.role;
  const userId = req.user!.sub;
  const where: any = {};
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
  const created = await prisma.project.create({
    data: {
      code: String(b.code),
      name: String(b.name),
      description: b.description || null,
      clientId: String(b.clientId),
      salesId: b.salesId || null,
      pmId: b.pmId || null,
      status: (b.status as ProjectStatus) || "OBSERVATION",
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
  res.status(201).json(serializeProject(created));
});

router.patch("/projects/:id", requireRole(...writeRoles), async (req, res) => {
  const b = req.body || {};

  // If status is changing to PAUSE or COMPLETE, require statusChangeReason
  if (b.status === "PAUSE" || b.status === "COMPLETE") {
    const existing = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: { status: true },
    });
    if (existing && existing.status !== b.status) {
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
  if (b.status !== undefined) {
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
    await prisma.project.delete({ where: { id: req.params.id } });
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
