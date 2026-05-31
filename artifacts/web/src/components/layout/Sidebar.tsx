import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { canManageUsers, canManageClients, canViewResources, canViewAuditLogs, canViewAllUsers, RoleLabels } from "@/lib/roles";
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
  ClipboardList,
  Receipt,
  Network,
  Award,
  Trophy,
  Grid3x3,
  FileBarChart,
  Wallet,
  Target,
  ListChecks,
  CalendarOff,
  GitBranch,
  ClipboardCheck,
  CheckSquare,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavLink = { href: string; label: string; icon: typeof LayoutDashboard };

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const isPM = user?.role === "PROJECT_MANAGER" || user?.role === "MANAGEMENT";

  const isSiteAdmin = user?.role === "SITE_ADMIN";
  const isFinance = user?.role === "FINANCE";
  const isHr = user?.role === "HR";

  const main: NavLink[] = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    ...(isSiteAdmin || isHr ? [] : [{ href: "/projects", label: "Projects", icon: Briefcase }]),
    ...(isSiteAdmin || isFinance || isHr ? [] : [{ href: "/timesheets", label: "Time Tracking", icon: Clock }]),
  ];

  const canSeeExpenses =
    user?.role === "MANAGEMENT" ||
    user?.role === "PROJECT_MANAGER" ||
    user?.role === "SALES";

  const canSeeLeads = user?.role === "SALES";

  // "My …" personal views — for delivery roles (Konsultan, TW, Admin Project)
  // and their Principal supervisors, plus Sales. Gives them a paginated +
  // exportable history of their own work without needing to dig into each
  // project tab.
  const canSeeMyViews =
    user?.role === "KONSULTAN" ||
    user?.role === "TECHNICAL_WRITER" ||
    user?.role === "ADMIN_PROJECT" ||
    user?.role === "PRINCIPAL_KONSULTAN" ||
    user?.role === "PRINCIPAL_TECHNICAL_WRITER" ||
    user?.role === "PRINCIPAL_ADMIN_PROJECT" ||
    user?.role === "SALES";

  const operations: NavLink[] = [
    ...(canSeeMyViews
      ? [
          { href: "/my-tasks", label: "My Tasks", icon: CheckSquare },
          { href: "/my-timesheets", label: "My Timesheet", icon: Clock },
          { href: "/my-expenses", label: "My Expenses", icon: Receipt },
        ]
      : []),
    ...(canSeeLeads ? [{ href: "/leads", label: "Sales Pipeline", icon: Target }] : []),
    ...(isPM ? [{ href: "/approvals", label: "Approval Inbox", icon: Inbox }] : []),
    ...(canViewResources(user?.role) ? [{ href: "/resources", label: "Resources", icon: UserCog }] : []),
    ...(isPM || isHr ? [{ href: "/capacity", label: "Capacity Planning", icon: CalendarRange }] : []),
    ...(canSeeExpenses ? [{ href: "/expenses", label: "Expenses", icon: Receipt }] : []),
    ...(isPM || isHr ? [{ href: "/resource-planning", label: "Resource Planning", icon: Grid3x3 }] : []),
    ...(isPM || isHr ? [{ href: "/bench", label: "Bench Report", icon: UserCog }] : []),
    ...(isPM || isHr ? [{ href: "/skill-matrix", label: "Skill Matrix", icon: Award }] : []),
    ...(isPM ? [{ href: "/task-templates", label: "Task Templates", icon: ListChecks }] : []),
    ...(isPM || user?.role === "SALES" ? [{ href: "/project-templates", label: "Project Templates", icon: ListChecks }] : []),
    { href: "/skill-development", label: "Skill Development", icon: Award },
    ...(isPM || isFinance || user?.role === "ADMIN_PROJECT" || user?.role === "SALES" ? [{ href: "/invoice-planning", label: "Invoice Planning", icon: Wallet }] : []),
    ...(isPM || isFinance ? [{ href: "/reports", label: "Reports", icon: FileBarChart }] : []),
    ...(user?.role === "MANAGEMENT" || isPM ||
      user?.role === "PRINCIPAL_KONSULTAN" ||
      user?.role === "PRINCIPAL_TECHNICAL_WRITER" ||
      user?.role === "PRINCIPAL_ADMIN_PROJECT"
      ? [{ href: "/performance-reviews", label: "Performance Reviews", icon: ClipboardCheck }] : []),
  ];

  const peopleOps: NavLink[] = isHr
    ? [
        { href: "/users", label: "Employees", icon: Users },
        { href: "/org-chart", label: "Org Chart", icon: GitBranch },
        { href: "/leaves", label: "Leave Management", icon: CalendarOff },
        { href: "/business-units", label: "Business Units", icon: Network },
        { href: "/skills", label: "Skills", icon: Award },
      ]
    : [];

  const admin: NavLink[] = [
    ...(canManageClients(user?.role) || isFinance ? [{ href: "/clients", label: "Clients", icon: Building2 }] : []),
    ...(canViewAllUsers(user?.role) && !isHr ? [{ href: "/users", label: "Users", icon: Users }] : []),
    ...(canManageUsers(user?.role) ? [{ href: "/business-units", label: "Business Units", icon: Network }] : []),
    ...(canManageUsers(user?.role) ? [{ href: "/skills", label: "Skills", icon: Award }] : []),
    ...(user?.role === "MANAGEMENT" ? [{ href: "/business-intelligence", label: "Business Intelligence", icon: TrendingUp }] : []),
    ...(user?.role === "MANAGEMENT" ||
        user?.role === "PRINCIPAL_KONSULTAN" ||
        user?.role === "PRINCIPAL_TECHNICAL_WRITER" ||
        user?.role === "PRINCIPAL_ADMIN_PROJECT"
      ? [{ href: "/top-performers", label: "Top Performers", icon: Trophy }]
      : []),
    ...(user?.role === "MANAGEMENT" || isFinance ? [{ href: "/vat-recap", label: "VAT Recap", icon: Receipt }] : []),
    ...(user?.role === "MANAGEMENT" || isFinance ? [{ href: "/invoice-settings", label: "Invoice Settings", icon: FileText }] : []),
    ...(user?.role === "MANAGEMENT" || user?.role === "SALES" ? [{ href: "/survey-results", label: "Survey Results", icon: ClipboardList }] : []),
    ...(user?.role === "MANAGEMENT" ? [{ href: "/settings/survey-template", label: "Survey Template", icon: ClipboardList }] : []),
    ...(canViewAuditLogs(user?.role) ? [{ href: "/audit-logs", label: "Audit Log", icon: ScrollText }] : []),
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
        {peopleOps.length > 0 && (
          <NavSection label="People Ops" links={peopleOps} location={location} />
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
