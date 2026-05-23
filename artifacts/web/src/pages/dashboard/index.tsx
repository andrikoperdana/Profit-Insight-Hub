import { useAuth } from "@/lib/auth";
import { UserRole } from "@workspace/api-client-react";
import ManagementDashboard from "./ManagementDashboard";
import PMDashboard from "./PMDashboard";
import SalesDashboard from "./SalesDashboard";
import ConsultantDashboard from "./ConsultantDashboard";
import AdminProjectDashboard from "./AdminProjectDashboard";
import PrincipalDashboard from "./PrincipalDashboard";
import SiteAdminDashboard from "./SiteAdminDashboard";
import { isPrincipalRole } from "@/lib/roles";

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;

  if (user.role === UserRole.PROJECT_MANAGER) return <PMDashboard />;
  if (user.role === UserRole.SALES) return <SalesDashboard />;
  if (user.role === UserRole.ADMIN_PROJECT) return <AdminProjectDashboard />;
  if (user.role === UserRole.KONSULTAN || user.role === UserRole.TECHNICAL_WRITER) {
    return <ConsultantDashboard />;
  }
  if (isPrincipalRole(user.role)) return <PrincipalDashboard />;
  if (user.role === UserRole.SITE_ADMIN) return <SiteAdminDashboard />;
  // MANAGEMENT (PMO Director) and FINANCE share the executive dashboard.
  return <ManagementDashboard />;
}
