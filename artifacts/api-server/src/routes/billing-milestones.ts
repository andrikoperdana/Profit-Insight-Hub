import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { validateBody } from "../middlewares/validate.js";
import { CreateBillingMilestoneBody, UpdateBillingMilestoneBody } from "@workspace/api-zod";
import { recordAudit } from "../lib/audit.js";
import { canViewAllProjects, canInvoiceProjectStatus } from "../lib/roles.js";
import { validateWorkstreamId } from "../lib/workstreams.js";
import { buildInvoicePdf } from "../lib/invoice-pdf.js";
import { getInvoiceIssuer } from "../lib/invoice-config.js";
import { splitVat, nextInvoiceNumber } from "../lib/invoicing.js";

const router: IRouter = Router();
router.use(requireAuth);

const ALLOWED_STATUSES = new Set(["PLANNED", "INVOICED", "PAID", "CANCELLED"]);

function parseDateOrNull(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const raw = String(value);
  const ymd = /^(\d{4})-\d{2}-\d{2}/.exec(raw);
  if (!ymd) return undefined;
  const year = Number(ymd[1]);
  if (year < 1900 || year > 9999) return undefined;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  return d;
}

async function canViewProject(
  role: string | undefined,
  userId: string | undefined,
  project: { pmId: string | null; salesId: string | null; id: string },
): Promise<boolean> {
  // Commercial-data policy: SITE_ADMIN is excluded (mirrors VAT recap and
  // invoice-planning gates). MANAGEMENT + FINANCE see everything for
  // reconciliation; ADMIN_PROJECT needs cross-project visibility into
  // closing documents/invoices.
  if (role === "MANAGEMENT" || role === "SUPER_ADMIN" || role === "FINANCE" || role === "ADMIN_PROJECT") return true;
  // canViewAllProjects intentionally NOT used here — see comment above.
  void canViewAllProjects;
  if (role === "PROJECT_MANAGER" && project.pmId === userId) return true;
  if (role === "SALES" && project.salesId === userId) return true;
  if (role === "KONSULTAN" || role === "TECHNICAL_WRITER") {
    const assigned = await prisma.projectResource.findFirst({
      where: { projectId: project.id, userId: userId ?? "" },
      select: { id: true },
    });
    return !!assigned;
  }
  return false;
}

function canManage(role: string, project: { pmId: string | null }, userId: string): boolean {
  if (role === "MANAGEMENT" || role === "SUPER_ADMIN") return true;
  if (role === "PROJECT_MANAGER" && project.pmId === userId) return true;
  return false;
}

function serialize(m: any) {
  return {
    id: m.id,
    projectId: m.projectId,
    workstreamId: m.workstreamId ?? null,
    name: m.name,
    description: m.description,
    percentage: m.percentage,
    amount: m.amount,
    dueDate: m.dueDate ? m.dueDate.toISOString() : null,
    status: m.status,
    invoiceNumber: m.invoiceNumber,
    invoicedAt: m.invoicedAt ? m.invoicedAt.toISOString() : null,
    paidAt: m.paidAt ? m.paidAt.toISOString() : null,
    reportUrl: m.reportUrl ?? null,
    reportFiledAt: m.reportFiledAt ? m.reportFiledAt.toISOString() : null,
    xeroInvoiceId: m.xeroInvoiceId ?? null,
    xeroInvoiceNumber: m.xeroInvoiceNumber ?? null,
    xeroAmountDue: m.xeroAmountDue ?? null,
    xeroAmountPaid: m.xeroAmountPaid ?? null,
    xeroAmountCredited: m.xeroAmountCredited ?? null,
    xeroSyncedAt: m.xeroSyncedAt ? m.xeroSyncedAt.toISOString() : null,
    sortOrder: m.sortOrder,
    bastDocumentId: m.invoiceDocuments?.[0]?.id ?? null,
    bastFileName: m.invoiceDocuments?.[0]?.fileName ?? null,
    bastUploadedAt: m.invoiceDocuments?.[0]?.uploadedAt
      ? m.invoiceDocuments[0].uploadedAt.toISOString()
      : null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

/**
 * GET /api/billing-milestones/vat-recap?year=YYYY
 * Monthly recap of PPN (VAT) obligations across all projects, based on
 * BillingMilestone with status INVOICED or PAID and a non-null invoicedAt.
 *
 * For each milestone:
 *  - gross = m.amount ?? (project.contractValue * percentage / 100)
 *  - if project.contractValueIncludesVat: DPP = gross / (1 + vat/100), PPN = gross - DPP
 *  - else: DPP = gross, PPN = gross * vat / 100, total = DPP + PPN
 *
 * Restricted to MANAGEMENT (commercial figures).
 */
router.get("/billing-milestones/vat-recap", async (req, res) => {
  if (req.user?.role !== "MANAGEMENT" && req.user?.role !== "FINANCE" && req.user?.role !== "SUPER_ADMIN") {
    // Kept as an explicit two-role gate (not `canViewAllProjects`) because
    // SITE_ADMIN must not see commercial VAT figures.
    res.status(403).json({ error: "Only Management or Finance can view VAT recap" });
    return;
  }
  const yearParam = req.query.year;
  const now = new Date();
  const year = yearParam !== undefined && yearParam !== ""
    ? Number(yearParam)
    : now.getUTCFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    res.status(400).json({ error: "year must be an integer between 2000 and 2100" });
    return;
  }
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));

  const rows = await prisma.billingMilestone.findMany({
    where: {
      status: { in: ["INVOICED", "PAID"] },
      invoicedAt: { gte: start, lt: end },
      // Internal/Presales/Training projects do not produce VAT obligations.
      project: { kind: "CLIENT" },
    },
    include: {
      project: {
        select: {
          id: true, code: true, name: true,
          contractValue: true,
          vatPercent: true,
          contractValueIncludesVat: true,
        },
      },
    },
    orderBy: [{ invoicedAt: "asc" }],
  });

  type MonthBucket = {
    month: string;
    monthLabel: string;
    milestoneCount: number;
    invoicedCount: number;
    paidCount: number;
    totalGross: number;
    totalDPP: number;
    totalVat: number;
    paidVat: number;
    outstandingVat: number;
  };
  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const buckets = new Map<string, MonthBucket>();
  for (let m = 0; m < 12; m++) {
    const key = `${year}-${String(m + 1).padStart(2, "0")}`;
    buckets.set(key, {
      month: key,
      monthLabel: `${MONTH_LABELS[m]} ${year}`,
      milestoneCount: 0,
      invoicedCount: 0,
      paidCount: 0,
      totalGross: 0,
      totalDPP: 0,
      totalVat: 0,
      paidVat: 0,
      outstandingVat: 0,
    });
  }

  for (const r of rows) {
    if (!r.invoicedAt) continue;
    const d = new Date(r.invoicedAt);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const b = buckets.get(key);
    if (!b) continue;
    const cv = r.project.contractValue ?? 0;
    const vatPct = r.project.vatPercent ?? 11;
    const includesVat = r.project.contractValueIncludesVat ?? true;
    const baseAmount = r.amount ?? (cv * (r.percentage || 0)) / 100;
    const { dpp, vat, total: gross } = splitVat(baseAmount, vatPct, includesVat);
    b.milestoneCount += 1;
    if (r.status === "PAID") {
      b.paidCount += 1;
      b.paidVat += vat;
    } else {
      b.invoicedCount += 1;
      b.outstandingVat += vat;
    }
    b.totalGross += gross;
    b.totalDPP += dpp;
    b.totalVat += vat;
  }

  const months = Array.from(buckets.values());
  const totals = months.reduce(
    (acc, b) => ({
      milestoneCount: acc.milestoneCount + b.milestoneCount,
      totalGross: acc.totalGross + b.totalGross,
      totalDPP: acc.totalDPP + b.totalDPP,
      totalVat: acc.totalVat + b.totalVat,
      paidVat: acc.paidVat + b.paidVat,
      outstandingVat: acc.outstandingVat + b.outstandingVat,
    }),
    { milestoneCount: 0, totalGross: 0, totalDPP: 0, totalVat: 0, paidVat: 0, outstandingVat: 0 },
  );

  res.json({ year, months, totals });
});

router.get("/projects/:id/billing-milestones", async (req, res) => {
  const projectId = req.params.id;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, pmId: true, salesId: true },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const allowed = await canViewProject(req.user?.role, req.user?.sub, project);
  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const rows = await prisma.billingMilestone.findMany({
    where: { projectId },
    include: {
      invoiceDocuments: {
        where: { type: "BAST", isLatest: true },
        select: { id: true, fileName: true, uploadedAt: true },
        orderBy: { uploadedAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  res.json(rows.map(serialize));
});

router.post("/projects/:id/billing-milestones", validateBody(CreateBillingMilestoneBody), async (req, res) => {
  const projectId = String(req.params.id);
  const userId = req.user!.sub;
  const role = req.user!.role;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, pmId: true },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!canManage(role, project, userId)) {
    res.status(403).json({ error: "Only Management or assigned PM can create billing milestones" });
    return;
  }
  const { name, description, percentage, amount, dueDate, invoiceNumber, sortOrder, workstreamId } = req.body || {};
  const wsCheck = await validateWorkstreamId(projectId, workstreamId);
  if (!wsCheck.ok) {
    res.status(400).json({ error: wsCheck.error });
    return;
  }
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const pct = Number(percentage);
  if (!isFinite(pct) || pct < 0 || pct > 100) {
    res.status(400).json({ error: "percentage must be 0-100" });
    return;
  }
  const due = parseDateOrNull(dueDate);
  if (due === undefined && dueDate !== undefined && dueDate !== null && dueDate !== "") {
    res.status(400).json({ error: "dueDate must be a valid YYYY-MM-DD" });
    return;
  }
  const amt = amount === undefined || amount === null || amount === "" ? null : Number(amount);
  if (amt !== null && (!isFinite(amt) || amt < 0)) {
    res.status(400).json({ error: "amount must be non-negative" });
    return;
  }
  let order = 0;
  if (sortOrder !== undefined && sortOrder !== null && sortOrder !== "") {
    const n = Number(sortOrder);
    if (!isFinite(n)) {
      res.status(400).json({ error: "sortOrder must be a number" });
      return;
    }
    order = Math.round(n);
  } else {
    const last = await prisma.billingMilestone.findFirst({
      where: { projectId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    order = (last?.sortOrder ?? 0) + 10;
  }
  const created = await prisma.billingMilestone.create({
    data: {
      projectId,
      workstreamId: wsCheck.workstreamId,
      name: trimmedName,
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      percentage: pct,
      amount: amt,
      dueDate: due ?? null,
      invoiceNumber: typeof invoiceNumber === "string" && invoiceNumber.trim() ? invoiceNumber.trim() : null,
      sortOrder: order,
    },
  });
  await recordAudit(req, {
    action: "billing_milestone.created",
    entityType: "BillingMilestone",
    entityId: created.id,
    description: `Created billing milestone "${created.name}" on project ${projectId}`,
    after: { id: created.id, name: created.name, percentage: created.percentage, projectId },
  });
  res.status(201).json(serialize(created));
});

router.patch("/billing-milestones/:milestoneId", validateBody(UpdateBillingMilestoneBody), async (req, res) => {
  const userId = req.user!.sub;
  const role = req.user!.role;
  const before = await prisma.billingMilestone.findUnique({
    where: { id: String(req.params.milestoneId) },
    include: { project: { select: { id: true, pmId: true, status: true } } },
  });
  if (!before) {
    res.status(404).json({ error: "Billing milestone not found" });
    return;
  }
  if (!canManage(role, { pmId: before.project.pmId }, userId)) {
    res.status(403).json({ error: "Only Management or assigned PM can edit billing milestones" });
    return;
  }
  const { name, description, percentage, amount, dueDate, status, invoiceNumber, invoicedAt, paidAt, reportUrl, sortOrder, workstreamId } =
    req.body || {};
  const data: Record<string, unknown> = {};
  if (workstreamId !== undefined) {
    const wsCheck = await validateWorkstreamId(before.projectId, workstreamId);
    if (!wsCheck.ok) {
      res.status(400).json({ error: wsCheck.error });
      return;
    }
    data.workstreamId = wsCheck.workstreamId;
  }
  if (name !== undefined) {
    const t = String(name).trim();
    if (!t) {
      res.status(400).json({ error: "name cannot be empty" });
      return;
    }
    data.name = t;
  }
  if (description !== undefined) {
    data.description = description === null || description === "" ? null : String(description).trim();
  }
  if (percentage !== undefined && percentage !== null) {
    const n = Number(percentage);
    if (!isFinite(n) || n < 0 || n > 100) {
      res.status(400).json({ error: "percentage must be 0-100" });
      return;
    }
    data.percentage = n;
  }
  if (amount !== undefined) {
    if (amount === null || amount === "") data.amount = null;
    else {
      const n = Number(amount);
      if (!isFinite(n) || n < 0) {
        res.status(400).json({ error: "amount must be non-negative" });
        return;
      }
      data.amount = n;
    }
  }
  if (dueDate !== undefined) {
    const d = parseDateOrNull(dueDate);
    if (d === undefined) {
      res.status(400).json({ error: "dueDate must be a valid YYYY-MM-DD" });
      return;
    }
    data.dueDate = d;
  }
  if (status !== undefined) {
    if (!ALLOWED_STATUSES.has(String(status))) {
      res.status(400).json({ error: "invalid status" });
      return;
    }
    if (
      (status === "INVOICED" || status === "PAID") &&
      !canInvoiceProjectStatus(before.project.status)
    ) {
      res.status(409).json({
        error: `Cannot mark this milestone as ${status}: the project is not active yet (status: ${before.project.status}). Set the project to Active before invoicing.`,
      });
      return;
    }
    data.status = String(status);
    if (status === "INVOICED" && !before.invoicedAt && invoicedAt === undefined) {
      data.invoicedAt = new Date();
    }
    if (status === "PAID" && !before.paidAt && paidAt === undefined) {
      data.paidAt = new Date();
    }
  }
  if (invoiceNumber !== undefined) {
    data.invoiceNumber = invoiceNumber === null || invoiceNumber === "" ? null : String(invoiceNumber).trim();
  }
  if (invoicedAt !== undefined) {
    const d = parseDateOrNull(invoicedAt);
    if (d === undefined) {
      res.status(400).json({ error: "invoicedAt must be a valid YYYY-MM-DD" });
      return;
    }
    data.invoicedAt = d;
  }
  if (paidAt !== undefined) {
    const d = parseDateOrNull(paidAt);
    if (d === undefined) {
      res.status(400).json({ error: "paidAt must be a valid YYYY-MM-DD" });
      return;
    }
    data.paidAt = d;
  }
  if (reportUrl !== undefined) {
    if (reportUrl === null || String(reportUrl).trim() === "") {
      data.reportUrl = null;
      data.reportFiledAt = null;
    } else {
      const raw = String(reportUrl).trim();
      // Require an absolute http(s) URL so the UI can safely open it (same
      // rule as LINK-kind documents).
      let parsed: URL | null = null;
      try {
        parsed = new URL(raw);
      } catch {
        parsed = null;
      }
      if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
        res.status(400).json({ error: "Report link must be a valid http(s) URL" });
        return;
      }
      data.reportUrl = raw;
      // Stamp the filing time whenever the link is first set or changed; an
      // unchanged URL keeps its original timestamp.
      if (raw !== before.reportUrl) data.reportFiledAt = new Date();
    }
  }
  if (sortOrder !== undefined && sortOrder !== null) {
    const n = Number(sortOrder);
    if (!isFinite(n)) {
      res.status(400).json({ error: "sortOrder must be a number" });
      return;
    }
    data.sortOrder = Math.round(n);
  }

  const updated = await prisma.billingMilestone.update({
    where: { id: before.id },
    data,
  });
  await recordAudit(req, {
    action: "billing_milestone.updated",
    entityType: "BillingMilestone",
    entityId: updated.id,
    description: `Updated billing milestone "${updated.name}"`,
    before: { name: before.name, status: before.status, percentage: before.percentage, reportUrl: before.reportUrl },
    after: { name: updated.name, status: updated.status, percentage: updated.percentage, reportUrl: updated.reportUrl },
  });
  res.json(serialize(updated));
});

router.delete("/billing-milestones/:milestoneId", async (req, res) => {
  const userId = req.user!.sub;
  const role = req.user!.role;
  const before = await prisma.billingMilestone.findUnique({
    where: { id: req.params.milestoneId },
    include: { project: { select: { id: true, pmId: true } } },
  });
  if (!before) {
    res.status(404).json({ error: "Billing milestone not found" });
    return;
  }
  if (!canManage(role, { pmId: before.project.pmId }, userId)) {
    res.status(403).json({ error: "Only Management or assigned PM can delete billing milestones" });
    return;
  }
  await prisma.billingMilestone.delete({ where: { id: before.id } });
  await recordAudit(req, {
    action: "billing_milestone.deleted",
    entityType: "BillingMilestone",
    entityId: before.id,
    description: `Deleted billing milestone "${before.name}"`,
    before: { id: before.id, name: before.name, projectId: before.projectId },
  });
  res.json({ success: true });
});

/**
 * POST /api/billing-milestones/:milestoneId/generate-invoice
 * Generates a PDF invoice for the milestone: assigns an invoice number (if
 * missing), transitions the milestone to INVOICED (stamping invoicedAt), and
 * archives the PDF as a Document (type INVOICE) linked to the milestone.
 * Restricted to MANAGEMENT or the project's assigned PM.
 */
router.post("/billing-milestones/:milestoneId/generate-invoice", async (req, res) => {
  const userId = req.user!.sub;
  const role = req.user!.role;
  const milestone = await prisma.billingMilestone.findUnique({
    where: { id: req.params.milestoneId },
    include: {
      project: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          pmId: true,
          contractValue: true,
          vatPercent: true,
          contractValueIncludesVat: true,
          client: {
            select: { name: true, contactPerson: true, email: true, phone: true },
          },
        },
      },
    },
  });
  if (!milestone) {
    res.status(404).json({ error: "Billing milestone not found" });
    return;
  }
  if (!canManage(role, { pmId: milestone.project.pmId }, userId)) {
    res.status(403).json({ error: "Only Management or assigned PM can generate invoices" });
    return;
  }
  if (milestone.status === "CANCELLED") {
    res.status(409).json({ error: "Cannot generate an invoice for a cancelled milestone" });
    return;
  }
  if (!canInvoiceProjectStatus(milestone.project.status)) {
    res.status(409).json({
      error: `Cannot generate an invoice: the project is not active yet (status: ${milestone.project.status}). Set the project to Active before invoicing.`,
    });
    return;
  }

  const vatPct = milestone.project.vatPercent ?? 11;
  const includesVat = milestone.project.contractValueIncludesVat ?? true;
  const baseAmount =
    milestone.amount ??
    ((milestone.project.contractValue ?? 0) * (milestone.percentage || 0)) / 100;
  if (!isFinite(baseAmount) || baseAmount <= 0) {
    res.status(409).json({ error: "Milestone has no billable amount to invoice" });
    return;
  }
  const { dpp, vat, total } = splitVat(baseAmount, vatPct, includesVat);

  const now = new Date();
  const invoicedAt = milestone.invoicedAt ?? now;
  // Preserve an explicitly-set invoice number; otherwise auto-allocate. The
  // number, PDF build, milestone update, and document archival all happen
  // inside a transaction that retries on a unique-constraint clash (P2002) so
  // concurrent generations cannot mint duplicate invoice numbers.
  const explicitNumber = milestone.invoiceNumber?.trim() || null;
  const MAX_ATTEMPTS = 5;

  const issuer = await getInvoiceIssuer();

  let invoiceNumber = "";
  let updated: any = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    invoiceNumber = explicitNumber || (await nextInvoiceNumber(invoicedAt));

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildInvoicePdf({
        invoiceNumber,
        invoiceDate: invoicedAt,
        dueDate: milestone.dueDate ?? null,
        issuer,
        project: { code: milestone.project.code ?? "", name: milestone.project.name },
        client: {
          name: milestone.project.client?.name ?? "—",
          contactPerson: milestone.project.client?.contactPerson,
          email: milestone.project.client?.email,
          phone: milestone.project.client?.phone,
        },
        milestone: { name: milestone.name, description: milestone.description },
        vatPercent: vatPct,
        dpp,
        vat,
        total,
      });
    } catch (err) {
      req.log.error({ err, milestoneId: milestone.id }, "Failed to build invoice PDF");
      res.status(500).json({ error: "Failed to generate invoice PDF" });
      return;
    }

    const dataUrl = `data:application/pdf;base64,${Buffer.from(pdfBytes).toString("base64")}`;
    const fileName = `Invoice-${invoiceNumber.replace(/[\\/]/g, "-")}.pdf`;

    try {
      updated = await prisma.$transaction(async (tx) => {
        // Re-read inside the transaction to guard against a concurrent status
        // change (e.g. cancellation) between the initial read and the write.
        const fresh = await tx.billingMilestone.findUnique({
          where: { id: milestone.id },
          select: { status: true },
        });
        if (!fresh) throw new Error("MILESTONE_GONE");
        if (fresh.status === "CANCELLED") throw new Error("MILESTONE_CANCELLED");

        const m = await tx.billingMilestone.update({
          where: { id: milestone.id },
          data: {
            invoiceNumber,
            status: fresh.status === "PLANNED" ? "INVOICED" : fresh.status,
            invoicedAt,
          },
        });
        // Replace any prior auto-generated invoice document for this milestone.
        await tx.document.deleteMany({
          where: { billingMilestoneId: milestone.id, type: "INVOICE" },
        });
        await tx.document.create({
          data: {
            projectId: milestone.project.id,
            billingMilestoneId: milestone.id,
            type: "INVOICE",
            fileName,
            fileUrl: dataUrl,
            invoiceNumber,
            invoiceAmount: total,
            invoiceStatus: m.status,
            notes: `Auto-generated invoice for billing milestone "${milestone.name}"`,
            uploadedById: userId,
          },
        });
        return m;
      });
      break;
    } catch (err: any) {
      // Unique clash on invoiceNumber — another request grabbed it. Retry with
      // a freshly recomputed number (only meaningful when auto-allocating).
      if (err?.code === "P2002" && !explicitNumber && attempt < MAX_ATTEMPTS - 1) {
        continue;
      }
      if (err?.code === "P2002") {
        res.status(409).json({ error: "Invoice number already in use; please retry" });
        return;
      }
      if (err?.message === "MILESTONE_CANCELLED") {
        res.status(409).json({ error: "Cannot generate an invoice for a cancelled milestone" });
        return;
      }
      if (err?.message === "MILESTONE_GONE") {
        res.status(404).json({ error: "Billing milestone not found" });
        return;
      }
      throw err;
    }
  }

  if (!updated) {
    res.status(409).json({ error: "Could not allocate a unique invoice number; please retry" });
    return;
  }

  await recordAudit(req, {
    action: "billing_milestone.invoice_generated",
    entityType: "BillingMilestone",
    entityId: milestone.id,
    description: `Generated invoice ${invoiceNumber} for milestone "${milestone.name}"`,
    after: { invoiceNumber, status: updated.status, total },
  });

  res.json({ ...serialize(updated), invoiceNumber, total });
});

/**
 * GET /api/billing-milestones/:milestoneId/invoice
 * Streams the archived invoice PDF for the milestone. Access mirrors the
 * milestone read scope (canViewProject). 409 if no invoice was generated yet.
 * Not part of the OpenAPI surface — frontend fetches with a bearer token.
 */
router.get("/billing-milestones/:milestoneId/invoice", async (req, res) => {
  const milestone = await prisma.billingMilestone.findUnique({
    where: { id: req.params.milestoneId },
    include: { project: { select: { id: true, code: true, pmId: true, salesId: true } } },
  });
  if (!milestone) {
    res.status(404).json({ error: "Billing milestone not found" });
    return;
  }
  const allowed = await canViewProject(req.user?.role, req.user?.sub, milestone.project);
  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const doc = await prisma.document.findFirst({
    where: { billingMilestoneId: milestone.id, type: "INVOICE" },
    orderBy: { uploadedAt: "desc" },
    select: { fileUrl: true, fileName: true },
  });
  if (!doc) {
    res.status(409).json({ error: "Invoice has not been generated yet" });
    return;
  }
  const m = /^data:application\/pdf;base64,(.+)$/i.exec(doc.fileUrl);
  if (!m) {
    res.status(500).json({ error: "Stored invoice is not a valid PDF" });
    return;
  }
  const bytes = Buffer.from(m[1], "base64");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${doc.fileName || `invoice-${milestone.project.code}.pdf`}"`,
  );
  res.send(bytes);
});

export default router;
