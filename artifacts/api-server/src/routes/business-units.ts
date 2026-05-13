import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";

const router: IRouter = Router();
router.use(requireAuth);

function serializeBU(b: {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  _count?: { users: number };
}) {
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    isActive: b.isActive,
    memberCount: b._count?.users ?? 0,
    createdAt: b.createdAt.toISOString(),
  };
}

router.get("/business-units", async (_req, res) => {
  const bus = await prisma.businessUnit.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });
  res.json(bus.map(serializeBU));
});

router.post("/business-units", requireRole("SITE_ADMIN", "MANAGEMENT"), async (req, res) => {
  const { name, description } = req.body || {};
  const n = typeof name === "string" ? name.trim() : "";
  if (!n) {
    res.status(400).json({ error: "name required" });
    return;
  }
  if (n.length > 80) {
    res.status(400).json({ error: "name too long (max 80 chars)" });
    return;
  }
  const exists = await prisma.businessUnit.findUnique({ where: { name: n }, select: { id: true } });
  if (exists) {
    res.status(409).json({ error: "Business Unit name already exists" });
    return;
  }
  const desc = typeof description === "string" && description.trim() ? description.trim().slice(0, 500) : null;
  const created = await prisma.businessUnit.create({
    data: { name: n, description: desc },
    include: { _count: { select: { users: true } } },
  });
  await recordAudit(req, {
    action: "business_unit.created",
    entityType: "BusinessUnit",
    entityId: created.id,
    description: `Created business unit "${created.name}"`,
    after: { name: created.name },
  });
  res.status(201).json(serializeBU(created));
});

router.patch("/business-units/:id", requireRole("SITE_ADMIN", "MANAGEMENT"), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.businessUnit.findUnique({ where: { id } });
  if (!before) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { name, description, isActive } = req.body || {};
  const data: Record<string, unknown> = {};
  if (name !== undefined) {
    const n = String(name).trim();
    if (!n || n.length > 80) {
      res.status(400).json({ error: "name required (max 80 chars)" });
      return;
    }
    if (n !== before.name) {
      const dupe = await prisma.businessUnit.findUnique({ where: { name: n }, select: { id: true } });
      if (dupe && dupe.id !== id) {
        res.status(409).json({ error: "Business Unit name already exists" });
        return;
      }
    }
    data.name = n;
  }
  if (description !== undefined) {
    data.description =
      description === null || description === "" ? null : String(description).trim().slice(0, 500);
  }
  if (isActive !== undefined) data.isActive = Boolean(isActive);
  const updated = await prisma.businessUnit.update({
    where: { id },
    data,
    include: { _count: { select: { users: true } } },
  });
  await recordAudit(req, {
    action: "business_unit.updated",
    entityType: "BusinessUnit",
    entityId: id,
    description: `Updated business unit "${updated.name}"`,
    before: { name: before.name, isActive: before.isActive },
    after: { name: updated.name, isActive: updated.isActive },
  });
  res.json(serializeBU(updated));
});

router.delete("/business-units/:id", requireRole("SITE_ADMIN", "MANAGEMENT"), async (req, res) => {
  const id = String(req.params.id);
  const before = await prisma.businessUnit.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!before) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if ((before._count?.users ?? 0) > 0) {
    res.status(409).json({
      error: `Cannot delete: ${before._count.users} user(s) still assigned. Move them to another BU first.`,
    });
    return;
  }
  await prisma.businessUnit.delete({ where: { id } });
  await recordAudit(req, {
    action: "business_unit.deleted",
    entityType: "BusinessUnit",
    entityId: id,
    description: `Deleted business unit "${before.name}"`,
    before: { name: before.name },
  });
  res.json({ success: true });
});

export default router;
