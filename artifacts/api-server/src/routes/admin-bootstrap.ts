import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "@workspace/db";

const router: IRouter = Router();

// One-shot, idempotent bootstrap to seed the canonical SecureProfit users
// (Site Admin + Principals + standard delivery users) into a fresh production
// database. Gated by the BOOTSTRAP_TOKEN env var; safe to call repeatedly.
// Remove this route after the production data is seeded.
router.post("/bootstrap-users", async (req, res) => {
  const expected = process.env["BOOTSTRAP_TOKEN"];
  if (!expected) {
    res.status(503).json({ error: "BOOTSTRAP_TOKEN not configured" });
    return;
  }
  const provided = req.header("X-Bootstrap-Token");
  if (provided !== expected) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const passwordHash = await bcrypt.hash("password123", 10);

  const principalSeed = [
    { email: "principal.kon.h7q4@itsecasia.com", name: "Bayu Prasetyo",        role: "PRINCIPAL_KONSULTAN" as const,         title: "Principal Consultant" },
    { email: "principal.tw.m9k2@itsecasia.com",  name: "Indah Kusumawardani",  role: "PRINCIPAL_TECHNICAL_WRITER" as const,  title: "Principal Technical Writer" },
    { email: "principal.ap.r3n8@itsecasia.com",  name: "Fajar Nugroho",        role: "PRINCIPAL_ADMIN_PROJECT" as const,     title: "Principal Admin Project" },
  ];
  const standardSeed = [
    { email: "siteadmin@secureprofit.id",  name: "Rina Kartika",     role: "SITE_ADMIN" as const,        title: "Site Administrator", dailyRate: null as number | null },
    { email: "management@secureprofit.id", name: "Adi Wibowo",       role: "MANAGEMENT" as const,        title: "PMO Director",       dailyRate: null },
    { email: "pm@secureprofit.id",         name: "Sari Pratiwi",     role: "PROJECT_MANAGER" as const,   title: "Project Manager",    dailyRate: null },
    { email: "sales@secureprofit.id",      name: "Budi Santoso",     role: "SALES" as const,             title: "Sales Lead",         dailyRate: null },
    { email: "konsultan@secureprofit.id",  name: "Rian Hidayat",     role: "KONSULTAN" as const,         title: "Senior Security Consultant", dailyRate: 1800000 },
    { email: "konsultan2@secureprofit.id", name: "Dewi Lestari",     role: "KONSULTAN" as const,         title: "Penetration Tester", dailyRate: 1700000 },
    { email: "writer@secureprofit.id",     name: "Ayu Wulandari",    role: "TECHNICAL_WRITER" as const,  title: "Technical Writer",   dailyRate: 1200000 },
    { email: "admin@secureprofit.id",      name: "Tono Setiawan",    role: "ADMIN_PROJECT" as const,     title: "Project Administrator", dailyRate: null },
  ];

  const created: string[] = [];
  const skipped: string[] = [];
  const passwordReset: string[] = [];
  const reset = req.query["resetPasswords"] === "1";

  for (const u of principalSeed) {
    const existing = await prisma.user.findUnique({ where: { email: u.email }, select: { id: true } });
    if (existing) {
      if (reset) {
        await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
        passwordReset.push(u.email);
      }
      skipped.push(u.email);
      continue;
    }
    await prisma.user.create({ data: { ...u, passwordHash, isActive: true } });
    created.push(u.email);
  }

  // Refetch principals to wire principalId on delivery users.
  const principals = await prisma.user.findMany({
    where: { role: { in: ["PRINCIPAL_KONSULTAN", "PRINCIPAL_TECHNICAL_WRITER", "PRINCIPAL_ADMIN_PROJECT"] } },
    select: { id: true, role: true },
  });
  const byRole = new Map(principals.map((p) => [p.role as string, p.id]));

  for (const u of standardSeed) {
    const existing = await prisma.user.findUnique({ where: { email: u.email }, select: { id: true, principalId: true } });
    let principalId: string | null = null;
    if (u.role === "KONSULTAN") principalId = byRole.get("PRINCIPAL_KONSULTAN") ?? null;
    if (u.role === "TECHNICAL_WRITER") principalId = byRole.get("PRINCIPAL_TECHNICAL_WRITER") ?? null;
    if (u.role === "ADMIN_PROJECT") principalId = byRole.get("PRINCIPAL_ADMIN_PROJECT") ?? null;

    if (existing) {
      // Only fill principalId when it's missing; never overwrite or rename users.
      if (principalId && !existing.principalId) {
        await prisma.user.update({ where: { id: existing.id }, data: { principalId } });
      }
      if (reset) {
        await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
        passwordReset.push(u.email);
      }
      skipped.push(u.email);
      continue;
    }
    await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        role: u.role,
        title: u.title,
        passwordHash,
        isActive: true,
        ...(u.dailyRate != null ? { dailyRate: u.dailyRate } : {}),
        ...(principalId ? { principalId } : {}),
      },
    });
    created.push(u.email);
  }

  req.log.info({ created, skipped, passwordReset }, "bootstrap-users completed");
  res.json({
    ok: true,
    created,
    skipped,
    passwordReset,
    note: "All passwords set to 'password123' for newly created users. Use ?resetPasswords=1 to reset existing.",
  });
});

export default router;
