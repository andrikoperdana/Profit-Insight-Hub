import { describe, it, expect } from "vitest";
import { computeMetrics } from "../serializers.js";

// F2 — per-period cost rates. computeMetrics prices each APPROVED timesheet
// with the newest ProjectResourceRate whose effectiveFrom <= workDate;
// timesheets before the earliest period (or resources with no history at all)
// fall back to the resource's denormalized dailyRate.

function baseProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    contractValue: 100_000_000,
    estimatedCost: 10_000_000,
    plannedMandays: 10,
    startDate: new Date("2026-07-01"),
    endDate: new Date("2026-08-31"),
    status: "ACTIVE",
    kind: "CLIENT",
    vatPercent: 11,
    contractValueIncludesVat: true,
    currency: "IDR",
    exchangeRate: 1,
    resources: [],
    timesheets: [],
    expenses: [],
    tasks: [],
    billingMilestones: [],
    ...overrides,
  } as any;
}

function ts(userId: string, workDate: string, hours = 8, status = "APPROVED") {
  return {
    userId,
    workDate: new Date(workDate),
    hours,
    status,
    user: { dailyRate: 0 },
  };
}

describe("computeMetrics rate periods (F2)", () => {
  it("uses the denormalized dailyRate when a resource has no history", () => {
    const m = computeMetrics(
      baseProject({
        resources: [{ userId: "u1", dailyRate: 1_000_000, rates: [] }],
        timesheets: [ts("u1", "2026-07-10")],
      }),
    );
    expect(m.resourceCost).toBe(1_000_000);
    expect(m.actualMandays).toBe(1);
  });

  it("prices a timesheet with the newest period whose effectiveFrom <= workDate", () => {
    const m = computeMetrics(
      baseProject({
        resources: [
          {
            userId: "u1",
            dailyRate: 3_000_000, // synced to newest period, must NOT be used for old dates
            rates: [
              { costRate: 2_000_000, effectiveFrom: new Date("2026-07-01") },
              { costRate: 3_000_000, effectiveFrom: new Date("2026-07-15") },
            ],
          },
        ],
        timesheets: [
          ts("u1", "2026-07-10"), // inside first period -> 2,000,000
          ts("u1", "2026-07-20"), // inside second period -> 3,000,000
        ],
      }),
    );
    expect(m.resourceCost).toBe(5_000_000);
  });

  it("falls back to dailyRate for dates before the earliest period", () => {
    const m = computeMetrics(
      baseProject({
        resources: [
          {
            userId: "u1",
            dailyRate: 1_000_000,
            rates: [{ costRate: 2_000_000, effectiveFrom: new Date("2026-07-15") }],
          },
        ],
        timesheets: [ts("u1", "2026-07-10")],
      }),
    );
    expect(m.resourceCost).toBe(1_000_000);
  });

  it("a work date exactly on effectiveFrom uses that period's rate", () => {
    const m = computeMetrics(
      baseProject({
        resources: [
          {
            userId: "u1",
            dailyRate: 1_000_000,
            rates: [{ costRate: 2_500_000, effectiveFrom: new Date("2026-07-15") }],
          },
        ],
        timesheets: [ts("u1", "2026-07-15")],
      }),
    );
    expect(m.resourceCost).toBe(2_500_000);
  });

  it("uses the user's own dailyRate fallback when the user has no resource row", () => {
    const m = computeMetrics(
      baseProject({
        resources: [],
        timesheets: [
          {
            userId: "ghost",
            workDate: new Date("2026-07-10"),
            hours: 8,
            status: "APPROVED",
            user: { dailyRate: 750_000 },
          },
        ],
      }),
    );
    expect(m.resourceCost).toBe(750_000);
  });

  it("rate periods apply per-user and do not leak across resources", () => {
    const m = computeMetrics(
      baseProject({
        resources: [
          {
            userId: "u1",
            dailyRate: 1_000_000,
            rates: [{ costRate: 2_000_000, effectiveFrom: new Date("2026-07-01") }],
          },
          { userId: "u2", dailyRate: 500_000, rates: [] },
        ],
        timesheets: [ts("u1", "2026-07-10"), ts("u2", "2026-07-10")],
      }),
    );
    expect(m.resourceCost).toBe(2_500_000);
  });

  it("raise-rate-mid-project does not reprice history (baseline row + synced dailyRate)", () => {
    // Mirrors the state the POST /resources/:id/rates route produces when the
    // FIRST period is added mid-project: a baseline row is backfilled at the
    // pre-change rate (from project start) and dailyRate is re-synced to the
    // newest in-effect period. Old timesheets must stay at the old rate.
    const m = computeMetrics(
      baseProject({
        resources: [
          {
            userId: "u1",
            dailyRate: 2_000_000, // synced to the new period
            rates: [
              { costRate: 1_000_000, effectiveFrom: new Date("2026-07-01") }, // baseline
              { costRate: 2_000_000, effectiveFrom: new Date("2026-07-20") }, // raise
            ],
          },
        ],
        timesheets: [
          ts("u1", "2026-07-10"), // before the raise -> old rate 1,000,000
          ts("u1", "2026-07-21"), // after the raise -> 2,000,000
        ],
      }),
    );
    expect(m.resourceCost).toBe(3_000_000);
  });

  it("SUBMITTED timesheets accrue at the period rate but do not hit resourceCost", () => {
    const m = computeMetrics(
      baseProject({
        resources: [
          {
            userId: "u1",
            dailyRate: 1_000_000,
            rates: [{ costRate: 2_000_000, effectiveFrom: new Date("2026-07-01") }],
          },
        ],
        timesheets: [ts("u1", "2026-07-10", 8, "SUBMITTED")],
      }),
    );
    expect(m.resourceCost).toBe(0);
    expect(m.accruedCost).toBe(2_000_000);
  });
});
