import { prisma } from "@workspace/db";

/**
 * Allocate the next sequential project ID for the given year in the format
 * PRJ/YYYY/NNN. The sequence resets annually and is scanned from existing
 * Project.projectId values sharing the same year prefix.
 *
 * This is a scan-then-increment, so callers MUST write the returned value
 * under the Project.projectId unique constraint and retry on P2002 — never
 * assume the returned value is still free.
 */
export async function nextProjectId(date: Date): Promise<string> {
  const year = date.getUTCFullYear();
  const prefix = `PRJ/${year}/`;
  const existing = await prisma.project.findMany({
    where: { projectId: { startsWith: prefix } },
    select: { projectId: true },
  });
  let max = 0;
  for (const row of existing) {
    const suffix = row.projectId?.slice(prefix.length) ?? "";
    const n = parseInt(suffix, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
