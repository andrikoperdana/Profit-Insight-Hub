import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { isPrincipalRole } from "../lib/roles.js";
import { TtlCache } from "../lib/ttlCache.js";

const router: IRouter = Router();
router.use(requireAuth);

// For MGMT/PM/HR the matrix is identical (the whole active workforce), so we
// key those by window params only. Principals see a scoped subset (their direct
// supervisees), so their cache key is additionally namespaced by user id (see
// `cacheKey` below). 30s matches the frontend React Query staleTime.
const planningCache = new TtlCache<unknown>(30_000);

// Returns the Monday (UTC) of the ISO week containing `d`.
function startOfIsoWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = dow === 0 ? -6 : 1 - dow; // shift to Monday
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}
function addDaysUtc(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resource planning matrix.
 *
 * Visibility: MANAGEMENT and PROJECT_MANAGER only — this surfaces commercial
 * data (which BU consumes which projects' mandays).
 *
 * For each user (grouped by their Business Unit), returns one cell per week
 * within the window with the planned mandays consumed by their active
 * `ProjectResource` rows. We spread each resource's `plannedMandays` evenly
 * across the project's [startDate, endDate] range, then bucket into weeks.
 */
router.get(
  "/resource-planning",
  requireRole(
    "MANAGEMENT",
    "PROJECT_MANAGER",
    "HR",
    "PRINCIPAL_KONSULTAN",
    "PRINCIPAL_TECHNICAL_WRITER",
    "PRINCIPAL_ADMIN_PROJECT",
  ),
  async (req, res) => {
    // Principals see only their direct supervisees (User.principalId = me);
    // everyone else (MGMT/PM/HR) sees the whole active workforce.
    const isPrincipal = isPrincipalRole(req.user!.role);
    let weeks = Number(req.query.weeks ?? 8);
    if (!isFinite(weeks) || weeks < 1) weeks = 8;
    if (weeks > 26) weeks = 26;

    let start: Date;
    if (typeof req.query.startDate === "string" && req.query.startDate) {
      const d = new Date(`${req.query.startDate}T00:00:00.000Z`);
      if (isNaN(d.getTime())) {
        res.status(400).json({ error: "startDate must be YYYY-MM-DD" });
        return;
      }
      start = startOfIsoWeek(d);
    } else {
      start = startOfIsoWeek(new Date());
    }
    const end = addDaysUtc(start, weeks * 7);

    const cacheKey = isPrincipal
      ? `principal:${req.user!.sub}:${isoDate(start)}:${weeks}`
      : `${isoDate(start)}:${weeks}`;
    const cached = planningCache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const weekStarts: Date[] = [];
    for (let i = 0; i < weeks; i++) weekStarts.push(addDaysUtc(start, i * 7));

    // Pull all active users with seniority/skill-relevant roles plus PMs.
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(isPrincipal ? { principalId: req.user!.sub } : {}),
      },
      orderBy: { name: "asc" },
      include: {
        businessUnit: { select: { id: true, name: true } },
        skills: { include: { skill: { select: { name: true } } } },
        // Active ProjectResource rows that overlap the window.
        resources: {
          where: {
            project: {
              deletedAt: null,
              status: { in: ["OBSERVATION", "ACTIVE", "DRAFT"] },
            },
          },
          include: {
            project: {
              select: {
                id: true, code: true, name: true,
                startDate: true, endDate: true, plannedMandays: true,
              },
            },
          },
        },
      },
    });

    type Cell = {
      weekStart: string;
      plannedMandays: number;
      allocations: { projectId: string; projectName: string; projectCode: string | null; mandays: number }[];
    };

    function buildCells(u: typeof users[number]): Cell[] {
      const cells: Cell[] = weekStarts.map((ws) => ({
        weekStart: isoDate(ws),
        plannedMandays: 0,
        allocations: [],
      }));
      for (const r of (u as any).resources as any[]) {
        const planned = r.plannedMandays ?? 0;
        if (!planned) continue;
        const p = r.project;
        const ps = p.startDate ? new Date(p.startDate) : null;
        const pe = p.endDate ? new Date(p.endDate) : null;
        if (!ps || !pe || pe.getTime() < ps.getTime()) continue;
        // Skip if project's window doesn't overlap our window.
        if (pe.getTime() < start.getTime() || ps.getTime() > end.getTime()) continue;
        const totalDays = Math.max(1, Math.round((pe.getTime() - ps.getTime()) / 86400000) + 1);
        const perDay = planned / totalDays;
        for (let i = 0; i < weeks; i++) {
          const ws = weekStarts[i]!;
          const we = addDaysUtc(ws, 7);
          const overlapStart = ps.getTime() > ws.getTime() ? ps : ws;
          const overlapEnd = pe.getTime() < we.getTime() ? pe : we;
          const overlapDays = Math.max(
            0,
            Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) +
              (pe.getTime() < we.getTime() ? 1 : 0),
          );
          if (overlapDays <= 0) continue;
          const md = perDay * Math.min(overlapDays, 7);
          if (md <= 0.001) continue;
          cells[i]!.plannedMandays += md;
          cells[i]!.allocations.push({
            projectId: p.id,
            projectName: p.name,
            projectCode: p.code ?? null,
            mandays: Number(md.toFixed(2)),
          });
        }
      }
      // Round display values; keep allocations as-is (already 2dp above).
      for (const c of cells) c.plannedMandays = Number(c.plannedMandays.toFixed(2));
      return cells;
    }

    type Row = {
      userId: string;
      userName: string;
      role: string;
      seniority: string | null;
      businessUnitId: string | null;
      businessUnitName: string | null;
      skills: string[];
      cells: Cell[];
    };
    const rows: Row[] = users.map((u) => ({
      userId: u.id,
      userName: u.name,
      role: u.role,
      seniority: (u as any).seniority ?? null,
      businessUnitId: (u as any).businessUnitId ?? null,
      businessUnitName: (u as any).businessUnit?.name ?? null,
      skills: ((u as any).skills ?? []).map((s: any) => s.skill?.name).filter(Boolean),
      cells: buildCells(u),
    }));

    // Group by business unit (null grouped under "No Business Unit").
    const groupMap = new Map<string, { businessUnitId: string | null; businessUnitName: string; rows: Row[] }>();
    for (const r of rows) {
      const key = r.businessUnitId ?? "__none__";
      const name = r.businessUnitName ?? "No Business Unit";
      let g = groupMap.get(key);
      if (!g) {
        g = { businessUnitId: r.businessUnitId, businessUnitName: name, rows: [] };
        groupMap.set(key, g);
      }
      g.rows.push(r);
    }
    const groups = Array.from(groupMap.values()).sort((a, b) => {
      if (a.businessUnitId === null) return 1;
      if (b.businessUnitId === null) return -1;
      return a.businessUnitName.localeCompare(b.businessUnitName);
    });

    const payload = {
      startDate: isoDate(start),
      weeks,
      weekStarts: weekStarts.map(isoDate),
      groups,
    };
    planningCache.set(cacheKey, payload);
    res.json(payload);
  },
);

export default router;
