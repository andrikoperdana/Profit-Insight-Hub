import { useAuth } from "@/lib/auth";
import { UserRole } from "@workspace/api-client-react";
import ManagementDashboard from "./ManagementDashboard";
import SalesDashboard from "./SalesDashboard";
import ConsultantDashboard from "./ConsultantDashboard";

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;

  if (user.role === UserRole.SALES) return <SalesDashboard />;
  if (user.role === UserRole.KONSULTAN || user.role === UserRole.TECHNICAL_WRITER || user.role === UserRole.ADMIN_PROJECT) {
    return <ConsultantDashboard />;
  }
  // MANAGEMENT and PROJECT_MANAGER
  return <ManagementDashboard />;
}
