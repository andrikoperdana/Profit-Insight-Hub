import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { userCanAccessProject } from "../lib/projectAccess.js";
import { prisma as prismaForRaid } from "@workspace/db";

// RAID writes are strictly limited to MANAGEMENT or the project's assigned PM,
// regardless of what `userCanWriteProject` allows for other endpoints.
async function canWriteRaid(projectId: string, user: { sub: string; role: string }): Promise<boolean> {
  if (user.role === "MANAGEMENT") return true;
  if (user.role !== "PROJECT_MANAGER") return false;
  const project = await prismaForRaid.project.findUnique({
    where: { id: projectId },
    select: { pmId: true },
  });
  return !!project && project.pmId === user.sub;
}

const router: IRouter = Router();
router.use(requireAuth);

const RAID_TYPES = new Set(["RISK", "ASSUMPTION", "ISSUE", "DEPENDENCY"]);
const IMPACTS = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const LIKELIHOODS = new Set(["LOW", "MEDIUM", "HIGH"]);
const STATUSES = new Set(["OPEN", "MITIGATING", "CLOSED"]);

type RaidWithRelations = {
  id: string;
  projectId: string;
  type: string;
  title: string;
  description: string | null;
  impact: string;
  likelihood: string;
  status: string;
  ownerId: string | null;
  owner: { name: string } | null;
  mitigation: string | null;
  dueDate: Date | null;
  closedAt: Date | null;
  createdById: string | null;
  createdBy: { name: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

function serialize(r: RaidWithRelations) {
  return {
    id: r.id,
    projectId: r.projectId,
    type: r.type as "RISK" | "ASSUMPTION" | "ISSUE" | "DEPENDENCY",
    title: r.title,
    description: r.description,
    impact: r.impact as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    likelihood: r.likelihood as "LOW" | "MEDIUM" | "HIGH",
    status: r.status as "OPEN" | "MITIGATING" | "CLOSED",
    ownerId: r.ownerId,
    ownerName: r.owner?.name ?? null,
    mitigation: r.mitigation,
    dueDate: r.dueDate ? r.dueDate.toISOString() : null,
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
    createdById: r.createdById,
    createdByName: r.createdBy?.name ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const include = {
  owner: { select: { name: true } },
  createdBy: { select: { name: true } },
} as const;

router.get("/projects/:id/raid", async (req, res) => {
  const projectId = String(req.params.id);
  if (!(await userCanAccessProject(projectId, req.user!))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const items = await prisma.projectRaidItem.findMany({
    where: { projectId },
    include,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  res.json(items.map(serialize));
});

router.post("/projects/:id/raid", async (req, res) => {
  const projectId = String(req.params.id);
  if (!(await userCanAccessProject(projectId, req.user!))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!(await canWriteRaid(projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project or Management can add RAID items" });
    return;
  }
  const body = req.body || {};
  const type = String(body.type ?? "");
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!RAID_TYPES.has(type)) {
    res.status(400).json({ error: `type must be one of ${[...RAID_TYPES].join(", ")}` });
    return;
  }
  if (!title) {
    res.status(400).json({ error: "title required" });
    return;
  }
  const impact = body.impact && IMPACTS.has(String(body.impact)) ? String(body.impact) : "MEDIUM";
  const likelihood = body.likelihood && LIKELIHOODS.has(String(body.likelihood)) ? String(body.likelihood) : "MEDIUM";
  const status = body.status && STATUSES.has(String(body.status)) ? String(body.status) : "OPEN";
  let dueDate: Date | null = null;
  if (body.dueDate) {
    const d = new Date(body.dueDate);
    if (isNaN(d.getTime())) { res.status(400).json({ error: "dueDate invalid" }); return; }
    dueDate = d;
  }
  let ownerId: string | null = null;
  if (body.ownerId) {
    const owner = await prisma.user.findUnique({ where: { id: String(body.ownerId) }, select: { id: true } });
    if (!owner) { res.status(400).json({ error: "ownerId not found" }); return; }
    ownerId = owner.id;
  }
  const item = await prisma.projectRaidItem.create({
    data: {
      projectId,
      type: type as "RISK" | "ASSUMPTION" | "ISSUE" | "DEPENDENCY",
      title,
      description: body.description ? String(body.description).trim() || null : null,
      impact: impact as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      likelihood: likelihood as "LOW" | "MEDIUM" | "HIGH",
      status: status as "OPEN" | "MITIGATING" | "CLOSED",
      ownerId,
      mitigation: body.mitigation ? String(body.mitigation).trim() || null : null,
      dueDate,
      closedAt: status === "CLOSED" ? new Date() : null,
      createdById: req.user!.sub,
    },
    include,
  });
  await recordAudit(req, {
    action: "raid.created",
    entityType: "ProjectRaidItem",
    entityId: item.id,
    description: `Added ${item.type} "${item.title}" on project ${projectId}`,
    after: { id: item.id, projectId, type: item.type, title: item.title, status: item.status },
  });
  res.status(201).json(serialize(item));
});

router.patch("/raid/:itemId", async (req, res) => {
  const id = String(req.params.itemId);
  const before = await prisma.projectRaidItem.findUnique({ where: { id }, include });
  if (!before) { res.status(404).json({ error: "RAID item not found" }); return; }
  if (!(await canWriteRaid(before.projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project or Management can edit RAID items" });
    return;
  }
  const body = req.body || {};
  const data: Record<string, unknown> = {};
  if (body.type !== undefined) {
    if (!RAID_TYPES.has(String(body.type))) { res.status(400).json({ error: "type invalid" }); return; }
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
  if (body.impact !== undefined) {
    if (!IMPACTS.has(String(body.impact))) { res.status(400).json({ error: "impact invalid" }); return; }
    data.impact = String(body.impact);
  }
  if (body.likelihood !== undefined) {
    if (!LIKELIHOODS.has(String(body.likelihood))) { res.status(400).json({ error: "likelihood invalid" }); return; }
    data.likelihood = String(body.likelihood);
  }
  if (body.status !== undefined) {
    const s = String(body.status);
    if (!STATUSES.has(s)) { res.status(400).json({ error: "status invalid" }); return; }
    data.status = s;
    if (s === "CLOSED" && !before.closedAt) data.closedAt = new Date();
    if (s !== "CLOSED") data.closedAt = null;
  }
  if (body.ownerId !== undefined) {
    if (body.ownerId === null || body.ownerId === "") {
      data.ownerId = null;
    } else {
      const o = await prisma.user.findUnique({ where: { id: String(body.ownerId) }, select: { id: true } });
      if (!o) { res.status(400).json({ error: "ownerId not found" }); return; }
      data.ownerId = o.id;
    }
  }
  if (body.mitigation !== undefined) {
    data.mitigation = body.mitigation ? String(body.mitigation).trim() || null : null;
  }
  if (body.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === "") {
      data.dueDate = null;
    } else {
      const d = new Date(body.dueDate);
      if (isNaN(d.getTime())) { res.status(400).json({ error: "dueDate invalid" }); return; }
      data.dueDate = d;
    }
  }
  const updated = await prisma.projectRaidItem.update({ where: { id }, data, include });
  await recordAudit(req, {
    action: "raid.updated",
    entityType: "ProjectRaidItem",
    entityId: id,
    description: `Updated RAID "${updated.title}" on project ${updated.projectId}`,
    before: { status: before.status, impact: before.impact, likelihood: before.likelihood },
    after: { status: updated.status, impact: updated.impact, likelihood: updated.likelihood },
  });
  res.json(serialize(updated));
});

router.delete("/raid/:itemId", async (req, res) => {
  const id = String(req.params.itemId);
  const before = await prisma.projectRaidItem.findUnique({ where: { id } });
  if (!before) { res.status(404).json({ error: "RAID item not found" }); return; }
  if (!(await canWriteRaid(before.projectId, req.user!))) {
    res.status(403).json({ error: "Only PM-of-project or Management can delete RAID items" });
    return;
  }
  await prisma.projectRaidItem.delete({ where: { id } });
  await recordAudit(req, {
    action: "raid.deleted",
    entityType: "ProjectRaidItem",
    entityId: id,
    description: `Deleted RAID "${before.title}" on project ${before.projectId}`,
    before: { id, title: before.title, type: before.type },
  });
  res.json({ message: "RAID item deleted" });
});

export default router;
