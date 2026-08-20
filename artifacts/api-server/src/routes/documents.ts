import { Router, type IRouter } from "express";
import { prisma, type DocumentType, type Prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { issueSurveyTokenIfMissing } from "../lib/surveyDefaults.js";
import {
  checkCloseRequirements,
  projectCloseReadinessWhere,
} from "../lib/feedback360.js";
import {
  assertProjectWritable,
  userCanAccessProject,
  userCanWriteProject,
} from "../lib/projectAccess.js";

const router: IRouter = Router();
router.use(requireAuth);

function serialize(
  d: Prisma.DocumentGetPayload<{
    include: { uploadedBy: true; billingMilestone: { select: { name: true } } };
  }>,
) {
  return {
    id: d.id,
    projectId: d.projectId,
    type: d.type,
    kind: d.kind,
    fileName: d.fileName,
    fileUrl: d.fileUrl,
    invoiceNumber: d.invoiceNumber,
    invoiceAmount: d.invoiceAmount,
    invoiceStatus: d.invoiceStatus,
    notes: d.notes,
    billingMilestoneId: d.billingMilestoneId ?? null,
    billingMilestoneName: d.billingMilestone?.name ?? null,
    uploadedById: d.uploadedById,
    uploadedByName: d.uploadedBy?.name ?? null,
    uploadedAt: d.uploadedAt.toISOString(),
    version: d.version,
    parentDocumentId: d.parentDocumentId,
    isLatest: d.isLatest,
  };
}

const DOC_INCLUDE = {
  uploadedBy: true,
  billingMilestone: { select: { name: true } },
} as const;

router.get("/projects/:id/documents", async (req, res) => {
  if (!(await userCanAccessProject(String(req.params.id), req.user!))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const includeHistory = req.query.includeHistory === "true" || req.query.includeHistory === "1";
  const docs = await prisma.document.findMany({
    where: {
      projectId: String(req.params.id),
      ...(includeHistory ? {} : { isLatest: true }),
    },
    include: DOC_INCLUDE,
    orderBy: [{ uploadedAt: "desc" }],
  });
  res.json(docs.map(serialize));
});

router.get("/documents/:id/versions", async (req, res) => {
  const doc = await prisma.document.findUnique({ where: { id: String(req.params.id) } });
  if (!doc) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!(await userCanAccessProject(doc.projectId, req.user!))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // walk to the root parent then collect the entire chain by descending children
  let rootId = doc.id;
  let cursor: { id: string; parentDocumentId: string | null } | null = doc;
  while (cursor?.parentDocumentId) {
    rootId = cursor.parentDocumentId;
    cursor = await prisma.document.findUnique({
      where: { id: cursor.parentDocumentId },
      select: { id: true, parentDocumentId: true },
    });
  }
  const collected: any[] = [];
  const toVisit: string[] = [rootId];
  const seen = new Set<string>();
  while (toVisit.length) {
    const ids = toVisit.splice(0).filter((id) => !seen.has(id));
    ids.forEach((id) => seen.add(id));
    if (!ids.length) break;
    const batch = await prisma.document.findMany({
      where: { id: { in: ids }, projectId: doc.projectId },
      include: DOC_INCLUDE,
    });
    collected.push(...batch);
    const children = await prisma.document.findMany({
      where: { parentDocumentId: { in: ids }, projectId: doc.projectId },
      select: { id: true },
    });
    for (const c of children) if (!seen.has(c.id)) toVisit.push(c.id);
  }
  collected.sort((a, b) => b.version - a.version);
  res.json(collected.map(serialize));
});

router.post(
  "/projects/:id/documents",
  requireRole("ADMIN_PROJECT", "MANAGEMENT", "PROJECT_MANAGER", "FINANCE"),
  async (req, res) => {
    const { type, fileName, fileUrl, invoiceNumber, invoiceAmount, invoiceStatus, notes } =
      req.body || {};
    const rawMilestoneId = req.body?.billingMilestoneId;
    const billingMilestoneId =
      rawMilestoneId != null && String(rawMilestoneId).trim() !== ""
        ? String(rawMilestoneId)
        : null;
    if (!type || !fileName || !fileUrl) {
      res.status(400).json({ error: "type, fileName, fileUrl required" });
      return;
    }
    const kind = req.body?.kind === "LINK" ? "LINK" : "FILE";
    if (kind === "LINK") {
      // Link documents point to an external location (SharePoint, Drive, ...).
      // Require an absolute http(s) URL so the UI can safely open it.
      let parsed: URL | null = null;
      try {
        parsed = new URL(String(fileUrl));
      } catch {
        parsed = null;
      }
      if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
        res.status(400).json({ error: "Link documents require a valid http(s) URL" });
        return;
      }
    }
    if (billingMilestoneId) {
      // Milestone-linked documents: only BAST (per Terms-of-Payment handover)
      // and INVOICE make sense per milestone.
      if (type !== "BAST" && type !== "INVOICE") {
        res.status(400).json({
          error: "billingMilestoneId can only be set on BAST or INVOICE documents",
        });
        return;
      }
      const milestone = await prisma.billingMilestone.findUnique({
        where: { id: billingMilestoneId },
        select: { id: true, projectId: true },
      });
      if (!milestone || milestone.projectId !== String(req.params.id)) {
        res.status(400).json({ error: "billingMilestoneId does not belong to this project" });
        return;
      }
    }
    // FINANCE has a narrow cross-project write right: INVOICE and CONTRACT
    // documents on any project. They bypass the per-project ownership check
    // below because they are not a project owner. All other roles must own
    // the project (assigned PM / project's Admin Project / MGMT).
    if (req.user!.role === "FINANCE") {
      if (type !== "INVOICE" && type !== "CONTRACT") {
        res.status(403).json({ error: "Finance can only upload INVOICE or CONTRACT documents" });
        return;
      }
      // FINANCE bypasses userCanWriteProject (which blocks archived), so
      // enforce the archived read-only contract here explicitly.
      if (!(await assertProjectWritable(String(req.params.id), res))) return;
    } else if (!(await userCanWriteProject(String(req.params.id), req.user!))) {
      // Tighten role gate: only the assigned PM (or MGMT / project's Admin
      // Project) may upload documents. Without this, any PROJECT_MANAGER
      // could upload BAST/Invoice on a project they don't own.
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    // Versioning: if a previous latest doc of same type exists for this project,
    // mark it as historical and link the new one as next version. INVOICE is
    // excluded (each invoice document is unique by invoiceNumber).
    const VERSIONED_TYPES: DocumentType[] = ["BAST", "CONTRACT", "REPORT", "OTHER"];
    const isVersioned = VERSIONED_TYPES.includes(type as DocumentType);
    const d = await prisma.$transaction(async (tx) => {
      let parentDocumentId: string | null = null;
      let nextVersion = 1;
      if (isVersioned) {
        // Version chain is per (project, type, milestone): a BAST for termin 2
        // must not supersede the BAST for termin 1 (or the project-level BAST).
        const prev = await tx.document.findFirst({
          where: {
            projectId: String(req.params.id),
            type: type as DocumentType,
            isLatest: true,
            billingMilestoneId: type === "BAST" ? billingMilestoneId : undefined,
          },
          orderBy: { version: "desc" },
        });
        if (prev) {
          parentDocumentId = prev.id;
          nextVersion = prev.version + 1;
          await tx.document.update({ where: { id: prev.id }, data: { isLatest: false } });
        }
      }
      return tx.document.create({
        data: {
          projectId: String(req.params.id),
          type: type as DocumentType,
          kind,
          fileName: String(fileName),
          fileUrl: String(fileUrl),
          invoiceNumber: invoiceNumber || null,
          invoiceAmount: invoiceAmount != null ? Number(invoiceAmount) : null,
          invoiceStatus: invoiceStatus || null,
          notes: notes || null,
          billingMilestoneId,
          uploadedById: req.user!.sub,
          version: nextVersion,
          parentDocumentId,
          isLatest: true,
        },
        include: DOC_INCLUDE,
      });
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
      // F6: auto-close must respect the same extra CLOSED requirements as the
      // manual transition (survey response for CLIENT kind, all 360 submitted).
      // When they are not met yet, skip auto-close; the project stays COMPLETE
      // and can be closed manually once the requirements are satisfied.
      const closeMissing =
        hasBast && hasInvoice
          ? await checkCloseRequirements(project.id, project.kind)
          : [];
      if (hasBast && hasInvoice && closeMissing.length === 0) {
        const closeResult = await prisma.project.updateMany({
          where: projectCloseReadinessWhere(project.id, project.kind, {
            requireChecklist: false,
          }),
          data: { status: "CLOSED", closedAt: new Date() },
        });
        if (closeResult.count === 1) {
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
      include: DOC_INCLUDE,
    });
    if (!before) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // FINANCE: narrow cross-project delete right on INVOICE/CONTRACT only,
    // bypassing the per-project ownership check (mirrors the upload gate).
    if (req.user!.role === "FINANCE") {
      if (before.type !== "INVOICE" && before.type !== "CONTRACT") {
        res.status(403).json({ error: "Finance can only delete INVOICE or CONTRACT documents" });
        return;
      }
      // FINANCE bypasses userCanWriteProject (which blocks archived), so
      // enforce the archived read-only contract here explicitly.
      if (!(await assertProjectWritable(before.projectId, res))) return;
    } else if (!(await userCanWriteProject(before.projectId, req.user!))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await prisma.document.delete({ where: { id: String(req.params.id) } });
    // If we deleted the latest version, promote the most recent prior version (if any) to latest
    if (before.isLatest && before.parentDocumentId) {
      const prior = await prisma.document.findFirst({
        where: { projectId: before.projectId, type: before.type },
        orderBy: { version: "desc" },
      });
      if (prior) {
        await prisma.document.update({ where: { id: prior.id }, data: { isLatest: true } });
      }
    }
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
