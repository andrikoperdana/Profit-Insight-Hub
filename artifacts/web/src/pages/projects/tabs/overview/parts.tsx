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


type RequiredField = { key: string; label: string };

function getMissingRequiredFields(project: any): RequiredField[] {
  const missing: RequiredField[] = [];
  if (!project.clientId) missing.push({ key: "clientId", label: "Client" });
  if (!project.startDate) missing.push({ key: "startDate", label: "Start Date" });
  if (!project.endDate) missing.push({ key: "endDate", label: "End Date" });
  if (!project.contractValue || Number(project.contractValue) <= 0)
    missing.push({ key: "contractValue", label: "Revenue (Selling Price)" });
  if (!project.plannedMandays || Number(project.plannedMandays) <= 0)
    missing.push({ key: "plannedMandays", label: "Planned Mandays" });
  if (!project.estimatedCost || Number(project.estimatedCost) <= 0)
    missing.push({ key: "estimatedCost", label: "Estimated Cost" });
  if (!project.description || !String(project.description).trim())
    missing.push({ key: "description", label: "Description" });
  return missing;
}


function OverviewFileSlot({
  label,
  url,
  fileName,
  canEdit,
  uploading,
  testIdPrefix,
  downloadFallback,
  downloadLinkLabel,
  onUpload,
  onRemove,
}: {
  label: string;
  url: string | null | undefined;
  fileName: string | null | undefined;
  canEdit: boolean;
  uploading: boolean;
  testIdPrefix: string;
  downloadFallback: string;
  downloadLinkLabel: string;
  onUpload: (data: PdfFileData) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <FileText className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        {url ? (
          <div className="flex items-center gap-2">
            <a
              href={url}
              download={fileName ?? downloadFallback}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline truncate block flex-1"
              data-testid={`link-${testIdPrefix}-file`}
            >
              {fileName ?? downloadLinkLabel}
            </a>
            {canEdit && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onRemove}
                disabled={uploading}
                data-testid={`button-${testIdPrefix}-remove`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ) : canEdit ? (
          <PdfUploadField
            label=""
            fileName={null}
            onChange={(data) => { if (data) onUpload(data); }}
            testId={`upload-${testIdPrefix}`}
            disabled={uploading}
          />
        ) : (
          <p className="text-sm text-muted-foreground italic">Not uploaded</p>
        )}
      </div>
    </div>
  );
}


function ConfirmRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className={multiline ? "" : "flex items-center justify-between gap-3"}>
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`${multiline ? "block mt-1 text-sm whitespace-pre-wrap" : "font-mono text-sm text-right"} text-foreground`}>
        {value}
      </span>
    </div>
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




export { OverviewFileSlot, ConfirmRow, InfoRow, getMissingRequiredFields };
export type { RequiredField };
