import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";

const router: IRouter = Router();

interface TemplateItem {
  title: string;
  description?: string | null;
  durationDays?: number | null;
  offsetDays?: number | null;
  billable?: boolean | null;
  parentIndex?: number | null;
}

function serialize(t: {
  id: string;
  name: string;
  description: string | null;
  businessUnitId: string | null;
  businessUnit: { name: string } | null;
  tasks: unknown;
  createdById: string;
  createdBy: { name: string };
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    businessUnitId: t.businessUnitId,
    businessUnitName: t.businessUnit?.name ?? null,
    tasks: Array.isArray(t.tasks) ? (t.tasks as TemplateItem[]) : [],
    createdById: t.createdById,
    createdByName: t.createdBy.name,
    isActive: t.isActive,
    createdAt: t.createdAt.toISOString(),
  };
}

const include = {
  businessUnit: { select: { name: true } },
  createdBy: { select: { name: true } },
} as const;

function validateTasks(tasks: unknown): TemplateItem[] | string {
  if (!Array.isArray(tasks) || tasks.length === 0) return "tasks must be a non-empty array";
  const out: TemplateItem[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i] as Partial<TemplateItem>;
    if (!t || typeof t.title !== "string" || !t.title.trim()) {
      return `tasks[${i}].title is required`;
    }
    if (t.parentIndex != null && (typeof t.parentIndex !== "number" || t.parentIndex >= i || t.parentIndex < 0)) {
      return `tasks[${i}].parentIndex must reference an earlier task`;
    }
    out.push({
      title: t.title.trim(),
      description: t.description ?? null,
      durationDays: t.durationDays != null ? Math.max(1, Math.floor(Number(t.durationDays))) : null,
      offsetDays: t.offsetDays != null ? Math.max(0, Math.floor(Number(t.offsetDays))) : 0,
      billable: t.billable ?? true,
      parentIndex: t.parentIndex ?? null,
    });
  }
  return out;
}

router.get(
  "/task-templates",
  requireAuth,
  async (req, res) => {
    const businessUnitId = req.query.businessUnitId as string | undefined;
    const list = await prisma.taskTemplate.findMany({
      where: {
        isActive: true,
        ...(businessUnitId ? { businessUnitId } : {}),
      },
      include,
      orderBy: [{ name: "asc" }],
    });
    res.json(list.map(serialize));
  },
);

router.post(
  "/task-templates",
  requireAuth,
  requireRole("MANAGEMENT"),
  async (req, res) => {
    const { name, description, businessUnitId, tasks, isActive } = req.body || {};
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name required" });
      return;
    }
    const validated = validateTasks(tasks);
    if (typeof validated === "string") {
      res.status(400).json({ error: validated });
      return;
    }
    const created = await prisma.taskTemplate.create({
      data: {
        name: name.trim(),
        description: description || null,
        businessUnitId: businessUnitId || null,
        tasks: validated as unknown as object,
        createdById: req.user!.sub,
        isActive: isActive !== false,
      },
      include,
    });
    await recordAudit(req, {
      action: "task_template.created",
      entityType: "TaskTemplate",
      entityId: created.id,
      description: `Task template created: ${created.name}`,
    });
    res.status(201).json(serialize(created));
  },
);

router.patch(
  "/task-templates/:id",
  requireAuth,
  requireRole("MANAGEMENT"),
  async (req, res) => {
    const existing = await prisma.taskTemplate.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { name, description, businessUnitId, tasks, isActive } = req.body || {};
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (description !== undefined) data.description = description || null;
    if (businessUnitId !== undefined) data.businessUnitId = businessUnitId || null;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (tasks !== undefined) {
      const v = validateTasks(tasks);
      if (typeof v === "string") {
        res.status(400).json({ error: v });
        return;
      }
      data.tasks = v as unknown as object;
    }
    const updated = await prisma.taskTemplate.update({
      where: { id: String(req.params.id) },
      data,
      include,
    });
    res.json(serialize(updated));
  },
);

router.delete(
  "/task-templates/:id",
  requireAuth,
  requireRole("MANAGEMENT"),
  async (req, res) => {
    const existing = await prisma.taskTemplate.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await prisma.taskTemplate.delete({ where: { id: String(req.params.id) } });
    await recordAudit(req, {
      action: "task_template.deleted",
      entityType: "TaskTemplate",
      entityId: existing.id,
      description: `Task template deleted: ${existing.name}`,
    });
    res.json({ message: "Deleted" });
  },
);

router.post(
  "/projects/:id/apply-task-template",
  requireAuth,
  async (req, res) => {
    const projectId = String(req.params.id);
    const { templateId, startDate } = req.body || {};
    if (!templateId) {
      res.status(400).json({ error: "templateId required" });
      return;
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, pmId: true, name: true, startDate: true },
    });
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const role = req.user!.role;
    if (role !== "MANAGEMENT" && !(role === "PROJECT_MANAGER" && project.pmId === req.user!.sub)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const template = await prisma.taskTemplate.findUnique({ where: { id: String(templateId) } });
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    const items = Array.isArray(template.tasks) ? (template.tasks as unknown as TemplateItem[]) : [];
    if (items.length === 0) {
      res.status(400).json({ error: "Template has no tasks" });
      return;
    }
    const base = startDate ? new Date(startDate) : project.startDate ?? new Date();
    const baseDay = new Date(base);
    baseDay.setHours(0, 0, 0, 0);
    const created: Array<{ id: string }> = [];
    // Create tasks sequentially to preserve parent references via array index
    const indexToId: Record<number, string> = {};
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const offset = item.offsetDays ?? 0;
      const dur = item.durationDays ?? 1;
      const sd = new Date(baseDay);
      sd.setDate(baseDay.getDate() + offset);
      const ed = new Date(sd);
      ed.setDate(sd.getDate() + Math.max(0, dur - 1));
      const parentTaskId =
        item.parentIndex != null ? indexToId[item.parentIndex] ?? null : null;
      const t = await prisma.task.create({
        data: {
          projectId,
          title: item.title,
          description: item.description ?? null,
          status: "TODO",
          billable: item.billable ?? true,
          startDate: sd,
          endDate: ed,
          parentTaskId,
          createdById: req.user!.sub,
        },
      });
      indexToId[i] = t.id;
      created.push({ id: t.id });
    }
    await recordAudit(req, {
      action: "task_template.applied",
      entityType: "Project",
      entityId: projectId,
      description: `Applied template "${template.name}" to ${project.name} (${created.length} tasks)`,
    });
    res.status(201).json({ created: created.length });
  },
);

export default router;
