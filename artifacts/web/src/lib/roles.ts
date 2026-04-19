import { UserRole } from "@workspace/api-client-react";

export const RoleLabels: Record<UserRole, string> = {
  [UserRole.MANAGEMENT]: "PMO Director",
  [UserRole.PROJECT_MANAGER]: "Project Manager",
  [UserRole.SALES]: "Sales",
  [UserRole.KONSULTAN]: "Consultant",
  [UserRole.TECHNICAL_WRITER]: "Technical Writer",
  [UserRole.ADMIN_PROJECT]: "Admin Project",
};

export function canCreateProject(role?: UserRole): boolean {
  return role === UserRole.MANAGEMENT || role === UserRole.PROJECT_MANAGER || role === UserRole.SALES;
}

export function canManageUsers(role?: UserRole): boolean {
  return role === UserRole.MANAGEMENT;
}

export function canManageClients(role?: UserRole): boolean {
  return role === UserRole.MANAGEMENT || role === UserRole.PROJECT_MANAGER || role === UserRole.SALES;
}

export function canViewResources(role?: UserRole): boolean {
  return role === UserRole.MANAGEMENT || role === UserRole.PROJECT_MANAGER;
}
