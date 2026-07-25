import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth);

function splitVat(
  gross: number,
  vatPct: number,
  includesVat: boolean,
): { dpp: number; vat: number; total: number } {
  if (!isFinite(gross) || gross <= 0) return { dpp: 0, vat: 0, total: 0 };
  if (includesVat) {
    const dpp = gross / (1 + vatPct / 100);
    return { dpp, vat: gross - dpp, total: gross };
  }
  const vat = gross * (vatPct / 100);
  return { dpp: gross, vat, total: gross + vat };
}

/**
 * GET /api/revenue-recognition
 *
 * Revenue-recognition recap across commercial (CLIENT) projects. A milestone
 * is "recognized" when either:
 *   1. its BAST is uploaded AND the milestone is INVOICED/PAID (primary path), or
 *   2. its per-milestone report link is filed (alternative path).
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
      pm: { select: { id: true, name: true } },
      client: { select: { name: true } },
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
          reportUrl: true,
          reportFiledAt: true,
          workstream: { select: { name: true } },
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
      const viaBastInvoice = !!bast && invoiced;
      const viaReport = !!m.reportUrl;
      const recognized = viaBastInvoice || viaReport;
      const basis = viaBastInvoice ? "BAST_INVOICE" : viaReport ? "REPORT" : null;
      const recognizedAt = viaBastInvoice
        ? (m.invoicedAt ?? bast?.uploadedAt ?? null)
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

  res.json({ totals, projects: outProjects, byPm });
});

export default router;
