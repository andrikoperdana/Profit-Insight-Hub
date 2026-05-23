import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";

const router: IRouter = Router();
router.use(requireAuth);

function serializeSkill(s: {
  id: string;
  name: string;
  category: string | null;
  isActive: boolean;
  createdAt: Date;
  _count?: { users: number };
}) {
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    isActive: s.isActive,
    userCount: s._count?.users ?? 0,
    createdAt: s.createdAt.toISOString(),
  };
}

router.get("/skills", async (_req, res) => {
  const skills = await prisma.skill.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  });
  res.json(skills.map(serializeSkill));
});

router.post("/skills", requireRole("SITE_ADMIN", "MANAGEMENT", "HR"), async (req, res) => {
  const { name, category } = req.body || {};
  const n = typeof name === "string" ? name.trim() : "";
  if (!n) {
    res.status(400).json({ error: "name required" });
    return;
  }
  if (n.length > 100) {
    res.status(400).json({ error: "name too long (max 100 chars)" });
    return;
  }
  const cat = typeof category === "string" && category.trim() ? category.trim().slice(0, 80) : null;
  const exists = await prisma.skill.findUnique({ where: { name: n }, select: { id: true } });
  if (exists) {
    res.status(409).json({ error: "Skill name already exists" });
    return;
  }
  const created = await prisma.skill.create({
    data: { name: n, category: cat },
    include: { _count: { select: { users: true } } },
  });
  await recordAudit(req, {
    action: "skill.created",
    entityType: "Skill",
    entityId: created.id,
    description: `Created skill "${created.name}"`,
    after: { id: created.id, name: created.name, category: created.category },
  });
  res.status(201).json(serializeSkill(created));
});

router.patch("/skills/:id", requireRole("SITE_ADMIN", "MANAGEMENT", "HR"), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.skill.findUnique({ where: { id } });
  if (!before) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { name, category, isActive } = req.body || {};
  const data: Record<string, unknown> = {};
  if (name !== undefined) {
    const n = String(name).trim();
    if (!n || n.length > 100) {
      res.status(400).json({ error: "name required (max 100 chars)" });
      return;
    }
    if (n !== before.name) {
      const dupe = await prisma.skill.findUnique({ where: { name: n }, select: { id: true } });
      if (dupe && dupe.id !== id) {
        res.status(409).json({ error: "Skill name already exists" });
        return;
      }
    }
    data.name = n;
  }
  if (category !== undefined) {
    data.category = category === null || category === "" ? null : String(category).trim().slice(0, 80);
  }
  if (isActive !== undefined) data.isActive = Boolean(isActive);
  const updated = await prisma.skill.update({
    where: { id },
    data,
    include: { _count: { select: { users: true } } },
  });
  await recordAudit(req, {
    action: "skill.updated",
    entityType: "Skill",
    entityId: id,
    description: `Updated skill "${updated.name}"`,
    before: { name: before.name, category: before.category, isActive: before.isActive },
    after: { name: updated.name, category: updated.category, isActive: updated.isActive },
  });
  res.json(serializeSkill(updated));
});

router.delete("/skills/:id", requireRole("SITE_ADMIN", "MANAGEMENT", "HR"), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.skill.findUnique({ where: { id } });
  if (!before) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Hard delete is safe — UserSkill cascades on Skill delete (FK ON DELETE CASCADE).
  await prisma.skill.delete({ where: { id } });
  await recordAudit(req, {
    action: "skill.deleted",
    entityType: "Skill",
    entityId: id,
    description: `Deleted skill "${before.name}"`,
    before: { name: before.name, category: before.category },
  });
  res.json({ success: true });
});

export default router;
