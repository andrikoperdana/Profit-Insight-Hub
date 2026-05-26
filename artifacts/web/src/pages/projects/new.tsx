import { useAuth } from "@/lib/auth";
import { canCreateProject } from "@/lib/roles";
import {
  useCreateProject,
  useListClients,
  useListUsers,
  useListLeads,
  useConvertLead,
} from "@workspace/api-client-react";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ProjectStatus, UserRole } from "@workspace/api-client-react";
import { ArrowLeft, Save, Plus, Trash2, Send } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { ProjectKind } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingPage } from "@/components/common/Loading";
import { PdfUploadField } from "@/components/common/PdfUploadField";
import { formatIDR, SUPPORTED_CURRENCIES } from "@/lib/format";
import NewClientDialog from "@/components/clients/NewClientDialog";
import { InternalInitiativeRulesDialog } from "@/components/projects/InternalInitiativeRulesDialog";

const ROLE_RATES: Record<string, { label: string; rate: number }> = {
  PROJECT_MANAGER: { label: "Project Manager", rate: 2_500_000 },
  KONSULTAN: { label: "Consultant", rate: 1_800_000 },
  TECHNICAL_WRITER: { label: "Technical Writer", rate: 1_200_000 },
};

export default function NewProject() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!canCreateProject(user?.role)) {
      toast({
        variant: "destructive",
        title: "Access Denied",
        description: "You do not have permission to create projects.",
      });
      setLocation("/projects");
    }
  }, [user, setLocation, toast]);

  if (!user) return <LoadingPage />;
  if (user.role === UserRole.SALES) return <SalesIntakeForm />;
  return <FullProjectForm />;
}

/* ------------------------------------------------------------------ */
/* Sales: minimal intake form (Project Name + SPK + Client)           */
/* ------------------------------------------------------------------ */

const salesIntakeSchema = z.object({
  code: z.string().min(2, "SPK/PO Number is required"),
  name: z.string().min(3, "Project name is required"),
  clientId: z.string().min(1, "Select a client"),
  contractValue: z.coerce.number().min(0, "Project value cannot be negative"),
  vatPercent: z.coerce.number().min(0).max(100),
  contractValueIncludesVat: z.boolean(),
});
type SalesIntake = z.infer<typeof salesIntakeSchema>;

function SalesIntakeForm() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: clients, isLoading: loadingClients } = useListClients();
  const { data: leads } = useListLeads();

  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const initialLeadId = params.get("leadId") || "";
  const [selectedLeadId, setSelectedLeadId] = useState<string>(initialLeadId);

  const eligibleLeads = (leads || []).filter(
    (l) => !l.convertedProjectId && (l.stage === "NEGOTIATION" || l.stage === "WON" || l.stage === "PROPOSAL"),
  );
  const selectedLead = eligibleLeads.find((l) => l.id === selectedLeadId) || null;

  const createProject = useCreateProject({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: "Project submitted to PMO",
          description: `${data.code} • awaiting PM assignment`,
        });
        setLocation("/");
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Failed to submit project",
          description: err?.message ?? "Unknown error",
        });
      },
    },
  });

  const convertLead = useConvertLead({
    mutation: {
      onSuccess: (data) => {
        toast({
          title: "Lead converted successfully",
          description: `Project ${data.projectCode} created • awaiting PM assignment`,
        });
        setLocation("/");
      },
      onError: (err: any) => {
        toast({
          variant: "destructive",
          title: "Failed to convert lead",
          description: err?.message ?? "Unknown error",
        });
      },
    },
  });

  const form = useForm<SalesIntake>({
    resolver: zodResolver(salesIntakeSchema),
    defaultValues: { code: "", name: "", clientId: "", contractValue: 0, vatPercent: 11, contractValueIncludesVat: true },
  });

  const [spkFile, setSpkFile] = useState<{ url: string; name: string } | null>(null);
  const [contractFile, setContractFile] = useState<{ url: string; name: string } | null>(null);
  const [description, setDescription] = useState<string>("");

  useEffect(() => {
    if (selectedLead) {
      form.setValue("name", selectedLead.title || "");
      form.setValue("contractValue", Number(selectedLead.estimatedValue || 0));
      if (selectedLead.clientId) form.setValue("clientId", selectedLead.clientId);
      if (selectedLead.notes) setDescription(selectedLead.notes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeadId]);

  const onSubmit = (data: SalesIntake) => {
    if (selectedLead) {
      convertLead.mutate({
        id: selectedLead.id,
        data: {
          code: data.code,
          clientId: selectedLead.clientId ? undefined : data.clientId || undefined,
          clientName:
            selectedLead.clientId || data.clientId
              ? undefined
              : selectedLead.prospectiveClientName || data.name,
          contractValue: data.contractValue,
          vatPercent: data.vatPercent,
          contractValueIncludesVat: data.contractValueIncludesVat,
          description: description || null,
          spkFileUrl: spkFile?.url ?? null,
          spkFileName: spkFile?.name ?? null,
          contractFileUrl: contractFile?.url ?? null,
          contractFileName: contractFile?.name ?? null,
        },
      });
      return;
    }
    createProject.mutate({
      data: {
        code: data.code,
        name: data.name,
        clientId: data.clientId,
        contractValue: data.contractValue,
        vatPercent: data.vatPercent,
        contractValueIncludesVat: data.contractValueIncludesVat,
        status: ProjectStatus.DRAFT,
        description: description || undefined,
        spkFileUrl: spkFile?.url ?? null,
        spkFileName: spkFile?.name ?? null,
        contractFileUrl: contractFile?.url ?? null,
        contractFileName: contractFile?.name ?? null,
      },
    });
  };

  const watchedCv = Number(form.watch("contractValue") || 0);
  const watchedVat = Number(form.watch("vatPercent") || 0);
  const watchedIncludes = form.watch("contractValueIncludesVat");
  const dppPreview = watchedIncludes ? watchedCv / (1 + watchedVat / 100) : watchedCv;
  const ppnPreview = watchedIncludes ? watchedCv - dppPreview : watchedCv * (watchedVat / 100);

  if (loadingClients) return <LoadingPage />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Register New Project</h1>
          <p className="text-muted-foreground">
            Fill in manually, or pick a won lead from the Sales Pipeline to auto-fill. The PMO Director will assign a Project Manager.
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="border-primary/30 bg-primary/5 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Register from Sales Pipeline (optional)</CardTitle>
              <CardDescription>
                Pick a lead in won/negotiation stage to auto-fill the name, value, client, and description. The lead will be marked WON automatically after submit.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Select
                    value={selectedLeadId || "__none__"}
                    onValueChange={(v) => setSelectedLeadId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger data-testid="select-lead-from-pipeline">
                      <SelectValue placeholder="-- Manual (no lead) --" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- Manual (no lead) --</SelectItem>
                      {eligibleLeads.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          [{l.stage}] {l.title} · {formatIDR(l.estimatedValue)}
                          {l.clientName || l.prospectiveClientName ? ` · ${l.clientName || l.prospectiveClientName}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedLeadId && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setSelectedLeadId("")}>
                    Clear selection
                  </Button>
                )}
              </div>
              {selectedLead && (
                <div className="rounded-md border border-primary/30 bg-background/60 p-3 text-xs space-y-1">
                  <p className="font-medium text-foreground">{selectedLead.title}</p>
                  <p className="text-muted-foreground">
                    Owner: {selectedLead.ownerName || "—"} · Stage: {selectedLead.stage} · Est:{" "}
                    {formatIDR(selectedLead.estimatedValue)}
                  </p>
                  {!selectedLead.clientId && (
                    <p className="text-amber-500">
                      This lead does not have a registered client yet — a new client will be created automatically from the selection below (or the prospect name).
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle>Project Information</CardTitle>
              <CardDescription>
                Fill in these 4 basic fields. Other details (mandays, team, cost, schedule) are filled in by the PM after assignment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name *</FormLabel>
                    <FormControl><Input placeholder="e.g. Pentest Web Application Bank XYZ" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SPK / PO Number *</FormLabel>
                    <FormControl><Input placeholder="e.g. SPK-2026-005" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Client *</FormLabel>
                      <NewClientDialog onCreated={(id) => field.onChange(id)} />
                    </div>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clients
                          ?.filter((c) => c.name.trim().toLowerCase() !== "internal")
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contractValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Value / Selling Price to Client (IDR) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g. 250000000"
                        className="font-mono"
                        data-testid="input-intake-contract-value"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="vatPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VAT (%)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={100} step={0.5} className="font-mono" data-testid="input-intake-vat-percent" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contractValueIncludesVat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Value type</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "incl")}
                        value={field.value ? "incl" : "excl"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-intake-vat-type"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="incl">Includes VAT (gross)</SelectItem>
                          <SelectItem value="excl">Excludes VAT (DPP / net)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1">
                  <p className="text-muted-foreground uppercase tracking-wide">Breakdown</p>
                  <p className="font-mono">DPP: {formatIDR(dppPreview)}</p>
                  <p className="font-mono text-muted-foreground">VAT: {formatIDR(ppnPreview)}</p>
                </div>
              </div>
              <div>
                <FormLabel>Description / Scope (optional)</FormLabel>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Summary of the scope of work..."
                  className="resize-none mt-2"
                  data-testid="textarea-intake-description"
                />
              </div>
              <PdfUploadField
                label="SPK / PO File (PDF)"
                fileName={spkFile?.name ?? null}
                onChange={setSpkFile}
                testId="upload-intake-spk"
              />
              <PdfUploadField
                label="Contract File (PDF)"
                fileName={contractFile?.name ?? null}
                onChange={setContractFile}
                testId="upload-intake-contract"
              />
            </CardContent>
          </Card>

          <div className="flex justify-end space-x-4">
            <Button variant="outline" asChild>
              <Link href="/">Cancel</Link>
            </Button>
            <Button
              type="submit"
              disabled={createProject.isPending || convertLead.isPending}
              data-testid="button-submit-intake"
            >
              {createProject.isPending || convertLead.isPending ? (
                "Submitting..."
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {selectedLead ? "Convert Lead & Submit to PMO" : "Submit to PMO"}
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Management/PM: full project form                                   */
/* ------------------------------------------------------------------ */

const resourceRowSchema = z.object({
  role: z.string().min(1, "Role required"),
  headcount: z.coerce.number().min(1, "At least 1"),
  mandaysPerPerson: z.coerce.number().min(0.5, "At least 0.5"),
  dailyRate: z.coerce.number().min(0, "Daily rate must be >= 0"),
});

const createProjectSchema = z.object({
  code: z.string().min(2, "SPK/PO Number is required"),
  name: z.string().min(3, "Project name required"),
  description: z.string().optional(),
  clientId: z.string().min(1, "Client is required"),
  salesId: z.string().optional(),
  pmId: z.string().min(1, "Project Manager is required"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  contractValue: z.coerce.number().min(0, "Revenue must be >= 0"),
  currency: z.string().default("IDR"),
  exchangeRate: z.coerce.number().min(0.0001).default(1),
  vatPercent: z.coerce.number().min(0).max(100),
  contractValueIncludesVat: z.boolean(),
  resources: z.array(resourceRowSchema).min(1, "Add at least one resource requirement"),
});

type FormValues = z.infer<typeof createProjectSchema>;

function FullProjectForm() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: clients, isLoading: loadingClients } = useListClients();
  const { data: users, isLoading: loadingUsers } = useListUsers();

  const createProject = useCreateProject({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Project created", description: `${data.code} • status: Observation` });
        setLocation(`/projects/${data.id}`);
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Failed to create project", description: err?.message ?? "Unknown error" });
      },
    },
  });
  const { user: currentUser } = useAuth();

  const form = useForm<FormValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      clientId: "",
      salesId: "",
      pmId: "",
      startDate: "",
      endDate: "",
      contractValue: 0,
      currency: "IDR",
      exchangeRate: 1,
      vatPercent: 11,
      contractValueIncludesVat: true,
      resources: [{ role: "KONSULTAN", headcount: 1, mandaysPerPerson: 10, dailyRate: ROLE_RATES.KONSULTAN.rate }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "resources" });

  const [spkFile, setSpkFile] = useState<{ url: string; name: string } | null>(null);
  const [contractFile, setContractFile] = useState<{ url: string; name: string } | null>(null);

  const watchedResources = form.watch("resources");
  const watchedRevenue = Number(form.watch("contractValue") || 0);
  const watchedClientId = form.watch("clientId");

  const selectedClient = useMemo(
    () => clients?.find((c) => c.id === watchedClientId) ?? null,
    [clients, watchedClientId],
  );
  const isInternal = (selectedClient?.name ?? "").trim().toLowerCase() === "internal";

  useEffect(() => {
    if (isInternal) {
      form.setValue("vatPercent", 0);
      form.setValue("contractValueIncludesVat", false);
      if (currentUser?.id && !form.getValues("salesId")) {
        form.setValue("salesId", currentUser.id);
      }
    } else {
      // restore commercial defaults when switching back to a regular client
      if (form.getValues("vatPercent") === 0) form.setValue("vatPercent", 11);
      if (form.getValues("contractValueIncludesVat") === false) {
        form.setValue("contractValueIncludesVat", true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInternal]);

  const totals = (watchedResources || []).reduce(
    (acc, r) => {
      const head = Number(r.headcount || 0);
      const md = Number(r.mandaysPerPerson || 0);
      const rate = Number(r.dailyRate || 0);
      const totalMandays = head * md;
      acc.mandays += totalMandays;
      acc.cost += totalMandays * rate;
      return acc;
    },
    { mandays: 0, cost: 0 },
  );

  const estimatedProfit = watchedRevenue - totals.cost;
  const marginPct = watchedRevenue > 0 ? (estimatedProfit / watchedRevenue) * 100 : 0;

  const onSubmit = (data: FormValues) => {
    createProject.mutate({
      data: {
        code: data.code,
        name: data.name,
        description: data.description,
        clientId: data.clientId,
        salesId: isInternal ? (currentUser?.id ?? data.salesId ?? undefined) : data.salesId,
        pmId: data.pmId,
        status: ProjectStatus.OBSERVATION,
        kind: isInternal ? ProjectKind.INTERNAL : ProjectKind.CLIENT,
        startDate: data.startDate || undefined,
        endDate: data.endDate || undefined,
        contractValue: data.contractValue,
        currency: isInternal ? "IDR" : (data.currency || "IDR"),
        exchangeRate: isInternal ? 1 : Number(data.exchangeRate || 1),
        vatPercent: isInternal ? 0 : data.vatPercent,
        contractValueIncludesVat: isInternal ? false : data.contractValueIncludesVat,
        estimatedCost: totals.cost,
        plannedMandays: totals.mandays,
        spkFileUrl: isInternal ? null : (spkFile?.url ?? null),
        spkFileName: isInternal ? null : (spkFile?.name ?? null),
        contractFileUrl: isInternal ? null : (contractFile?.url ?? null),
        contractFileName: isInternal ? null : (contractFile?.name ?? null),
      },
    });
  };

  if (loadingClients || loadingUsers) {
    return <LoadingPage />;
  }

  const pms = users?.filter((u) => u.role === UserRole.PROJECT_MANAGER || u.role === UserRole.MANAGEMENT) || [];
  const sales = users?.filter((u) => u.role === UserRole.SALES || u.role === UserRole.MANAGEMENT) || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/projects"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Project Registration</h1>
          <p className="text-muted-foreground">New engagement starts in <span className="text-primary font-medium">Observation</span> status.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle>Basic Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SPK/PO Number *</FormLabel>
                    <FormControl><Input placeholder="SPK-2026-005" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name *</FormLabel>
                    <FormControl><Input placeholder="Pentest Web Application" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Client *</FormLabel>
                      <NewClientDialog onCreated={(id) => field.onChange(id)} />
                    </div>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clients
                          ?.filter((c) =>
                            currentUser?.role === UserRole.MANAGEMENT
                              ? true
                              : c.name.trim().toLowerCase() !== "internal",
                          )
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contractValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {isInternal ? "Internal Budget *" : "Selling Price to Client / Revenue *"}
                    </FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isInternal && (
                <>
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {SUPPORTED_CURRENCIES.map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {form.watch("currency") !== "IDR" && (
                    <FormField
                      control={form.control}
                      name="exchangeRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Kurs ke IDR *</FormLabel>
                          <FormControl><Input type="number" step="0.01" placeholder="contoh: 16500" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <FormField
                    control={form.control}
                    name="vatPercent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>VAT (%)</FormLabel>
                        <FormControl><Input type="number" min={0} max={100} step={0.5} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contractValueIncludesVat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Revenue type</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "incl")} value={field.value ? "incl" : "excl"}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="incl">Includes VAT (gross)</SelectItem>
                            <SelectItem value="excl">Excludes VAT (DPP)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              {isInternal && (
                <div className="col-span-1 md:col-span-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium mb-1">Internal Initiative Mode</p>
                      <p>
                        This project is treated as an internal initiative: no VAT, invoice, client SPK, or contract. The "Internal Budget" field acts as a spending cap. It will automatically appear in the <span className="font-mono">Internal Initiative Cost</span> report and be excluded from profitability/VAT reports. The internal SPK is issued and signed by HR, while a Project Manager supervises execution and approves resource clocking (timesheet hours).
                      </p>
                    </div>
                    <InternalInitiativeRulesDialog
                      trigger={
                        <button
                          type="button"
                          className="shrink-0 underline text-amber-100 hover:text-white"
                          data-testid="button-internal-rules-from-form"
                        >
                          Full rules
                        </button>
                      }
                    />
                  </div>
                </div>
              )}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="col-span-1 md:col-span-2">
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea placeholder="Scope of work and details..." className="resize-none" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isInternal && (
                <>
                  <PdfUploadField
                    label="SPK / PO File (PDF)"
                    fileName={spkFile?.name ?? null}
                    onChange={setSpkFile}
                    testId="upload-full-spk"
                  />
                  <PdfUploadField
                    label="Contract File (PDF)"
                    fileName={contractFile?.name ?? null}
                    onChange={setContractFile}
                    testId="upload-full-contract"
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle>Team Assignment</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {!isInternal && (
                <FormField
                  control={form.control}
                  name="salesId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sales *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select Sales" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {sales.map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="pmId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Manager *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select PM" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {pms.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-2">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date</FormLabel>
                      <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Resource Requirements</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => append({ role: "KONSULTAN", headcount: 1, mandaysPerPerson: 5, dailyRate: ROLE_RATES.KONSULTAN.rate })}>
                <Plus className="h-4 w-4 mr-2" /> Add Row
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="text-left p-2 font-medium">Role</th>
                      <th className="text-right p-2 font-medium w-32">Headcount</th>
                      <th className="text-right p-2 font-medium w-32">Mandays/Person</th>
                      <th className="text-right p-2 font-medium w-40">Daily Rate</th>
                      <th className="text-right p-2 font-medium w-44">Subtotal Cost</th>
                      <th className="w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f, idx) => {
                      const r = watchedResources?.[idx];
                      const head = Number(r?.headcount || 0);
                      const md = Number(r?.mandaysPerPerson || 0);
                      const rate = Number(r?.dailyRate || 0);
                      const subtotal = head * md * rate;
                      return (
                        <tr key={f.id} className="border-t border-border">
                          <td className="p-2">
                            <FormField
                              control={form.control}
                              name={`resources.${idx}.role`}
                              render={({ field }) => (
                                <Select
                                  onValueChange={(v) => {
                                    field.onChange(v);
                                    const defaultRate = ROLE_RATES[v]?.rate;
                                    if (defaultRate !== undefined) {
                                      form.setValue(`resources.${idx}.dailyRate`, defaultRate, { shouldDirty: true });
                                    }
                                  }}
                                  value={field.value}
                                >
                                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(ROLE_RATES).map(([key, v]) => (
                                      <SelectItem key={key} value={key}>{v.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </td>
                          <td className="p-2">
                            <FormField
                              control={form.control}
                              name={`resources.${idx}.headcount`}
                              render={({ field }) => (
                                <Input type="number" min={1} className="h-9 text-right" {...field} />
                              )}
                            />
                          </td>
                          <td className="p-2">
                            <FormField
                              control={form.control}
                              name={`resources.${idx}.mandaysPerPerson`}
                              render={({ field }) => (
                                <Input type="number" min={0.5} step={0.5} className="h-9 text-right" {...field} />
                              )}
                            />
                          </td>
                          <td className="p-2">
                            <FormField
                              control={form.control}
                              name={`resources.${idx}.dailyRate`}
                              render={({ field }) => (
                                <Input
                                  type="number"
                                  min={0}
                                  step={50000}
                                  className="h-9 text-right font-mono"
                                  data-testid={`input-daily-rate-${idx}`}
                                  {...field}
                                />
                              )}
                            />
                          </td>
                          <td className="p-2 text-right font-mono">{formatIDR(subtotal)}</td>
                          <td className="p-2">
                            <Button type="button" variant="ghost" size="icon" onClick={() => fields.length > 1 && remove(idx)} disabled={fields.length === 1}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {form.formState.errors.resources?.message && (
                <p className="text-sm text-destructive">{form.formState.errors.resources.message}</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-border">
                <SummaryStat label="Total Mandays" value={`${totals.mandays.toFixed(1)}`} />
                <SummaryStat label="Estimated Operational Cost" value={formatIDR(totals.cost)} mono />
                <SummaryStat label="Revenue" value={formatIDR(watchedRevenue)} mono />
                <SummaryStat
                  label="Estimated Profit"
                  value={`${formatIDR(estimatedProfit)} (${marginPct.toFixed(1)}%)`}
                  mono
                  highlight={estimatedProfit >= 0 ? "good" : "bad"}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end space-x-4">
            <Button variant="outline" asChild>
              <Link href="/projects">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createProject.isPending}>
              {createProject.isPending ? "Creating..." : (
                <><Save className="mr-2 h-4 w-4" /> Save Project</>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

function SummaryStat({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: "good" | "bad" }) {
  const color =
    highlight === "good" ? "text-primary" :
      highlight === "bad" ? "text-destructive" :
        "text-foreground";
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-semibold ${color} ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
