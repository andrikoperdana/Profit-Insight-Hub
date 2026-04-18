import { useParams, Link } from "wouter";
import { useState, useRef } from "react";
import {
  useGetProject,
  useGetProjectFinancials,
  useUpdateProject,
  useListProjectDocuments,
  useCreateProjectDocument,
  useDeleteDocument,
  getGetProjectQueryKey,
  getGetProjectFinancialsQueryKey,
  getListProjectDocumentsQueryKey,
  ProjectStatus,
  DocumentType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Building2, User, Calendar, DollarSign, TrendingUp, TrendingDown,
  Activity, Flame, Upload, FileText, Trash2, CheckCircle2, AlertCircle,
} from "lucide-react";
import { formatIDR, formatDate, formatPct } from "@/lib/format";
import { MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";

export default function ProjectDetail() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: project, isLoading } = useGetProject(id, {
    query: { queryKey: getGetProjectQueryKey(id), enabled: !!id }
  });

  const updateProject = useUpdateProject({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        qc.invalidateQueries({ queryKey: ["/projects"] });
        toast({ title: "Status updated" });
      },
      onError: (e: any) => toast({ title: "Failed to update status", description: e?.message, variant: "destructive" }),
    },
  });

  if (isLoading) return <LoadingPage />;
  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        description="The project you are looking for does not exist or you do not have access."
      />
    );
  }

  const canChangeStatus = user?.role === "MANAGEMENT" || user?.role === "PROJECT_MANAGER";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/projects"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="text-sm text-muted-foreground font-mono mt-1">SPK/PO: {project.code}</p>
          </div>
        </div>
        {canChangeStatus && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Change Status</span>
            <Select
              value={project.status}
              onValueChange={(v) =>
                updateProject.mutate({ id, data: { status: v as any } })
              }
              disabled={updateProject.isPending || project.status === ProjectStatus.CLOSED}
            >
              <SelectTrigger className="w-[180px]" data-testid="select-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ProjectStatus.OBSERVATION}>Observation</SelectItem>
                <SelectItem value={ProjectStatus.ACTIVE}>Active</SelectItem>
                <SelectItem value={ProjectStatus.PAUSE}>Pause</SelectItem>
                <SelectItem value={ProjectStatus.COMPLETE}>Complete</SelectItem>
                <SelectItem value={ProjectStatus.CLOSED} disabled>Closed (auto)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="bg-muted">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4 m-0">
          <OverviewTab project={project} />
        </TabsContent>
        <TabsContent value="financials" className="pt-4 m-0">
          <FinancialsTab projectId={id} />
        </TabsContent>
        <TabsContent value="documents" className="pt-4 m-0">
          <DocumentsTab projectId={id} projectStatus={project.status} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab({ project }: { project: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Project Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InfoRow icon={<Building2 className="h-4 w-4" />} label="Client" value={project.clientName ?? "-"} />
          <InfoRow icon={<User className="h-4 w-4" />} label="Sales" value={project.salesName ?? "-"} />
          <InfoRow icon={<User className="h-4 w-4" />} label="Project Manager" value={project.pmName ?? "-"} />
          <InfoRow
            icon={<Calendar className="h-4 w-4" />}
            label="Timeline"
            value={
              project.startDate || project.endDate
                ? `${project.startDate ? formatDate(project.startDate) : "?"} → ${project.endDate ? formatDate(project.endDate) : "?"}`
                : "Not set"
            }
          />
          {project.description && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{project.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Financial Estimation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Stat label="Revenue (Harga Jual)" value={formatIDR(project.contractValue)} />
          <Stat label="Estimated Operational Cost" value={formatIDR(project.estimatedCost)} muted />
          <Stat label="Estimated Profit" value={formatIDR(project.estimatedProfit)} highlight />
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Margin</p>
            <MarginBadge marginPct={project.marginPct} />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Planned Mandays</p>
            <p className="font-mono text-sm">{project.plannedMandays.toFixed(1)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FinancialsTab({ projectId }: { projectId: string }) {
  const { data: f, isLoading } = useGetProjectFinancials(projectId, {
    query: { queryKey: getGetProjectFinancialsQueryKey(projectId), enabled: !!projectId },
  });

  if (isLoading) return <LoadingPage />;
  if (!f) return <EmptyState title="No financial data" description="Financial data is unavailable for this project." />;

  const profitPositive = (f.actualProfit ?? 0) >= 0;
  const forecastPositive = (f.forecastProfit ?? 0) >= 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <FinancialCard
          icon={<DollarSign className="h-4 w-4 text-primary" />}
          label="Revenue"
          value={formatIDR(f.contractValue)}
          subtitle="Contract value (Harga Jual)"
        />
        <FinancialCard
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
          label="Estimated Cost"
          value={formatIDR(f.estimatedCost)}
          subtitle="Planned operational cost"
        />
        <FinancialCard
          icon={<Activity className="h-4 w-4 text-amber-500" />}
          label="Actual Cost"
          value={formatIDR(f.actualCost ?? 0)}
          subtitle="From approved timesheets × rate"
        />
        <FinancialCard
          icon={profitPositive ? <TrendingUp className="h-4 w-4 text-primary" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          label="Actual Profit / Loss"
          value={formatIDR(f.actualProfit ?? 0)}
          subtitle={`${formatPct(f.marginPct ?? 0)} margin`}
          tone={profitPositive ? "good" : "bad"}
        />
        <FinancialCard
          icon={forecastPositive ? <TrendingUp className="h-4 w-4 text-primary" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          label="Forecasted Final Profit"
          value={formatIDR(f.forecastProfit ?? 0)}
          subtitle={`Projected cost: ${formatIDR(f.forecastCost ?? 0)}`}
          tone={forecastPositive ? "good" : "bad"}
        />
        <FinancialCard
          icon={<Flame className="h-4 w-4 text-amber-500" />}
          label="Burn Rate"
          value={`${(f.burnRatePct ?? 0).toFixed(1)}%`}
          subtitle={`${(f.actualMandays ?? 0).toFixed(1)} / ${(f.plannedMandays ?? 0).toFixed(1)} mandays`}
          progress={Math.min(f.burnRatePct ?? 0, 100)}
        />
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Monthly Cost vs Revenue</CardTitle>
          <CardDescription>Approved timesheet cost compared to amortized revenue per month.</CardDescription>
        </CardHeader>
        <CardContent className="h-[320px]">
          {!f.monthly?.length ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              No approved timesheets yet — chart will populate as cost accrues.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={f.monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="finRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="finCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `Rp ${(v / 1_000_000).toFixed(0)}M`} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                  formatter={(v: number) => formatIDR(v)}
                />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--chart-1))" fillOpacity={1} fill="url(#finRev)" />
                <Area type="monotone" dataKey="cost" name="Cost" stroke="hsl(var(--destructive))" fillOpacity={1} fill="url(#finCost)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentsTab({ projectId, projectStatus }: { projectId: string; projectStatus: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: docs, isLoading } = useListProjectDocuments(projectId, {
    query: { queryKey: getListProjectDocumentsQueryKey(projectId), enabled: !!projectId },
  });

  const createDoc = useCreateProjectDocument({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProjectDocumentsQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: ["/projects"] });
      },
    },
  });
  const deleteDoc = useDeleteDocument({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProjectDocumentsQueryKey(projectId) });
        toast({ title: "Document deleted" });
      },
    },
  });

  const canUpload =
    user?.role === "ADMIN_PROJECT" ||
    user?.role === "MANAGEMENT" ||
    user?.role === "PROJECT_MANAGER";

  const list = docs ?? [];
  const hasBast = list.some((d) => d.type === "BAST");
  const hasInvoice = list.some((d) => d.type === "INVOICE");

  async function handleUpload(file: File, type: "BAST" | "INVOICE") {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/uploads", {
        method: "POST",
        body: fd,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const { fileName, fileUrl } = await res.json();
      await createDoc.mutateAsync({
        id: projectId,
        data: { type: type as DocumentType, fileName, fileUrl },
      });
      toast({ title: `${type} uploaded`, description: fileName });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
  }

  if (isLoading) return <LoadingPage />;

  return (
    <div className="space-y-6">
      {projectStatus === "COMPLETE" && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Awaiting closing documents</p>
              <p className="text-xs text-muted-foreground mt-1">
                Upload both BAST and Invoice (PDF) to automatically close this project.
              </p>
              <div className="flex gap-4 mt-3">
                <Badge variant="outline" className={hasBast ? "bg-primary/10 text-primary border-primary/30" : ""}>
                  {hasBast ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null} BAST {hasBast ? "received" : "pending"}
                </Badge>
                <Badge variant="outline" className={hasInvoice ? "bg-primary/10 text-primary border-primary/30" : ""}>
                  {hasInvoice ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null} Invoice {hasInvoice ? "received" : "pending"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {canUpload && projectStatus !== "CLOSED" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UploadCard
            type="BAST"
            label="BAST"
            description="Berita Acara Serah Terima (PDF)"
            done={hasBast}
            onUpload={(f) => handleUpload(f, "BAST")}
          />
          <UploadCard
            type="INVOICE"
            label="Invoice"
            description="Customer invoice (PDF)"
            done={hasInvoice}
            onUpload={(f) => handleUpload(f, "INVOICE")}
          />
        </div>
      )}

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">All Documents</CardTitle>
          <CardDescription>{list.length} file(s) uploaded</CardDescription>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No documents yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-3" data-testid={`doc-${d.type}`}>
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{d.type}</Badge>
                      <a
                        href={d.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline truncate"
                      >
                        {d.fileName}
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Uploaded by {d.uploadedByName ?? "Unknown"} on {formatDate(d.uploadedAt)}
                    </p>
                  </div>
                  {canUpload && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteDoc.mutate({ id: d.id })}
                      disabled={deleteDoc.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UploadCard({ type, label, description, done, onUpload }: {
  type: string; label: string; description: string; done: boolean; onUpload: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card className={`border-border shadow-sm ${done ? "bg-primary/5 border-primary/30" : ""}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {done && <CheckCircle2 className="h-4 w-4 text-primary" />}
            {label}
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">{type}</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <input
          ref={ref}
          type="file"
          accept="application/pdf"
          className="hidden"
          data-testid={`input-upload-${type}`}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            try { await onUpload(f); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
          }}
        />
        <Button
          variant={done ? "outline" : "default"}
          className="w-full"
          onClick={() => ref.current?.click()}
          disabled={busy}
          data-testid={`button-upload-${type}`}
        >
          <Upload className="h-4 w-4 mr-2" />
          {busy ? "Uploading…" : done ? `Replace ${label} PDF` : `Upload ${label} PDF`}
        </Button>
      </CardContent>
    </Card>
  );
}

function FinancialCard({ icon, label, value, subtitle, tone, progress }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  tone?: "good" | "bad";
  progress?: number;
}) {
  const valueColor =
    tone === "good" ? "text-primary" :
    tone === "bad" ? "text-destructive" :
    "text-foreground";
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className={`text-xl md:text-2xl font-bold font-mono ${valueColor}`}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {progress != null && <Progress value={progress} className="mt-3 h-1.5" />}
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, muted, highlight }: { label: string; value: string; muted?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`font-mono text-sm ${highlight ? "text-primary font-semibold" : muted ? "text-muted-foreground" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
