import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  computeMetrics,
  projectMetricsSelect,
  type ProjectWithRelations,
} from "../lib/serializers.js";

const router: IRouter = Router();

type RoleKey = "PROJECT_MANAGER" | "KONSULTAN" | "TECHNICAL_WRITER" | "ADMIN_PROJECT";

const ALLOWED_ROLES: RoleKey[] = [
  "PROJECT_MANAGER",
  "KONSULTAN",
  "TECHNICAL_WRITER",
  "ADMIN_PROJECT",
];

// Min-max normalize an array of raw values to 0..100. Higher raw = higher score
// unless `invert` is true (then lower raw = higher score). If all values are the
// same, every candidate gets 100 (no signal — don't penalise).
function normalize(values: number[], invert = false): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 100);
  return values.map((v) => {
    const pct = ((v - min) / (max - min)) * 100;
    return invert ? 100 - pct : pct;
  });
}

function yearRange(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

function inRange(d: Date | null | undefined, start: Date, end: Date): boolean {
  if (!d) return false;
  const t = d.getTime();
  return t >= start.getTime() && t < end.getTime();
}

function distinctMonths(dates: Date[]): number {
  const s = new Set<string>();
  for (const d of dates) s.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}`);
  return s.size;
}

// Approx working hours per year (230 working days × 8h).
const ANNUAL_CAPACITY_HOURS = 230 * 8;
const MIN_ACTIVE_MONTHS = 3;

interface MetricDef {
  key: string;
  label: string;
  weight: number; // 0..1, sums to 1 per role
  invert?: boolean;
  format?: "pct" | "number" | "hours" | "currency";
}

const WEIGHTS: Record<RoleKey, MetricDef[]> = {
  PROJECT_MANAGER: [
    { key: "avgMargin",      label: "Avg Margin %",         weight: 0.30, format: "pct" },
    { key: "totalRevenue",   label: "Revenue Delivered",    weight: 0.20, format: "currency" },
    { key: "onTimeRate",     label: "On-time Delivery %",   weight: 0.20, format: "pct" },
    { key: "billingOnTime",  label: "Billing On-time %",    weight: 0.15, format: "pct" },
    { key: "approvalSpeed",  label: "Approval Speed (hrs)", weight: 0.15, invert: true, format: "hours" },
  ],
  KONSULTAN: [
    { key: "billableUtil",   label: "Billable Utilization %", weight: 0.35, format: "pct" },
    { key: "approvedHours",  label: "Approved Hours",         weight: 0.20, format: "hours" },
    { key: "taskCompletion", label: "Task Completion %",      weight: 0.15, format: "pct" },
    { key: "acceptanceRate", label: "Acceptance Rate %",      weight: 0.15, format: "pct" },
    { key: "projectVariety", label: "Project Variety",        weight: 0.10, format: "number" },
    { key: "discipline",     label: "Weekly Discipline %",    weight: 0.05, format: "pct" },
  ],
  TECHNICAL_WRITER: [
    { key: "deliverables",   label: "Reports / BAST Produced", weight: 0.30, format: "number" },
    { key: "billableUtil",   label: "Billable Utilization %",  weight: 0.25, format: "pct" },
    { key: "taskCompletion", label: "Task Completion %",       weight: 0.15, format: "pct" },
    { key: "acceptanceRate", label: "Acceptance Rate %",       weight: 0.15, format: "pct" },
    { key: "approvedHours",  label: "Approved Hours",          weight: 0.10, format: "hours" },
    { key: "projectVariety", label: "Project Variety",         weight: 0.05, format: "number" },
  ],
  ADMIN_PROJECT: [
    { key: "closingDocs",       label: "Closing Docs Uploaded", weight: 0.35, format: "number" },
    { key: "timeToClose",       label: "Avg Time-to-Close (d)", weight: 0.25, invert: true, format: "number" },
    { key: "projectCoverage",   label: "Projects Supported",    weight: 0.20, format: "number" },
    { key: "invoicingVelocity", label: "Invoices Issued",       weight: 0.10, format: "number" },
    { key: "discipline",        label: "Weekly Discipline %",   weight: 0.10, format: "pct" },
  ],
};

// Principals can only view performers for their directly supervised delivery
// role (and only users whose `principalId` points to them).
const PRINCIPAL_TO_REPORT: Record<string, RoleKey> = {
  PRINCIPAL_KONSULTAN: "KONSULTAN",
  PRINCIPAL_TECHNICAL_WRITER: "TECHNICAL_WRITER",
  PRINCIPAL_ADMIN_PROJECT: "ADMIN_PROJECT",
};

router.get(
  "/top-performers",
  requireAuth,
  requireRole(
    "MANAGEMENT",
    "PRINCIPAL_KONSULTAN",
    "PRINCIPAL_TECHNICAL_WRITER",
    "PRINCIPAL_ADMIN_PROJECT",
  ),
  async (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    const role = String(req.query.role || "") as RoleKey;
    const businessUnitId = req.query.businessUnitId ? String(req.query.businessUnitId) : null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 20));

    if (!ALLOWED_ROLES.includes(role)) {
      res.status(400).json({ error: `role must be one of ${ALLOWED_ROLES.join(", ")}` });
      return;
    }

    const callerRole = req.user!.role as string;
    const supervisedRole = PRINCIPAL_TO_REPORT[callerRole];
    const isPrincipal = Boolean(supervisedRole);
    if (isPrincipal && supervisedRole !== role) {
      res.status(403).json({
        error: `As ${callerRole}, you can only view the '${supervisedRole}' ranking.`,
      });
      return;
    }

    const { start, end } = yearRange(year);

    // Candidate users for this role (active + matching BU filter if any).
    // Principals: further restrict to users they directly supervise.
    const users = await prisma.user.findMany({
      where: {
        role,
        deletedAt: null,
        ...(businessUnitId ? { businessUnitId } : {}),
        ...(isPrincipal ? { principalId: req.user!.sub } : {}),
      },
      select: {
        id: true, name: true, email: true, isActive: true,
        businessUnitId: true,
        businessUnit: { select: { name: true } },
        avatarDataUrl: true,
        seniority: true,
      },
    });

    if (users.length === 0) {
      res.json({ year, role, page, pageSize, total: 0, weights: WEIGHTS[role], items: [] });
      return;
    }
    const userIds = users.map((u) => u.id);

    // Pre-fetch shared data sets used across roles, scoped to this year & cohort.
    const [timesheets, leaves] = await Promise.all([
      prisma.timesheet.findMany({
        where: {
          userId: { in: userIds },
          workDate: { gte: start, lt: end },
        },
        select: {
          userId: true, projectId: true, taskId: true,
          workDate: true, hours: true, status: true,
          task: { select: { billable: true } },
        },
      }),
      prisma.userLeave.findMany({
        where: {
          userId: { in: userIds },
          // True interval intersection: leave overlaps the year window.
          AND: [
            { startDate: { lt: end } },
            { endDate: { gte: start } },
          ],
        },
        select: { userId: true, startDate: true, endDate: true, type: true },
      }),
    ]);

    // Map: userId -> leave-days within year (working-day approximation).
    const leaveDaysByUser = new Map<string, number>();
    for (const lv of leaves) {
      const lvStart = lv.startDate > start ? lv.startDate : start;
      const lvEnd = lv.endDate < end ? lv.endDate : new Date(end.getTime() - 86_400_000);
      const days = Math.max(0, Math.floor((lvEnd.getTime() - lvStart.getTime()) / 86_400_000) + 1);
      leaveDaysByUser.set(lv.userId, (leaveDaysByUser.get(lv.userId) ?? 0) + days);
    }

    // Aggregate timesheets per user.
    interface TsAgg {
      approvedHours: number;
      billableApprovedHours: number;
      submittedOrApprovedHours: number;
      rejectedHours: number;
      distinctProjects: Set<string>;
      workDates: Date[];
    }
    const tsAgg = new Map<string, TsAgg>();
    for (const u of users) {
      tsAgg.set(u.id, {
        approvedHours: 0,
        billableApprovedHours: 0,
        submittedOrApprovedHours: 0,
        rejectedHours: 0,
        distinctProjects: new Set<string>(),
        workDates: [],
      });
    }
    for (const ts of timesheets) {
      const a = tsAgg.get(ts.userId);
      if (!a) continue;
      if (ts.status === "APPROVED") {
        a.approvedHours += ts.hours;
        a.submittedOrApprovedHours += ts.hours;
        a.distinctProjects.add(ts.projectId);
        a.workDates.push(ts.workDate);
        if (ts.task?.billable !== false) a.billableApprovedHours += ts.hours;
      } else if (ts.status === "SUBMITTED") {
        a.submittedOrApprovedHours += ts.hours;
      } else if (ts.status === "REJECTED") {
        a.rejectedHours += ts.hours;
      }
    }

    // ------- Per-role raw metrics -------
    type Raw = Record<string, number>;
    const rawByUser = new Map<string, Raw>();
    const activeMonthsByUser = new Map<string, number>();

    if (role === "PROJECT_MANAGER") {
      // Narrow select on purpose: scoring only needs the metrics shape
      // (resources/timesheets/expenses) plus pmId, dates, and milestone
      // invoice timing. The full `projectInclude` would drag avatars, RAID,
      // and other heavy relations across the wire for every PM project —
      // a large payload over the remote production database link.
      const projects = await prisma.project.findMany({
        where: {
          pmId: { in: userIds },
          deletedAt: null,
        },
        select: {
          ...projectMetricsSelect,
          pmId: true,
          endDate: true,
          updatedAt: true,
          billingMilestones: { select: { invoicedAt: true, dueDate: true } },
        },
      });
      // For approval speed, fetch timesheets approved this year on PM's projects.
      const pmProjectIds = projects.map((p) => p.id);
      const approvedTs = pmProjectIds.length
        ? await prisma.timesheet.findMany({
            where: {
              projectId: { in: pmProjectIds },
              status: "APPROVED",
              approvedAt: { gte: start, lt: end, not: null },
            },
            select: { projectId: true, createdAt: true, approvedAt: true },
          })
        : [];
      const approvalHoursByPm = new Map<string, number[]>();
      const projectsByPm = new Map<string, typeof projects>();
      for (const p of projects) {
        if (!p.pmId) continue;
        const arr = projectsByPm.get(p.pmId) ?? [];
        arr.push(p);
        projectsByPm.set(p.pmId, arr);
      }
      const pmIdByProject = new Map(projects.map((p) => [p.id, p.pmId]));
      for (const ts of approvedTs) {
        const pmId = pmIdByProject.get(ts.projectId);
        if (!pmId || !ts.approvedAt) continue;
        const hrs = (ts.approvedAt.getTime() - ts.createdAt.getTime()) / 3_600_000;
        if (hrs >= 0 && hrs < 24 * 14) {
          const arr = approvalHoursByPm.get(pmId) ?? [];
          arr.push(hrs);
          approvalHoursByPm.set(pmId, arr);
        }
      }

      for (const u of users) {
        const pmProjects = projectsByPm.get(u.id) ?? [];
        // Only consider COMPLETE/CLOSED with completion in target year.
        const delivered = pmProjects.filter(
          (p) => (p.status === "COMPLETE" || p.status === "CLOSED") && inRange(p.endDate ?? p.updatedAt, start, end),
        );
        let marginSum = 0;
        let revenueSum = 0;
        let onTime = 0;
        for (const p of delivered) {
          const m = computeMetrics(p as unknown as ProjectWithRelations);
          revenueSum += p.contractValue;
          if (p.contractValue > 0) marginSum += m.marginPct;
          if (p.endDate && p.updatedAt <= p.endDate) onTime += 1;
        }
        const avgMargin = delivered.length > 0 ? marginSum / delivered.length : 0;
        const onTimeRate = delivered.length > 0 ? (onTime / delivered.length) * 100 : 0;

        // Billing on-time: invoiced milestones (in year) where invoicedAt <= dueDate.
        let invoicedTotal = 0;
        let invoicedOnTime = 0;
        for (const p of pmProjects) {
          for (const ms of (p as any).billingMilestones ?? []) {
            if (!ms.invoicedAt || !inRange(ms.invoicedAt, start, end)) continue;
            invoicedTotal += 1;
            if (!ms.dueDate || ms.invoicedAt <= ms.dueDate) invoicedOnTime += 1;
          }
        }
        const billingOnTime = invoicedTotal > 0 ? (invoicedOnTime / invoicedTotal) * 100 : 0;

        const hoursArr = approvalHoursByPm.get(u.id) ?? [];
        const approvalSpeed = hoursArr.length
          ? hoursArr.reduce((s, h) => s + h, 0) / hoursArr.length
          : 48; // neutral baseline when no data

        rawByUser.set(u.id, {
          avgMargin,
          totalRevenue: revenueSum,
          onTimeRate,
          billingOnTime,
          approvalSpeed,
          deliveredCount: delivered.length,
        });
        // Active months proxy: months in which PM had any project activity (timesheet on their project, or delivery).
        const months = new Set<string>();
        for (const p of pmProjects) {
          for (const ts of (p as any).timesheets ?? []) {
            if (ts.workDate >= start && ts.workDate < end)
              months.add(`${ts.workDate.getUTCFullYear()}-${ts.workDate.getUTCMonth()}`);
          }
          if (inRange(p.endDate ?? p.updatedAt, start, end))
            months.add(`${(p.endDate ?? p.updatedAt).getUTCFullYear()}-${(p.endDate ?? p.updatedAt).getUTCMonth()}`);
        }
        activeMonthsByUser.set(u.id, months.size);
      }
    } else if (role === "KONSULTAN" || role === "TECHNICAL_WRITER") {
      // Pull tasks where user is an assignee.
      const taskAssignees = await prisma.taskAssignee.findMany({
        where: { userId: { in: userIds } },
        select: {
          userId: true,
          task: { select: { id: true, status: true, endDate: true, updatedAt: true } },
        },
      });
      const tasksByUser = new Map<string, { status: string; endDate: Date | null; updatedAt: Date }[]>();
      for (const ta of taskAssignees) {
        const arr = tasksByUser.get(ta.userId) ?? [];
        arr.push(ta.task);
        tasksByUser.set(ta.userId, arr);
      }

      // For TW: count documents authored.
      let docsByUser = new Map<string, number>();
      if (role === "TECHNICAL_WRITER") {
        const docs = await prisma.document.findMany({
          where: {
            uploadedById: { in: userIds },
            type: { in: ["BAST"] },
            uploadedAt: { gte: start, lt: end },
          },
          select: { uploadedById: true },
        });
        for (const d of docs) {
          if (!d.uploadedById) continue;
          docsByUser.set(d.uploadedById, (docsByUser.get(d.uploadedById) ?? 0) + 1);
        }
      }

      for (const u of users) {
        const agg = tsAgg.get(u.id)!;
        const leaveDays = leaveDaysByUser.get(u.id) ?? 0;
        const capacity = Math.max(1, ANNUAL_CAPACITY_HOURS - leaveDays * 8);
        const billableUtil = Math.min(150, (agg.billableApprovedHours / capacity) * 100);
        const submittedOrApproved = agg.submittedOrApprovedHours;
        const acceptanceRate = submittedOrApproved + agg.rejectedHours > 0
          ? (submittedOrApproved / (submittedOrApproved + agg.rejectedHours)) * 100
          : 100;

        const myTasks = tasksByUser.get(u.id) ?? [];
        const closedThisYear = myTasks.filter(
          (t) => t.status === "DONE" && inRange(t.updatedAt, start, end),
        );
        const dueThisYear = myTasks.filter(
          (t) => t.endDate && inRange(t.endDate, start, end),
        );
        const taskCompletion = dueThisYear.length > 0
          ? (closedThisYear.filter((t) => dueThisYear.includes(t)).length / dueThisYear.length) * 100
          : (myTasks.length > 0 ? (closedThisYear.length / myTasks.length) * 100 : 0);

        // Weekly discipline: % of weeks (Jan-Dec or up to today) where >= 32 logged hours.
        const totalsByWeek = new Map<string, number>();
        for (const ts of timesheets) {
          if (ts.userId !== u.id || ts.status !== "APPROVED") continue;
          const d = ts.workDate;
          // ISO week key
          const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
          const dayNum = tmp.getUTCDay() || 7;
          tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
          const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
          const wk = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
          const key = `${tmp.getUTCFullYear()}-W${wk}`;
          totalsByWeek.set(key, (totalsByWeek.get(key) ?? 0) + ts.hours);
        }
        const now = new Date();
        const yearEnd = now < end ? now : new Date(end.getTime() - 1);
        const weeksElapsed = Math.max(1, Math.ceil((yearEnd.getTime() - start.getTime()) / (7 * 86_400_000)));
        const goodWeeks = Array.from(totalsByWeek.values()).filter((h) => h >= 32).length;
        const discipline = Math.min(100, (goodWeeks / weeksElapsed) * 100);

        rawByUser.set(u.id, {
          billableUtil,
          approvedHours: agg.approvedHours,
          taskCompletion,
          acceptanceRate,
          projectVariety: agg.distinctProjects.size,
          deliverables: docsByUser.get(u.id) ?? 0,
          discipline,
        });
        activeMonthsByUser.set(u.id, distinctMonths(agg.workDates));
      }
    } else {
      // ADMIN_PROJECT
      const docs = await prisma.document.findMany({
        where: {
          uploadedById: { in: userIds },
          type: { in: ["INVOICE", "BAST", "CONTRACT"] },
          uploadedAt: { gte: start, lt: end },
        },
        select: {
          uploadedById: true, type: true, uploadedAt: true,
          project: { select: { id: true, status: true, updatedAt: true, endDate: true } },
        },
      });
      const docsByUser = new Map<string, typeof docs>();
      for (const d of docs) {
        if (!d.uploadedById) continue;
        const arr = docsByUser.get(d.uploadedById) ?? [];
        arr.push(d);
        docsByUser.set(d.uploadedById, arr);
      }

      const coveredProjects = await prisma.project.findMany({
        where: { adminProjectId: { in: userIds }, deletedAt: null },
        select: {
          id: true, adminProjectId: true, status: true, endDate: true, updatedAt: true,
          billingMilestones: {
            select: { id: true, status: true, invoicedAt: true },
          },
          documents: {
            where: { type: { in: ["INVOICE", "BAST"] } },
            select: { type: true, uploadedAt: true },
            orderBy: { uploadedAt: "asc" },
          },
        },
      });

      for (const u of users) {
        const myDocs = docsByUser.get(u.id) ?? [];
        const closingDocs = myDocs.length;
        const myProjects = coveredProjects.filter((p) => p.adminProjectId === u.id);
        const projectCoverage = myProjects.length;

        // Time-to-close: avg days between project COMPLETE/CLOSED (updatedAt) and first closing doc.
        const ttcs: number[] = [];
        let invoicingVelocity = 0;
        for (const p of myProjects) {
          for (const ms of p.billingMilestones) {
            if (ms.invoicedAt && inRange(ms.invoicedAt, start, end)) invoicingVelocity += 1;
          }
          if (p.status === "COMPLETE" || p.status === "CLOSED") {
            const firstDoc = p.documents[0];
            if (firstDoc && inRange(firstDoc.uploadedAt, start, end)) {
              const days = (firstDoc.uploadedAt.getTime() - p.updatedAt.getTime()) / 86_400_000;
              if (days >= 0 && days < 365) ttcs.push(days);
            }
          }
        }
        const timeToClose = ttcs.length > 0 ? ttcs.reduce((s, x) => s + x, 0) / ttcs.length : 30;

        // Weekly discipline for AP based on their own approved timesheets.
        const agg = tsAgg.get(u.id)!;
        const totalsByWeek = new Map<string, number>();
        for (const ts of timesheets) {
          if (ts.userId !== u.id || ts.status !== "APPROVED") continue;
          const d = ts.workDate;
          const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
          const dayNum = tmp.getUTCDay() || 7;
          tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
          const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
          const wk = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
          totalsByWeek.set(`${tmp.getUTCFullYear()}-W${wk}`, (totalsByWeek.get(`${tmp.getUTCFullYear()}-W${wk}`) ?? 0) + ts.hours);
        }
        const now = new Date();
        const yearEnd = now < end ? now : new Date(end.getTime() - 1);
        const weeksElapsed = Math.max(1, Math.ceil((yearEnd.getTime() - start.getTime()) / (7 * 86_400_000)));
        const goodWeeks = Array.from(totalsByWeek.values()).filter((h) => h >= 32).length;
        const discipline = Math.min(100, (goodWeeks / weeksElapsed) * 100);

        rawByUser.set(u.id, {
          closingDocs,
          timeToClose,
          projectCoverage,
          invoicingVelocity,
          discipline,
        });
        // Active months: months containing a doc upload, OR an approved timesheet.
        const months = new Set<string>();
        for (const d of myDocs) months.add(`${d.uploadedAt.getUTCFullYear()}-${d.uploadedAt.getUTCMonth()}`);
        for (const w of agg.workDates) months.add(`${w.getUTCFullYear()}-${w.getUTCMonth()}`);
        activeMonthsByUser.set(u.id, months.size);
      }
    }

    // ------- Eligibility + Normalisation -------
    const defs = WEIGHTS[role];
    // Eligibility: ≥ MIN_ACTIVE_MONTHS active months. New joiners with fewer
    // months are still returned (so they appear in the listing) but flagged
    // ineligible and excluded from normalisation.
    const candidates = users.map((u) => {
      const raw = rawByUser.get(u.id) ?? {};
      const activeMonths = activeMonthsByUser.get(u.id) ?? 0;
      const eligible = activeMonths >= MIN_ACTIVE_MONTHS;
      return { user: u, raw, activeMonths, eligible };
    });

    // Normalise each metric across eligible candidates only.
    const eligible = candidates.filter((c) => c.eligible);
    const normByKey: Record<string, Map<string, number>> = {};
    for (const def of defs) {
      const vals = eligible.map((c) => Number(c.raw[def.key] ?? 0));
      const norm = normalize(vals, def.invert);
      const map = new Map<string, number>();
      eligible.forEach((c, i) => map.set(c.user.id, norm[i]));
      normByKey[def.key] = map;
    }

    const scored = candidates.map((c) => {
      let score = 0;
      const breakdown: Record<string, { raw: number; normalized: number; weighted: number }> = {};
      for (const def of defs) {
        const raw = Number(c.raw[def.key] ?? 0);
        const normalized = c.eligible ? (normByKey[def.key].get(c.user.id) ?? 0) : 0;
        const weighted = normalized * def.weight;
        score += weighted;
        breakdown[def.key] = { raw, normalized, weighted };
      }
      return {
        userId: c.user.id,
        name: c.user.name,
        email: c.user.email,
        avatarDataUrl: c.user.avatarDataUrl,
        seniority: c.user.seniority,
        businessUnitId: c.user.businessUnitId,
        businessUnitName: c.user.businessUnit?.name ?? null,
        isActive: c.user.isActive,
        activeMonths: c.activeMonths,
        eligible: c.eligible,
        score: Number(score.toFixed(2)),
        breakdown,
      };
    });

    scored.sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.score - a.score;
    });
    scored.forEach((s, i) => ((s as any).rank = i + 1));

    const total = scored.length;
    const items = scored.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      year,
      role,
      page,
      pageSize,
      total,
      weights: defs,
      items,
    });
  },
);

export default router;
