import { useState, useRef } from "react";
import {
  useListProjectReports,
  useCreateProjectReport,
  useUpdateProjectReportItem,
  useDeleteProjectReport,
  useListProjectWorkstreams,
  getListProjectReportsQueryKey,
  getGetProjectQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  Upload, FileText, Trash2, CheckCircle2, Plus, Pencil, ExternalLink, ChevronLeft, ChevronRight,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/common/EmptyState";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type ReportFormState = {
  title: string;
  coverUrl: string;
  link: string;
  note: string;
  workstreamId: string;
};

const EMPTY_FORM: ReportFormState = {
  title: "",
  coverUrl: "",
  link: "",
  note: "",
  workstreamId: "",
};

const NONE_VALUE = "__none__";

function ReportTab({ projectId, project }: { projectId: string; project: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canEdit =
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id) ||
    (user?.role === "TECHNICAL_WRITER" && project.technicalWriterId === user?.id);

  const [page, setPage] = useState(1);
  const pageSize = 5;

  const { data, isLoading } = useListProjectReports(projectId, { page, pageSize });
  const { data: workstreams } = useListProjectWorkstreams(projectId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ReportFormState>(EMPTY_FORM);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListProjectReportsQueryKey(projectId) });
    qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
  };

  const createMut = useCreateProjectReport({
    mutation: {
      onSuccess: () => {
        toast({ title: "Report added" });
        invalidate();
        closeDialog();
      },
      onError: (e: any) =>
        toast({ title: "Failed", description: e?.message ?? "Could not add report", variant: "destructive" }),
    },
  });

  const updateMut = useUpdateProjectReportItem({
    mutation: {
      onSuccess: () => {
        toast({ title: "Report updated" });
        invalidate();
        closeDialog();
      },
      onError: (e: any) =>
        toast({ title: "Failed", description: e?.message ?? "Could not update report", variant: "destructive" }),
    },
  });

  const deleteMut = useDeleteProjectReport({
    mutation: {
      onSuccess: () => {
        toast({ title: "Report deleted" });
        invalidate();
      },
      onError: (e: any) =>
        toast({ title: "Failed", description: e?.message ?? "Could not delete", variant: "destructive" }),
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (r: any) => {
    setEditingId(r.id);
    setForm({
      title: r.title ?? "",
      coverUrl: r.coverUrl ?? "",
      link: r.link ?? "",
      note: r.note ?? "",
      workstreamId: r.workstreamId ?? "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleFile = (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 4 MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, coverUrl: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  const submit = () => {
    const title = form.title.trim();
    if (!title) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    const payload = {
      title,
      coverUrl: form.coverUrl || null,
      link: form.link.trim() || null,
      note: form.note.trim() || null,
      workstreamId: form.workstreamId || null,
    } as any;
    if (editingId) {
      updateMut.mutate({ reportId: editingId, data: payload });
    } else {
      createMut.mutate({ id: projectId, data: payload });
    }
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const useWorkstreams = !!project.useWorkstreams && (workstreams?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Project Reports
            </CardTitle>
            <CardDescription>
              Upload one or more report deliverables (cover image + link). When both cover and link are filled,
              the PM and Admin Project are notified. Add a separate report per workstream if needed.
            </CardDescription>
          </div>
          {canEdit && (
            <Button onClick={openCreate} size="sm" data-testid="button-add-report">
              <Plus className="h-4 w-4 mr-1" /> Add report
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-12 w-12 text-muted-foreground/50" />}
              title="No reports yet"
              description={canEdit ? "Click 'Add report' to upload your first one." : "Reports will appear here once the team adds them."}
            />
          ) : (
            <div className="space-y-3">
              {items.map((r: any) => (
                <div
                  key={r.id}
                  className="flex flex-col sm:flex-row gap-4 rounded-md border border-border p-3"
                  data-testid={`report-row-${r.id}`}
                >
                  <div className="shrink-0">
                    {r.coverUrl ? (
                      <img
                        src={r.coverUrl}
                        alt={r.title}
                        className="w-32 h-20 object-cover rounded border border-border"
                      />
                    ) : (
                      <div className="w-32 h-20 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground">
                        <FileText className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-medium truncate">{r.title}</h4>
                      {r.workstreamCode && (
                        <Badge variant="outline" className="text-xs">
                          {r.workstreamCode}{r.workstreamName ? ` · ${r.workstreamName}` : ""}
                        </Badge>
                      )}
                      {r.submittedAt && (
                        <Badge variant="outline" className="text-xs text-emerald-500 border-emerald-500/30">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Submitted {formatDate(r.submittedAt)}
                        </Badge>
                      )}
                    </div>
                    {r.link && (
                      <a
                        href={r.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary underline break-all inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {r.link}
                      </a>
                    )}
                    {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
                    <p className="text-xs text-muted-foreground">
                      Added {formatDate(r.createdAt)}{r.createdByName ? ` by ${r.createdByName}` : ""}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex sm:flex-col gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(r)}
                        data-testid={`button-edit-report-${r.id}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm(`Delete report "${r.title}"?`)) {
                            deleteMut.mutate({ reportId: r.id });
                          }
                        }}
                        data-testid={`button-delete-report-${r.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {total > 0 && (
            <div className="flex items-center justify-between pt-2 text-sm text-muted-foreground">
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  data-testid="button-reports-prev"
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="text-xs">
                  Page {page} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  data-testid="button-reports-next"
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit report" : "Add report"}</DialogTitle>
            <DialogDescription>
              Upload a cover image and paste the link to the report (e.g. Google Drive). Both are optional, but the
              PM and Admin Project are only notified once both are filled in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="e.g. Final Report — Workstream Pentest"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                data-testid="input-report-title"
              />
            </div>
            {useWorkstreams && (
              <div className="space-y-2">
                <Label>Workstream (optional)</Label>
                <Select
                  value={form.workstreamId || NONE_VALUE}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, workstreamId: v === NONE_VALUE ? "" : v }))
                  }
                >
                  <SelectTrigger data-testid="select-report-workstream">
                    <SelectValue placeholder="Whole project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Whole project</SelectItem>
                    {(workstreams ?? []).map((w: any) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Cover photo</Label>
              {form.coverUrl ? (
                <div className="relative">
                  <img
                    src={form.coverUrl}
                    alt="Report cover"
                    className="w-full h-40 object-cover rounded-md border border-border"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-2 right-2"
                    onClick={() => setForm((f) => ({ ...f, coverUrl: "" }))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div
                  className="rounded-md border border-dashed border-border p-6 text-center cursor-pointer hover:bg-muted/30"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Click to upload (max 4 MB)</p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.currentTarget.value = "";
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Report link</Label>
              <Input
                placeholder="https://drive.google.com/..."
                value={form.link}
                onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
                data-testid="input-report-link"
              />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Textarea
                placeholder="Short description or context for this report"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={createMut.isPending || updateMut.isPending}
              data-testid="button-save-report"
            >
              {(createMut.isPending || updateMut.isPending) ? "Saving..." : "Save report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ReportTab;
