import { describe, expect, it } from "vitest";
import {
  isSurveyAvailableStatus,
  isSurveyLinkUnavailable,
} from "../surveyEligibility.js";

const availableProject = {
  deletedAt: null,
  archivedAt: null,
  kind: "CLIENT",
  status: "COMPLETE",
  surveyEnabled: true,
  surveyExpiresAt: null,
};

describe("survey eligibility", () => {
  it.each([
    ["DRAFT", false],
    ["ACTIVE", false],
    ["PAUSE", false],
    ["COMPLETE", true],
    ["CLOSED", true],
  ])("treats %s availability as %s", (status, expected) => {
    expect(isSurveyAvailableStatus(status)).toBe(expected);
  });

  it("allows a valid CLIENT link at COMPLETE and CLOSED", () => {
    expect(isSurveyLinkUnavailable(availableProject)).toBe(false);
    expect(
      isSurveyLinkUnavailable({ ...availableProject, status: "CLOSED" }),
    ).toBe(false);
  });

  it.each([
    ["before COMPLETE", { status: "ACTIVE" }],
    ["archived", { archivedAt: new Date() }],
    ["deleted", { deletedAt: new Date() }],
    ["disabled", { surveyEnabled: false }],
    ["expired", { surveyExpiresAt: new Date(Date.now() - 1_000) }],
    ["non-client", { kind: "INTERNAL" }],
  ])("blocks a link when the project is %s", (_label, override) => {
    expect(
      isSurveyLinkUnavailable({ ...availableProject, ...override }),
    ).toBe(true);
  });
});