import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { canViewAllProjects } from "../lib/roles.js";
import { splitVat } from "../lib/invoicing.js";

const router: IRouter = Router();
router.use(requireAuth);

function startOfIsoWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addDaysUtc(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function addMonthsUtc(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Invoice planning matrix.
 *
 * Returns Project rows (grouped by PM's Business Unit) × period columns
 * (weekly or monthly). Each cell aggregates BillingMilestone amounts that
 * fall in that period by `dueDate`. CANCELLED milestones are excluded.
 *
 * Access:
 *   MANAGEMENT      — all projects
 *   FINANCE         — all projects (read-only consumer)
 *   PROJECT_MANAGER — projects where pmId === user
 *   ADMIN_PROJECT   — projects where adminProjectId === user
 *   SALES           — projects where salesId === user
 *   others          — 403
 */
router.get("/invoice-planning", async (req, res) => {
  const role = req.user!.role;
  const userId = req.user!.sub;
  // MANAGEMENT + FINANCE (canViewAllProjects, minus SITE_ADMIN which has no
  // billing visibility) plus the per-scope owners (PM/ADMIN_PROJECT/SALES).
  const isOwnerRole =
    role === "PROJECT_MANAGER" || role === "ADMIN_PROJECT" || role === "SALES";
  if (!(canViewAllProjects(role) && role !== "SITE_ADMIN") && !isOwnerRole) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const mode = req.query.mode === "month" ? "month" : "week";
  const maxPeriods = mode === "month" ? 12 : 26;
  let periods = Number(req.query.periods ?? (mode === "month" ? 6 : 8));
  if (!isFinite(periods) || periods < 1) periods = mode === "month" ? 6 : 8;
  if (periods > maxPeriods) periods = maxPeriods;

  let start: Date;
  if (typeof req.query.startDate === "string" && req.query.startDate) {
    const d = new Date(`${req.query.startDate}T00:00:00.000Z`);
    if (isNaN(d.getTime())) {
      res.status(400).json({ error: "startDate must be YYYY-MM-DD" });
      return;
    }
    start = mode === "month" ? startOfMonth(d) : startOfIsoWeek(d);
  } else {
    start = mode === "month" ? startOfMonth(new Date()) : startOfIsoWeek(new Date());
  }

  const periodStarts: Date[] = [];
  for (let i = 0; i < periods; i++) {
    periodStarts.push(mode === "month" ? addMonthsUtc(start, i) : addDaysUtc(start, i * 7));
  }
  const periodEnd = mode === "month" ? addMonthsUtc(start, periods) : addDaysUtc(start, periods * 7);

  const projectWhere: any = {
    deletedAt: null,
    status: { in: ["OBSERVATION", "ACTIVE", "PAUSE"] },
  };
  if (role === "PROJECT_MANAGER") projectWhere.pmId = userId;
  else if (role === "ADMIN_PROJECT") projectWhere.adminProjectId = userId;
  else if (role === "SALES") projectWhere.salesId = userId;

  const projects = await prisma.project.findMany({
    where: projectWhere,
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      contractValue: true,
      vatPercent: true,
      contractValueIncludesVat: true,
      pmId: true,
      pm: { select: { id: true, name: true, businessUnitId: true, businessUnit: { select: { id: true, name: true } } } },
      client: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  const milestones = await prisma.billingMilestone.findMany({
    where: {
      projectId: { in: projects.map((p) => p.id) },
      status: { in: ["PLANNED", "INVOICED", "PAID"] },
      dueDate: { gte: start, lt: periodEnd },
    },
    orderBy: { dueDate: "asc" },
  });

  // Surface count of milestones with no due date so they aren't silently hidden.
  const unscheduledCount = projects.length
    ? await prisma.billingMilestone.count({
        where: {
          projectId: { in: projects.map((p) => p.id) },
          status: { in: ["PLANNED", "INVOICED", "PAID"] },
          dueDate: null,
        },
      })
    : 0;

  function bucketIndex(due: Date): number {
    if (mode === "month") {
      const months = (due.getUTCFullYear() - start.getUTCFullYear()) * 12 + (due.getUTCMonth() - start.getUTCMonth());
      return months >= 0 && months < periods ? months : -1;
    }
    const diffDays = Math.floor((due.getTime() - start.getTime()) / 86400000);
    const idx = Math.floor(diffDays / 7);
    return idx >= 0 && idx < periods ? idx : -1;
  }

  type CellMilestone = {
    id: string;
    name: string;
    status: string;
    invoiceNumber: string | null;
    dueDate: string | null;
    dpp: number;
    vat: number;
    total: number;
  };
  type Cell = { periodStart: string; dpp: number; vat: number; total: number; milestones: CellMilestone[] };

  type Row = {
    projectId: string;
    projectCode: string | null;
    projectName: string;
    projectStatus: string;
    clientName: string | null;
    pmName: string | null;
    cells: Cell[];
    rowTotalDpp: number;
    rowTotalVat: number;
    rowTotalTotal: number;
  };

  const rowsByProject = new Map<string, Row>();
  for (const p of projects) {
    rowsByProject.set(p.id, {
      projectId: p.id,
      projectCode: p.code ?? null,
      projectName: p.name,
      projectStatus: p.status,
      clientName: p.client?.name ?? null,
      pmName: p.pm?.name ?? null,
      cells: periodStarts.map((d) => ({
        periodStart: isoDate(d),
        dpp: 0,
        vat: 0,
        total: 0,
        milestones: [],
      })),
      rowTotalDpp: 0,
      rowTotalVat: 0,
      rowTotalTotal: 0,
    });
  }

  for (const ms of milestones) {
    if (!ms.dueDate) continue;
    const idx = bucketIndex(ms.dueDate);
    if (idx < 0) continue;
    const p = projects.find((x) => x.id === ms.projectId);
    if (!p) continue;
    const row = rowsByProject.get(p.id);
    if (!row) continue;
    const gross = ms.amount ?? (p.contractValue * (ms.percentage ?? 0)) / 100;
    const { dpp, vat, total } = splitVat(gross, p.vatPercent ?? 11, p.contractValueIncludesVat ?? true);
    const cell = row.cells[idx]!;
    cell.dpp += dpp;
    cell.vat += vat;
    cell.total += total;
    cell.milestones.push({
      id: ms.id,
      name: ms.name,
      status: ms.status,
      invoiceNumber: ms.invoiceNumber ?? null,
      dueDate: ms.dueDate ? isoDate(ms.dueDate) : null,
      dpp,
      vat,
      total,
    });
    row.rowTotalDpp += dpp;
    row.rowTotalVat += vat;
    row.rowTotalTotal += total;
  }

  // Group by PM's Business Unit
  type Group = { businessUnitId: string | null; businessUnitName: string; rows: Row[] };
  const groupMap = new Map<string, Group>();
  for (const p of projects) {
    const buId = p.pm?.businessUnitId ?? null;
    const buName = p.pm?.businessUnit?.name ?? "No Business Unit";
    const key = buId ?? "__none__";
    let g = groupMap.get(key);
    if (!g) {
      g = { businessUnitId: buId, businessUnitName: buName, rows: [] };
      groupMap.set(key, g);
    }
    const row = rowsByProject.get(p.id);
    if (row) g.rows.push(row);
  }
  const groups = Array.from(groupMap.values()).sort((a, b) => {
    if (a.businessUnitId === null) return 1;
    if (b.businessUnitId === null) return -1;
    return a.businessUnitName.localeCompare(b.businessUnitName);
  });

  // Period totals (grand-totals per column)
  const periodTotals = periodStarts.map((d, i) => {
    let dpp = 0, vat = 0, total = 0, count = 0;
    for (const g of groups) {
      for (const r of g.rows) {
        const c = r.cells[i]!;
        dpp += c.dpp;
        vat += c.vat;
        total += c.total;
        count += c.milestones.length;
      }
    }
    return { periodStart: isoDate(d), dpp, vat, total, milestoneCount: count };
  });

  res.json({
    mode,
    startDate: isoDate(start),
    periods,
    periodStarts: periodStarts.map(isoDate),
    groups,
    periodTotals,
    unscheduledCount,
  });
});

export default router;
