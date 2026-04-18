import { UserRole } from "@workspace/api-client-react";

export const RoleLabels: Record<UserRole, string> = {
  [UserRole.MANAGEMENT]: "Management",
  [UserRole.PROJECT_MANAGER]: "Project Manager",
  [UserRole.SALES]: "Sales",
  [UserRole.KONSULTAN]: "Konsultan",
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
