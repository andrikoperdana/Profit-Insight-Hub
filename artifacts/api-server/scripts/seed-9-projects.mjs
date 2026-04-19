import { prisma } from "@workspace/db";

const PROJECTS = [
  { status: "OBSERVATION", name: "Penilaian Risiko Cyber Awal", value: 320_000_000, mandays: 35 },
  { status: "OBSERVATION", name: "Pre-Sales Penetration Test", value: 280_000_000, mandays: 28 },
  { status: "OBSERVATION", name: "Workshop Awareness Karyawan", value: 180_000_000, mandays: 18 },
  { status: "ACTIVE",      name: "Implementasi SOC Tier-1",     value: 850_000_000, mandays: 90 },
  { status: "ACTIVE",      name: "Audit ISO 27001 Tahap 2",     value: 620_000_000, mandays: 70 },
  { status: "ACTIVE",      name: "Penetration Test Aplikasi Mobile", value: 480_000_000, mandays: 55 },
  { status: "PAUSE",       name: "Migrasi SIEM Splunk",         value: 920_000_000, mandays: 110 },
  { status: "PAUSE",       name: "Hardening Infrastruktur Cloud", value: 540_000_000, mandays: 60 },
  { status: "PAUSE",       name: "Review Kebijakan Keamanan TI", value: 240_000_000, mandays: 28 },
];

async function main() {
  const clients = await prisma.client.findMany({ take: 4, orderBy: { createdAt: "asc" } });
  const pm = await prisma.user.findFirst({ where: { role: "PROJECT_MANAGER" } });
  const sales = await prisma.user.findFirst({ where: { role: "SALES" } });
  if (!clients.length || !pm || !sales) {
    console.error("Missing seed data: need clients + PM + Sales users");
    process.exit(1);
  }

  const last = await prisma.project.findFirst({
    where: { code: { startsWith: "SPH-2026-" } },
    orderBy: { code: "desc" },
  });
  let nextNum = 5;
  if (last) {
    const m = last.code.match(/SPH-2026-(\d+)/);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }

  const today = new Date();
  for (let i = 0; i < PROJECTS.length; i += 1) {
    const p = PROJECTS[i];
    const code = `SPH-2026-${String(nextNum + i).padStart(3, "0")}`;
    const client = clients[i % clients.length];
    const startOffset = p.status === "OBSERVATION" ? 30 : p.status === "ACTIVE" ? -20 : -45;
    const startDate = new Date(today.getTime() + startOffset * 86400000);
    const endDate = new Date(startDate.getTime() + p.mandays * 86400000);
    const created = await prisma.project.create({
      data: {
        code,
        name: p.name,
        description: `${p.name} untuk ${client.name}.`,
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
    console.log(`  + ${created.code} [${created.status}] ${created.name}`);
  }

  const counts = await prisma.project.groupBy({ by: ["status"], _count: true });
  console.log("Totals:", counts);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
