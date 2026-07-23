import { prisma } from "@workspace/db";

/**
 * F6 — 360 feedback pairs, auto-created when a project reaches COMPLETE.
 *
 * Pairs: the assigned PM reviews each accepted delivery resource, and each
 * accepted delivery resource reviews the PM. Idempotent via createMany
 * skipDuplicates on @@unique([projectId, reviewerId, subjectId]) so a repeat
 * COMPLETE transition (COMPLETE -> PAUSE -> COMPLETE) never duplicates rows,
 * while newly staffed members get pairs added on the next transition.
 */
export async function createFeedback360PairsIfMissing(
  projectId: string,
): Promise<{ created: number; reviewerIds: string[] }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      pmId: true,
      resources: {
        where: { acceptedAt: { not: null } },
        select: { userId: true },
      },
    },
  });
  if (!project?.pmId) return { created: 0, reviewerIds: [] };
  const pmId = project.pmId;
  const memberIds = Array.from(
    new Set(project.resources.map((r) => r.userId).filter((id) => id && id !== pmId)),
  );
  if (memberIds.length === 0) return { created: 0, reviewerIds: [] };

  const rows: { projectId: string; reviewerId: string; subjectId: string }[] = [];
  for (const memberId of memberIds) {
    rows.push({ projectId, reviewerId: pmId, subjectId: memberId });
    rows.push({ projectId, reviewerId: memberId, subjectId: pmId });
  }
  const result = await prisma.projectFeedback360.createMany({
    data: rows,
    skipDuplicates: true,
  });
  return { created: result.count, reviewerIds: [pmId, ...memberIds] };
}

/**
 * F6 — extra CLOSED-transition requirements on top of the closing checklist.
 * Returns human-readable blockers ([] when the project may close):
 *  - CLIENT projects need at least one client satisfaction survey response.
 *  - Every 360 feedback entry must be SUBMITTED (projects with no entries
 *    pass — e.g. projects completed before this feature existed).
 */
export async function checkCloseRequirements(
  projectId: string,
  kind: string,
): Promise<string[]> {
  const missing: string[] = [];
  const [surveyResponses, pending360] = await Promise.all([
    kind === "CLIENT"
      ? prisma.surveyResponse.count({ where: { projectId } })
      : Promise.resolve(-1),
    prisma.projectFeedback360.count({ where: { projectId, status: "PENDING" } }),
  ]);
  if (surveyResponses === 0) {
    missing.push("At least one client satisfaction survey response must be received");
  }
  if (pending360 > 0) {
    missing.push(`All 360 feedback must be submitted (${pending360} still pending)`);
  }
  return missing;
}
