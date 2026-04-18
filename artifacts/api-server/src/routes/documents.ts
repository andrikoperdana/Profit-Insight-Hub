import { Router, type IRouter } from "express";
import { prisma, type DocumentType, type Prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";

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
  const docs = await prisma.document.findMany({
    where: { projectId: req.params.id },
    include: { uploadedBy: true },
    orderBy: { uploadedAt: "desc" },
  });
  res.json(docs.map(serialize));
});

router.post(
  "/projects/:id/documents",
  requireRole("ADMIN_PROJECT", "MANAGEMENT", "PROJECT_MANAGER"),
  async (req, res) => {
    const { type, fileName, fileUrl, invoiceNumber, invoiceAmount, invoiceStatus, notes } =
      req.body || {};
    if (!type || !fileName || !fileUrl) {
      res.status(400).json({ error: "type, fileName, fileUrl required" });
      return;
    }
    const d = await prisma.document.create({
      data: {
        projectId: req.params.id,
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
        projectId: req.params.id,
      },
    });

    // Auto-close: when both BAST and INVOICE exist on a COMPLETE project, set CLOSED
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
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
        await prisma.activity.create({
          data: {
            type: "project.status_changed",
            message: `Project ${project.code} auto-closed (BAST + Invoice received)`,
            userId: req.user!.sub,
            projectId: project.id,
          },
        });
      }
    }

    res.status(201).json(serialize(d));
  },
);

router.delete(
  "/documents/:id",
  requireRole("ADMIN_PROJECT", "MANAGEMENT", "PROJECT_MANAGER"),
  async (req, res) => {
    await prisma.document.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  },
);

export default router;
