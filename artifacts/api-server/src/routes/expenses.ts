import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { canViewProjectFinancials } from "../lib/serializers.js";

const router: IRouter = Router();
router.use(requireAuth);

const writeRoles = ["MANAGEMENT", "PROJECT_MANAGER"] as const;

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
  createdById: string | null;
  createdBy?: { name: string } | null;
  createdAt: Date;
}) {
  return {
    id: e.id,
    projectId: e.projectId,
    category: e.category,
    description: e.description,
    amount: e.amount,
    spentAt: e.spentAt.toISOString(),
    evidenceUrl: e.evidenceUrl,
    evidenceFileName: e.evidenceFileName,
    createdById: e.createdById,
    createdByName: e.createdBy?.name ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

const ALLOWED_EVIDENCE_MIME = /^data:(application\/pdf|image\/(png|jpe?g|webp));base64,/i;
const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024; // ~8MB raw

router.get("/projects/:id/expenses", async (req, res) => {
  const projectId = req.params.id;
  // Read access mirrors GET /projects/:id, which is open to any authenticated user.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const expenses = await prisma.projectExpense.findMany({
    where: { projectId },
    include: { createdBy: { select: { name: true } } },
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
  requireRole(...writeRoles),
  async (req, res) => {
    const projectId = req.params.id;
    const userId = req.user!.sub;
    const role = req.user!.role;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, pmId: true, status: true },
    });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // PM can only add expenses to projects assigned to them; Management is global.
    if (role === "PROJECT_MANAGER" && project.pmId !== userId) {
      res
        .status(403)
        .json({ error: "Project Manager can only manage expenses on assigned projects" });
      return;
    }

    const { category, description, amount, spentAt, evidenceUrl, evidenceFileName } = req.body || {};
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

    const expense = await prisma.projectExpense.create({
      data: {
        projectId,
        category: String(category),
        description: desc,
        amount: amt,
        spentAt: spentDate,
        evidenceUrl: evidenceUrlClean,
        evidenceFileName: evidenceFileNameClean,
        createdById: userId,
      },
      include: { createdBy: { select: { name: true } } },
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
  requireRole(...writeRoles),
  async (req, res) => {
    const userId = req.user!.sub;
    const role = req.user!.role;
    const before = await prisma.projectExpense.findUnique({
      where: { id: req.params.expenseId },
      include: {
        createdBy: { select: { name: true } },
        project: { select: { pmId: true } },
      },
    });
    if (!before) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }
    if (role === "PROJECT_MANAGER" && before.project.pmId !== userId) {
      res
        .status(403)
        .json({ error: "Project Manager can only manage expenses on assigned projects" });
      return;
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

export default router;
