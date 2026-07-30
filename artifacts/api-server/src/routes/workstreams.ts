import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";

function isUniqueConstraintError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === "P2002"
  );
}
import { requireAuth } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { userCanAccessProject, assertProjectWritable } from "../lib/projectAccess.js";

const router: IRouter = Router();
router.use(requireAuth);

const STATUSES = new Set(["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]);

async function canWriteWorkstream(
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

type WorkstreamRow = {
  id: string;
  projectId: string;
  code: string;
  name: string;
  description: string | null;
  businessUnitId: string | null;
  businessUnit: { id: string; name: string } | null;
  allocationPct: number;
  plannedMandays: number;
  estimatedCost: number;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

function serialize(w: WorkstreamRow) {
  return {
    id: w.id,
    projectId: w.projectId,
    code: w.code,
    name: w.name,
    description: w.description,
    businessUnitId: w.businessUnitId,
    businessUnitName: w.businessUnit?.name ?? null,
    allocationPct: w.allocationPct,
    plannedMandays: w.plannedMandays,
    estimatedCost: w.estimatedCost,
    startDate: w.startDate ? w.startDate.toISOString() : null,
    endDate: w.endDate ? w.endDate.toISOString() : null,
    status: w.status,
    sortOrder: w.sortOrder,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

const include = {
  businessUnit: { select: { id: true, name: true } },
} as const;

router.get("/projects/:id/workstreams", async (req, res) => {
  const projectId = String(req.params.id);
  if (!(await userCanAccessProject(projectId, req.user!))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const items = await prisma.projectWorkstream.findMany({
    where: { projectId },
    include,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  res.json(items.map(serialize));
});

router.post("/projects/:id/workstreams", async (req, res) => {
  const projectId = String(req.params.id);
  if (!(await userCanAccessProject(projectId, req.user!))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!(await canWriteWorkstream(projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project or Management can add workstreams" });
    return;
  }
  if (!(await assertProjectWritable(projectId, res))) return;
  const body = req.body || {};
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!code) {
    res.status(400).json({ error: "code required" });
    return;
  }
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const dup = await prisma.projectWorkstream.findUnique({
    where: { projectId_code: { projectId, code } },
    select: { id: true },
  });
  if (dup) {
    res.status(409).json({ error: `Workstream code "${code}" already exists in this project` });
    return;
  }
  let businessUnitId: string | null = null;
  if (body.businessUnitId) {
    const bu = await prisma.businessUnit.findUnique({
      where: { id: String(body.businessUnitId) },
      select: { id: true },
    });
    if (!bu) {
      res.status(400).json({ error: "businessUnitId not found" });
      return;
    }
    businessUnitId = bu.id;
  }
  const status =
    body.status && STATUSES.has(String(body.status)) ? String(body.status) : "ACTIVE";
  let startDate: Date | null = null;
  let endDate: Date | null = null;
  if (body.startDate) {
    const d = new Date(body.startDate);
    if (isNaN(d.getTime())) {
      res.status(400).json({ error: "startDate invalid" });
      return;
    }
    startDate = d;
  }
  if (body.endDate) {
    const d = new Date(body.endDate);
    if (isNaN(d.getTime())) {
      res.status(400).json({ error: "endDate invalid" });
      return;
    }
    endDate = d;
  }
  const allocationPct = Number.isFinite(Number(body.allocationPct)) ? Number(body.allocationPct) : 0;
  if (allocationPct < 0 || allocationPct > 100) {
    res.status(400).json({ error: "allocationPct must be between 0 and 100" });
    return;
  }
  const plannedMandays = Number.isFinite(Number(body.plannedMandays)) ? Number(body.plannedMandays) : 0;
  if (plannedMandays < 0) {
    res.status(400).json({ error: "plannedMandays invalid" });
    return;
  }
  const estimatedCost = Number.isFinite(Number(body.estimatedCost)) ? Number(body.estimatedCost) : 0;
  if (estimatedCost < 0) {
    res.status(400).json({ error: "estimatedCost invalid" });
    return;
  }
  let item;
  try {
    // Atomically create the workstream and enable the project's workstream mode.
    item = await prisma.$transaction(async (tx) => {
      const created = await tx.projectWorkstream.create({
        data: {
          projectId,
          code,
          name,
          description: body.description ? String(body.description).trim() || null : null,
          businessUnitId,
          allocationPct,
          plannedMandays,
          estimatedCost,
          startDate,
          endDate,
          status,
          sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
        },
        include,
      });
      await tx.project.update({
        where: { id: projectId },
        data: { useWorkstreams: true },
      });
      return created;
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      res.status(409).json({ error: `Workstream code "${code}" already exists in this project` });
      return;
    }
    throw e;
  }
  await recordAudit(req, {
    action: "workstream.created",
    entityType: "ProjectWorkstream",
    entityId: item.id,
    description: `Added workstream "${item.code} — ${item.name}" on project ${projectId}`,
    after: { id: item.id, projectId, code: item.code, name: item.name },
  });
  res.status(201).json(serialize(item));
});

router.patch("/workstreams/:wsId", async (req, res) => {
  const id = String(req.params.wsId);
  const before = await prisma.projectWorkstream.findUnique({ where: { id }, include });
  if (!before) {
    res.status(404).json({ error: "Workstream not found" });
    return;
  }
  if (!(await canWriteWorkstream(before.projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project or Management can edit workstreams" });
    return;
  }
  if (!(await assertProjectWritable(before.projectId, res))) return;
  const body = req.body || {};
  const data: Record<string, unknown> = {};
  if (body.code !== undefined) {
    const c = String(body.code).trim();
    if (!c) {
      res.status(400).json({ error: "code cannot be empty" });
      return;
    }
    if (c !== before.code) {
      const dup = await prisma.projectWorkstream.findUnique({
        where: { projectId_code: { projectId: before.projectId, code: c } },
        select: { id: true },
      });
      if (dup) {
        res.status(409).json({ error: `Workstream code "${c}" already exists in this project` });
        return;
      }
    }
    data.code = c;
  }
  if (body.name !== undefined) {
    const n = String(body.name).trim();
    if (!n) {
      res.status(400).json({ error: "name cannot be empty" });
      return;
    }
    data.name = n;
  }
  if (body.description !== undefined) {
    data.description = body.description ? String(body.description).trim() || null : null;
  }
  if (body.businessUnitId !== undefined) {
    if (body.businessUnitId === null || body.businessUnitId === "") {
      data.businessUnitId = null;
    } else {
      const bu = await prisma.businessUnit.findUnique({
        where: { id: String(body.businessUnitId) },
        select: { id: true },
      });
      if (!bu) {
        res.status(400).json({ error: "businessUnitId not found" });
        return;
      }
      data.businessUnitId = bu.id;
    }
  }
  if (body.allocationPct !== undefined) {
    const v = Number(body.allocationPct);
    if (!Number.isFinite(v) || v < 0 || v > 100) {
      res.status(400).json({ error: "allocationPct must be between 0 and 100" });
      return;
    }
    data.allocationPct = v;
  }
  if (body.plannedMandays !== undefined) {
    const v = Number(body.plannedMandays);
    if (!Number.isFinite(v) || v < 0) {
      res.status(400).json({ error: "plannedMandays invalid" });
      return;
    }
    data.plannedMandays = v;
  }
  if (body.estimatedCost !== undefined) {
    const v = Number(body.estimatedCost);
    if (!Number.isFinite(v) || v < 0) {
      res.status(400).json({ error: "estimatedCost invalid" });
      return;
    }
    data.estimatedCost = v;
  }
  if (body.startDate !== undefined) {
    if (body.startDate === null || body.startDate === "") {
      data.startDate = null;
    } else {
      const d = new Date(body.startDate);
      if (isNaN(d.getTime())) {
        res.status(400).json({ error: "startDate invalid" });
        return;
      }
      data.startDate = d;
    }
  }
  if (body.endDate !== undefined) {
    if (body.endDate === null || body.endDate === "") {
      data.endDate = null;
    } else {
      const d = new Date(body.endDate);
      if (isNaN(d.getTime())) {
        res.status(400).json({ error: "endDate invalid" });
        return;
      }
      data.endDate = d;
    }
  }
  if (body.status !== undefined) {
    const s = String(body.status);
    if (!STATUSES.has(s)) {
      res.status(400).json({ error: "status invalid" });
      return;
    }
    data.status = s;
  }
  if (body.sortOrder !== undefined) {
    const v = Number(body.sortOrder);
    if (!Number.isFinite(v)) {
      res.status(400).json({ error: "sortOrder invalid" });
      return;
    }
    data.sortOrder = v;
  }
  let updated;
  try {
    updated = await prisma.projectWorkstream.update({ where: { id }, data, include });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      res
        .status(409)
        .json({ error: `Workstream code "${String(data.code ?? before.code)}" already exists in this project` });
      return;
    }
    throw e;
  }
  await recordAudit(req, {
    action: "workstream.updated",
    entityType: "ProjectWorkstream",
    entityId: id,
    description: `Updated workstream "${updated.code} — ${updated.name}" on project ${updated.projectId}`,
    before: {
      code: before.code,
      name: before.name,
      allocationPct: before.allocationPct,
      status: before.status,
    },
    after: {
      code: updated.code,
      name: updated.name,
      allocationPct: updated.allocationPct,
      status: updated.status,
    },
  });
  res.json(serialize(updated));
});

router.delete("/workstreams/:wsId", async (req, res) => {
  const id = String(req.params.wsId);
  const before = await prisma.projectWorkstream.findUnique({ where: { id } });
  if (!before) {
    res.status(404).json({ error: "Workstream not found" });
    return;
  }
  if (!(await canWriteWorkstream(before.projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project or Management can delete workstreams" });
    return;
  }
  if (!(await assertProjectWritable(before.projectId, res))) return;
  // Atomically delete and flip the project flag if this was the last workstream.
  await prisma.$transaction(async (tx) => {
    await tx.projectWorkstream.delete({ where: { id } });
    const remaining = await tx.projectWorkstream.count({
      where: { projectId: before.projectId },
    });
    if (remaining === 0) {
      await tx.project.update({
        where: { id: before.projectId },
        data: { useWorkstreams: false },
      });
    }
  });
  await recordAudit(req, {
    action: "workstream.deleted",
    entityType: "ProjectWorkstream",
    entityId: id,
    description: `Deleted workstream "${before.code} — ${before.name}" on project ${before.projectId}`,
    before: { id, code: before.code, name: before.name },
  });
  res.json({ message: "Workstream deleted" });
});

export default router;
