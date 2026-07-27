import { describe, it, expect, vi } from "vitest";

// email.ts imports prisma at module load; stub it since these tests only
// exercise pure helpers (no DB access).
vi.mock("@workspace/db", () => ({ prisma: {} }));

import { isEmailEligible, shouldEmailNotification, EMAIL_NOTIFICATION_TYPES } from "../email.js";

describe("isEmailEligible", () => {
  it("accepts a well-formed real address", () => {
    expect(isEmailEligible("budi.santoso@itsecasia.com")).toBe(true);
    expect(isEmailEligible("pm@secureprofit.id")).toBe(true);
  });

  it("rejects empty / missing values", () => {
    expect(isEmailEligible(null)).toBe(false);
    expect(isEmailEligible(undefined)).toBe(false);
    expect(isEmailEligible("")).toBe(false);
  });

  it("rejects malformed addresses", () => {
    expect(isEmailEligible("not-an-email")).toBe(false);
    expect(isEmailEligible("missing@domain")).toBe(false);
    expect(isEmailEligible("@nolocal.com")).toBe(false);
    expect(isEmailEligible("spaces in@email.co")).toBe(false);
  });

  it("rejects placeholder / test domains (case-insensitive)", () => {
    expect(isEmailEligible("user@example.com")).toBe(false);
    expect(isEmailEligible("user@test.com")).toBe(false);
    expect(isEmailEligible("user@localhost")).toBe(false);
    expect(isEmailEligible("User@Example.com")).toBe(false);
  });
});

describe("shouldEmailNotification", () => {
  it("includes only the important notification types", () => {
    for (const t of [
      "timesheet.submitted",
      "timesheet.approved",
      "timesheet.rejected",
      "expense.rejected",
      "INVOICE_DUE_SOON",
      "PROJECT_OVERRUN",
      "LOW_MARGIN",
      "WEEKLY_DIGEST",
    ]) {
      expect(shouldEmailNotification(t)).toBe(true);
    }
  });

  it("excludes non-important types", () => {
    for (const t of [
      "report.submitted",
      "project.assigned_writer",
      "project.assigned_admin",
      "RESOURCE_APPROVAL_PENDING",
      "RESOURCE_APPROVAL_DECIDED",
      "TIMESHEET_LATE",
      "TIMESHEET_LATE_REPORT",
      "LEAD_FOLLOWUP_OVERDUE",
    ]) {
      expect(shouldEmailNotification(t)).toBe(false);
    }
  });

  it("has exactly the expected set size", () => {
    expect(EMAIL_NOTIFICATION_TYPES.size).toBe(8);
  });
});
