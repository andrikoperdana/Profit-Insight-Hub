import { Router, type IRouter } from "express";
import { prisma, type DocumentType, type Prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { issueSurveyTokenIfMissing } from "../lib/surveyDefaults.js";
import {
  userCanAccessProject,
  userCanWriteProject,
} from "../lib/projectAccess.js";

const router: IRouter = Router();
router.use(requireAuth);

function serialize(
  d: Prisma.DocumentGetPayload<{ include: { uploadedBy: true } }>,
) {
  return {
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
  };
}

router.get("/projects/:id/documents", async (req, res) => {
  // Documents may contain BAST/Invoice PDFs with confidential client data.
  // Require the same project visibility as the project detail endpoint to
  // prevent IDOR enumeration across projects.
  if (!(await userCanAccessProject(String(req.params.id), req.user!))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const docs = await prisma.document.findMany({
    where: { projectId: String(req.params.id) },
    include: { uploadedBy: true },
    orderBy: { uploadedAt: "desc" },
  });
  res.json(docs.map(serialize));
});

router.post(
  "/projects/:id/documents",
  requireRole("ADMIN_PROJECT", "MANAGEMENT", "PROJECT_MANAGER", "FINANCE"),
  async (req, res) => {
    const { type, fileName, fileUrl, invoiceNumber, invoiceAmount, invoiceStatus, notes } =
      req.body || {};
    if (!type || !fileName || !fileUrl) {
      res.status(400).json({ error: "type, fileName, fileUrl required" });
      return;
    }
    // FINANCE may only upload INVOICE or CONTRACT documents.
    if (req.user!.role === "FINANCE" && type !== "INVOICE" && type !== "CONTRACT") {
      res.status(403).json({ error: "Finance can only upload INVOICE or CONTRACT documents" });
      return;
    }
    // Tighten role gate: only the assigned PM (or MGMT / project's Admin
    // Project / Finance) may upload documents. Without this, any
    // PROJECT_MANAGER could upload BAST/Invoice on a project they don't own.
    if (!(await userCanWriteProject(String(req.params.id), req.user!))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const d = await prisma.document.create({
      data: {
        projectId: String(req.params.id),
        type: type as DocumentType,
        fileName: String(fileName),
        fileUrl: String(fileUrl),
        invoiceNumber: invoiceNumber || null,
        invoiceAmount: invoiceAmount != null ? Number(invoiceAmount) : null,
        invoiceStatus: invoiceStatus || null,
        notes: notes || null,
        uploadedById: req.user!.sub,
      },
      include: { uploadedBy: true },
    });
    await prisma.activity.create({
      data: {
        type: "document.uploaded",
        message: `${type} uploaded for project`,
        userId: req.user!.sub,
        projectId: String(req.params.id),
      },
    });
    await recordAudit(req, {
      action: "document.uploaded",
      entityType: "Document",
      entityId: d.id,
      description: `Uploaded ${type} (${d.fileName})${d.invoiceAmount ? ` — IDR ${d.invoiceAmount}` : ""}`,
      after: serialize(d),
    });

    // Auto-close: when both BAST and INVOICE exist on a COMPLETE project, set CLOSED
    const project = await prisma.project.findUnique({
      where: { id: String(req.params.id) },
      include: { documents: true },
    });
    if (project && project.status === "COMPLETE") {
      const hasBast = project.documents.some((doc) => doc.type === "BAST");
      const hasInvoice = project.documents.some((doc) => doc.type === "INVOICE");
      if (hasBast && hasInvoice) {
        await prisma.project.update({
          where: { id: project.id },
          data: { status: "CLOSED" },
        });
        await issueSurveyTokenIfMissing(project.id);
        await prisma.activity.create({
          data: {
            type: "project.status_changed",
            message: `Project ${project.code} auto-closed (BAST + Invoice received)`,
            userId: req.user!.sub,
            projectId: project.id,
          },
        });
        await recordAudit(req, {
          action: "project.auto_closed",
          entityType: "Project",
          entityId: project.id,
          description: `Project ${project.code} auto-closed (BAST + Invoice received)`,
          before: { status: "COMPLETE" },
          after: { status: "CLOSED" },
        });
      }
    }

    res.status(201).json(serialize(d));
  },
);

router.delete(
  "/documents/:id",
  requireRole("ADMIN_PROJECT", "MANAGEMENT", "PROJECT_MANAGER", "FINANCE"),
  async (req, res) => {
    const before = await prisma.document.findUnique({
      where: { id: String(req.params.id) },
      include: { uploadedBy: true },
    });
    if (!before) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (req.user!.role === "FINANCE" && before.type !== "INVOICE" && before.type !== "CONTRACT") {
      res.status(403).json({ error: "Finance can only delete INVOICE or CONTRACT documents" });
      return;
    }
    if (!(await userCanWriteProject(before.projectId, req.user!))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await prisma.document.delete({ where: { id: String(req.params.id) } });
    await recordAudit(req, {
      action: "document.deleted",
      entityType: "Document",
      entityId: before.id,
      description: `Deleted ${before.type} ${before.fileName}`,
      before: serialize(before),
    });
    res.json({ success: true });
  },
);

export default router;
