import type { UserRole } from "@workspace/api-client-react";

/**
 * Roles that log billable hours from the mobile app. Mirrors the delivery
 * roles that own a timesheet in the web app (PM + Konsultan + Technical
 * Writer + the three Principal supervisors).
 */
const HOURS_LOGGING_ROLES: UserRole[] = [
  "PROJECT_MANAGER",
  "KONSULTAN",
  "TECHNICAL_WRITER",
  "PRINCIPAL_KONSULTAN",
  "PRINCIPAL_TECHNICAL_WRITER",
  "PRINCIPAL_ADMIN_PROJECT",
];

export function canLogHours(role: UserRole | undefined | null): boolean {
  return !!role && HOURS_LOGGING_ROLES.includes(role);
}

/**
 * Only Project Managers approve/reject timesheets from the phone. (Management
 * does not approve timesheets — same rule as the web Approval Inbox.)
 */
export function canApproveTimesheets(role: UserRole | undefined | null): boolean {
  return role === "PROJECT_MANAGER";
}

/**
 * Roles that can review project expenses beyond their own (the cross-project
 * GET /api/expenses list). Mirrors the server allowlist: MANAGEMENT, the
 * project's PM, and SALES (own projects). Used to surface a "Team" expense view
 * so PMs can pull receipts for claims they review on the go.
 */
export function canViewTeamExpenses(role: UserRole | undefined | null): boolean {
  return (
    role === "MANAGEMENT" ||
    role === "SUPER_ADMIN" ||
    role === "PROJECT_MANAGER" ||
    role === "SALES"
  );
}

/**
 * Roles that can decide (approve/reject) expense claims from the phone.
 * Mirrors the server's approverRoles in routes/expenses.ts: MANAGEMENT,
 * SUPER_ADMIN and the project's PM. SALES can view team expenses but never
 * decides them, and the server additionally verifies a PM owns the claim's
 * project before accepting the decision.
 */
export function canDecideExpenses(role: UserRole | undefined | null): boolean {
  return (
    role === "MANAGEMENT" ||
    role === "SUPER_ADMIN" ||
    role === "PROJECT_MANAGER"
  );
}

/**
 * Roles whose expense submissions are auto-approved on the server (no PM
 * approval step). Mirrors the server allowlist in routes/expenses.ts:
 * MANAGEMENT and SUPER_ADMIN.
 */
export function expensesAutoApproved(role: UserRole | undefined | null): boolean {
  return role === "MANAGEMENT" || role === "SUPER_ADMIN";
}

/**
 * Roles that can edit the SPK / PO Number (Project.code) from the phone.
 * Mirrors the server's `writeRoles` in lib/projectValidators.ts (PATCH
 * /api/projects/:id). The auto-assigned Project ID is read-only everywhere.
 */
export function canEditProjectCode(role: UserRole | undefined | null): boolean {
  return (
    role === "MANAGEMENT" ||
    role === "SUPER_ADMIN" ||
    role === "PROJECT_MANAGER" ||
    role === "SALES" ||
    role === "PRINCIPAL_TECHNICAL_WRITER" ||
    role === "PRINCIPAL_ADMIN_PROJECT"
  );
}

/** Friendly label for a role, used in the header greeting. */
export function roleLabel(role: UserRole | undefined | null): string {
  switch (role) {
    case "PROJECT_MANAGER":
      return "Project Manager";
    case "KONSULTAN":
      return "Konsultan";
    case "TECHNICAL_WRITER":
      return "Technical Writer";
    case "PRINCIPAL_KONSULTAN":
      return "Principal Konsultan";
    case "PRINCIPAL_TECHNICAL_WRITER":
      return "Principal Technical Writer";
    case "PRINCIPAL_ADMIN_PROJECT":
      return "Principal Admin Project";
    case "MANAGEMENT":
      return "Management";
    case "SALES":
      return "Sales";
    case "ADMIN_PROJECT":
      return "Admin Project";
    case "FINANCE":
      return "Finance";
    case "HR":
      return "HR";
    case "SITE_ADMIN":
      return "Site Admin";
    default:
      return "Team Member";
  }
}
