/**
 * One-time backfill: assign PRJ/YYYY/NNN project IDs to all existing projects
 * that don't have one yet. Uses the project's createdAt year to keep numbering
 * consistent with when the project was created.
 *
 * Run with: npx tsx src/scripts/backfill-project-ids.ts
 */
import { prisma } from "@workspace/db";

async function main() {
  // Load all projects without a projectId, ordered by createdAt so the IDs
  // are allocated in chronological order per year.
  const projects = await prisma.project.findMany({
    where: { projectId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, code: true, createdAt: true },
  });

  console.log(`Found ${projects.length} projects without a Project ID.`);
  if (projects.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  // Scan existing projectIds to find current max per year.
  const existingIds = await prisma.project.findMany({
    where: { projectId: { not: null } },
    select: { projectId: true },
  });
  const maxByYear: Record<number, number> = {};
  for (const row of existingIds) {
    const match = row.projectId?.match(/^PRJ\/(\d{4})\/(\d+)$/);
    if (match) {
      const year = parseInt(match[1], 10);
      const seq = parseInt(match[2], 10);
      if (!maxByYear[year] || seq > maxByYear[year]) maxByYear[year] = seq;
    }
  }

  let assigned = 0;
  for (const p of projects) {
    const year = p.createdAt.getUTCFullYear();
    const next = (maxByYear[year] ?? 0) + 1;
    maxByYear[year] = next;
    const projectId = `PRJ/${year}/${String(next).padStart(3, "0")}`;
    await prisma.project.update({
      where: { id: p.id },
      data: { projectId },
    });
    console.log(`  ${p.name}: ${projectId}`);
    assigned++;
  }

  console.log(`\nDone. Assigned ${assigned} Project IDs.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
