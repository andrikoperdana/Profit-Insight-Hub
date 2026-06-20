import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { userCanAccessProject } from "../lib/projectAccess.js";

// Change Requests drive formal change control: a documented request to alter a
// project's scope, schedule, or cost. Reads and writes are scoped to the
// project's assigned PM and Management (CRs expose committed cost/schedule
// commitments). When an APPROVED schedule/cost CR is APPLIED it re-baselines
// the project (a new ProjectBaseline version), marking the prior one stale.
async function canManageChangeRequest(
  projectId: string,
  user: { sub: string; role: string },
): Promise<boolean> {
  if (user.role === "MANAGEMENT" || user.role === "SUPER_ADMIN") return true;
  if (user.role !== "PROJECT_MANAGER") return false;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { pmId: true },
  });
  return !!project && project.pmId === user.sub;
}

const router: IRouter = Router();
router.use(requireAuth);

const CR_TYPES = new Set(["SCOPE", "SCHEDULE", "COST"]);

type CrType = "SCOPE" | "SCHEDULE" | "COST";
type CrStatus = "DRAFT" | "APPROVED" | "APPLIED" | "REJECTED";

const include = {
  requestedBy: { select: { name: true } },
  decidedBy: { select: { name: true } },
} as const;

type ChangeRequestWithRelations = {
  id: string;
  projectId: string;
  type: string;
  status: string;
  title: string;
  description: string | null;
  impactSummary: string | null;
  proposedStartDate: Date | null;
  proposedEndDate: Date | null;
  proposedPlannedMandays: number | null;
  proposedEstimatedCost: number | null;
  proposedContractValue: number | null;
  requestedById: string | null;
  requestedBy: { name: string } | null;
  decidedById: string | null;
  decidedBy: { name: string } | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function serialize(cr: ChangeRequestWithRelations, canEdit: boolean) {
  return {
    id: cr.id,
    projectId: cr.projectId,
    type: cr.type as CrType,
    status: cr.status as CrStatus,
    title: cr.title,
    description: cr.description,
    impactSummary: cr.impactSummary,
    proposedStartDate: cr.proposedStartDate ? cr.proposedStartDate.toISOString() : null,
    proposedEndDate: cr.proposedEndDate ? cr.proposedEndDate.toISOString() : null,
    proposedPlannedMandays: cr.proposedPlannedMandays,
    proposedEstimatedCost: cr.proposedEstimatedCost,
    proposedContractValue: cr.proposedContractValue,
    requestedById: cr.requestedById,
    requestedByName: cr.requestedBy?.name ?? null,
    decidedById: cr.decidedById,
    decidedByName: cr.decidedBy?.name ?? null,
    decidedAt: cr.decidedAt ? cr.decidedAt.toISOString() : null,
    decisionNote: cr.decisionNote,
    appliedAt: cr.appliedAt ? cr.appliedAt.toISOString() : null,
    canEdit,
    createdAt: cr.createdAt.toISOString(),
    updatedAt: cr.updatedAt.toISOString(),
  };
}

// Parse an optional numeric proposed field. Returns undefined when omitted (so
// the caller can preserve), null when explicitly cleared, or a finite number.
function parseOptionalNumber(
  value: unknown,
): number | null | undefined | "invalid" {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return "invalid";
  return n;
}

// Parse an optional ISO date field. undefined=omit, null=clear, Date=set.
function parseOptionalDate(value: unknown): Date | null | undefined | "invalid" {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return "invalid";
  return d;
}

router.get("/projects/:id/change-requests", async (req, res) => {
  const projectId = String(req.params.id);
  if (!(await userCanAccessProject(projectId, req.user!))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!(await canManageChangeRequest(projectId, req.user!))) {
    res.status(403).json({ error: "You do not have access to change requests for this project" });
    return;
  }
  const items = await prisma.changeRequest.findMany({
    where: { projectId },
    include,
    orderBy: [{ createdAt: "desc" }],
  });
  res.json(items.map((cr) => serialize(cr, cr.status === "DRAFT")));
});

router.post("/projects/:id/change-requests", async (req, res) => {
  const projectId = String(req.params.id);
  if (!(await userCanAccessProject(projectId, req.user!))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!(await canManageChangeRequest(projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project or Management can create change requests" });
    return;
  }
  const body = req.body || {};
  const type = String(body.type ?? "");
  if (!CR_TYPES.has(type)) {
    res.status(400).json({ error: `type must be one of ${[...CR_TYPES].join(", ")}` });
    return;
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    res.status(400).json({ error: "title required" });
    return;
  }
  const startDate = parseOptionalDate(body.proposedStartDate);
  if (startDate === "invalid") { res.status(400).json({ error: "proposedStartDate invalid" }); return; }
  const endDate = parseOptionalDate(body.proposedEndDate);
  if (endDate === "invalid") { res.status(400).json({ error: "proposedEndDate invalid" }); return; }
  const mandays = parseOptionalNumber(body.proposedPlannedMandays);
  if (mandays === "invalid") { res.status(400).json({ error: "proposedPlannedMandays invalid" }); return; }
  const estCost = parseOptionalNumber(body.proposedEstimatedCost);
  if (estCost === "invalid") { res.status(400).json({ error: "proposedEstimatedCost invalid" }); return; }
  const contractValue = parseOptionalNumber(body.proposedContractValue);
  if (contractValue === "invalid") { res.status(400).json({ error: "proposedContractValue invalid" }); return; }

  const cr = await prisma.changeRequest.create({
    data: {
      projectId,
      type: type as CrType,
      status: "DRAFT",
      title,
      description: body.description ? String(body.description).trim() || null : null,
      impactSummary: body.impactSummary ? String(body.impactSummary).trim() || null : null,
      proposedStartDate: startDate === undefined ? null : startDate,
      proposedEndDate: endDate === undefined ? null : endDate,
      proposedPlannedMandays: mandays === undefined ? null : mandays,
      proposedEstimatedCost: estCost === undefined ? null : estCost,
      proposedContractValue: contractValue === undefined ? null : contractValue,
      requestedById: req.user!.sub,
    },
    include,
  });
  await recordAudit(req, {
    action: "change_request.created",
    entityType: "ChangeRequest",
    entityId: cr.id,
    description: `Created ${cr.type} change request "${cr.title}" on project ${projectId}`,
    after: { id: cr.id, projectId, type: cr.type, title: cr.title, status: cr.status },
  });
  res.status(201).json(serialize(cr, true));
});

router.patch("/change-requests/:crId", async (req, res) => {
  const id = String(req.params.crId);
  const before = await prisma.changeRequest.findUnique({ where: { id }, include });
  if (!before) { res.status(404).json({ error: "Change request not found" }); return; }
  if (!(await canManageChangeRequest(before.projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project or Management can edit change requests" });
    return;
  }
  if (before.status !== "DRAFT") {
    res.status(409).json({ error: "Only DRAFT change requests can be edited" });
    return;
  }
  const body = req.body || {};
  const data: Record<string, unknown> = {};
  if (body.type !== undefined) {
    if (!CR_TYPES.has(String(body.type))) { res.status(400).json({ error: "type invalid" }); return; }
    data.type = String(body.type);
  }
  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (!t) { res.status(400).json({ error: "title cannot be empty" }); return; }
    data.title = t;
  }
  if (body.description !== undefined) {
    data.description = body.description ? String(body.description).trim() || null : null;
  }
  if (body.impactSummary !== undefined) {
    data.impactSummary = body.impactSummary ? String(body.impactSummary).trim() || null : null;
  }
  if (body.proposedStartDate !== undefined) {
    const d = parseOptionalDate(body.proposedStartDate);
    if (d === "invalid") { res.status(400).json({ error: "proposedStartDate invalid" }); return; }
    data.proposedStartDate = d;
  }
  if (body.proposedEndDate !== undefined) {
    const d = parseOptionalDate(body.proposedEndDate);
    if (d === "invalid") { res.status(400).json({ error: "proposedEndDate invalid" }); return; }
    data.proposedEndDate = d;
  }
  if (body.proposedPlannedMandays !== undefined) {
    const n = parseOptionalNumber(body.proposedPlannedMandays);
    if (n === "invalid") { res.status(400).json({ error: "proposedPlannedMandays invalid" }); return; }
    data.proposedPlannedMandays = n;
  }
  if (body.proposedEstimatedCost !== undefined) {
    const n = parseOptionalNumber(body.proposedEstimatedCost);
    if (n === "invalid") { res.status(400).json({ error: "proposedEstimatedCost invalid" }); return; }
    data.proposedEstimatedCost = n;
  }
  if (body.proposedContractValue !== undefined) {
    const n = parseOptionalNumber(body.proposedContractValue);
    if (n === "invalid") { res.status(400).json({ error: "proposedContractValue invalid" }); return; }
    data.proposedContractValue = n;
  }
  const updated = await prisma.changeRequest.update({ where: { id }, data, include });
  await recordAudit(req, {
    action: "change_request.updated",
    entityType: "ChangeRequest",
    entityId: id,
    description: `Updated change request "${updated.title}"`,
    after: { id, fields: Object.keys(data) },
  });
  res.json(serialize(updated, updated.status === "DRAFT"));
});

router.delete("/change-requests/:crId", async (req, res) => {
  const id = String(req.params.crId);
  const before = await prisma.changeRequest.findUnique({ where: { id } });
  if (!before) { res.status(404).json({ error: "Change request not found" }); return; }
  if (!(await canManageChangeRequest(before.projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project or Management can delete change requests" });
    return;
  }
  if (before.status !== "DRAFT") {
    res.status(409).json({ error: "Only DRAFT change requests can be deleted" });
    return;
  }
  await prisma.changeRequest.delete({ where: { id } });
  await recordAudit(req, {
    action: "change_request.deleted",
    entityType: "ChangeRequest",
    entityId: id,
    description: `Deleted change request "${before.title}"`,
    before: { id, projectId: before.projectId, type: before.type, title: before.title },
  });
  res.json({ message: "Change request deleted" });
});

router.post("/change-requests/:crId/approve", async (req, res) => {
  const id = String(req.params.crId);
  const before = await prisma.changeRequest.findUnique({ where: { id }, include });
  if (!before) { res.status(404).json({ error: "Change request not found" }); return; }
  if (!(await canManageChangeRequest(before.projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project or Management can approve change requests" });
    return;
  }
  if (before.status !== "DRAFT") {
    res.status(409).json({ error: "Only DRAFT change requests can be approved" });
    return;
  }
  const note = req.body?.decisionNote ? String(req.body.decisionNote).trim() || null : null;
  const updated = await prisma.changeRequest.update({
    where: { id },
    data: { status: "APPROVED", decidedById: req.user!.sub, decidedAt: new Date(), decisionNote: note },
    include,
  });
  await recordAudit(req, {
    action: "change_request.approved",
    entityType: "ChangeRequest",
    entityId: id,
    description: `Approved change request "${updated.title}"`,
    after: { id, status: updated.status },
  });
  res.json(serialize(updated, false));
});

router.post("/change-requests/:crId/reject", async (req, res) => {
  const id = String(req.params.crId);
  const before = await prisma.changeRequest.findUnique({ where: { id }, include });
  if (!before) { res.status(404).json({ error: "Change request not found" }); return; }
  if (!(await canManageChangeRequest(before.projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project or Management can reject change requests" });
    return;
  }
  if (before.status !== "DRAFT" && before.status !== "APPROVED") {
    res.status(409).json({ error: "Only DRAFT or APPROVED change requests can be rejected" });
    return;
  }
  const note = req.body?.decisionNote ? String(req.body.decisionNote).trim() || null : null;
  const updated = await prisma.changeRequest.update({
    where: { id },
    data: { status: "REJECTED", decidedById: req.user!.sub, decidedAt: new Date(), decisionNote: note },
    include,
  });
  await recordAudit(req, {
    action: "change_request.rejected",
    entityType: "ChangeRequest",
    entityId: id,
    description: `Rejected change request "${updated.title}"`,
    after: { id, status: updated.status },
  });
  res.json(serialize(updated, false));
});

router.post("/change-requests/:crId/apply", async (req, res) => {
  const id = String(req.params.crId);
  const before = await prisma.changeRequest.findUnique({ where: { id }, include });
  if (!before) { res.status(404).json({ error: "Change request not found" }); return; }
  if (!(await canManageChangeRequest(before.projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project or Management can apply change requests" });
    return;
  }
  if (before.status !== "APPROVED") {
    res.status(409).json({ error: "Only APPROVED change requests can be applied" });
    return;
  }

  // Apply any proposed values onto the project, then (for SCHEDULE/COST CRs)
  // snapshot the resulting committed plan as a new current baseline version so
  // EVM and the variance panel measure against the re-baselined commitment.
  const reBaseline = before.type === "SCHEDULE" || before.type === "COST";
  let alreadyApplied = false;
  const updated = await prisma.$transaction(async (tx) => {
    // Atomic status guard: only transition if still APPROVED. Two concurrent
    // apply requests that both read APPROVED outside the transaction would
    // otherwise both proceed and create duplicate baseline versions.
    const claim = await tx.changeRequest.updateMany({
      where: { id, status: "APPROVED" },
      data: { status: "APPLIED", appliedAt: new Date() },
    });
    if (claim.count === 0) {
      alreadyApplied = true;
      return tx.changeRequest.findUniqueOrThrow({ where: { id }, include });
    }

    // SCOPE change requests are audit-only: they document a scope decision but
    // never mutate the project's schedule/cost commitment and never re-baseline.
    // Only SCHEDULE/COST CRs (reBaseline) write proposed values onto the project.
    const projectData: Record<string, unknown> = {};
    if (reBaseline) {
      if (before.proposedStartDate !== null) projectData.startDate = before.proposedStartDate;
      if (before.proposedEndDate !== null) projectData.endDate = before.proposedEndDate;
      if (before.proposedPlannedMandays !== null) projectData.plannedMandays = before.proposedPlannedMandays;
      if (before.proposedEstimatedCost !== null) projectData.estimatedCost = before.proposedEstimatedCost;
      if (before.proposedContractValue !== null) projectData.contractValue = before.proposedContractValue;
    }

    const project = Object.keys(projectData).length
      ? await tx.project.update({ where: { id: before.projectId }, data: projectData })
      : await tx.project.findUniqueOrThrow({ where: { id: before.projectId } });

    if (reBaseline) {
      const agg = await tx.projectBaseline.aggregate({
        where: { projectId: before.projectId },
        _max: { version: true },
      });
      const nextVersion = (agg._max.version ?? 0) + 1;
      await tx.projectBaseline.updateMany({
        where: { projectId: before.projectId, isCurrent: true },
        data: { isCurrent: false },
      });
      await tx.projectBaseline.create({
        data: {
          projectId: before.projectId,
          version: nextVersion,
          isCurrent: true,
          source: "CHANGE_REQUEST",
          changeRequestId: before.id,
          startDate: project.startDate,
          endDate: project.endDate,
          plannedMandays: project.plannedMandays,
          estimatedCost: project.estimatedCost,
          contractValue: project.contractValue,
          createdById: req.user!.sub,
        },
      });
    }

    return tx.changeRequest.findUniqueOrThrow({ where: { id }, include });
  });

  if (alreadyApplied) {
    res.status(409).json({ error: "Only APPROVED change requests can be applied" });
    return;
  }

  await recordAudit(req, {
    action: "change_request.applied",
    entityType: "ChangeRequest",
    entityId: id,
    description: `Applied ${updated.type} change request "${updated.title}"${reBaseline ? " (re-baselined)" : ""}`,
    after: { id, status: updated.status, reBaseline },
  });
  res.json(serialize(updated, false));
});

export default router;
