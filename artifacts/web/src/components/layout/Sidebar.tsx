import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { canManageUsers, canManageClients, canCreateProject } from "@/lib/roles";
import {
  LayoutDashboard,
  Briefcase,
  Clock,
  Users,
  Building2,
  Settings,
  LogOut,
  Shield,
  Inbox
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const isPM = user?.role === "PROJECT_MANAGER" || user?.role === "MANAGEMENT";

  const links = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/projects", label: "Projects", icon: Briefcase },
    { href: "/timesheets", label: "Time Tracking", icon: Clock },
    ...(isPM ? [{ href: "/approvals", label: "Approval Inbox", icon: Inbox }] : []),
    ...(canManageClients(user?.role) ? [{ href: "/clients", label: "Clients", icon: Building2 }] : []),
    ...(canManageUsers(user?.role) ? [{ href: "/users", label: "Users", icon: Users }] : []),
  ];

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border hidden md:flex flex-col h-screen sticky top-0">
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
        <Shield className="w-6 h-6 text-primary mr-3" />
        <span className="font-bold text-lg tracking-tight text-sidebar-foreground">SecureProfit Hub</span>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {links.map((link) => {
          const isActive = location === link.href || (link.href !== "/" && location.startsWith(link.href));
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Icon className={cn("mr-3 w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <Link
          href="/settings"
          className={cn(
            "flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors mb-1",
            location.startsWith("/settings")
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50"
          )}
        >
          <Settings className="mr-3 w-5 h-5 text-muted-foreground" />
          Settings
        </Link>
        <button
          onClick={logout}
          className="w-full flex items-center px-3 py-2.5 rounded-md text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="mr-3 w-5 h-5" />
          Logout
        </button>
      </div>
    </div>
  );
}
