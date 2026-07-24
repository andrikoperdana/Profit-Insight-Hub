import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { prisma, type UserRole, type AccessRequestStatus } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { hashPassword } from "../lib/auth.js";
import { serializeUser } from "../lib/serializers.js";
import { recordAudit } from "../lib/audit.js";

const router: IRouter = Router();

router.use(requireAuth);

const ALL_ROLES: UserRole[] = [
  "MANAGEMENT", "PROJECT_MANAGER", "SALES",
  "KONSULTAN", "TECHNICAL_WRITER", "ADMIN_PROJECT",
  "PRINCIPAL_KONSULTAN", "PRINCIPAL_TECHNICAL_WRITER", "PRINCIPAL_ADMIN_PROJECT",
  "FINANCE", "HR", "SITE_ADMIN",
];

const ALLOWED_SENIORITY = new Set(["JUNIOR", "MID", "SENIOR", "PRINCIPAL"]);
const STATUSES = new Set<string>(["PENDING", "APPROVED", "REJECTED"]);

type AccessRequestWithDecider = import("@workspace/db").Prisma.AccessRequestGetPayload<{
  include: { decidedBy: { select: { name: true } } };
}>;

function serializeAccessRequest(ar: AccessRequestWithDecider) {
  return {
    id: ar.id,
    email: ar.email,
    name: ar.name,
    status: ar.status,
    decidedById: ar.decidedById,
    decidedByName: ar.decidedBy?.name ?? null,
    decidedAt: ar.decidedAt ? ar.decidedAt.toISOString() : null,
    createdUserId: ar.createdUserId,
    createdAt: ar.createdAt.toISOString(),
    updatedAt: ar.updatedAt.toISOString(),
  };
}

const deciderInclude = { decidedBy: { select: { name: true } } } as const;

router.get("/access-requests", requireRole("SITE_ADMIN"), async (req, res) => {
  const statusRaw = typeof req.query.status === "string" ? req.query.status : "";
  if (statusRaw && !STATUSES.has(statusRaw)) {
    res.status(400).json({ error: "status must be one of PENDING, APPROVED, REJECTED" });
    return;
  }
  const items = await prisma.accessRequest.findMany({
    where: statusRaw ? { status: statusRaw as AccessRequestStatus } : {},
    include: deciderInclude,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(items.map(serializeAccessRequest));
});

router.post("/access-requests/:id/approve", requireRole("SITE_ADMIN"), async (req, res) => {
  const id = String(req.params.id);
  const ar = await prisma.accessRequest.findUnique({ where: { id } });
  if (!ar) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (ar.status !== "PENDING") {
    res.status(409).json({ error: "This request has already been decided" });
    return;
  }
  const { role, name, title, seniority, businessUnitId } = req.body || {};
  if (!role || !ALL_ROLES.includes(role as UserRole)) {
    res.status(400).json({ error: `role must be one of ${ALL_ROLES.join(", ")}` });
    return;
  }
  const nameClean = String(name ?? ar.name).trim();
  if (!nameClean || nameClean.length > 200) {
    res.status(400).json({ error: "name required (max 200 chars)" });
    return;
  }
  if (seniority != null && seniority !== "" && !ALLOWED_SENIORITY.has(String(seniority))) {
    res.status(400).json({ error: `seniority must be one of ${[...ALLOWED_SENIORITY].join(", ")}` });
    return;
  }
  if (businessUnitId != null && businessUnitId !== "") {
    const bu = await prisma.businessUnit.findUnique({
      where: { id: String(businessUnitId) },
      select: { id: true },
    });
    if (!bu) {
      res.status(400).json({ error: "businessUnitId not found" });
      return;
    }
  }

  // SSO users never use this password — a random unguessable placeholder
  // satisfies the required passwordHash column.
  const passwordHash = await hashPassword(crypto.randomUUID());
  let created: { id: string } | null = null;
  try {
    created = await prisma.$transaction(async (tx) => {
      // Atomic claim: only one concurrent approve/reject can flip PENDING.
      const claimed = await tx.accessRequest.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "APPROVED", decidedById: req.user!.sub, decidedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error("ALREADY_DECIDED");
      const exists = await tx.user.findUnique({
        where: { email: ar.email },
        select: { id: true },
      });
      if (exists) throw new Error("EMAIL_TAKEN");
      const u = await tx.user.create({
        data: {
          email: ar.email,
          passwordHash,
          name: nameClean,
          role: role as UserRole,
          title: title || null,
          seniority: seniority ? (String(seniority) as never) : null,
          businessUnitId: businessUnitId || null,
        },
      });
      await tx.accessRequest.update({
        where: { id },
        data: { createdUserId: u.id },
      });
      return u;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "ALREADY_DECIDED") {
      res.status(409).json({ error: "This request has already been decided" });
      return;
    }
    if (msg === "EMAIL_TAKEN") {
      res.status(409).json({ error: "A user with this email already exists" });
      return;
    }
    // Unique-constraint race (email created between check and insert)
    if ((err as { code?: string })?.code === "P2002") {
      res.status(409).json({ error: "A user with this email already exists" });
      return;
    }
    throw err;
  }

  const u = await prisma.user.findUnique({
    where: { id: created.id },
    include: {
      businessUnit: { select: { id: true, name: true } },
      skills: {
        include: { skill: { select: { id: true, name: true, category: true } } },
        orderBy: { createdAt: "asc" as const },
      },
    },
  });
  await recordAudit(req, {
    action: "access_request.approved",
    entityType: "AccessRequest",
    entityId: id,
    description: `Approved access request for ${ar.email} — created user ${nameClean} as ${role}`,
    after: serializeUser(u!),
  });
  res.status(201).json(serializeUser(u!));
});

router.post("/access-requests/:id/reject", requireRole("SITE_ADMIN"), async (req, res) => {
  const id = String(req.params.id);
  const claimed = await prisma.accessRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REJECTED", decidedById: req.user!.sub, decidedAt: new Date() },
  });
  if (claimed.count === 0) {
    const exists = await prisma.accessRequest.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      res.status(404).json({ error: "Not found" });
    } else {
      res.status(409).json({ error: "This request has already been decided" });
    }
    return;
  }
  const ar = await prisma.accessRequest.findUnique({ where: { id }, include: deciderInclude });
  await recordAudit(req, {
    action: "access_request.rejected",
    entityType: "AccessRequest",
    entityId: id,
    description: `Rejected access request for ${ar!.email}`,
  });
  res.json(serializeAccessRequest(ar!));
});

export default router;
