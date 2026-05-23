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

const writeRoles = ["SALES"] as const;

// Loose but enough to reject obvious garbage like "abc" or "no-at-sign.com".
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LEN = 200;
const MAX_FIELD_LEN = 200;

function validateClientFields(b: Record<string, unknown>, partial: boolean): string | null {
  if (!partial || b.name !== undefined) {
    const n = typeof b.name === "string" ? b.name.trim() : "";
    if (!n) return "name required";
    if (n.length > MAX_NAME_LEN) return `name too long (max ${MAX_NAME_LEN} chars)`;
  }
  if (b.email !== undefined && b.email !== null && b.email !== "") {
    const e = String(b.email).trim();
    if (e.length > MAX_FIELD_LEN) return `email too long (max ${MAX_FIELD_LEN} chars)`;
    if (!EMAIL_RE.test(e)) return "email must be a valid email address";
  }
  for (const f of ["contactPerson", "phone", "industry"] as const) {
    if (b[f] !== undefined && b[f] !== null && typeof b[f] === "string" && (b[f] as string).length > MAX_FIELD_LEN) {
      return `${f} too long (max ${MAX_FIELD_LEN} chars)`;
    }
  }
  return null;
}

router.post("/clients", requireRole(...writeRoles), async (req, res) => {
  const body = req.body || {};
  const err = validateClientFields(body, false);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  const { name, contactPerson, email, phone, industry } = body;
  const c = await prisma.client.create({
    data: {
      name: String(name).trim(),
      contactPerson: contactPerson || null,
      email: email ? String(email).trim() : null,
      phone: phone || null,
      industry: industry || null,
    },
  });
  res.status(201).json(serialize(c));
});

router.patch("/clients/:id", requireRole(...writeRoles), async (req, res) => {
  const body = req.body || {};
  const err = validateClientFields(body, true);
  if (err) {
    res.status(400).json({ error: err });
    return;
  }
  const { name, contactPerson, email, phone, industry } = body;
  const c = await prisma.client.update({
    where: { id: String(req.params.id) },
    data: {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(contactPerson !== undefined ? { contactPerson: contactPerson || null } : {}),
      ...(email !== undefined ? { email: email ? String(email).trim() : null } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
      ...(industry !== undefined ? { industry: industry || null } : {}),
    },
  });
  res.json(serialize(c));
});

router.delete("/clients/:id", requireRole("MANAGEMENT"), async (req, res) => {
  await prisma.client.delete({ where: { id: String(req.params.id) } });
  res.json({ success: true });
});

export default router;
