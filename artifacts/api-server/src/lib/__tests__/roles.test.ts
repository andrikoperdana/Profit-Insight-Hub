import { describe, it, expect } from "vitest";
import {
  canViewAllProjects,
  canWriteAnyProject,
  isPrincipalRole,
  isDeliveryAssignmentRole,
  isFinanceDocumentRole,
} from "../roles.js";

describe("canViewAllProjects", () => {
  it("allows MANAGEMENT, SITE_ADMIN, FINANCE", () => {
    for (const r of ["MANAGEMENT", "SITE_ADMIN", "FINANCE"]) {
      expect(canViewAllProjects(r)).toBe(true);
    }
  });
  it("denies everyone else", () => {
    for (const r of [
      "PROJECT_MANAGER",
      "SALES",
      "KONSULTAN",
      "TECHNICAL_WRITER",
      "ADMIN_PROJECT",
      "HR",
      "PRINCIPAL_KONSULTAN",
      "PRINCIPAL_TECHNICAL_WRITER",
      "PRINCIPAL_ADMIN_PROJECT",
      "WHO_KNOWS",
      "",
    ]) {
      expect(canViewAllProjects(r)).toBe(false);
    }
    expect(canViewAllProjects(null)).toBe(false);
    expect(canViewAllProjects(undefined)).toBe(false);
  });
});

describe("canWriteAnyProject", () => {
  it("allows MANAGEMENT only — FINANCE is NOT a project owner anymore", () => {
    expect(canWriteAnyProject("MANAGEMENT")).toBe(true);
    expect(canWriteAnyProject("FINANCE")).toBe(false);
    expect(canWriteAnyProject("PROJECT_MANAGER")).toBe(false);
    expect(canWriteAnyProject("SITE_ADMIN")).toBe(false);
    expect(canWriteAnyProject(null)).toBe(false);
  });
});

describe("isPrincipalRole", () => {
  it("matches all three principal variants", () => {
    expect(isPrincipalRole("PRINCIPAL_KONSULTAN")).toBe(true);
    expect(isPrincipalRole("PRINCIPAL_TECHNICAL_WRITER")).toBe(true);
    expect(isPrincipalRole("PRINCIPAL_ADMIN_PROJECT")).toBe(true);
  });
  it("rejects non-principal roles and nullish values", () => {
    for (const r of ["MANAGEMENT", "PROJECT_MANAGER", "SALES", "HR", ""]) {
      expect(isPrincipalRole(r)).toBe(false);
    }
    expect(isPrincipalRole(null)).toBe(false);
    expect(isPrincipalRole(undefined)).toBe(false);
  });
});

describe("isDeliveryAssignmentRole", () => {
  it("matches KONSULTAN and TECHNICAL_WRITER", () => {
    expect(isDeliveryAssignmentRole("KONSULTAN")).toBe(true);
    expect(isDeliveryAssignmentRole("TECHNICAL_WRITER")).toBe(true);
  });
  it("rejects everyone else", () => {
    for (const r of ["MANAGEMENT", "PROJECT_MANAGER", "SALES", "ADMIN_PROJECT", "FINANCE", "HR"]) {
      expect(isDeliveryAssignmentRole(r)).toBe(false);
    }
  });
});

describe("isFinanceDocumentRole", () => {
  it("matches only FINANCE", () => {
    expect(isFinanceDocumentRole("FINANCE")).toBe(true);
    expect(isFinanceDocumentRole("MANAGEMENT")).toBe(false);
    expect(isFinanceDocumentRole(null)).toBe(false);
  });
});
