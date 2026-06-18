import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useListUsers } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingPage } from "@/components/common/Loading";
import { GitBranch, ShieldAlert } from "lucide-react";
import { RoleLabels, isPrincipalRole, isSuperAdmin } from "@/lib/roles";

type User = {
  id: string;
  name: string;
  role: string;
  title?: string | null;
  isActive: boolean;
  managerId?: string | null;
  principalId?: string | null;
  businessUnit?: { id: string; name: string } | null;
};

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

function UserNode({ user, sub }: { user: User; sub?: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 min-w-[200px]">
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{user.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {user.title ?? RoleLabels[user.role as keyof typeof RoleLabels]}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[10px]">
          {RoleLabels[user.role as keyof typeof RoleLabels] ?? user.role}
        </Badge>
        {user.businessUnit && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {user.businessUnit.name}
          </Badge>
        )}
        {typeof sub === "number" && sub > 0 && (
          <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
            {sub} report{sub === 1 ? "" : "s"}
          </Badge>
        )}
      </div>
    </div>
  );
}

export default function OrgChartPage() {
  const { user: me } = useAuth();
  const canView =
    isSuperAdmin(me?.role) ||
    me?.role === "HR" ||
    me?.role === "MANAGEMENT" ||
    me?.role === "SITE_ADMIN";

  const { data: users, isLoading } = useListUsers();

  const groups = useMemo(() => {
    const list = ((users ?? []) as User[]).filter((u) => u.isActive);

    const mgmt = list.filter((u) => u.role === "MANAGEMENT");
    const pms = list.filter((u) => u.role === "PROJECT_MANAGER");
    const sales = list.filter((u) => u.role === "SALES");

    const principals = list.filter((u) => isPrincipalRole(u.role));
    const supervisedByPrincipal = new Map<string, User[]>();
    for (const p of principals) supervisedByPrincipal.set(p.id, []);
    for (const u of list) {
      if (u.principalId && supervisedByPrincipal.has(u.principalId)) {
        supervisedByPrincipal.get(u.principalId)!.push(u);
      }
    }

    const reportingToPmoByMgr = new Map<string, User[]>();
    for (const m of mgmt) reportingToPmoByMgr.set(m.id, []);
    for (const pm of pms) {
      if (pm.managerId && reportingToPmoByMgr.has(pm.managerId)) {
        reportingToPmoByMgr.get(pm.managerId)!.push(pm);
      }
    }
    const orphanedPms = pms.filter((pm) => !pm.managerId || !reportingToPmoByMgr.has(pm.managerId ?? ""));

    const supportRoles = list.filter((u) =>
      ["FINANCE", "HR", "ADMIN_PROJECT", "SITE_ADMIN"].includes(u.role) && !u.principalId,
    );

    return { mgmt, pms, sales, principals, supervisedByPrincipal, reportingToPmoByMgr, orphanedPms, supportRoles };
  }, [users]);

  if (!canView) {
    return (
      <EmptyState
        title="Access Denied"
        description="Org Chart is visible to HR, PMO Director, and Site Admin."
        icon={<ShieldAlert className="h-10 w-10 text-destructive/50" />}
      />
    );
  }

  if (isLoading) return <LoadingPage />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <GitBranch className="h-7 w-7 text-primary" /> Org Chart
        </h1>
        <p className="text-muted-foreground">
          Reporting hierarchy for the project delivery team only: Project Managers → PMO
          Director, delivery staff → Principal supervisors. This is not the full company
          org chart — it covers personnel involved in project execution.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">PMO Hierarchy</CardTitle>
          <CardDescription>Project Managers reporting to the PMO Director.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {groups.mgmt.length === 0 ? (
            <p className="text-sm text-muted-foreground">No PMO Director assigned.</p>
          ) : (
            groups.mgmt.map((m) => {
              const reports = groups.reportingToPmoByMgr.get(m.id) ?? [];
              return (
                <div key={m.id} className="space-y-3">
                  <UserNode user={m} sub={reports.length} />
                  {reports.length > 0 && (
                    <div className="ml-6 border-l-2 border-primary/30 pl-6 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                      {reports.map((pm) => (
                        <UserNode key={pm.id} user={pm} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
          {groups.orphanedPms.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-amber-500 mb-2">
                Unassigned PMs ({groups.orphanedPms.length})
              </p>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {groups.orphanedPms.map((pm) => (
                  <UserNode key={pm.id} user={pm} />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery Supervision</CardTitle>
          <CardDescription>Consultants, Writers, and Admin Projects under each Principal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {groups.principals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Principals configured.</p>
          ) : (
            groups.principals.map((p) => {
              const reports = groups.supervisedByPrincipal.get(p.id) ?? [];
              return (
                <div key={p.id} className="space-y-3">
                  <UserNode user={p} sub={reports.length} />
                  {reports.length === 0 ? (
                    <p className="ml-12 text-xs text-muted-foreground italic">No direct reports.</p>
                  ) : (
                    <div className="ml-6 border-l-2 border-primary/30 pl-6 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                      {reports.map((u) => (
                        <UserNode key={u.id} user={u} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {groups.sales.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {groups.sales.map((u) => (
                <UserNode key={u.id} user={u} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {groups.supportRoles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Support &amp; Administration</CardTitle>
            <CardDescription>Finance, HR, Admin Project, Site Admin.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {groups.supportRoles.map((u) => (
                <UserNode key={u.id} user={u} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
