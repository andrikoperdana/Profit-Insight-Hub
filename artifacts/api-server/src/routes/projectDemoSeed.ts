import { Router, type IRouter } from "express";
import { prisma, type ProjectStatus } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { recordAudit } from "../lib/audit.js";
import { nextProjectId } from "../lib/projectIds.js";

const router: IRouter = Router();
router.use(requireAuth);

// One-time demo seed (MANAGEMENT only) — adds 9 sample projects
// across OBSERVATION/ACTIVE/PAUSE. Idempotent: skips codes that already exist.
const DEMO_PROJECTS: { status: ProjectStatus; name: string; value: number; mandays: number }[] = [
  { status: "OBSERVATION", name: "Initial Cyber Risk Assessment", value: 320_000_000, mandays: 35 },
  { status: "OBSERVATION", name: "Pre-Sales Penetration Test", value: 280_000_000, mandays: 28 },
  { status: "OBSERVATION", name: "Employee Awareness Workshop", value: 180_000_000, mandays: 18 },
  { status: "ACTIVE",      name: "SOC Tier-1 Implementation", value: 850_000_000, mandays: 90 },
  { status: "ACTIVE",      name: "ISO 27001 Audit Stage 2", value: 620_000_000, mandays: 70 },
  { status: "ACTIVE",      name: "Mobile Application Penetration Test", value: 480_000_000, mandays: 55 },
  { status: "PAUSE",       name: "Splunk SIEM Migration", value: 920_000_000, mandays: 110 },
  { status: "PAUSE",       name: "Cloud Infrastructure Hardening", value: 540_000_000, mandays: 60 },
  { status: "PAUSE",       name: "IT Security Policy Review", value: 240_000_000, mandays: 28 },
];

router.post("/projects/seed-demo", requireRole("MANAGEMENT"), async (req, res) => {
  const clients = await prisma.client.findMany({ take: 4, orderBy: { createdAt: "asc" } });
  const pm = await prisma.user.findFirst({ where: { role: "PROJECT_MANAGER" } });
  const sales = await prisma.user.findFirst({ where: { role: "SALES" } });
  if (!clients.length || !pm || !sales) {
    res.status(400).json({ error: "Seed prerequisites missing (clients/PM/Sales)" });
    return;
  }
  const last = await prisma.project.findFirst({
    where: { code: { startsWith: "SPH-2026-" } },
    orderBy: { code: "desc" },
  });
  let nextNum = 1;
  if (last?.code) {
    const m = last.code.match(/SPH-2026-(\d+)/);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }
  const consultants = await prisma.user.findMany({
    where: { role: { in: ["KONSULTAN", "TECHNICAL_WRITER"] } },
  });
  const today = new Date();
  const created: string[] = [];
  const skipped: string[] = [];
  let resourcesCreated = 0;
  for (let i = 0; i < DEMO_PROJECTS.length; i += 1) {
    const p = DEMO_PROJECTS[i];
    const exists = await prisma.project.findFirst({ where: { name: p.name, status: p.status } });
    if (exists) { skipped.push(p.name); continue; }
    const code = `SPH-2026-${String(nextNum).padStart(3, "0")}`;
    nextNum += 1;
    const client = clients[i % clients.length];
    const startOffset = p.status === "OBSERVATION" ? 30 : p.status === "ACTIVE" ? -20 : -45;
    const startDate = new Date(today.getTime() + startOffset * 86400000);
    const endDate = new Date(startDate.getTime() + p.mandays * 86400000);
    let project: Awaited<ReturnType<typeof prisma.project.create>> | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const projectIdVal = await nextProjectId(new Date());
      try {
        project = await prisma.project.create({
          data: {
            projectId: projectIdVal,
            code,
            name: p.name,
            description: `${p.name} for ${client.name}.`,
            status: p.status,
            clientId: client.id,
            salesId: sales.id,
            pmId: pm.id,
            startDate,
            endDate,
            contractValue: p.value,
            estimatedCost: Math.round(p.value * 0.55),
            plannedMandays: p.mandays,
          },
        });
        break; // success
      } catch (e: unknown) {
        const pe = e as { code?: string };
        if (pe?.code === "P2002" && attempt < 4) continue;
        throw e;
      }
    }
    if (!project) { skipped.push(p.name); continue; }
    created.push(project.projectId ?? project.code ?? project.id);

    // Assign PM + 2 consultants for ACTIVE/PAUSE; just PM for OBSERVATION
    const assignments: { userId: string; role: string; share: number; rate: number }[] = [
      { userId: pm.id, role: "Project Manager", share: 0.2, rate: 2_500_000 },
    ];
    if (p.status !== "OBSERVATION" && consultants.length > 0) {
      const c1 = consultants[i % consultants.length];
      const c2 = consultants[(i + 1) % consultants.length];
      assignments.push({ userId: c1.id, role: "Lead Consultant", share: 0.5, rate: 1_800_000 });
      if (c2.id !== c1.id) {
        assignments.push({ userId: c2.id, role: "Consultant", share: 0.3, rate: 1_500_000 });
      }
    }
    for (const a of assignments) {
      await prisma.projectResource.create({
        data: {
          projectId: project.id,
          userId: a.userId,
          roleInProject: a.role,
          plannedMandays: Math.round(p.mandays * a.share),
          dailyRate: a.rate,
        },
      });
      resourcesCreated += 1;
    }
  }
  await recordAudit(req, {
    action: "project.seed_demo",
    entityType: "Project",
    description: `Seeded ${created.length} demo projects (${resourcesCreated} resource assignments)`,
    after: { created, skipped, resourcesCreated },
  });
  res.json({ ok: true, created, skipped, resourcesCreated });
});

export default router;
