import { prisma } from "@workspace/db";

/**
 * Validates that `workstreamId` (if provided) belongs to `projectId`.
 *
 * Returns:
 *   - `{ ok: true, workstreamId: null }` — caller passed undefined/null/empty (no workstream)
 *   - `{ ok: true, workstreamId: string }` — workstream exists and matches the project
 *   - `{ ok: false, error: string }` — caller passed a value but it's invalid
 *
 * Callers should treat undefined as "do not change" on PATCH paths; this helper
 * normalises both undefined and "" to null so it's safe to forward to Prisma.
 */
export async function validateWorkstreamId(
  projectId: string,
  workstreamId: unknown,
): Promise<{ ok: true; workstreamId: string | null } | { ok: false; error: string }> {
  if (workstreamId === undefined || workstreamId === null || workstreamId === "") {
    return { ok: true, workstreamId: null };
  }
  if (typeof workstreamId !== "string") {
    return { ok: false, error: "workstreamId must be a string" };
  }
  const ws = await prisma.projectWorkstream.findUnique({
    where: { id: workstreamId },
    select: { projectId: true },
  });
  if (!ws) {
    return { ok: false, error: "workstream not found" };
  }
  if (ws.projectId !== projectId) {
    return { ok: false, error: "workstream does not belong to this project" };
  }
  return { ok: true, workstreamId };
}
