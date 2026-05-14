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


function DraftCompletionCard({ project }: { project: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [description, setDescription] = useState<string>(project.description ?? "");
  const [startDate, setStartDate] = useState<string>(project.startDate ? project.startDate.slice(0, 10) : "");
  const [endDate, setEndDate] = useState<string>(project.endDate ? project.endDate.slice(0, 10) : "");
  const [contractValue, setContractValue] = useState<string>(String(project.contractValue ?? 0));
  const [vatPercent, setVatPercent] = useState<string>(String(project.vatPercent ?? 11));
  const [contractValueIncludesVat, setContractValueIncludesVat] = useState<boolean>(project.contractValueIncludesVat ?? true);
  const [plannedMandays, setPlannedMandays] = useState<string>(String(project.plannedMandays ?? 0));
  const [estimatedCost, setEstimatedCost] = useState<string>(String(project.estimatedCost ?? 0));

  const update = useUpdateProject({
    mutation: {
      onSuccess: async () => {
        toast({ title: "Details saved", description: "Project moved to Observation status." });
        await qc.refetchQueries({ queryKey: getGetProjectQueryKey(project.id) });
      },
      onError: (e: any) =>
        toast({ variant: "destructive", title: "Failed to save", description: e?.message ?? "Unknown error" }),
    },
  });

  function handleSave(promoteToObservation: boolean) {
    const cv = Number(contractValue);
    const ec = Number(estimatedCost);
    const pm = Number(plannedMandays);
    if (cv < 0 || ec < 0 || pm < 0) {
      toast({ variant: "destructive", title: "Invalid value", description: "Revenue, cost, and mandays cannot be negative." });
      return;
    }
    if (promoteToObservation && (!cv || !pm || !startDate || !endDate)) {
      toast({
        variant: "destructive",
        title: "Required fields missing",
        description: "Revenue, Planned Mandays, Start Date, and End Date are required before moving to Observation.",
      });
      return;
    }
    const vp = Number(vatPercent);
    if (!isFinite(vp) || vp < 0 || vp > 100) {
      toast({ variant: "destructive", title: "Invalid VAT", description: "VAT (PPN) percent must be between 0 and 100." });
      return;
    }
    update.mutate({
      id: project.id,
      data: {
        description: description || null,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        contractValue: cv,
        vatPercent: vp,
        contractValueIncludesVat,
        estimatedCost: ec,
        plannedMandays: pm,
        ...(promoteToObservation ? { status: ProjectStatus.OBSERVATION } : {}),
      } as any,
    });
  }

  return (
    <Card className="border-purple-500/40 bg-purple-500/5 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Complete Project Details (DRAFT)</CardTitle>
        <CardDescription>
          Fill in financial data, schedule, and description. Add resources in the <span className="font-medium">Resources</span> tab. Once complete, move the project to <span className="font-medium">Observation</span> status to start execution.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="draft-description">Description</Label>
            <Textarea
              id="draft-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope of work and additional information..."
              className="resize-none h-20 mt-1"
              data-testid="input-draft-description"
            />
          </div>
          <div>
            <Label htmlFor="draft-start">Start Date *</Label>
            <Input id="draft-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" data-testid="input-draft-start" />
          </div>
          <div>
            <Label htmlFor="draft-end">End Date *</Label>
            <Input id="draft-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1" data-testid="input-draft-end" />
          </div>
          <div>
            <Label htmlFor="draft-revenue">Revenue / Selling Price (IDR) *</Label>
            <Input id="draft-revenue" type="number" min={0} value={contractValue} onChange={(e) => setContractValue(e.target.value)} className="mt-1 font-mono" data-testid="input-draft-revenue" />
          </div>
          <div>
            <Label htmlFor="draft-vat">PPN / VAT (%)</Label>
            <Input id="draft-vat" type="number" min={0} max={100} step="0.5" value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} className="mt-1 font-mono" data-testid="input-draft-vat" />
          </div>
          <div>
            <Label htmlFor="draft-vat-type">Revenue type</Label>
            <Select value={contractValueIncludesVat ? "incl" : "excl"} onValueChange={(v) => setContractValueIncludesVat(v === "incl")}>
              <SelectTrigger id="draft-vat-type" className="mt-1" data-testid="select-draft-vat-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="incl">Includes PPN (gross)</SelectItem>
                <SelectItem value="excl">Excludes PPN (DPP)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="draft-mandays">Planned Mandays *</Label>
            <Input id="draft-mandays" type="number" min={0} step="0.5" value={plannedMandays} onChange={(e) => setPlannedMandays(e.target.value)} className="mt-1 font-mono" data-testid="input-draft-mandays" />
          </div>
          <div>
            <Label htmlFor="draft-cost">Estimated Cost (IDR)</Label>
            <Input id="draft-cost" type="number" min={0} value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} className="mt-1 font-mono" data-testid="input-draft-cost" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={update.isPending}
            data-testid="button-save-draft"
          >
            Save as DRAFT
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={update.isPending}
            data-testid="button-promote-observation"
          >
            Save & Move to Observation
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


export default DraftCompletionCard;
