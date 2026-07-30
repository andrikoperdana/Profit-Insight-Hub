import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { nextProjectId } from "../lib/projectIds.js";

const router: IRouter = Router();

const include = {
  businessUnit: { select: { name: true } },
  createdBy: { select: { name: true } },
  taskTemplate: { select: { id: true, name: true } },
  resources: { orderBy: { createdAt: "asc" } },
  milestones: { orderBy: { order: "asc" } },
  raidItems: { orderBy: { createdAt: "asc" } },
} as const;

type Tpl = Awaited<ReturnType<typeof prisma.projectTemplate.findFirstOrThrow<{ include: typeof include }>>>;

function serialize(t: Tpl) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    businessUnitId: t.businessUnitId,
    businessUnitName: t.businessUnit?.name ?? null,
    kind: t.kind,
    defaultDurationDays: t.defaultDurationDays,
    estimatedContractValue: t.estimatedContractValue,
    estimatedCost: t.estimatedCost,
    plannedMandays: t.plannedMandays,
    vatPercent: t.vatPercent,
    contractValueIncludesVat: t.contractValueIncludesVat,
    taskTemplateId: t.taskTemplateId,
    taskTemplateName: t.taskTemplate?.name ?? null,
    isActive: t.isActive,
    createdById: t.createdById,
    createdByName: t.createdBy.name,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    resources: t.resources.map((r) => ({
      id: r.id,
      role: r.role,
      count: r.count,
      plannedMandays: r.plannedMandays,
      dailyRate: r.dailyRate,
      note: r.note,
    })),
    milestones: t.milestones.map((m) => ({
      id: m.id,
      name: m.name,
      percentage: m.percentage,
      offsetDays: m.offsetDays,
      order: m.order,
    })),
    raidItems: t.raidItems.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      description: r.description,
      impact: r.impact,
      likelihood: r.likelihood,
      mitigation: r.mitigation,
    })),
  };
}

router.get("/project-templates", requireAuth, async (_req, res) => {
  const list = await prisma.projectTemplate.findMany({
    where: { isActive: true },
    include,
    orderBy: [{ name: "asc" }],
  });
  res.json(list.map(serialize));
});

router.get("/project-templates/:id", requireAuth, async (req, res) => {
  const t = await prisma.projectTemplate.findUnique({ where: { id: String(req.params.id) }, include });
  if (!t) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serialize(t));
});

interface ResourceInput {
  role: string;
  count?: number;
  plannedMandays?: number;
  dailyRate?: number;
  note?: string | null;
}
interface MilestoneInput {
  name: string;
  percentage?: number;
  offsetDays?: number;
  order?: number;
}
interface RaidInput {
  type: "RISK" | "ASSUMPTION" | "ISSUE" | "DEPENDENCY";
  title: string;
  description?: string | null;
  impact?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  likelihood?: "LOW" | "MEDIUM" | "HIGH";
  mitigation?: string | null;
}

function computeTotals(resources: ResourceInput[]) {
  let mandays = 0;
  let cost = 0;
  for (const r of resources) {
    const c = Math.max(1, Math.floor(r.count ?? 1));
    const md = Math.max(0, Number(r.plannedMandays ?? 0));
    const rate = Math.max(0, Number(r.dailyRate ?? 0));
    mandays += c * md;
    cost += c * md * rate;
  }
  return { mandays, cost };
}

router.post(
  "/project-templates",
  requireAuth,
  requireRole("MANAGEMENT"),
  async (req, res) => {
    const b = req.body || {};
    if (!b.name || typeof b.name !== "string") {
      res.status(400).json({ error: "name required" });
      return;
    }
    const resources: ResourceInput[] = Array.isArray(b.resources) ? b.resources : [];
    const milestones: MilestoneInput[] = Array.isArray(b.milestones) ? b.milestones : [];
    const raidItems: RaidInput[] = Array.isArray(b.raidItems) ? b.raidItems : [];
    const totals = computeTotals(resources);
    const estimatedContractValue = Number(b.estimatedContractValue ?? 0);
    const estimatedCost = b.estimatedCost != null ? Number(b.estimatedCost) : totals.cost;
    const plannedMandays = b.plannedMandays != null ? Number(b.plannedMandays) : totals.mandays;

    const created = await prisma.projectTemplate.create({
      data: {
        name: String(b.name).trim(),
        description: b.description || null,
        businessUnitId: b.businessUnitId || null,
        kind: b.kind || "CLIENT",
        defaultDurationDays: Math.max(1, Math.floor(Number(b.defaultDurationDays ?? 30))),
        estimatedContractValue,
        estimatedCost,
        plannedMandays,
        vatPercent: Number(b.vatPercent ?? 11),
        contractValueIncludesVat: b.contractValueIncludesVat !== false,
        taskTemplateId: b.taskTemplateId || null,
        isActive: b.isActive !== false,
        createdById: req.user!.sub,
        resources: {
          create: resources.map((r) => ({
            role: String(r.role),
            count: Math.max(1, Math.floor(r.count ?? 1)),
            plannedMandays: Number(r.plannedMandays ?? 0),
            dailyRate: Number(r.dailyRate ?? 0),
            note: r.note || null,
          })),
        },
        milestones: {
          create: milestones.map((m, i) => ({
            name: String(m.name),
            percentage: Number(m.percentage ?? 0),
            offsetDays: Math.max(0, Math.floor(Number(m.offsetDays ?? 0))),
            order: m.order ?? i,
          })),
        },
        raidItems: {
          create: raidItems.map((r) => ({
            type: r.type,
            title: String(r.title),
            description: r.description || null,
            impact: r.impact || "MEDIUM",
            likelihood: r.likelihood || "MEDIUM",
            mitigation: r.mitigation || null,
          })),
        },
      },
      include,
    });
    await recordAudit(req, {
      action: "project_template.created",
      entityType: "ProjectTemplate",
      entityId: created.id,
      description: `Project template created: ${created.name}`,
    });
    res.status(201).json(serialize(created));
  },
);

router.patch(
  "/project-templates/:id",
  requireAuth,
  requireRole("MANAGEMENT"),
  async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.projectTemplate.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const b = req.body || {};
    const data: Record<string, unknown> = {};
    if (b.name !== undefined) data.name = String(b.name).trim();
    if (b.description !== undefined) data.description = b.description || null;
    if (b.businessUnitId !== undefined) data.businessUnitId = b.businessUnitId || null;
    if (b.kind !== undefined) data.kind = b.kind;
    if (b.defaultDurationDays !== undefined)
      data.defaultDurationDays = Math.max(1, Math.floor(Number(b.defaultDurationDays)));
    if (b.estimatedContractValue !== undefined) data.estimatedContractValue = Number(b.estimatedContractValue);
    if (b.estimatedCost !== undefined) data.estimatedCost = Number(b.estimatedCost);
    if (b.plannedMandays !== undefined) data.plannedMandays = Number(b.plannedMandays);
    if (b.vatPercent !== undefined) data.vatPercent = Number(b.vatPercent);
    if (b.contractValueIncludesVat !== undefined)
      data.contractValueIncludesVat = Boolean(b.contractValueIncludesVat);
    if (b.taskTemplateId !== undefined) data.taskTemplateId = b.taskTemplateId || null;
    if (b.isActive !== undefined) data.isActive = Boolean(b.isActive);

    // Replace-all semantics for nested arrays when provided
    await prisma.$transaction(async (tx) => {
      await tx.projectTemplate.update({ where: { id }, data });
      if (Array.isArray(b.resources)) {
        await tx.projectTemplateResource.deleteMany({ where: { templateId: id } });
        const resources = b.resources as ResourceInput[];
        for (const r of resources) {
          await tx.projectTemplateResource.create({
            data: {
              templateId: id,
              role: String(r.role),
              count: Math.max(1, Math.floor(r.count ?? 1)),
              plannedMandays: Number(r.plannedMandays ?? 0),
              dailyRate: Number(r.dailyRate ?? 0),
              note: r.note || null,
            },
          });
        }
        if (b.plannedMandays === undefined || b.estimatedCost === undefined) {
          const totals = computeTotals(resources);
          await tx.projectTemplate.update({
            where: { id },
            data: {
              ...(b.plannedMandays === undefined ? { plannedMandays: totals.mandays } : {}),
              ...(b.estimatedCost === undefined ? { estimatedCost: totals.cost } : {}),
            },
          });
        }
      }
      if (Array.isArray(b.milestones)) {
        await tx.projectTemplateMilestone.deleteMany({ where: { templateId: id } });
        const milestones = b.milestones as MilestoneInput[];
        for (let i = 0; i < milestones.length; i++) {
          const m = milestones[i]!;
          await tx.projectTemplateMilestone.create({
            data: {
              templateId: id,
              name: String(m.name),
              percentage: Number(m.percentage ?? 0),
              offsetDays: Math.max(0, Math.floor(Number(m.offsetDays ?? 0))),
              order: m.order ?? i,
            },
          });
        }
      }
      if (Array.isArray(b.raidItems)) {
        await tx.projectTemplateRaidItem.deleteMany({ where: { templateId: id } });
        const raidItems = b.raidItems as RaidInput[];
        for (const r of raidItems) {
          await tx.projectTemplateRaidItem.create({
            data: {
              templateId: id,
              type: r.type,
              title: String(r.title),
              description: r.description || null,
              impact: r.impact || "MEDIUM",
              likelihood: r.likelihood || "MEDIUM",
              mitigation: r.mitigation || null,
            },
          });
        }
      }
    });
    const updated = await prisma.projectTemplate.findUnique({ where: { id }, include });
    res.json(serialize(updated!));
  },
);

router.delete(
  "/project-templates/:id",
  requireAuth,
  requireRole("MANAGEMENT"),
  async (req, res) => {
    const id = String(req.params.id);
    const existing = await prisma.projectTemplate.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await prisma.projectTemplate.delete({ where: { id } });
    await recordAudit(req, {
      action: "project_template.deleted",
      entityType: "ProjectTemplate",
      entityId: id,
      description: `Project template deleted: ${existing.name}`,
    });
    res.json({ message: "Deleted" });
  },
);

router.post(
  "/project-templates/:id/apply",
  requireAuth,
  requireRole("MANAGEMENT", "PROJECT_MANAGER", "SALES"),
  async (req, res) => {
    const id = String(req.params.id);
    const template = await prisma.projectTemplate.findUnique({ where: { id }, include });
    if (!template || !template.isActive) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    const b = req.body || {};
    if (!b.name || !b.clientId) {
      res.status(400).json({ error: "name, clientId required" });
      return;
    }
    const spkCode = b.code ? String(b.code).trim() || null : null;
    // unique code check (only when a SPK/PO code was provided)
    if (spkCode) {
      const dup = await prisma.project.findUnique({ where: { code: spkCode } });
      if (dup) {
        res.status(409).json({ error: "Project code already exists" });
        return;
      }
    }
    const role = req.user!.role;
    const startDate = b.startDate ? new Date(b.startDate) : new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + template.defaultDurationDays);

    // Allocate Project ID with collision retry (same pattern as /projects create).
    let created: Awaited<ReturnType<typeof prisma.project.create>> | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const generatedProjectId = await nextProjectId(new Date());
      try {
        created = await prisma.$transaction(async (tx) => {
          const project = await tx.project.create({
            data: {
              projectId: generatedProjectId,
              code: spkCode,
              name: String(b.name).trim(),
              description: b.description || template.description || null,
              status: "DRAFT",
              kind: template.kind,
              clientId: String(b.clientId),
              salesId: role === "SALES" ? req.user!.sub : (b.salesId || null),
              pmId: null,
              startDate,
              endDate,
              contractValue: Number(b.contractValue ?? template.estimatedContractValue),
              currency: (b.currency ? String(b.currency).toUpperCase() : "IDR").slice(0, 8),
              exchangeRate: Number(b.exchangeRate ?? 1) > 0 ? Number(b.exchangeRate ?? 1) : 1,
              vatPercent: template.vatPercent,
              contractValueIncludesVat: template.contractValueIncludesVat,
              estimatedCost: template.estimatedCost,
              plannedMandays: template.plannedMandays,
            },
          });
          // billing milestones
          for (let i = 0; i < template.milestones.length; i++) {
            const m = template.milestones[i]!;
            const due = new Date(startDate);
            due.setDate(due.getDate() + m.offsetDays);
            const amount = (project.contractValue * m.percentage) / 100;
            await tx.billingMilestone.create({
              data: {
                projectId: project.id,
                name: m.name,
                percentage: m.percentage,
                amount,
                dueDate: due,
                status: "PLANNED",
                sortOrder: (m.order ?? i) * 10,
              },
            });
          }
          // RAID items
          for (const r of template.raidItems) {
            await tx.projectRaidItem.create({
              data: {
                projectId: project.id,
                type: r.type,
                title: r.title,
                description: r.description,
                impact: r.impact,
                likelihood: r.likelihood,
                mitigation: r.mitigation,
                status: "OPEN",
                createdById: req.user!.sub,
              },
            });
          }
          return project;
        });
        break; // success
      } catch (e: unknown) {
        const pe = e as { code?: string };
        if (pe?.code === "P2002" && attempt < 4) continue; // projectId collision → retry
        throw e;
      }
    }
    if (!created) {
      res.status(500).json({ error: "Failed to allocate a Project ID" });
      return;
    }

    await recordAudit(req, {
      action: "project_template.applied",
      entityType: "Project",
      entityId: created.id,
      description: `Project "${created.name}" created from template "${template.name}"`,
    });
    res.status(201).json({ projectId: created.id });
  },
);

export default router;
