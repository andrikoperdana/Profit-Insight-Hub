import { describe, expect, it } from "vitest";
import { resolveMilestoneAmount, sumAmounts } from "../billing-facts.js";

describe("resolveMilestoneAmount", () => {
  it("prefers the explicit amount when present", () => {
    expect(resolveMilestoneAmount({ amount: 1000, percentage: 50, contractValue: 10_000 })).toBe(1000);
  });

  it("falls back to percentage of contract value", () => {
    expect(resolveMilestoneAmount({ amount: null, percentage: 30, contractValue: 10_000 })).toBe(3000);
  });

  it("treats a missing percentage as zero", () => {
    expect(resolveMilestoneAmount({ amount: null, percentage: null, contractValue: 10_000 })).toBe(0);
  });

  it("keeps an explicit zero amount (no percentage fallback)", () => {
    expect(resolveMilestoneAmount({ amount: 0, percentage: 50, contractValue: 10_000 })).toBe(0);
  });
});

describe("sumAmounts", () => {
  it("sums every row without any cap (regression: totals were computed from capped query results)", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ amount: i + 1 }));
    expect(sumAmounts(rows)).toBe((500 * 501) / 2);
  });

  it("returns 0 for an empty list", () => {
    expect(sumAmounts([])).toBe(0);
  });
});
