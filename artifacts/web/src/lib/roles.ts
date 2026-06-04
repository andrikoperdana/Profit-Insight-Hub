import { UserRole } from "@workspace/api-client-react";

export const RoleLabels: Record<UserRole, string> = {
  [UserRole.MANAGEMENT]: "PMO Director",
  [UserRole.PROJECT_MANAGER]: "Project Manager",
  [UserRole.SALES]: "Sales",
  [UserRole.KONSULTAN]: "Consultant",
  [UserRole.TECHNICAL_WRITER]: "Technical Writer",
  [UserRole.ADMIN_PROJECT]: "Admin Project",
  [UserRole.PRINCIPAL_KONSULTAN]: "Principal Consultant",
  [UserRole.PRINCIPAL_TECHNICAL_WRITER]: "Principal Technical Writer",
  [UserRole.PRINCIPAL_ADMIN_PROJECT]: "Principal Admin Project",
  [UserRole.FINANCE]: "Finance",
  [UserRole.HR]: "HR",
  [UserRole.SITE_ADMIN]: "Site Admin",
};

// Mapping from a Principal role to the delivery role they supervise.
export const PRINCIPAL_TO_REPORT_ROLE: Partial<Record<UserRole, UserRole>> = {
  [UserRole.PRINCIPAL_KONSULTAN]: UserRole.KONSULTAN,
  [UserRole.PRINCIPAL_TECHNICAL_WRITER]: UserRole.TECHNICAL_WRITER,
  [UserRole.PRINCIPAL_ADMIN_PROJECT]: UserRole.ADMIN_PROJECT,
};

export function isPrincipalRole(role?: UserRole | string | null): boolean {
  return typeof role === "string" && role.startsWith("PRINCIPAL_");
}

export function canCreateProject(role?: UserRole): boolean {
  return role === UserRole.MANAGEMENT || role === UserRole.PROJECT_MANAGER || role === UserRole.SALES;
}

export function canManageUsers(role?: UserRole): boolean {
  return role === UserRole.SITE_ADMIN;
}

// HR can view all users and edit non-sensitive personnel fields
// (title, dailyRate, seniority, businessUnit, manager, principal, skills) —
// but NOT create/delete users, change role, reset passwords, or toggle isActive.
export function canViewAllUsers(role?: UserRole): boolean {
  return role === UserRole.SITE_ADMIN || role === UserRole.HR;
}

export function canEditPersonnel(role?: UserRole): boolean {
  return role === UserRole.SITE_ADMIN || role === UserRole.HR;
}

export function canViewAuditLogs(role?: UserRole): boolean {
  return role === UserRole.SITE_ADMIN;
}

export function canManageClients(role?: UserRole): boolean {
  return role === UserRole.SALES;
}

export function canViewResources(role?: UserRole): boolean {
  return (
    role === UserRole.MANAGEMENT ||
    role === UserRole.PROJECT_MANAGER ||
    isPrincipalRole(role)
  );
}

// Delivery roles + Principals never see commercial figures.
export function canViewProjectFinancials(role?: UserRole): boolean {
  if (!role) return false;
  if (role === UserRole.TECHNICAL_WRITER || role === UserRole.KONSULTAN) return false;
  if (role === UserRole.HR) return false;
  if (isPrincipalRole(role)) return false;
  return true;
}

// Daily rate on project resources is restricted to MGMT and PM only.
// Mirrors `canViewDailyRate` on the server.
export function canViewDailyRate(role?: UserRole): boolean {
  return role === UserRole.MANAGEMENT || role === UserRole.PROJECT_MANAGER;
}

// RAID log is restricted to the core project delivery team: Management,
// Project Manager, Consultants, and all Principal roles. Sales, Technical
// Writer, Admin Project, Finance, HR, and Site Admin do not see it.
// Mirrors `canViewRaid` on the server.
export function canViewRaid(role?: UserRole): boolean {
  return (
    role === UserRole.MANAGEMENT ||
    role === UserRole.PROJECT_MANAGER ||
    role === UserRole.KONSULTAN ||
    isPrincipalRole(role)
  );
}

// A project may only be invoiced once it is actually running or beyond. Projects
// that have not started yet (DRAFT, OBSERVATION) or that were marked as not
// needing a consultant (NO_NEED_CONSULTANT) cannot be invoiced. Mirrors
// `canInvoiceProjectStatus` on the API server.
export function canInvoiceProjectStatus(status?: string | null): boolean {
  return (
    status === "ACTIVE" ||
    status === "PAUSE" ||
    status === "COMPLETE" ||
    status === "CLOSED"
  );
}
