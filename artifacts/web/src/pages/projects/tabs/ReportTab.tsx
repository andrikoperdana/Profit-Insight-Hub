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
  Pencil, AlertTriangle, Paperclip, X,
} from "lucide-react";
import { formatIDR, formatDate, formatPct } from "@/lib/format";
import { MarginBadge, ProjectStatusBadge } from "@/components/common/Badges";
import { LoadingPage } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { PdfUploadField, type PdfFileData } from "@/components/common/PdfUploadField";
import { useAuth } from "@/lib/auth";
import { RoleLabels, canViewProjectFinancials } from "@/lib/roles";
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


function ReportTab({ projectId, project }: { projectId: string; project: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canEdit =
    user?.role === "MANAGEMENT" ||
    (user?.role === "PROJECT_MANAGER" && project.pmId === user?.id) ||
    (user?.role === "TECHNICAL_WRITER" && project.technicalWriterId === user?.id);

  const [coverUrl, setCoverUrl] = useState<string>(project.reportCoverUrl ?? "");
  const [reportLink, setReportLink] = useState<string>(project.reportLink ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = useUpdateProjectReport({
    mutation: {
      onSuccess: () => {
        toast({ title: "Report saved" });
        qc.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) });
      },
      onError: (e: any) =>
        toast({ title: "Failed", description: e?.message ?? "Could not save", variant: "destructive" }),
    },
  });

  const handleFile = (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 4 MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCoverUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Project Report
          </CardTitle>
          <CardDescription>
            Upload the report cover image and paste the report link (e.g. Google Drive). When both are filled, the PM and Admin Project will be notified.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {project.reportSubmittedAt && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-500 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Submitted on {formatDate(project.reportSubmittedAt)}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Cover photo</Label>
              {coverUrl ? (
                <div className="relative">
                  <img
                    src={coverUrl}
                    alt="Report cover"
                    className="w-full h-48 object-cover rounded-md border border-border"
                  />
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute top-2 right-2"
                      onClick={() => setCoverUrl("")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ) : (
                <div
                  className="rounded-md border border-dashed border-border p-6 text-center cursor-pointer hover:bg-muted/30"
                  onClick={() => canEdit && fileInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {canEdit ? "Click to upload (max 4 MB)" : "No cover uploaded"}
                  </p>
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
                value={reportLink}
                onChange={(e) => setReportLink(e.target.value)}
                disabled={!canEdit}
                data-testid="input-report-link"
              />
              {reportLink && (
                <a
                  href={reportLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary underline break-all"
                >
                  {reportLink}
                </a>
              )}
            </div>
          </div>
          {canEdit && (
            <div className="flex justify-end">
              <Button
                onClick={() =>
                  update.mutate({
                    id: projectId,
                    data: { reportCoverUrl: coverUrl || null, reportLink: reportLink || null } as any,
                  })
                }
                disabled={update.isPending}
                data-testid="button-save-report"
              >
                {update.isPending ? "Saving..." : "Save report"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


export default ReportTab;
