import { prisma } from "@workspace/db";

async function main() {
  const pm = await prisma.user.findFirst({ where: { role: "PROJECT_MANAGER" } });
  if (!pm) {
    console.error("ERROR: no PROJECT_MANAGER user found — cannot assign resources.");
    process.exit(1);
  }
  const consultants = await prisma.user.findMany({ where: { role: { in: ["KONSULTAN", "TECHNICAL_WRITER"] } } });
  const projects = await prisma.project.findMany({
    where: { status: { in: ["OBSERVATION", "ACTIVE", "PAUSE"] } },
    orderBy: { createdAt: "asc" },
  });
  let added = 0;
  for (let i = 0; i < projects.length; i += 1) {
    const p = projects[i];
    const existing = await prisma.projectResource.count({ where: { projectId: p.id } });
    if (existing > 0) { console.log(`  - ${p.code}: skip (${existing} resources already)`); continue; }
    const md = p.plannedMandays ?? 30;
    const assignments = [
      { userId: pm.id, role: "Project Manager", share: 0.2, rate: 2_500_000 },
    ];
    if (p.status !== "OBSERVATION" && consultants.length > 0) {
      const c1 = consultants[i % consultants.length];
      const c2 = consultants[(i + 1) % consultants.length];
      assignments.push({ userId: c1.id, role: "Lead Consultant", share: 0.5, rate: 1_800_000 });
      if (c2.id !== c1.id) assignments.push({ userId: c2.id, role: "Consultant", share: 0.3, rate: 1_500_000 });
    }
    for (const a of assignments) {
      await prisma.projectResource.create({
        data: { projectId: p.id, userId: a.userId, roleInProject: a.role, plannedMandays: Math.round(md * a.share), dailyRate: a.rate },
      });
      added += 1;
    }
    console.log(`  + ${p.code} [${p.status}] ← ${assignments.length} resources`);
  }
  console.log(`Done. Added ${added} project resources.`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
