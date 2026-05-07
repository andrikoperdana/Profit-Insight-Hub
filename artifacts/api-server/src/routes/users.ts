import { Router, type IRouter } from "express";
import { prisma, type UserRole } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { hashPassword } from "../lib/auth.js";
import { serializeUser } from "../lib/serializers.js";
import { recordAudit } from "../lib/audit.js";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/users", async (req, res) => {
  const includeDeleted = req.query.includeDeleted === "true" && req.user!.role === "MANAGEMENT";
  const users = await prisma.user.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    orderBy: { name: "asc" },
  });
  res.json(users.map(serializeUser));
});

router.get("/users/available", async (req, res) => {
  const callerRole = req.user!.role;
  if (callerRole !== "MANAGEMENT" && callerRole !== "PROJECT_MANAGER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const role = String(req.query.role || "") as UserRole;
  const validRoles: UserRole[] = [
    "MANAGEMENT", "PROJECT_MANAGER", "SALES",
    "KONSULTAN", "TECHNICAL_WRITER", "ADMIN_PROJECT",
  ];
  if (!validRoles.includes(role)) {
    res.status(400).json({ error: "role required" });
    return;
  }
  const users = await prisma.user.findMany({
    where: { role, deletedAt: null, isActive: true },
    orderBy: { name: "asc" },
  });
  // Count active project assignments per user.
  // For KONSULTAN: count ProjectResource where project.status in OBSERVATION/ACTIVE.
  // For TW/AP: count direct assignments via Project.technicalWriterId / adminProjectId.
  const result = await Promise.all(
    users.map(async (u) => {
      let activeProjectCount = 0;
      if (role === "KONSULTAN") {
        activeProjectCount = await prisma.projectResource.count({
          where: {
            userId: u.id,
            project: { status: { in: ["OBSERVATION", "ACTIVE"] }, deletedAt: null },
          },
        });
      } else if (role === "TECHNICAL_WRITER") {
        activeProjectCount = await prisma.project.count({
          where: { technicalWriterId: u.id, status: { in: ["OBSERVATION", "ACTIVE"] }, deletedAt: null },
        });
      } else if (role === "ADMIN_PROJECT") {
        activeProjectCount = await prisma.project.count({
          where: { adminProjectId: u.id, status: { in: ["OBSERVATION", "ACTIVE", "NO_NEED_CONSULTANT"] }, deletedAt: null },
        });
      }
      const atCapacity = role === "KONSULTAN" ? activeProjectCount >= 2 : false;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        title: u.title,
        dailyRate: u.dailyRate,
        activeProjectCount,
        atCapacity,
      };
    }),
  );
  res.json(result);
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
    if (String(password).length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }
    if (dailyRate != null && (Number(dailyRate) < 0 || !isFinite(Number(dailyRate)))) {
      res.status(400).json({ error: "dailyRate must be a non-negative number" });
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
    await recordAudit(req, {
      action: "user.created",
      entityType: "User",
      entityId: u.id,
      description: `Created user ${u.name} (${u.email}) as ${u.role}`,
      after: serializeUser(u),
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
  const before = await prisma.user.findUnique({ where: { id: targetId } });
  if (!before) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const { name, role, title, dailyRate, isActive, password } = req.body || {};
  if (dailyRate != null && (Number(dailyRate) < 0 || !isFinite(Number(dailyRate)))) {
    res.status(400).json({ error: "dailyRate must be a non-negative number" });
    return;
  }
  if (password && String(password).length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = String(name);
  if (title !== undefined) data.title = title || null;
  if (password) data.passwordHash = await hashPassword(String(password));
  if (isAdmin) {
    if (role !== undefined) data.role = role as UserRole;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    if (dailyRate !== undefined)
      data.dailyRate = dailyRate != null ? Number(dailyRate) : null;
  }
  const u = await prisma.user.update({ where: { id: targetId }, data });
  await recordAudit(req, {
    action: "user.updated",
    entityType: "User",
    entityId: u.id,
    description: `Updated user ${u.name}`,
    before: serializeUser(before),
    after: serializeUser(u),
  });
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
    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Soft delete: keep the row, set deletedAt + isActive=false so the user
    // disappears from selects/lists but their historical records (timesheets,
    // approvals, audit log entries) remain intact.
    const u = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false, deletedAt: new Date() },
    });
    await recordAudit(req, {
      action: "user.deleted",
      entityType: "User",
      entityId: u.id,
      description: `Soft-deleted user ${before.name} (${before.email})`,
      before: serializeUser(before),
      after: serializeUser(u),
    });
    res.json({ success: true });
  },
);

export default router;
