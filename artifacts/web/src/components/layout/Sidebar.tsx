import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { canManageUsers, canManageClients, canViewResources, RoleLabels } from "@/lib/roles";
import {
  LayoutDashboard,
  Briefcase,
  Clock,
  Users,
  Building2,
  Settings,
  LogOut,
  Shield,
  Inbox,
  UserCog,
  CalendarRange,
  ScrollText,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavLink = { href: string; label: string; icon: typeof LayoutDashboard };

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const isPM = user?.role === "PROJECT_MANAGER" || user?.role === "MANAGEMENT";

  const main: NavLink[] = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/projects", label: "Projects", icon: Briefcase },
    { href: "/timesheets", label: "Time Tracking", icon: Clock },
  ];

  const operations: NavLink[] = [
    ...(isPM ? [{ href: "/approvals", label: "Approval Inbox", icon: Inbox }] : []),
    ...(canViewResources(user?.role) ? [{ href: "/resources", label: "Resources", icon: UserCog }] : []),
    ...(isPM ? [{ href: "/capacity", label: "Capacity Planning", icon: CalendarRange }] : []),
  ];

  const admin: NavLink[] = [
    ...(canManageClients(user?.role) ? [{ href: "/clients", label: "Clients", icon: Building2 }] : []),
    ...(canManageUsers(user?.role) ? [{ href: "/users", label: "Users", icon: Users }] : []),
    ...(user?.role === "MANAGEMENT" ? [{ href: "/business-intelligence", label: "Business Intelligence", icon: TrendingUp }] : []),
    ...(user?.role === "MANAGEMENT" ? [{ href: "/audit-logs", label: "Audit Log", icon: ScrollText }] : []),
  ];

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2)
    : "U";

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border hidden md:flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <div className="h-16 flex items-center px-5 border-b border-sidebar-border">
        <div className="relative h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center mr-3 ring-1 ring-primary/30">
          <Shield className="w-5 h-5 text-primary" />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
        </div>
        <div className="leading-tight">
          <p className="font-bold text-base tracking-tight text-sidebar-foreground">SecureProfit</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Hub</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
        <NavSection label="Main" links={main} location={location} />
        {operations.length > 0 && (
          <NavSection label="Operations" links={operations} location={location} />
        )}
        {admin.length > 0 && (
          <NavSection label="Administration" links={admin} location={location} />
        )}
      </nav>

      {/* User card */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <div className="flex items-center gap-3 px-2 py-2.5 rounded-lg bg-sidebar-accent/40 mb-1">
          <Avatar className="h-9 w-9 border border-sidebar-border">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.name ?? "—"}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {user?.role ? RoleLabels[user.role] : ""}
            </p>
          </div>
        </div>

        <Link
          href="/settings"
          className={cn(
            "flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all",
            location.startsWith("/settings")
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-accent/60"
          )}
        >
          <Settings className="mr-3 w-4 h-4 text-muted-foreground" />
          Settings
        </Link>
        <button
          onClick={logout}
          className="w-full flex items-center px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-all"
        >
          <LogOut className="mr-3 w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}

function NavSection({
  label,
  links,
  location,
}: {
  label: string;
  links: NavLink[];
  location: string;
}) {
  return (
    <div>
      <p className="px-3 mb-2 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
        {label}
      </p>
      <div className="space-y-0.5">
        {links.map((link) => {
          const isActive =
            location === link.href || (link.href !== "/" && location.startsWith(link.href));
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "group relative flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-r-full" />
              )}
              <Icon
                className={cn(
                  "mr-3 w-4 h-4 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-accent-foreground"
                )}
              />
              {link.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
