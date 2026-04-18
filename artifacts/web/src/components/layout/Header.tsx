import { useAuth } from "@/lib/auth";
import { RoleLabels } from "@/lib/roles";
import {
  useListTimesheets,
  useListProjects,
  ProjectStatus,
} from "@workspace/api-client-react";
import { Bell, Menu, Inbox, FileWarning, ClipboardCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import Sidebar from "./Sidebar";
import { Link } from "wouter";

export default function Header() {
  const { user, logout } = useAuth();

  const isPM = !!user && (user.role === "PROJECT_MANAGER" || user.role === "MANAGEMENT");
  const isAdminProject = user?.role === "ADMIN_PROJECT";
  const isConsultant = user?.role === "KONSULTAN" || user?.role === "TECHNICAL_WRITER";

  const { data: pendingTimesheets } = useListTimesheets(
    { status: "SUBMITTED", scope: "approval" },
    { query: { enabled: isPM, queryKey: ["timesheets", "submitted", "approval"] } }
  );
  const { data: completeProjects } = useListProjects(
    { status: ProjectStatus.COMPLETE },
    { query: { enabled: isAdminProject, queryKey: ["projects", "COMPLETE", "notif"] } }
  );
  const { data: rejectedTs } = useListTimesheets(
    { status: "REJECTED", scope: "mine" },
    { query: { enabled: isConsultant, queryKey: ["timesheets", "rejected", "mine"] } }
  );

  const pendingCount = pendingTimesheets?.length ?? 0;
  const completeCount = completeProjects?.length ?? 0;
  const rejectedCount = rejectedTs?.length ?? 0;

  const totalNotif = (isPM ? pendingCount : 0) + (isAdminProject ? completeCount : 0) + (isConsultant ? rejectedCount : 0);

  const initials = user?.name
    ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2)
    : "U";

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
      <div className="flex items-center md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-ml-2">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-r-0">
            <Sidebar />
          </SheetContent>
        </Sheet>
        <span className="font-bold text-lg ml-2 text-foreground">SecureProfit</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center space-x-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {totalNotif > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                  {totalNotif > 9 ? "9+" : totalNotif}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80" align="end">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              <Badge variant="outline" className="text-[10px]">{totalNotif}</Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {totalNotif === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                You're all caught up.
              </div>
            )}

            {isPM && pendingCount > 0 && (
              <DropdownMenuItem asChild>
                <Link href="/approvals" className="flex items-start gap-3 cursor-pointer">
                  <Inbox className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Pending approvals</p>
                    <p className="text-xs text-muted-foreground">
                      {pendingCount} timesheet{pendingCount === 1 ? "" : "s"} waiting for your review.
                    </p>
                  </div>
                </Link>
              </DropdownMenuItem>
            )}

            {isAdminProject && completeCount > 0 && (
              <DropdownMenuItem asChild>
                <Link href="/" className="flex items-start gap-3 cursor-pointer">
                  <ClipboardCheck className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Projects ready to close</p>
                    <p className="text-xs text-muted-foreground">
                      {completeCount} complete project{completeCount === 1 ? "" : "s"} awaiting BAST/Invoice upload.
                    </p>
                  </div>
                </Link>
              </DropdownMenuItem>
            )}

            {isConsultant && rejectedCount > 0 && (
              <DropdownMenuItem asChild>
                <Link href="/timesheets" className="flex items-start gap-3 cursor-pointer">
                  <FileWarning className="h-4 w-4 text-destructive mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Rejected timesheets</p>
                    <p className="text-xs text-muted-foreground">
                      {rejectedCount} entr{rejectedCount === 1 ? "y" : "ies"} need to be revised.
                    </p>
                  </div>
                </Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
              <Avatar className="h-10 w-10 border border-border">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="p-2">
              <Badge variant="outline" className="w-full justify-center bg-primary/10 text-primary border-primary/20">
                {user?.role ? RoleLabels[user.role] : "Unknown Role"}
              </Badge>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer w-full">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout} className="text-destructive cursor-pointer">
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
