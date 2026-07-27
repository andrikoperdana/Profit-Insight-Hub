import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { splitVat } from "../lib/invoicing.js";

const router: IRouter = Router();
router.use(requireAuth);

/**
 * GET /api/revenue-recognition
 *
 * Revenue-recognition recap across commercial (CLIENT) projects. A milestone
 * is "recognized" when ANY of the following holds:
 *   1. its BAST document is uploaded, or
 *   2. the milestone is PAID, or
 *   3. its per-milestone report link is filed.
 * CANCELLED milestones are excluded entirely.
 *
 * Access: MANAGEMENT / FINANCE / SUPER_ADMIN see every project; a
 * PROJECT_MANAGER only sees projects where they are the assigned PM. All
 * other roles are rejected (commercial figures).
 */
router.get("/revenue-recognition", async (req, res) => {
  const role = req.user?.role;
  const userId = req.user?.sub;
  const seesAll = role === "MANAGEMENT" || role === "FINANCE" || role === "SUPER_ADMIN";
  if (!seesAll && role !== "PROJECT_MANAGER") {
    res.status(403).json({ error: "Only Management, Finance or a Project Manager can view revenue recognition" });
    return;
  }

  const projects = await prisma.project.findMany({
    where: {
      kind: "CLIENT",
      ...(seesAll ? {} : { pmId: userId ?? "" }),
    },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      contractValue: true,
      vatPercent: true,
      contractValueIncludesVat: true,
      pmId: true,
      pm: {
        select: {
          id: true,
          name: true,
          role: true,
          businessUnit: { select: { id: true, name: true } },
          manager: { select: { id: true, name: true } },
        },
      },
      client: { select: { name: true } },
      workstreams: { select: { businessUnit: { select: { id: true, name: true } } } },
      billingMilestones: {
        where: { status: { not: "CANCELLED" } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          status: true,
          percentage: true,
          amount: true,
          invoicedAt: true,
          paidAt: true,
          reportUrl: true,
          reportFiledAt: true,
          workstream: { select: { name: true, businessUnit: { select: { id: true, name: true } } } },
          invoiceDocuments: {
            where: { type: "BAST", isLatest: true },
            select: { id: true, uploadedAt: true },
            orderBy: { uploadedAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ code: "asc" }],
  });

  type PmBucket = {
    pmId: string | null;
    pmName: string;
    projectCount: number;
    totalDpp: number;
    recognizedDpp: number;
  };
  const pmBuckets = new Map<string, PmBucket>();

  type BuBucket = {
    businessUnitId: string | null;
    businessUnitName: string;
    projectIds: Set<string>;
    milestoneCount: number;
    totalDpp: number;
    recognizedDpp: number;
  };
  const buBuckets = new Map<string, BuBucket>();

  type PmoBucket = {
    directorId: string | null;
    directorName: string;
    projectCount: number;
    totalDpp: number;
    recognizedDpp: number;
  };
  const pmoBuckets = new Map<string, PmoBucket>();

  const outProjects = [];
  const totals = {
    totalDpp: 0,
    totalGross: 0,
    recognizedDpp: 0,
    recognizedGross: 0,
    unrecognizedDpp: 0,
    recognizedPct: 0,
    projectCount: 0,
    milestoneCount: 0,
    recognizedCount: 0,
  };

  for (const p of projects) {
    if (p.billingMilestones.length === 0) continue;
    const vatPct = p.vatPercent ?? 11;
    const includesVat = p.contractValueIncludesVat ?? true;

    // Business-unit fallback for milestones without a workstream: if every
    // BU-assigned workstream of the project points at the same BU use it,
    // otherwise fall back to the PM's own BU (may be null).
    const wsBus = new Map<string, { id: string; name: string }>();
    for (const w of p.workstreams) {
      if (w.businessUnit) wsBus.set(w.businessUnit.id, w.businessUnit);
    }
    const projectFallbackBu =
      wsBus.size === 1 ? [...wsBus.values()][0] : (p.pm?.businessUnit ?? null);

    let totalDpp = 0;
    let totalGross = 0;
    let recognizedDpp = 0;
    let recognizedGross = 0;
    let recognizedCount = 0;

    const milestones = p.billingMilestones.map((m) => {
      const base = m.amount ?? ((p.contractValue ?? 0) * (m.percentage || 0)) / 100;
      const { dpp, total: gross } = splitVat(base, vatPct, includesVat);
      const bast = m.invoiceDocuments[0] ?? null;
      const invoiced = m.status === "INVOICED" || m.status === "PAID";
      const viaBast = !!bast;
      const viaPaid = m.status === "PAID";
      const viaReport = !!m.reportUrl;
      const recognized = viaBast || viaPaid || viaReport;
      const basis = viaBast ? "BAST" : viaPaid ? "PAID" : viaReport ? "REPORT" : null;
      const recognizedAt = viaBast
        ? (bast?.uploadedAt ?? null)
        : viaPaid
          ? (m.paidAt ?? m.invoicedAt ?? null)
          : viaReport
            ? m.reportFiledAt
            : null;

      totalDpp += dpp;
      totalGross += gross;
      if (recognized) {
        recognizedDpp += dpp;
        recognizedGross += gross;
        recognizedCount += 1;
      }

      const bu = m.workstream?.businessUnit ?? projectFallbackBu;
      const buKey = bu?.id ?? "__none";
      let buBucket = buBuckets.get(buKey);
      if (!buBucket) {
        buBucket = {
          businessUnitId: bu?.id ?? null,
          businessUnitName: bu?.name ?? "Unassigned",
          projectIds: new Set<string>(),
          milestoneCount: 0,
          totalDpp: 0,
          recognizedDpp: 0,
        };
        buBuckets.set(buKey, buBucket);
      }
      buBucket.projectIds.add(p.id);
      buBucket.milestoneCount += 1;
      buBucket.totalDpp += dpp;
      if (recognized) buBucket.recognizedDpp += dpp;

      return {
        id: m.id,
        name: m.name,
        workstreamName: m.workstream?.name ?? null,
        status: m.status,
        dpp,
        gross,
        recognized,
        basis,
        hasBast: !!bast,
        invoiced,
        reportUrl: m.reportUrl ?? null,
        reportFiledAt: m.reportFiledAt ? m.reportFiledAt.toISOString() : null,
        recognizedAt: recognizedAt ? recognizedAt.toISOString() : null,
      };
    });

    outProjects.push({
      projectId: p.id,
      code: p.code,
      name: p.name,
      clientName: p.client?.name ?? null,
      pmId: p.pmId ?? null,
      pmName: p.pm?.name ?? null,
      status: p.status,
      totalDpp,
      totalGross,
      recognizedDpp,
      recognizedGross,
      unrecognizedDpp: totalDpp - recognizedDpp,
      recognizedPct: totalDpp > 0 ? (recognizedDpp / totalDpp) * 100 : 0,
      milestoneCount: milestones.length,
      recognizedCount,
      milestones,
    });

    totals.totalDpp += totalDpp;
    totals.totalGross += totalGross;
    totals.recognizedDpp += recognizedDpp;
    totals.recognizedGross += recognizedGross;
    totals.projectCount += 1;
    totals.milestoneCount += milestones.length;
    totals.recognizedCount += recognizedCount;

    const pmKey = p.pmId ?? "__none";
    let bucket = pmBuckets.get(pmKey);
    if (!bucket) {
      bucket = {
        pmId: p.pmId ?? null,
        pmName: p.pm?.name ?? "Unassigned",
        projectCount: 0,
        totalDpp: 0,
        recognizedDpp: 0,
      };
      pmBuckets.set(pmKey, bucket);
    }
    bucket.projectCount += 1;
    bucket.totalDpp += totalDpp;
    bucket.recognizedDpp += recognizedDpp;

    // PMO Director attribution: the PM's manager. A MANAGEMENT user acting
    // as PM is their own director.
    const director = p.pm
      ? p.pm.role === "MANAGEMENT"
        ? { id: p.pm.id, name: p.pm.name }
        : (p.pm.manager ?? null)
      : null;
    const pmoKey = director?.id ?? "__none";
    let pmoBucket = pmoBuckets.get(pmoKey);
    if (!pmoBucket) {
      pmoBucket = {
        directorId: director?.id ?? null,
        directorName: director?.name ?? "Unassigned",
        projectCount: 0,
        totalDpp: 0,
        recognizedDpp: 0,
      };
      pmoBuckets.set(pmoKey, pmoBucket);
    }
    pmoBucket.projectCount += 1;
    pmoBucket.totalDpp += totalDpp;
    pmoBucket.recognizedDpp += recognizedDpp;
  }

  totals.unrecognizedDpp = totals.totalDpp - totals.recognizedDpp;
  totals.recognizedPct = totals.totalDpp > 0 ? (totals.recognizedDpp / totals.totalDpp) * 100 : 0;

  const byPm = Array.from(pmBuckets.values())
    .map((b) => ({
      pmId: b.pmId,
      pmName: b.pmName,
      projectCount: b.projectCount,
      totalDpp: b.totalDpp,
      recognizedDpp: b.recognizedDpp,
      recognizedPct: b.totalDpp > 0 ? (b.recognizedDpp / b.totalDpp) * 100 : 0,
    }))
    .sort((a, b) => b.totalDpp - a.totalDpp);

  const byBusinessUnit = Array.from(buBuckets.values())
    .map((b) => ({
      businessUnitId: b.businessUnitId,
      businessUnitName: b.businessUnitName,
      projectCount: b.projectIds.size,
      milestoneCount: b.milestoneCount,
      totalDpp: b.totalDpp,
      recognizedDpp: b.recognizedDpp,
      recognizedPct: b.totalDpp > 0 ? (b.recognizedDpp / b.totalDpp) * 100 : 0,
    }))
    .sort((a, b) => b.totalDpp - a.totalDpp);

  const byPmoDirector = Array.from(pmoBuckets.values())
    .map((b) => ({
      directorId: b.directorId,
      directorName: b.directorName,
      projectCount: b.projectCount,
      totalDpp: b.totalDpp,
      recognizedDpp: b.recognizedDpp,
      recognizedPct: b.totalDpp > 0 ? (b.recognizedDpp / b.totalDpp) * 100 : 0,
    }))
    .sort((a, b) => b.totalDpp - a.totalDpp);

  res.json({ totals, projects: outProjects, byPm, byBusinessUnit, byPmoDirector });
});

export default router;
