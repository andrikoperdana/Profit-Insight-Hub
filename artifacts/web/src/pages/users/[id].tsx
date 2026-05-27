import { useParams, Link } from "wouter";
import { useGetUserProjectAssignments } from "@workspace/api-client-react";
import { RoleLabels } from "@/lib/roles";
import { ArrowLeft, Briefcase, AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return "-";
  }
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground border-border",
  OBSERVATION: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  ACTIVE: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  PAUSE: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  COMPLETE: "bg-sky-500/10 text-sky-500 border-sky-500/20",
  CLOSED: "bg-muted text-muted-foreground border-border",
};

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params.id;
  const { data, isLoading, error } = useGetUserProjectAssignments(userId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <TableSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <Link href="/users">
          <Button variant="ghost" size="sm" data-testid="link-back-users">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Users
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
            <p>Unable to load this user's projects. You may not have permission to view them.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { user, assignments } = data;
  const initials = user.name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);

  const active = assignments.filter((a) => a.status === "ACTIVE" || a.status === "OBSERVATION");
  const onHold = assignments.filter((a) => a.status === "PAUSE");
  const wrapping = assignments.filter((a) => a.status === "COMPLETE");
  const closed = assignments.filter((a) => a.status === "CLOSED");
  const drafts = assignments.filter((a) => a.status === "DRAFT");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/users">
          <Button variant="ghost" size="sm" data-testid="link-back-users">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Users
          </Button>
        </Link>
      </div>

      <Card className="border-border">
        <CardHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-14 w-14 border border-border">
              <AvatarFallback className="bg-primary/10 text-primary text-base">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className="text-xl">{user.name}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant="outline" className="bg-secondary text-secondary-foreground border-border">
                  {RoleLabels[user.role as keyof typeof RoleLabels] ?? user.role}
                </Badge>
                {user.title && (
                  <Badge variant="outline" className="border-border">{user.title}</Badge>
                )}
                {user.seniority && (
                  <Badge variant="outline" className="border-border">{user.seniority}</Badge>
                )}
                {!user.isActive && (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                    Inactive
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-border">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Active / Observation</p>
            <p className="text-2xl font-semibold mt-1">{active.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">On Hold</p>
            <p className="text-2xl font-semibold mt-1">{onHold.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Wrapping Up</p>
            <p className="text-2xl font-semibold mt-1">{wrapping.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Closed</p>
            <p className="text-2xl font-semibold mt-1">{closed.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold mt-1">{assignments.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Briefcase className="h-4 w-4 text-primary" />
            Project Involvements
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignments.length === 0 ? (
            <EmptyState
              title="No project assignments"
              description="This user is not currently linked to any project."
            />
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>PM</TableHead>
                  <TableHead>Role on Project</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead className="text-right">Mandays</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...drafts, ...active, ...onHold, ...wrapping, ...closed].map((a) => {
                  const remaining = daysUntil(a.endDate);
                  const wrappingSoon =
                    (a.status === "ACTIVE" || a.status === "OBSERVATION") &&
                    remaining != null && remaining <= 14 && remaining >= 0;
                  const overdue =
                    (a.status === "ACTIVE" || a.status === "OBSERVATION") &&
                    remaining != null && remaining < 0;
                  return (
                    <TableRow key={a.projectId} data-testid={`row-assignment-${a.projectId}`}>
                      <TableCell>
                        <Link href={`/projects/${a.projectId}`}>
                          <span className="font-medium text-primary hover:underline cursor-pointer">
                            {a.projectCode}
                          </span>
                        </Link>
                        <div className="text-xs text-muted-foreground">{a.projectName}</div>
                      </TableCell>
                      <TableCell className="text-sm">{a.clientName ?? "-"}</TableCell>
                      <TableCell className="text-sm">{a.pmName ?? "-"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {a.roles.length === 0 ? (
                            <span className="text-xs text-muted-foreground">-</span>
                          ) : (
                            a.roles.map((r) => (
                              <Badge key={r} variant="outline" className="text-xs border-border">{r}</Badge>
                            ))
                          )}
                          {a.proposed && (
                            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-500 border-amber-500/20">
                              Proposed
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={STATUS_STYLES[a.status] ?? "border-border"}>
                          {a.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(a.startDate)}</TableCell>
                      <TableCell className="text-sm">
                        <div>{fmtDate(a.endDate)}</div>
                        {overdue && (
                          <div className="text-xs text-destructive mt-0.5">
                            {Math.abs(remaining!)}d overdue
                          </div>
                        )}
                        {wrappingSoon && (
                          <div className="text-xs text-amber-500 mt-0.5">
                            in {remaining}d
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {a.plannedMandays > 0 ? a.plannedMandays.toFixed(1) : "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
