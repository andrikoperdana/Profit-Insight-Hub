import { Router, type IRouter } from "express";
import { prisma, type UserRole } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { hashPassword } from "../lib/auth.js";
import { serializeUser } from "../lib/serializers.js";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  res.json(users.map(serializeUser));
});

router.get("/users/:id", async (req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!u) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeUser(u));
});

router.post(
  "/users",
  requireRole("MANAGEMENT"),
  async (req, res) => {
    const { email, password, name, role, title, dailyRate } = req.body || {};
    if (!email || !password || !name || !role) {
      res.status(400).json({ error: "email, password, name, role required" });
      return;
    }
    const exists = await prisma.user.findUnique({
      where: { email: String(email).toLowerCase() },
    });
    if (exists) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }
    const passwordHash = await hashPassword(String(password));
    const u = await prisma.user.create({
      data: {
        email: String(email).toLowerCase(),
        passwordHash,
        name: String(name),
        role: role as UserRole,
        title: title || null,
        dailyRate: dailyRate != null ? Number(dailyRate) : null,
      },
    });
    res.status(201).json(serializeUser(u));
  },
);

router.patch("/users/:id", async (req, res) => {
  const targetId = req.params.id;
  const isSelf = req.user!.sub === targetId;
  const isAdmin = req.user!.role === "MANAGEMENT";
  if (!isSelf && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { name, role, title, dailyRate, isActive, password } = req.body || {};
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = String(name);
  if (title !== undefined) data.title = title || null;
  if (dailyRate !== undefined)
    data.dailyRate = dailyRate != null ? Number(dailyRate) : null;
  if (password) data.passwordHash = await hashPassword(String(password));
  if (isAdmin) {
    if (role !== undefined) data.role = role as UserRole;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
  }
  const u = await prisma.user.update({ where: { id: targetId }, data });
  res.json(serializeUser(u));
});

router.delete(
  "/users/:id",
  requireRole("MANAGEMENT"),
  async (req, res) => {
    if (req.user!.sub === req.params.id) {
      res.status(400).json({ error: "Cannot delete yourself" });
      return;
    }
    await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true });
  },
);

export default router;
