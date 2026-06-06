import { useState } from "react";
import { Link } from "wouter";
import {
  useListProjectsNeedingResource,
  useListUsersUnderSupervision,
  useProposeProjectResource,
  useUpdateProject,
  useListAvailableUsers,
  useListPendingResourceApprovals,
  useAcceptProjectResource,
  useRejectProjectResource,
  ProjectStatus,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ProjectStatusBadge } from "@/components/common/Badges";
import { RoleLabels, PRINCIPAL_TO_REPORT_ROLE } from "@/lib/roles";
import { UserPlus, Users, ClipboardCheck } from "lucide-react";
import MyExpensesCard from "@/components/dashboard/MyExpensesCard";
import WorkHoursCard from "@/components/WorkHoursCard";

export default function PrincipalDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const supervisedRole = user ? PRINCIPAL_TO_REPORT_ROLE[user.role] : undefined;

  const { data: needing, isLoading: loadingProjects, refetch: refetchProjects } = useListProjectsNeedingResource();
  const { data: supervisees, isLoading: loadingSup } = useListUsersUnderSupervision();
  const { data: availablePool } = useListAvailableUsers(
    { role: supervisedRole as any },
    { query: { enabled: !!supervisedRole, queryKey: ["principal-available", supervisedRole] } },
  );

  const [proposeFor, setProposeFor] = useState<{ id: string; name: string; code: string } | null>(null);
  const [form, setForm] = useState({ userId: "", roleInProject: "", plannedMandays: "10", dailyRate: "1500000" });

  // KONSULTAN and TECHNICAL_WRITER principals propose via ProjectResource (multi-pick;
  // PM accepts later). ADMIN_PROJECT is the only remaining single-pick on Project.
  const isSinglePickPrincipal = user?.role === "PRINCIPAL_ADMIN_PROJECT";
  // Only KONSULTAN / TECHNICAL_WRITER principals receive PM-initiated approval
  // requests (Admin Project staffing is single-pick on Project, no approval).
  const canApprove =
    user?.role === "PRINCIPAL_KONSULTAN" || user?.role === "PRINCIPAL_TECHNICAL_WRITER";

  const { data: pendingApprovals, isLoading: loadingApprovals, refetch: refetchApprovals } =
    useListPendingResourceApprovals({
      query: { enabled: canApprove, queryKey: ["pending-resource-approvals"] },
    } as any);

  const acceptMutation = useAcceptProjectResource({
    mutation: {
      onSuccess: () => {
        toast({ title: "Assignment approved", description: "The team member is now active on the project." });
        refetchApprovals();
      },
      onError: (e: any) =>
        toast({ variant: "destructive", title: "Could not approve", description: e?.message ?? "Unknown error" }),
    },
  });
  const rejectMutation = useRejectProjectResource({
    mutation: {
      onSuccess: () => {
        toast({ title: "Assignment declined", description: "The proposed assignment was removed." });
        refetchApprovals();
      },
      onError: (e: any) =>
        toast({ variant: "destructive", title: "Could not decline", description: e?.message ?? "Unknown error" }),
    },
  });

  const propose = useProposeProjectResource({
    mutation: {
      onSuccess: () => {
        toast({ title: "Resource proposed", description: "PM has been notified to accept." });
        setProposeFor(null);
        setForm({ userId: "", roleInProject: "", plannedMandays: "10", dailyRate: "1500000" });
        refetchProjects();
      },
      onError: (e: any) =>
        toast({ variant: "destructive", title: "Could not propose", description: e?.message ?? "Unknown error" }),
    },
  });

  const updateProject = useUpdateProject({
    mutation: {
      onSuccess: () => {
        toast({ title: "Resource assigned", description: "PM may override later if needed." });
        setProposeFor(null);
        setForm({ userId: "", roleInProject: "", plannedMandays: "10", dailyRate: "1500000" });
        refetchProjects();
      },
      onError: (e: any) =>
        toast({ variant: "destructive", title: "Could not assign", description: e?.message ?? "Unknown error" }),
    },
  });

  const submitPropose = () => {
    if (!proposeFor || !form.userId) {
      toast({ variant: "destructive", title: "Pick a team member" });
      return;
    }
    if (isSinglePickPrincipal) {
      updateProject.mutate({
        id: proposeFor.id,
        data: { adminProjectId: form.userId } as any,
      });
      return;
    }
    propose.mutate({
      id: proposeFor.id,
      data: {
        userId: form.userId,
        roleInProject: form.roleInProject || undefined,
        plannedMandays: Number(form.plannedMandays) || 0,
        dailyRate: Number(form.dailyRate) || 0,
      },
    });
  };

  const list = needing ?? [];
  const team = supervisees ?? [];
  const pool = availablePool ?? [];

  return (
    <div className="space-y-6">
      <WelcomeBanner subtitle={`Supervising ${supervisedRole ? RoleLabels[supervisedRole] : ""} delivery — propose resources where PMs need staffing.`} />

      <WorkHoursCard />

      {canApprove && (
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              Pending approvals
              {(pendingApprovals?.length ?? 0) > 0 && (
                <Badge variant="outline" className="ml-1 border-amber-500/50 text-amber-500">
                  {pendingApprovals?.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              A PM has requested to assign one of your supervisees to a project. Approve to activate the assignment, or decline to remove it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingApprovals ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (pendingApprovals?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground italic">No assignments awaiting your approval.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3 font-medium">Team member</th>
                      <th className="py-2 pr-3 font-medium">Project</th>
                      <th className="py-2 pr-3 font-medium">Requested by</th>
                      <th className="py-2 pr-3 font-medium text-right">Planned (md)</th>
                      <th className="py-2 pr-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pendingApprovals ?? []).map((a: any) => (
                      <tr key={a.id} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="py-2 pr-3 font-medium">{a.userName}</td>
                        <td className="py-2 pr-3">
                          <Link href={`/projects/${a.projectId}`} className="text-primary hover:underline">
                            {a.projectCode} · {a.projectName}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">{a.proposedByName ?? "—"}</td>
                        <td className="py-2 pr-3 text-right font-mono">{(a.plannedMandays ?? 0).toFixed(1)}</td>
                        <td className="py-2 pr-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              disabled={acceptMutation.isPending || rejectMutation.isPending}
                              onClick={() => acceptMutation.mutate({ resourceId: a.id })}
                              data-testid={`button-approve-${a.id}`}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={acceptMutation.isPending || rejectMutation.isPending}
                              onClick={() => {
                                if (confirm(`Decline the assignment of ${a.userName}?`)) {
                                  rejectMutation.mutate({ resourceId: a.id });
                                }
                              }}
                              data-testid={`button-decline-${a.id}`}
                            >
                              Decline
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            Projects needing {supervisedRole ? RoleLabels[supervisedRole] : "resource"}
          </CardTitle>
          <CardDescription>
            Active or observation-stage projects without an assigned {supervisedRole ? RoleLabels[supervisedRole] : "resource"} of your type. Propose a candidate; the PM has the final say.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingProjects ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No projects currently need staffing of your type.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Project</th>
                    <th className="py-2 pr-3 font-medium">Client</th>
                    <th className="py-2 pr-3 font-medium">PM</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p: any) => (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="py-2 pr-3">
                        <Link href={`/projects/${p.id}`} className="text-primary hover:underline font-medium">
                          {p.code} · {p.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">{p.clientName ?? "—"}</td>
                      <td className="py-2 pr-3">{p.pmName ?? <span className="text-muted-foreground italic">unassigned</span>}</td>
                      <td className="py-2 pr-3"><ProjectStatusBadge status={p.status as ProjectStatus} /></td>
                      <td className="py-2 pr-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setProposeFor({ id: p.id, name: p.name, code: p.code })}
                          disabled={!p.pmId}
                          title={!p.pmId ? "Project has no PM yet" : "Propose a resource"}
                          data-testid={`button-propose-${p.code}`}
                        >
                          Propose
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Your team
          </CardTitle>
          <CardDescription>
            Direct reports under your supervision.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingSup ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : team.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No supervisees assigned to you yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {team.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground">{u.title ?? RoleLabels[u.role as keyof typeof RoleLabels]}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{RoleLabels[u.role as keyof typeof RoleLabels]}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <MyExpensesCard />

      <Dialog open={!!proposeFor} onOpenChange={(o) => !o && setProposeFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propose resource for {proposeFor?.code}</DialogTitle>
            <DialogDescription>
              Pick one of your supervisees. The PM will be notified and may accept or replace your proposal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Team member</Label>
              <Select value={form.userId} onValueChange={(v) => {
                const picked = pool.find((u: any) => u.id === v);
                setForm({ ...form, userId: v, dailyRate: picked?.dailyRate ? String(picked.dailyRate) : form.dailyRate });
              }}>
                <SelectTrigger><SelectValue placeholder={pool.length === 0 ? "No supervisees available" : "Select"} /></SelectTrigger>
                <SelectContent>
                  {pool.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                      {supervisedRole === "KONSULTAN" && (
                        <span className="text-xs text-muted-foreground ml-1">— {u.activeProjectCount}/2 active</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isSinglePickPrincipal && (
              <>
                <div className="space-y-1.5">
                  <Label>Project Role <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input value={form.roleInProject} onChange={(e) => setForm({ ...form, roleInProject: e.target.value })} placeholder="e.g. Lead Auditor" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Planned Mandays</Label>
                    <Input type="number" min="0" step="0.5" value={form.plannedMandays} onChange={(e) => setForm({ ...form, plannedMandays: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Daily Rate (IDR)</Label>
                    <Input type="number" min="0" step="100000" value={form.dailyRate} onChange={(e) => setForm({ ...form, dailyRate: e.target.value })} />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposeFor(null)} disabled={propose.isPending || updateProject.isPending}>Cancel</Button>
            <Button onClick={submitPropose} disabled={propose.isPending || updateProject.isPending || !form.userId}>
              {propose.isPending || updateProject.isPending
                ? (isSinglePickPrincipal ? "Assigning…" : "Proposing…")
                : (isSinglePickPrincipal ? "Assign" : "Propose")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
