import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
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
const approverRoles = ["MANAGEMENT", "PROJECT_MANAGER"] as const;

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
  const isGlobal = role === "MANAGEMENT" || role === "ADMIN_PROJECT" || role === "SITE_ADMIN";
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
  const expenses = await prisma.projectExpense.findMany({
    where: { projectId },
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
    const isAutoApproved = role === "MANAGEMENT";
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

// Cross-project expense listing for the global /expenses page.
// MGMT sees everything; PM sees own projects; SALES sees own projects;
// other roles get 403 (commercial data).
router.get("/expenses", async (req, res) => {
  const role = req.user!.role;
  const userId = req.user!.sub;
  // Explicit allowlist — broader financial roles like ADMIN_PROJECT/SITE_ADMIN
  // do not need cross-project commercial expense visibility.
  const allowed = role === "MANAGEMENT" || role === "PROJECT_MANAGER" || role === "SALES";
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

export default router;
