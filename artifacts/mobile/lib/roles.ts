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
 * Roles that can open the Expenses tab on mobile: anyone who logs hours (and so
 * files their own claims) OR anyone who reviews cross-project claims
 * (Management / Sales / PM via the "Team" view). Without the second clause,
 * Management and Sales were listed for the Team view but could never reach the
 * tab at all.
 */
export function canViewExpenses(role: UserRole | undefined | null): boolean {
  return canLogHours(role) || canViewTeamExpenses(role);
}

/**
 * Roles whose expense submissions are auto-approved on the server (no PM
 * approval step). Mirrors the server allowlist in routes/expenses.ts:
 * MANAGEMENT and SUPER_ADMIN.
 */
export function expensesAutoApproved(role: UserRole | undefined | null): boolean {
  return role === "MANAGEMENT" || role === "SUPER_ADMIN";
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
