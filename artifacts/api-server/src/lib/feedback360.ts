import { prisma, type Prisma } from "@workspace/db";

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

export type CloseReadiness = {
  csatRequired: boolean;
  csatResponseCount: number;
  csatSatisfied: boolean;
  csatWaived: boolean;
  csatWaiver: {
    waivedAt: Date;
    reason: string | null;
    waivedBy: { id: string; name: string } | null;
  } | null;
  feedback360Total: number;
  feedback360Submitted: number;
  feedback360Pending: number;
  feedback360Satisfied: boolean;
};

/**
 * Relational predicates that must still be true at the exact moment a project
 * is changed to CLOSED. Callers use this in a conditional updateMany so
 * project-row races such as a concurrent waiver removal are re-evaluated by
 * PostgreSQL before the status update succeeds.
 */
export function projectCloseReadinessWhere(
  projectId: string,
  kind: string,
  options: { requireChecklist?: boolean } = {},
): Prisma.ProjectWhereInput {
  const requireChecklist = options.requireChecklist !== false;
  const conditions: Prisma.ProjectWhereInput[] = [
    {
      id: projectId,
      status: "COMPLETE",
      archivedAt: null,
      deletedAt: null,
    },
    { feedback360: { none: { status: "PENDING" } } },
  ];

  if (requireChecklist) {
    conditions.push(
      { closingChecklist: { some: {} } },
      { closingChecklist: { none: { status: "PENDING" } } },
    );
  }
  if (kind === "CLIENT") {
    conditions.push({
      OR: [
        { surveyResponses: { some: {} } },
        { csatWaivedAt: { not: null } },
      ],
    });
  }

  return { AND: conditions };
}

/**
 * One source of truth for the non-checklist requirements used by both the
 * close-transition gate and the web Closing/Survey tabs.
 */
export async function getCloseReadiness(
  projectId: string,
  kind: string,
): Promise<CloseReadiness> {
  const csatRequired = kind === "CLIENT";
  const [csatResponseCount, feedback360Pending, feedback360Total, waiverProject] =
    await Promise.all([
      csatRequired
        ? prisma.surveyResponse.count({ where: { projectId } })
        : Promise.resolve(0),
      prisma.projectFeedback360.count({
        where: { projectId, status: "PENDING" },
      }),
      prisma.projectFeedback360.count({ where: { projectId } }),
      csatRequired
        ? prisma.project.findUnique({
            where: { id: projectId },
            select: {
              csatWaivedAt: true,
              csatWaiverReason: true,
              csatWaivedBy: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve(null),
    ]);

  const csatWaived = !!waiverProject?.csatWaivedAt;
  return {
    csatRequired,
    csatResponseCount,
    csatSatisfied: !csatRequired || csatResponseCount > 0 || csatWaived,
    csatWaived,
    csatWaiver: waiverProject?.csatWaivedAt
      ? {
          waivedAt: waiverProject.csatWaivedAt,
          reason: waiverProject.csatWaiverReason,
          waivedBy: waiverProject.csatWaivedBy,
        }
      : null,
    feedback360Total,
    feedback360Submitted: feedback360Total - feedback360Pending,
    feedback360Pending,
    feedback360Satisfied: feedback360Pending === 0,
  };
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
  const readiness = await getCloseReadiness(projectId, kind);
  if (!readiness.csatSatisfied) {
    missing.push(
      "At least one client satisfaction survey response must be received or waived by Management",
    );
  }
  if (!readiness.feedback360Satisfied) {
    missing.push(
      `All 360 feedback must be submitted (${readiness.feedback360Pending} still pending)`,
    );
  }
  return missing;
}
