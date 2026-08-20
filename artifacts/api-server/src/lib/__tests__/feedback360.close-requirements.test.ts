import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  surveyCount: vi.fn(),
  feedbackCount: vi.fn(),
  projectFindUnique: vi.fn(),
}));

vi.mock("@workspace/db", () => ({
  prisma: {
    surveyResponse: { count: mocks.surveyCount },
    projectFeedback360: { count: mocks.feedbackCount },
    project: { findUnique: mocks.projectFindUnique },
  },
}));

const {
  checkCloseRequirements,
  getCloseReadiness,
  projectCloseReadinessWhere,
} = await import(
  "../feedback360.js"
);

describe("CLIENT close requirements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.surveyCount.mockResolvedValue(0);
    mocks.feedbackCount.mockImplementation(async ({ where }: any) =>
      where.status === "PENDING" ? 0 : 2,
    );
    mocks.projectFindUnique.mockResolvedValue({
      csatWaivedAt: null,
      csatWaiverReason: null,
      csatWaivedBy: null,
    });
  });

  it("blocks closing without a CSAT response or waiver", async () => {
    const missing = await checkCloseRequirements("project-1", "CLIENT");
    expect(missing).toEqual([
      "At least one client satisfaction survey response must be received or waived by Management",
    ]);
  });

  it("accepts a real CSAT response", async () => {
    mocks.surveyCount.mockResolvedValue(1);
    const readiness = await getCloseReadiness("project-1", "CLIENT");
    expect(readiness.csatSatisfied).toBe(true);
    expect(await checkCloseRequirements("project-1", "CLIENT")).toEqual([]);
  });

  it("accepts an active Management waiver", async () => {
    mocks.projectFindUnique.mockResolvedValue({
      csatWaivedAt: new Date("2026-08-20T00:00:00.000Z"),
      csatWaiverReason: "Client did not respond after repeated follow-up.",
      csatWaivedBy: { id: "mgmt-1", name: "Management User" },
    });
    const readiness = await getCloseReadiness("project-1", "CLIENT");
    expect(readiness.csatSatisfied).toBe(true);
    expect(readiness.csatWaived).toBe(true);
    expect(await checkCloseRequirements("project-1", "CLIENT")).toEqual([]);
  });

  it("still blocks closing while any 360 feedback is pending", async () => {
    mocks.surveyCount.mockResolvedValue(1);
    mocks.feedbackCount.mockImplementation(async ({ where }: any) =>
      where.status === "PENDING" ? 1 : 2,
    );
    expect(await checkCloseRequirements("project-1", "CLIENT")).toEqual([
      "All 360 feedback must be submitted (1 still pending)",
    ]);
  });

  it("exempts non-client projects from CSAT without weakening 360 feedback", async () => {
    mocks.feedbackCount.mockImplementation(async ({ where }: any) =>
      where.status === "PENDING" ? 2 : 3,
    );
    const readiness = await getCloseReadiness("project-1", "INTERNAL");
    expect(readiness.csatRequired).toBe(false);
    expect(readiness.csatSatisfied).toBe(true);
    expect(await checkCloseRequirements("project-1", "INTERNAL")).toEqual([
      "All 360 feedback must be submitted (2 still pending)",
    ]);
  });

  it("builds an atomic CLIENT close predicate with every applicable gate", () => {
    expect(projectCloseReadinessWhere("project-1", "CLIENT")).toEqual({
      AND: [
        {
          id: "project-1",
          status: "COMPLETE",
          archivedAt: null,
          deletedAt: null,
        },
        { feedback360: { none: { status: "PENDING" } } },
        { closingChecklist: { some: {} } },
        { closingChecklist: { none: { status: "PENDING" } } },
        {
          OR: [
            { surveyResponses: { some: {} } },
            { csatWaivedAt: { not: null } },
          ],
        },
      ],
    });
  });
});