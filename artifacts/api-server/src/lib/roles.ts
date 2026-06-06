// Central role helpers for the API server. Keep all role-list logic here so
// that role membership changes only need to touch one file. The web frontend
// has its own mirror in `artifacts/web/src/lib/roles.ts`.

export type Role =
  | "MANAGEMENT"
  | "PROJECT_MANAGER"
  | "SALES"
  | "KONSULTAN"
  | "TECHNICAL_WRITER"
  | "ADMIN_PROJECT"
  | "FINANCE"
  | "HR"
  | "SITE_ADMIN"
  | "PRINCIPAL_KONSULTAN"
  | "PRINCIPAL_TECHNICAL_WRITER"
  | "PRINCIPAL_ADMIN_PROJECT";

export function isPrincipalRole(role: string | null | undefined): boolean {
  return !!role && role.startsWith("PRINCIPAL_");
}

// Roles that read every project regardless of assignment. They never filter
// by pmId/salesId/resource membership when listing or fetching a project.
// FINANCE has read-all rights for reconciliation; SITE_ADMIN for support.
const PROJECT_FULL_VIEWERS = new Set<string>([
  "MANAGEMENT",
  "SITE_ADMIN",
  "FINANCE",
]);

export function canViewAllProjects(role: string | null | undefined): boolean {
  return !!role && PROJECT_FULL_VIEWERS.has(role);
}

// Roles that may mutate the project record itself (status, dates, contract
// value, etc.) — distinct from "may upload an invoice on this project".
// PM is allowed only when they lead the project (caller checks pmId).
const PROJECT_RECORD_WRITERS = new Set<string>(["MANAGEMENT"]);

export function canWriteAnyProject(role: string | null | undefined): boolean {
  return !!role && PROJECT_RECORD_WRITERS.has(role);
}

// FINANCE has a narrow cross-project write right: upload/delete INVOICE and
// CONTRACT documents on any project. They are NOT a project owner. Callers
// must still gate by document type. See `routes/documents.ts`.
export function isFinanceDocumentRole(role: string | null | undefined): boolean {
  return role === "FINANCE";
}

// Delivery roles whose project visibility flows from being staffed on the
// project (resource roster) or having logged time against it.
const DELIVERY_ASSIGNMENT_ROLES = new Set<string>(["KONSULTAN", "TECHNICAL_WRITER"]);

export function isDeliveryAssignmentRole(role: string | null | undefined): boolean {
  return !!role && DELIVERY_ASSIGNMENT_ROLES.has(role);
}

// RAID log read access is restricted to the core project delivery team:
// Management, Project Manager, Consultant (KONSULTAN), and all Principal
// roles. Sales, Technical Writer, Admin Project, Finance, HR, and Site Admin
// are intentionally excluded. Read access is still further scoped per-project
// by `userCanAccessProject`. Mirrors `canViewRaid` on the web frontend.
const RAID_VIEW_ROLES = new Set<string>([
  "MANAGEMENT",
  "PROJECT_MANAGER",
  "KONSULTAN",
  "PRINCIPAL_KONSULTAN",
  "PRINCIPAL_TECHNICAL_WRITER",
  "PRINCIPAL_ADMIN_PROJECT",
]);

export function canViewRaid(role: string | null | undefined): boolean {
  return !!role && RAID_VIEW_ROLES.has(role);
}

// A project may only be invoiced once it is actually running or beyond. Projects
// that have not started yet (DRAFT, OBSERVATION) or that were marked as not
// needing a consultant (NO_NEED_CONSULTANT) cannot be invoiced — no push to
// Xero, no generated invoice PDF, no manual transition to INVOICED/PAID.
// Mirrors `canInvoiceProjectStatus` on the web frontend.
const INVOICEABLE_PROJECT_STATUSES = new Set<string>([
  "ACTIVE",
  "PAUSE",
  "COMPLETE",
  "CLOSED",
]);

export function canInvoiceProjectStatus(status: string | null | undefined): boolean {
  return !!status && INVOICEABLE_PROJECT_STATUSES.has(status);
}

// Roles required to log a full 40h work week. Delivery roles (Consultant,
// Technical Writer), Project Managers, and all Principal supervisors are held
// to the weekly hours target; Admin Project, Sales, Finance, HR, Management,
// and Site Admin are exempt. Mirrors `WORK_HOURS_REQUIRED_ROLES` on the web
// frontend — keep the two lists identical.
const WORK_HOURS_REQUIRED_ROLES = new Set<string>([
  "PROJECT_MANAGER",
  "KONSULTAN",
  "TECHNICAL_WRITER",
  "PRINCIPAL_KONSULTAN",
  "PRINCIPAL_TECHNICAL_WRITER",
  "PRINCIPAL_ADMIN_PROJECT",
]);

export function isWorkHoursRequiredRole(role: string | null | undefined): boolean {
  return !!role && WORK_HOURS_REQUIRED_ROLES.has(role);
}

// Roles that may view other people's work-hours compliance. HR sees everyone,
// Management sees Project Managers, and each Principal sees their own
// supervisees. Scope itself is enforced in `routes/work-hours.ts`.
export function canViewWorkHoursTeam(role: string | null | undefined): boolean {
  return role === "HR" || role === "MANAGEMENT" || isPrincipalRole(role);
}
