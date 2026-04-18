import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();
router.use(requireAuth);

function serialize(c: {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  createdAt: Date;
}) {
  return {
    id: c.id,
    name: c.name,
    contactPerson: c.contactPerson,
    email: c.email,
    phone: c.phone,
    industry: c.industry,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/clients", async (_req, res) => {
  const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
  res.json(clients.map(serialize));
});

const writeRoles = ["MANAGEMENT", "SALES", "PROJECT_MANAGER"] as const;

router.post("/clients", requireRole(...writeRoles), async (req, res) => {
  const { name, contactPerson, email, phone, industry } = req.body || {};
  if (!name) {
    res.status(400).json({ error: "name required" });
    return;
  }
  const c = await prisma.client.create({
    data: {
      name: String(name),
      contactPerson: contactPerson || null,
      email: email || null,
      phone: phone || null,
      industry: industry || null,
    },
  });
  res.status(201).json(serialize(c));
});

router.patch("/clients/:id", requireRole(...writeRoles), async (req, res) => {
  const { name, contactPerson, email, phone, industry } = req.body || {};
  const c = await prisma.client.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: String(name) } : {}),
      ...(contactPerson !== undefined ? { contactPerson: contactPerson || null } : {}),
      ...(email !== undefined ? { email: email || null } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
      ...(industry !== undefined ? { industry: industry || null } : {}),
    },
  });
  res.json(serialize(c));
});

router.delete("/clients/:id", requireRole("MANAGEMENT"), async (req, res) => {
  await prisma.client.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

export default router;
