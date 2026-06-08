import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { validateBody } from "../middlewares/validate.js";
import { AddProjectExpenseBody } from "@workspace/api-zod";
import { recordAudit } from "../lib/audit.js";
import { canViewProjectFinancials } from "../lib/serializers.js";
import { notifyUser } from "../lib/notifications.js";
import { validateWorkstreamId } from "../lib/workstreams.js";

// Direct involvement check for Principal roles on a project. Unlike
// `userCanAccessProject` (which grants principals broad status-based
// visibility for proposal/oversight workflows), this predicate is narrow:
// the principal must either be assigned to the project themselves, or have
// at least one direct supervisee (`principalId = principal`) staffed on
// the project as a resource, Admin Project, or Technical Writer. This is
// what we use for write-like actions (submit expense) and per-project data
// reads (expense list) where status visibility must not imply authority.
async function principalIsInvolvedInProject(
  projectId: string,
  principalId: string,
): Promise<boolean> {
  const hit = await prisma.project.findFirst({
    where: {
      id: projectId,
      deletedAt: null,
      OR: [
        { resources: { some: { userId: principalId } } },
        { resources: { some: { user: { principalId } } } },
        { adminProject: { is: { principalId } } },
        { technicalWriter: { is: { principalId } } },
      ],
    },
    select: { id: true },
  });
  return !!hit;
}

const router: IRouter = Router();
router.use(requireAuth);

// Roles allowed to create/delete an expense submission.
// MGMT/PM keep full management; SALES/KONSULTAN/TECHNICAL_WRITER/ADMIN_PROJECT
// can submit (status=PENDING) so the field team can request reimbursement and
// the PM-of-project (or MGMT) makes the call to approve/reject.
const submitRoles = [
  "MANAGEMENT",
  "SUPER_ADMIN",
  "PROJECT_MANAGER",
  "SALES",
  "KONSULTAN",
  "TECHNICAL_WRITER",
  "ADMIN_PROJECT",
  "PRINCIPAL_KONSULTAN",
  "PRINCIPAL_TECHNICAL_WRITER",
  "PRINCIPAL_ADMIN_PROJECT",
] as const;
// Only MGMT and PM-of-project can approve/reject expenses.
const approverRoles = ["MANAGEMENT", "SUPER_ADMIN", "PROJECT_MANAGER"] as const;

const ALLOWED_CATEGORIES = new Set([
  "SOFTWARE",
  "HARDWARE",
  "LICENSE",
  "TRAVEL",
  "OTHER",
]);

function serializeExpense(e: {
  id: string;
  projectId: string;
  category: string;
  description: string;
  amount: number;
  spentAt: Date;
  evidenceUrl: string | null;
  evidenceFileName: string | null;
  workstreamId?: string | null;
  status?: string;
  approvedById?: string | null;
  approvedAt?: Date | null;
  rejectionReason?: string | null;
  approvedBy?: { name: string } | null;
  createdById: string | null;
  createdBy?: { name: string } | null;
  createdAt: Date;
  project?: { code: string; name: string; client?: { name: string } | null } | null;
}) {
  return {
    id: e.id,
    projectId: e.projectId,
    workstreamId: e.workstreamId ?? null,
    projectCode: e.project?.code ?? null,
    projectName: e.project?.name ?? null,
    clientName: e.project?.client?.name ?? null,
    category: e.category,
    description: e.description,
    amount: e.amount,
    spentAt: e.spentAt.toISOString(),
    evidenceUrl: e.evidenceUrl,
    evidenceFileName: e.evidenceFileName,
    status: (e.status ?? "PENDING") as "PENDING" | "APPROVED" | "REJECTED",
    approvedById: e.approvedById ?? null,
    approvedByName: e.approvedBy?.name ?? null,
    approvedAt: e.approvedAt ? e.approvedAt.toISOString() : null,
    rejectionReason: e.rejectionReason ?? null,
    createdById: e.createdById,
    createdByName: e.createdBy?.name ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

const expenseInclude = {
  createdBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
} as const;

const ALLOWED_EVIDENCE_MIME = /^data:(application\/pdf|image\/(png|jpe?g|webp));base64,/i;
const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024; // ~8MB raw

router.get("/projects/:id/expenses", async (req, res) => {
  const projectId = req.params.id;
  const role = req.user!.role;
  const userId = req.user!.sub;
  // Mirror GET /projects/:id visibility: MGMT/ADMIN_PROJECT/SITE_ADMIN see all;
  // PM only own; SALES only own; KONSULTAN/TW/Principals only if they're a
  // resource on the project (or assigned via project-level slot).
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, pmId: true, salesId: true,
      adminProjectId: true, technicalWriterId: true,
    },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const isGlobal = role === "MANAGEMENT" || role === "SUPER_ADMIN" || role === "ADMIN_PROJECT" || role === "SITE_ADMIN";
  if (!isGlobal) {
    let allowed =
      (role === "PROJECT_MANAGER" && project.pmId === userId) ||
      (role === "SALES" && project.salesId === userId) ||
      project.adminProjectId === userId ||
      project.technicalWriterId === userId;
    if (!allowed) {
      const isResource = await prisma.projectResource.findFirst({
        where: { projectId, userId },
        select: { id: true },
      });
      allowed = !!isResource;
    }
    // Principals see expenses only when directly involved (themselves staffed,
    // or supervising someone staffed) — not via broad status-based visibility.
    if (
      !allowed &&
      (role === "PRINCIPAL_KONSULTAN" ||
        role === "PRINCIPAL_TECHNICAL_WRITER" ||
        role === "PRINCIPAL_ADMIN_PROJECT")
    ) {
      allowed = await principalIsInvolvedInProject(projectId, userId);
    }
    if (!allowed) {
      res.status(403).json({ error: "You do not have access to this project" });
      return;
    }
  }
  // Except MGMT (global) and the project's PM, every other role only sees
  // expenses they themselves submitted on this project. Sales/Konsultan/TW/
  // Principal_*/Admin all submit reimbursement requests for their own work;
  // they have no need to see each other's pending or approved expense lines.
  const isFullView =
    role === "MANAGEMENT" ||
    role === "SUPER_ADMIN" ||
    role === "SITE_ADMIN" ||
    role === "FINANCE" ||
    (role === "PROJECT_MANAGER" && project.pmId === userId);
  const expenseWhere: { projectId: string; createdById?: string } = { projectId };
  if (!isFullView) {
    expenseWhere.createdById = userId;
  }
  const expenses = await prisma.projectExpense.findMany({
    where: expenseWhere,
    include: expenseInclude,
    orderBy: { spentAt: "desc" },
  });
  // Invoice/billing PDFs are commercially sensitive — only roles allowed to see
  // project financials may download the evidence file. Other roles still see
  // the row (category/description/amount) so the timeline stays consistent.
  const showEvidence = canViewProjectFinancials(req.user?.role);
  res.json(
    expenses.map((e) => {
      const s = serializeExpense(e);
      if (!showEvidence) {
        s.evidenceUrl = null;
        s.evidenceFileName = null;
      }
      return s;
    }),
  );
});

router.post(
  "/projects/:id/expenses",
  requireRole(...submitRoles),
  validateBody(AddProjectExpenseBody),
  async (req, res) => {
    const projectId = String(req.params.id);
    const userId = req.user!.sub;
    const role = req.user!.role;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        pmId: true,
        salesId: true,
        status: true,
      },
    });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // PM submits only on assigned projects; SALES only on owned projects;
    // KONSULTAN/TECHNICAL_WRITER/ADMIN_PROJECT only when assigned as a
    // ProjectResource of that project. MGMT is global.
    if (role === "PROJECT_MANAGER" && project.pmId !== userId) {
      res.status(403).json({ error: "Project Manager can only submit expenses on assigned projects" });
      return;
    }
    if (role === "SALES" && project.salesId !== userId) {
      res.status(403).json({ error: "Sales can only submit expenses on own projects" });
      return;
    }
    if (role === "KONSULTAN" || role === "TECHNICAL_WRITER" || role === "ADMIN_PROJECT") {
      const isResource = await prisma.projectResource.findFirst({
        where: { projectId, userId },
        select: { id: true },
      });
      if (!isResource && project.pmId !== userId && project.salesId !== userId) {
        res.status(403).json({ error: "You can only submit expenses on projects you're assigned to" });
        return;
      }
    }
    // Principals submit only when directly involved (themselves staffed, or
    // supervising someone staffed) — not via broad status-based visibility.
    if (
      role === "PRINCIPAL_KONSULTAN" ||
      role === "PRINCIPAL_TECHNICAL_WRITER" ||
      role === "PRINCIPAL_ADMIN_PROJECT"
    ) {
      if (!(await principalIsInvolvedInProject(projectId, userId))) {
        res.status(403).json({ error: "You can only submit expenses on projects you're involved in" });
        return;
      }
    }

    const { category, description, amount, spentAt, evidenceUrl, evidenceFileName, workstreamId } = req.body || {};
    const wsCheck = await validateWorkstreamId(projectId, workstreamId);
    if (!wsCheck.ok) {
      res.status(400).json({ error: wsCheck.error });
      return;
    }
    if (!category || !ALLOWED_CATEGORIES.has(String(category))) {
      res.status(400).json({
        error: `category required; must be one of ${[...ALLOWED_CATEGORIES].join(", ")}`,
      });
      return;
    }
    const desc = typeof description === "string" ? description.trim() : "";
    if (!desc) {
      res.status(400).json({ error: "description required" });
      return;
    }
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }
    let spentDate: Date;
    if (spentAt) {
      const d = new Date(spentAt);
      if (isNaN(d.getTime())) {
        res.status(400).json({ error: "spentAt must be a valid date" });
        return;
      }
      spentDate = d;
    } else {
      spentDate = new Date();
    }

    let evidenceUrlClean: string | null = null;
    let evidenceFileNameClean: string | null = null;
    if (evidenceUrl != null && evidenceUrl !== "") {
      if (typeof evidenceUrl !== "string" || !ALLOWED_EVIDENCE_MIME.test(evidenceUrl)) {
        res.status(400).json({ error: "evidenceUrl must be a base64 data URL of a PDF or image (png/jpeg/webp)" });
        return;
      }
      if (evidenceUrl.length > MAX_EVIDENCE_BYTES * 1.4) {
        res.status(413).json({ error: "evidence file too large (max ~8MB)" });
        return;
      }
      evidenceUrlClean = evidenceUrl;
      evidenceFileNameClean =
        typeof evidenceFileName === "string" && evidenceFileName.trim()
          ? evidenceFileName.trim().slice(0, 200)
          : "evidence";
    }

    // MGMT auto-approves on submit (they have approval power anyway and a
    // self-approval round-trip would just be busywork). All other roles enter
    // PENDING and require a PM/MGMT to approve before it counts as cost.
    const isAutoApproved = role === "MANAGEMENT" || role === "SUPER_ADMIN";
    const expense = await prisma.projectExpense.create({
      data: {
        projectId,
        workstreamId: wsCheck.workstreamId,
        category: String(category),
        description: desc,
        amount: amt,
        spentAt: spentDate,
        evidenceUrl: evidenceUrlClean,
        evidenceFileName: evidenceFileNameClean,
        createdById: userId,
        status: isAutoApproved ? "APPROVED" : "PENDING",
        approvedById: isAutoApproved ? userId : null,
        approvedAt: isAutoApproved ? new Date() : null,
      },
      include: expenseInclude,
    });
    await recordAudit(req, {
      action: "expense.created",
      entityType: "ProjectExpense",
      entityId: expense.id,
      description: `Added expense (${expense.category}) ${expense.description} = ${expense.amount} on project ${projectId}`,
      after: {
        id: expense.id,
        projectId: expense.projectId,
        category: expense.category,
        description: expense.description,
        amount: expense.amount,
        spentAt: expense.spentAt,
      },
    });
    res.status(201).json(serializeExpense(expense));
  },
);

router.delete(
  "/expenses/:expenseId",
  requireRole(...submitRoles),
  async (req, res) => {
    const userId = req.user!.sub;
    const role = req.user!.role;
    const before = await prisma.projectExpense.findUnique({
      where: { id: String(req.params.expenseId) },
      include: {
        createdBy: { select: { name: true } },
        project: { select: { pmId: true } },
      },
    });
    if (!before) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    // MGMT and the project's PM can always delete. Other roles can only
    // delete an entry they themselves submitted, and only while it is still
    // PENDING (once approved or rejected the audit trail must be preserved).
    const isManager =
      role === "MANAGEMENT" ||
      role === "SUPER_ADMIN" ||
      (role === "PROJECT_MANAGER" && before.project.pmId === userId);
    if (!isManager) {
      if (before.createdById !== userId) {
        res.status(403).json({ error: "You can only delete your own expense submissions" });
        return;
      }
      if (before.status !== "PENDING") {
        res.status(400).json({ error: "Cannot delete an expense that has already been approved or rejected" });
        return;
      }
    }
    await prisma.projectExpense.delete({ where: { id: before.id } });
    await recordAudit(req, {
      action: "expense.deleted",
      entityType: "ProjectExpense",
      entityId: before.id,
      description: `Removed expense (${before.category}) ${before.description} = ${before.amount}`,
      before: {
        id: before.id,
        projectId: before.projectId,
        category: before.category,
        description: before.description,
        amount: before.amount,
        spentAt: before.spentAt,
      },
    });
    res.json({ success: true });
  },
);

// Submitter's own expenses across all their projects — feeds the
// "My Expenses" card on Consultant / Principal / Sales dashboards so they
// can track approval status and download receipts for closed items.
router.get("/expenses/mine", async (req, res) => {
  const userId = req.user!.sub;
  // Default 50 (cheap for the dashboard card). Pages that paginate all-time
  // history pass ?limit=500 to fetch the full set.
  const raw = Number(req.query.limit);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 1000) : 50;
  const expenses = await prisma.projectExpense.findMany({
    where: { createdById: userId },
    include: {
      approvedBy: { select: { name: true } },
      project: { select: { id: true, code: true, name: true } },
    },
    orderBy: { spentAt: "desc" },
    take: limit,
  });
  res.json(
    expenses.map((e) => ({
      id: e.id,
      projectId: e.projectId,
      projectCode: e.project?.code ?? null,
      projectName: e.project?.name ?? null,
      category: e.category,
      description: e.description,
      amount: e.amount,
      spentAt: e.spentAt.toISOString(),
      status: e.status,
      rejectionReason: e.rejectionReason,
      approvedByName: e.approvedBy?.name ?? null,
      approvedAt: e.approvedAt ? e.approvedAt.toISOString() : null,
      hasReceipt: e.status === "APPROVED" || e.status === "REJECTED",
    })),
  );
});

// Cross-project expense listing for the global /expenses page.
// MGMT sees everything; PM sees own projects; SALES sees own projects;
// other roles get 403 (commercial data).
router.get("/expenses", async (req, res) => {
  const role = req.user!.role;
  const userId = req.user!.sub;
  // Explicit allowlist — broader financial roles like ADMIN_PROJECT/SITE_ADMIN
  // do not need cross-project commercial expense visibility.
  const allowed = role === "MANAGEMENT" || role === "SUPER_ADMIN" || role === "PROJECT_MANAGER" || role === "SALES";
  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const where: Record<string, unknown> = {};
  if (role === "PROJECT_MANAGER") {
    where.project = { pmId: userId };
  } else if (role === "SALES") {
    where.project = { salesId: userId };
  }
  const expenses = await prisma.projectExpense.findMany({
    where,
    include: {
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      project: {
        select: {
          code: true,
          name: true,
          client: { select: { name: true } },
        },
      },
    },
    orderBy: { spentAt: "desc" },
    take: 1000,
  });
  res.json(expenses.map((e) => serializeExpense(e)));
});

// Approve a PENDING expense — MGMT or the project's PM only.
router.post(
  "/expenses/:expenseId/approve",
  requireRole(...approverRoles),
  async (req, res) => {
    const userId = req.user!.sub;
    const role = req.user!.role;
    const before = await prisma.projectExpense.findUnique({
      where: { id: String(req.params.expenseId) },
      include: {
        ...expenseInclude,
        project: { select: { pmId: true, code: true, name: true, client: { select: { name: true } } } },
      },
    });
    if (!before) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    if (role === "PROJECT_MANAGER" && before.project.pmId !== userId) {
      res.status(403).json({ error: "Project Manager can only approve expenses on assigned projects" });
      return;
    }
    if (before.status === "APPROVED") {
      res.json(serializeExpense(before as any));
      return;
    }
    if (before.status !== "PENDING") {
      res.status(409).json({ error: `Cannot approve an expense in ${before.status} state` });
      return;
    }
    const updated = await prisma.projectExpense.update({
      where: { id: before.id },
      data: {
        status: "APPROVED",
        approvedById: userId,
        approvedAt: new Date(),
        rejectionReason: null,
      },
      include: {
        ...expenseInclude,
        project: { select: { pmId: true, code: true, name: true, client: { select: { name: true } } } },
      },
    });
    await recordAudit(req, {
      action: "expense.approved",
      entityType: "ProjectExpense",
      entityId: updated.id,
      description: `Approved expense (${updated.category}) ${updated.description} = ${updated.amount}`,
      before: { status: before.status },
      after: { status: updated.status, approvedById: updated.approvedById, amount: updated.amount },
    });
    res.json(serializeExpense(updated as any));
  },
);

// Reject a PENDING expense with a written reason — MGMT or the project's PM only.
router.post(
  "/expenses/:expenseId/reject",
  requireRole(...approverRoles),
  async (req, res) => {
    const userId = req.user!.sub;
    const role = req.user!.role;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) {
      res.status(400).json({ error: "reason required" });
      return;
    }
    if (reason.length > 500) {
      res.status(400).json({ error: "reason too long (max 500 chars)" });
      return;
    }
    const before = await prisma.projectExpense.findUnique({
      where: { id: String(req.params.expenseId) },
      include: {
        ...expenseInclude,
        project: { select: { pmId: true, code: true, name: true, client: { select: { name: true } } } },
      },
    });
    if (!before) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    if (role === "PROJECT_MANAGER" && before.project.pmId !== userId) {
      res.status(403).json({ error: "Project Manager can only reject expenses on assigned projects" });
      return;
    }
    if (before.status !== "PENDING") {
      res.status(409).json({ error: `Cannot reject an expense in ${before.status} state` });
      return;
    }
    const updated = await prisma.projectExpense.update({
      where: { id: before.id },
      data: {
        status: "REJECTED",
        approvedById: userId,
        approvedAt: new Date(),
        rejectionReason: reason,
      },
      include: {
        ...expenseInclude,
        project: { select: { pmId: true, code: true, name: true, client: { select: { name: true } } } },
      },
    });
    await recordAudit(req, {
      action: "expense.rejected",
      entityType: "ProjectExpense",
      entityId: updated.id,
      description: `Rejected expense (${updated.category}) ${updated.description}: ${reason}`,
      before: { status: before.status },
      after: { status: updated.status, rejectionReason: updated.rejectionReason },
    });
    if (updated.createdById && updated.createdById !== userId) {
      await notifyUser({
        userId: updated.createdById,
        type: "expense.rejected",
        title: "Expense rejected",
        message: `Your ${updated.category} expense on ${before.project.name} (${updated.description}) was rejected: ${reason}`,
        link: `/projects/${updated.projectId}`,
      });
    }
    res.json(serializeExpense(updated as any));
  },
);

// Generate a single merged PDF receipt for an APPROVED or REJECTED expense:
// page 1 = formatted receipt (project, expense detail, large APPROVED/REJECTED
// stamp with reviewer name & timestamp); subsequent pages = the original
// evidence file (PNG/JPEG embedded as a full-page image, or each page of the
// evidence PDF copied in). Access: the submitter, MGMT, or the project's PM.
router.get("/expenses/:expenseId/receipt", async (req, res) => {
  const userId = req.user!.sub;
  const role = req.user!.role;
  const expense = await prisma.projectExpense.findUnique({
    where: { id: String(req.params.expenseId) },
    include: {
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      project: {
        select: {
          pmId: true,
          code: true,
          name: true,
          client: { select: { name: true } },
        },
      },
    },
  });
  if (!expense) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  const isCreator = expense.createdById === userId;
  const isPmOfProject = role === "PROJECT_MANAGER" && expense.project.pmId === userId;
  if (!(role === "MANAGEMENT" || role === "SUPER_ADMIN" || isPmOfProject || isCreator)) {
    res.status(403).json({ error: "You can only download receipts for your own expenses" });
    return;
  }
  if (expense.status !== "APPROVED" && expense.status !== "REJECTED") {
    res.status(409).json({
      error: "Receipt is only available after the expense has been approved or rejected",
    });
    return;
  }

  const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const A4: [number, number] = [595.28, 841.89];
  const page = pdf.addPage(A4);
  const { width, height } = page.getSize();

  const ink = rgb(0.06, 0.09, 0.16);
  const accent = rgb(0.13, 0.77, 0.37);
  const danger = rgb(0.86, 0.21, 0.27);
  const muted = rgb(0.39, 0.45, 0.55);
  const headerH = 90;
  page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: ink });
  page.drawRectangle({ x: 0, y: height - headerH - 3, width, height: 3, color: accent });
  page.drawText("SecureProfit Hub", { x: 50, y: height - 38, size: 14, font: helvBold, color: accent });
  page.drawText("Expense Receipt", { x: 50, y: height - 62, size: 20, font: helvBold, color: rgb(1, 1, 1) });
  page.drawText(`Ref: ${expense.id.slice(-10).toUpperCase()}`, {
    x: 50, y: height - 80, size: 9, font: helv, color: rgb(0.8, 0.85, 0.92),
  });

  let y = height - headerH - 32;
  const left = 50;
  const labelOpts = { size: 9, font: helvBold, color: muted };
  const valueOpts = { size: 11, font: helv, color: ink };

  const row = (label: string, value: string) => {
    page.drawText(label.toUpperCase(), { x: left, y, ...labelOpts });
    y -= 14;
    const lines = wrapText(value, helv, 11, width - left * 2);
    for (const line of lines) {
      page.drawText(line, { x: left, y, ...valueOpts });
      y -= 14;
    }
    y -= 6;
  };

  row("Project", `${expense.project.code} — ${expense.project.name}`);
  row("Client", expense.project.client?.name ?? "—");
  row("Category", String(expense.category));
  row("Description", expense.description);
  row("Amount (IDR)", formatIdr(expense.amount));
  row("Spent on", expense.spentAt.toISOString().slice(0, 10));
  row("Submitted by", `${expense.createdBy?.name ?? "—"} (${expense.createdAt.toISOString().slice(0, 10)})`);

  // Approval / rejection stamp
  const stampLabel = expense.status === "APPROVED" ? "APPROVED" : "REJECTED";
  const stampColor = expense.status === "APPROVED" ? accent : danger;
  const reviewerLine = `${stampLabel} BY: ${expense.approvedBy?.name ?? "—"}`;
  const reviewerDate = expense.approvedAt
    ? `On ${expense.approvedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`
    : "";

  y -= 10;
  page.drawRectangle({
    x: left, y: y - 90, width: width - left * 2, height: 90,
    borderColor: stampColor, borderWidth: 2, color: rgb(1, 1, 1),
  });
  page.drawText(stampLabel, {
    x: left + 20, y: y - 50, size: 36, font: helvBold, color: stampColor, rotate: degrees(-8),
  });
  page.drawText(reviewerLine, { x: left + 220, y: y - 36, size: 11, font: helvBold, color: ink });
  if (reviewerDate) {
    page.drawText(reviewerDate, { x: left + 220, y: y - 52, size: 10, font: helv, color: muted });
  }
  if (expense.status === "REJECTED" && expense.rejectionReason) {
    const reasonLines = wrapText(`Reason: ${expense.rejectionReason}`, helv, 10, width - left * 2 - 240);
    let ry = y - 68;
    for (const line of reasonLines.slice(0, 2)) {
      page.drawText(line, { x: left + 220, y: ry, size: 10, font: helv, color: ink });
      ry -= 12;
    }
  }
  y -= 110;

  page.drawText(`Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`, {
    x: left, y: 40, size: 8, font: helv, color: muted,
  });

  // Embed evidence file
  if (expense.evidenceUrl) {
    const m = /^data:(application\/pdf|image\/(png|jpe?g|webp));base64,(.+)$/i.exec(expense.evidenceUrl);
    if (m) {
      const mime = m[1].toLowerCase();
      const bytes = Buffer.from(m[3], "base64");
      try {
        if (mime === "application/pdf") {
          const ev = await PDFDocument.load(bytes, { ignoreEncryption: true });
          const copied = await pdf.copyPages(ev, ev.getPageIndices());
          for (const p of copied) pdf.addPage(p);
        } else if (mime === "image/png" || mime === "image/jpeg" || mime === "image/jpg") {
          const img = mime === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
          const evPage = pdf.addPage(A4);
          const maxW = evPage.getWidth() - 80;
          const maxH = evPage.getHeight() - 120;
          const scale = Math.min(maxW / img.width, maxH / img.height, 1);
          const w = img.width * scale;
          const h = img.height * scale;
          evPage.drawText("Evidence (image)", {
            x: 50, y: evPage.getHeight() - 60, size: 12, font: helvBold, color: ink,
          });
          evPage.drawImage(img, {
            x: (evPage.getWidth() - w) / 2,
            y: (evPage.getHeight() - h) / 2 - 20,
            width: w, height: h,
          });
        } else {
          // WebP and any other future-allowed image format that pdf-lib
          // can't embed natively — keep the receipt usable with a note.
          const evPage = pdf.addPage(A4);
          evPage.drawText("Evidence file attached separately", {
            x: 50, y: evPage.getHeight() - 80, size: 12, font: helvBold, color: ink,
          });
          evPage.drawText(
            `Format ${mime} cannot be embedded in this PDF. Open the expense in the app to view.`,
            { x: 50, y: evPage.getHeight() - 100, size: 10, font: helv, color: muted },
          );
        }
      } catch (err) {
        req.log.warn({ err, expenseId: expense.id }, "Failed to embed expense evidence into receipt");
      }
    }
  }

  const out = await pdf.save();
  const filename = `expense-${expense.project.code}-${expense.id.slice(-6)}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(Buffer.from(out));
});

function formatIdr(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (s: string, size: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const words = String(text ?? "").split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      line = trial;
    } else {
      if (line) out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

export default router;
