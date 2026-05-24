import { Router, type IRouter } from "express";
import { prisma, type UserRole } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { hashPassword } from "../lib/auth.js";
import { serializeUser } from "../lib/serializers.js";
import { recordAudit } from "../lib/audit.js";
import { parsePagination, setTotalCount } from "../lib/pagination.js";

const router: IRouter = Router();

router.use(requireAuth);

const ALL_ROLES: UserRole[] = [
  "MANAGEMENT", "PROJECT_MANAGER", "SALES",
  "KONSULTAN", "TECHNICAL_WRITER", "ADMIN_PROJECT",
  "PRINCIPAL_KONSULTAN", "PRINCIPAL_TECHNICAL_WRITER", "PRINCIPAL_ADMIN_PROJECT",
  "FINANCE", "HR", "SITE_ADMIN",
];

const ALLOWED_SENIORITY = new Set(["JUNIOR", "MID", "SENIOR", "PRINCIPAL"]);

// Standard include for serializing a User with its BU + skills.
const userInclude = {
  businessUnit: { select: { id: true, name: true } },
  skills: {
    include: { skill: { select: { id: true, name: true, category: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

async function setUserSkills(userId: string, skillIds: string[]) {
  await prisma.userSkill.deleteMany({ where: { userId } });
  if (skillIds.length > 0) {
    await prisma.userSkill.createMany({
      data: skillIds.map((sid) => ({ userId, skillId: sid })),
      skipDuplicates: true,
    });
  }
}

function normalizeSkillIds(input: unknown): string[] | null | "INVALID" {
  if (input === undefined) return null;
  if (input === null) return [];
  if (!Array.isArray(input)) return "INVALID";
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of input) {
    if (typeof v !== "string" || !v) return "INVALID";
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

const PRINCIPAL_TO_REPORT_ROLE: Record<string, UserRole> = {
  PRINCIPAL_KONSULTAN: "KONSULTAN",
  PRINCIPAL_TECHNICAL_WRITER: "TECHNICAL_WRITER",
  PRINCIPAL_ADMIN_PROJECT: "ADMIN_PROJECT",
};

router.get("/users", async (req, res) => {
  const role = req.user!.role;
  // Full directory exposes HR data (email, dailyRate, seniority, BU, skills).
  // Only roles that legitimately need it: SITE_ADMIN, MANAGEMENT, PROJECT_MANAGER, SALES (project intake).
  // Other roles should use /users/active-all, /users/under-supervision, or /users/available.
  const allowed =
    role === "SITE_ADMIN" || role === "MANAGEMENT" ||
    role === "PROJECT_MANAGER" || role === "SALES" || role === "HR";
  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const includeDeleted = req.query.includeDeleted === "true" && role === "SITE_ADMIN";
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const where: import("@workspace/db").Prisma.UserWhereInput = includeDeleted ? {} : { deletedAt: null };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }
  const { limit, offset, requested } = parsePagination(req.query, {
    defaultLimit: 500,
    maxLimit: 500,
  });
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      include: userInclude,
      skip: offset,
      take: limit,
    }),
    requested ? prisma.user.count({ where }) : Promise.resolve(0),
  ]);
  if (requested) setTotalCount(res, total);
  res.json(users.map(serializeUser));
});

// Lists users supervised by the calling Principal (principalId === caller.id).
// Used by Principal dashboards/forms to scope edits + Propose Resource picks.
router.get("/users/under-supervision", async (req, res) => {
  const callerRole = req.user!.role;
  const callerId = req.user!.sub;
  if (!callerRole.startsWith("PRINCIPAL_")) {
    res.status(403).json({ error: "Only Principal roles can list supervisees" });
    return;
  }
  const supWhere = { principalId: callerId, deletedAt: null };
  const supPg = parsePagination(req.query, { defaultLimit: 500, maxLimit: 500 });
  const [users, supTotal] = await Promise.all([
    prisma.user.findMany({
      where: supWhere,
      orderBy: { name: "asc" },
      include: userInclude,
      ...(supPg.requested ? { skip: supPg.offset, take: supPg.limit } : {}),
    }),
    supPg.requested ? prisma.user.count({ where: supWhere }) : Promise.resolve(0),
  ]);
  if (supPg.requested) setTotalCount(res, supTotal);
  res.json(users.map(serializeUser));
});

router.get("/users/active-all", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "PROJECT_MANAGER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const aaWhere = { deletedAt: null, isActive: true };
  const aaPg = parsePagination(req.query, { defaultLimit: 500, maxLimit: 500 });
  const [users, aaTotal] = await Promise.all([
    prisma.user.findMany({
      where: aaWhere,
      orderBy: [{ role: "asc" }, { name: "asc" }],
      ...(aaPg.requested ? { skip: aaPg.offset, take: aaPg.limit } : {}),
    }),
    aaPg.requested ? prisma.user.count({ where: aaWhere }) : Promise.resolve(0),
  ]);
  if (aaPg.requested) setTotalCount(res, aaTotal);
  res.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      title: u.title,
      dailyRate: u.dailyRate,
    })),
  );
});

router.get("/users/available", async (req, res) => {
  const callerRole = req.user!.role;
  const callerId = req.user!.sub;
  const role = String(req.query.role || "") as UserRole;
  if (!ALL_ROLES.includes(role)) {
    res.status(400).json({ error: "role required" });
    return;
  }
  // MGMT/PM see all of a role; Principals see only the role they supervise (their own supervisees).
  let scopeWhere: any = { role, deletedAt: null, isActive: true };
  if (callerRole === "MANAGEMENT" || callerRole === "PROJECT_MANAGER") {
    // no extra filter
  } else if (callerRole.startsWith("PRINCIPAL_")) {
    const reportRole = PRINCIPAL_TO_REPORT_ROLE[callerRole];
    if (reportRole !== role) {
      res.status(403).json({ error: "Principal can only list users they supervise" });
      return;
    }
    scopeWhere.principalId = callerId;
  } else {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const users = await prisma.user.findMany({
    where: scopeWhere,
    orderBy: { name: "asc" },
  });
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
      const atCapacity = role === "KONSULTAN" ? activeProjectCount >= 4 : false;
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
  const u = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: userInclude,
  });
  if (!u) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeUser(u));
});

router.post(
  "/users",
  requireRole("SITE_ADMIN"),
  async (req, res) => {
    const {
      email, password, name, role, title, dailyRate, managerId, principalId,
      seniority, businessUnitId, skillIds,
    } = req.body || {};
    if (!email || !password || !name || !role) {
      res.status(400).json({ error: "email, password, name, role required" });
      return;
    }
    const emailClean = String(email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean) || emailClean.length > 200) {
      res.status(400).json({ error: "email must be a valid email address (max 200 chars)" });
      return;
    }
    const nameClean = String(name).trim();
    if (!nameClean || nameClean.length > 200) {
      res.status(400).json({ error: "name required (max 200 chars)" });
      return;
    }
    if (!ALL_ROLES.includes(role as UserRole)) {
      res.status(400).json({ error: `role must be one of ${ALL_ROLES.join(", ")}` });
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
    if (seniority != null && seniority !== "" && !ALLOWED_SENIORITY.has(String(seniority))) {
      res.status(400).json({ error: `seniority must be one of ${[...ALLOWED_SENIORITY].join(", ")}` });
      return;
    }
    if (businessUnitId != null && businessUnitId !== "") {
      const bu = await prisma.businessUnit.findUnique({ where: { id: String(businessUnitId) }, select: { id: true } });
      if (!bu) {
        res.status(400).json({ error: "businessUnitId not found" });
        return;
      }
    }
    const skills = normalizeSkillIds(skillIds);
    if (skills === "INVALID") {
      res.status(400).json({ error: "skillIds must be an array of skill IDs" });
      return;
    }
    const exists = await prisma.user.findUnique({
      where: { email: emailClean },
    });
    if (exists) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }
    const passwordHash = await hashPassword(String(password));
    const created = await prisma.user.create({
      data: {
        email: emailClean,
        passwordHash,
        name: nameClean,
        role: role as UserRole,
        title: title || null,
        dailyRate: dailyRate != null ? Number(dailyRate) : null,
        seniority: seniority ? (String(seniority) as any) : null,
        businessUnitId: businessUnitId || null,
        managerId: managerId || null,
        principalId: principalId || null,
      },
    });
    if (skills && skills.length > 0) {
      await setUserSkills(created.id, skills);
    }
    const u = await prisma.user.findUnique({ where: { id: created.id }, include: userInclude });
    await recordAudit(req, {
      action: "user.created",
      entityType: "User",
      entityId: created.id,
      description: `Created user ${created.name} (${created.email}) as ${created.role}`,
      after: serializeUser(u!),
    });
    res.status(201).json(serializeUser(u!));
  },
);

router.patch("/users/:id", async (req, res) => {
  const targetId = req.params.id;
  const isSelf = req.user!.sub === targetId;
  const isAdmin = req.user!.role === "SITE_ADMIN";
  const isHr = req.user!.role === "HR";
  if (!isSelf && !isAdmin && !isHr) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const before = await prisma.user.findUnique({ where: { id: targetId }, include: userInclude });
  if (!before) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const {
    name, role, title, dailyRate, isActive, password, managerId, principalId,
    seniority, businessUnitId, skillIds,
  } = req.body || {};
  if (dailyRate != null && (Number(dailyRate) < 0 || !isFinite(Number(dailyRate)))) {
    res.status(400).json({ error: "dailyRate must be a non-negative number" });
    return;
  }
  if (password && String(password).length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  if (name !== undefined) {
    const n = String(name).trim();
    if (!n || n.length > 200) {
      res.status(400).json({ error: "name required (max 200 chars)" });
      return;
    }
  }
  if (role !== undefined && !ALL_ROLES.includes(role as UserRole)) {
    res.status(400).json({ error: `role must be one of ${ALL_ROLES.join(", ")}` });
    return;
  }
  if (seniority !== undefined && seniority !== null && seniority !== "" && !ALLOWED_SENIORITY.has(String(seniority))) {
    res.status(400).json({ error: `seniority must be one of ${[...ALLOWED_SENIORITY].join(", ")}` });
    return;
  }
  if (businessUnitId !== undefined && businessUnitId !== null && businessUnitId !== "") {
    const bu = await prisma.businessUnit.findUnique({ where: { id: String(businessUnitId) }, select: { id: true } });
    if (!bu) {
      res.status(400).json({ error: "businessUnitId not found" });
      return;
    }
  }
  const skillsParsed = normalizeSkillIds(skillIds);
  if (skillsParsed === "INVALID") {
    res.status(400).json({ error: "skillIds must be an array of skill IDs" });
    return;
  }
  const data: Record<string, unknown> = {};
  // Name changes are personal — only the user themself or Site Admin may rename.
  // HR can update personnel attributes but not legal name.
  if (name !== undefined && (isSelf || isAdmin)) data.name = String(name).trim();
  if (title !== undefined) data.title = title || null;
  if (password && (isSelf || isAdmin)) data.passwordHash = await hashPassword(String(password));
  // HR may edit non-sensitive personnel fields on any user, but never role/isActive/password.
  if (isAdmin || isHr) {
    if (dailyRate !== undefined)
      data.dailyRate = dailyRate != null ? Number(dailyRate) : null;
    if (managerId !== undefined) data.managerId = managerId || null;
    if (principalId !== undefined) data.principalId = principalId || null;
    if (seniority !== undefined) data.seniority = seniority ? (String(seniority) as any) : null;
    if (businessUnitId !== undefined) data.businessUnitId = businessUnitId || null;
  }
  if (isAdmin) {
    if (role !== undefined) data.role = role as UserRole;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
  }
  await prisma.user.update({ where: { id: targetId }, data });
  if ((isAdmin || isHr) && skillsParsed !== null) {
    await setUserSkills(targetId, skillsParsed);
  }
  const u = await prisma.user.findUnique({ where: { id: targetId }, include: userInclude });
  if (!u) {
    res.status(404).json({ error: "Not found" });
    return;
  }
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
  requireRole("SITE_ADMIN"),
  async (req, res) => {
    if (req.user!.sub === req.params.id) {
      res.status(400).json({ error: "Cannot delete yourself" });
      return;
    }
    const before = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
    if (!before) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const u = await prisma.user.update({
      where: { id: String(req.params.id) },
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
