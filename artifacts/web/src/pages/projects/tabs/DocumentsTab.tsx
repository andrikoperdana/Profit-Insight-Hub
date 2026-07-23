import { useParams, Link } from "wouter";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import {
  useGetProject,
  useUpdateTask,
  getListProjectTasksQueryKey,
  useGetProjectFinancials,
  useUpdateProject,
  useUpdateProjectReport,
  useListProjectDocuments,
  useCreateProjectDocument,
  useDeleteDocument,
  useListBillingMilestones,
  getListBillingMilestonesQueryKey,
  useListProjectResources,
  useAddProjectResource,
  useProposeProjectResource,
  useRemoveProjectResource,
  getListProjectResourcesQueryKey,
  useListAvailableUsers,
  useListActiveAllUsers,
  useListUsersUnderSupervision,
  useListClients,
  useListTimesheets,
  useListProjectTasks,
  useListProjectExpenses,
  useAddProjectExpense,
  useRemoveProjectExpense,
  useApproveProjectExpense,
  useRejectProjectExpense,
  getListProjectExpensesQueryKey,
  getListClientsQueryKey,
  getGetProjectQueryKey,
  getGetProjectFinancialsQueryKey,
  getListProjectDocumentsQueryKey,
  ProjectStatus,
  DocumentType,
  customFetch,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Building2, User, Calendar, DollarSign, TrendingUp, TrendingDown,
  Activity, Flame, Upload, FileText, Trash2, CheckCircle2, AlertCircle, Plus,
  Pencil, AlertTriangle, Paperclip, X, Link2,
} from "lucide-react";
import { formatIDR, formatDate, formatPct } from "@/lib/format";
import { MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { PdfUploadField, type PdfFileData } from "@/components/common/PdfUploadField";
import { useAuth } from "@/lib/auth";
import { RoleLabels, canViewProjectFinancials, isSuperAdmin } from "@/lib/roles";
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


function DocumentsTab({ projectId, projectStatus }: { projectId: string; projectStatus: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: docs, isLoading } = useListProjectDocuments(projectId, undefined, {
    query: { queryKey: getListProjectDocumentsQueryKey(projectId), enabled: !!projectId },
  });
  const { data: milestones } = useListBillingMilestones(projectId, {
    query: { queryKey: getListBillingMilestonesQueryKey(projectId), enabled: !!projectId },
  });
  const [bastMilestoneId, setBastMilestoneId] = useState<string>("project");

  const createDoc = useCreateProjectDocument({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProjectDocumentsQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
        qc.invalidateQueries({ queryKey: getListBillingMilestonesQueryKey(projectId) });
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
    isSuperAdmin(user?.role) ||
    user?.role === "ADMIN_PROJECT" ||
    user?.role === "MANAGEMENT" ||
    user?.role === "PROJECT_MANAGER";

  const list = docs ?? [];
  const hasBast = list.some((d) => d.type === "BAST");
  const hasInvoice = list.some((d) => d.type === "INVOICE");
  const hasReport = list.some((d) => d.type === "REPORT");

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkType, setLinkType] = useState<string>("REPORT");
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  async function handleAddLink() {
    const name = linkName.trim();
    const url = linkUrl.trim();
    if (!name || !url) {
      toast({ title: "Name and URL are required", variant: "destructive" });
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      toast({
        title: "Invalid URL",
        description: "The link must start with http:// or https://",
        variant: "destructive",
      });
      return;
    }
    try {
      await createDoc.mutateAsync({
        id: projectId,
        data: {
          type: linkType as DocumentType,
          kind: "LINK",
          fileName: name,
          fileUrl: url,
          ...(linkType === "BAST" && bastMilestoneId !== "project"
            ? { billingMilestoneId: bastMilestoneId }
            : {}),
        },
      });
      toast({ title: "Link added", description: name });
      setLinkOpen(false);
      setLinkName("");
      setLinkUrl("");
    } catch (e: any) {
      toast({ title: "Failed to add link", description: e.message, variant: "destructive" });
    }
  }

  async function handleUpload(file: File, type: "BAST" | "INVOICE" | "REPORT") {
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
        data: {
          type: type as DocumentType,
          fileName,
          fileUrl,
          ...(type === "BAST" && bastMilestoneId !== "project"
            ? { billingMilestoneId: bastMilestoneId }
            : {}),
        },
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UploadCard
            type="BAST"
            label="BAST"
            description="Handover Acceptance Report (PDF)"
            done={hasBast}
            onUpload={(f) => handleUpload(f, "BAST")}
            extra={
              (milestones ?? []).length > 0 ? (
                <div className="mb-3">
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    Link to Terms of Payment (optional)
                  </Label>
                  <Select value={bastMilestoneId} onValueChange={setBastMilestoneId}>
                    <SelectTrigger data-testid="select-bast-milestone">
                      <SelectValue placeholder="Project-level BAST" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="project">Project-level BAST</SelectItem>
                      {(milestones ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} ({m.percentage.toFixed(0)}%)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null
            }
          />
          <UploadCard
            type="INVOICE"
            label="Invoice"
            description="Customer invoice (PDF)"
            done={hasInvoice}
            onUpload={(f) => handleUpload(f, "INVOICE")}
          />
          <UploadCard
            type="REPORT"
            label="Final Report"
            description="Final deliverable report (PDF)"
            done={hasReport}
            onUpload={(f) => handleUpload(f, "REPORT")}
          />
        </div>
      )}

      <Card className="border-border shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">All Documents</CardTitle>
              <CardDescription>{list.length} document(s)</CardDescription>
            </div>
            {canUpload && projectStatus !== "CLOSED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLinkOpen(true)}
                data-testid="button-add-link-doc"
              >
                <Link2 className="h-4 w-4 mr-2" /> Add Link
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No documents yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-3" data-testid={`doc-${d.type}`}>
                  {d.kind === "LINK" ? (
                    <Link2 className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{d.type}</Badge>
                      {d.billingMilestoneName && (
                        <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30">
                          {d.billingMilestoneName}
                        </Badge>
                      )}
                      {d.version > 1 && (
                        <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                          v{d.version}
                        </Badge>
                      )}
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
                      {d.version > 1 && " • supersedes previous version"}
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

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Link Document</DialogTitle>
            <DialogDescription>
              Register an external document (SharePoint, Google Drive, etc.) by its URL.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs mb-1.5 block">Document type</Label>
              <Select value={linkType} onValueChange={setLinkType}>
                <SelectTrigger data-testid="select-link-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="REPORT">Report</SelectItem>
                  <SelectItem value="BAST">BAST</SelectItem>
                  <SelectItem value="INVOICE">Invoice</SelectItem>
                  <SelectItem value="CONTRACT">Contract</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Document name</Label>
              <Input
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                placeholder="e.g. Final Pentest Report v2"
                data-testid="input-link-name"
              />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">URL</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://…"
                data-testid="input-link-url"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddLink}
              disabled={createDoc.isPending}
              data-testid="button-save-link-doc"
            >
              {createDoc.isPending ? "Saving…" : "Add Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UploadCard({ type, label, description, done, onUpload, extra }: {
  type: string; label: string; description: string; done: boolean; onUpload: (f: File) => void;
  extra?: React.ReactNode;
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
        {extra}
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


export default DocumentsTab;
