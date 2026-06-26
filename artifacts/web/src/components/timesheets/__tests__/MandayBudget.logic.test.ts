import { describe, it, expect } from "vitest";
import {
  wouldExceedPlan,
  countCumulativeOverPlan,
  type MandayRow,
} from "../MandayBudget.logic";

describe("wouldExceedPlan", () => {
  it("never alerts when there is no positive plan", () => {
    expect(wouldExceedPlan(10, null, 8)).toBe(false);
    expect(wouldExceedPlan(10, 0, 8)).toBe(false);
    expect(wouldExceedPlan(10, undefined, 8)).toBe(false);
  });

  it("stays within plan when the pending row fits", () => {
    expect(wouldExceedPlan(5, 10, 8)).toBe(false); // 5 + 1 = 6 <= 10
  });

  it("treats landing exactly on plan as not exceeding", () => {
    expect(wouldExceedPlan(9, 10, 8)).toBe(false); // 9 + 1 = 10, not > 10
  });

  it("alerts when the pending row crosses the plan", () => {
    expect(wouldExceedPlan(9.5, 10, 8)).toBe(true); // 9.5 + 1 = 10.5 > 10
  });

  it("treats a missing consumed value as zero", () => {
    expect(wouldExceedPlan(null, 1, 8)).toBe(false); // 0 + 1 = 1, not > 1
    expect(wouldExceedPlan(undefined, 0.5, 8)).toBe(true); // 0 + 1 = 1 > 0.5
  });
});

describe("countCumulativeOverPlan", () => {
  const row = (over: Partial<MandayRow>): MandayRow => ({
    projectId: "p1",
    userId: "u1",
    hours: 8,
    userConsumedMandays: 0,
    userPlannedMandays: null,
    projectConsumedMandays: 0,
    projectPlannedMandays: null,
    ...over,
  });

  it("returns 0 for an empty batch", () => {
    expect(countCumulativeOverPlan([])).toBe(0);
  });

  it("does not flag rows when no plan exists", () => {
    expect(countCumulativeOverPlan([row({}), row({})])).toBe(0);
  });

  it("flags a single row that individually crosses the project plan", () => {
    // project plan 10, baseline 9.5, one 8h row -> 10.5 > 10
    const r = row({ projectPlannedMandays: 10, projectConsumedMandays: 9.5 });
    expect(countCumulativeOverPlan([r])).toBe(1);
  });

  it("flags cumulative over-plan even when each row is individually safe", () => {
    // project plan 10, baseline 9.0; two 6h rows each project to 9.75 (<=10)
    // individually, but together reach 10.5 (>10): the second row is flagged.
    const base = row({ hours: 6, projectPlannedMandays: 10, projectConsumedMandays: 9.0 });
    expect(countCumulativeOverPlan([{ ...base }, { ...base }])).toBe(1);
  });

  it("accumulates per (project,user) for the person plan too", () => {
    // user plan 1.5 md, baseline 0; two 8h rows -> 1.0 then 2.0 md.
    const r = row({ userPlannedMandays: 1.5, userConsumedMandays: 0, hours: 8 });
    expect(countCumulativeOverPlan([{ ...r }, { ...r }])).toBe(1);
  });

  it("keeps separate projects from cross-contaminating", () => {
    // each project is exactly on its plan (1.0 == 1), so neither is over.
    const a = row({ projectId: "pa", projectPlannedMandays: 1, projectConsumedMandays: 0 });
    const b = row({ projectId: "pb", projectPlannedMandays: 1, projectConsumedMandays: 0 });
    expect(countCumulativeOverPlan([a, b])).toBe(0);
  });
});
