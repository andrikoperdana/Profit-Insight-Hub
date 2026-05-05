import { useAuth } from "@/lib/auth";
import { canCreateProject } from "@/lib/roles";
import { useCreateProject, useListClients, useListUsers } from "@workspace/api-client-react";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { ProjectStatus, UserRole } from "@workspace/api-client-react";
import { ArrowLeft, Save, Plus, Trash2, Send } from "lucide-react";
import { Link } from "wouter";
import { useEffect } from "react";

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
import { formatIDR } from "@/lib/format";

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
});
type SalesIntake = z.infer<typeof salesIntakeSchema>;

function SalesIntakeForm() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: clients, isLoading: loadingClients } = useListClients();

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

  const form = useForm<SalesIntake>({
    resolver: zodResolver(salesIntakeSchema),
    defaultValues: { code: "", name: "", clientId: "", contractValue: 0 },
  });

  const onSubmit = (data: SalesIntake) => {
    createProject.mutate({
      data: {
        code: data.code,
        name: data.name,
        clientId: data.clientId,
        contractValue: data.contractValue,
        status: ProjectStatus.DRAFT,
      },
    });
  };

  if (loadingClients) return <LoadingPage />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Register a New Project</h1>
          <p className="text-muted-foreground">
            Fill in the basic information — the PMO Director will assign a Project Manager and the PM will complete the details.
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                    <FormLabel>Client *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clients?.map((c) => (
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
            </CardContent>
          </Card>

          <div className="flex justify-end space-x-4">
            <Button variant="outline" asChild>
              <Link href="/">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createProject.isPending} data-testid="button-submit-intake">
              {createProject.isPending ? "Submitting..." : (
                <><Send className="mr-2 h-4 w-4" /> Submit to PMO</>
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
  salesId: z.string().min(1, "Sales is required"),
  pmId: z.string().min(1, "Project Manager is required"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  contractValue: z.coerce.number().min(0, "Revenue must be >= 0"),
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
      resources: [{ role: "KONSULTAN", headcount: 1, mandaysPerPerson: 10, dailyRate: ROLE_RATES.KONSULTAN.rate }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "resources" });

  const watchedResources = form.watch("resources");
  const watchedRevenue = Number(form.watch("contractValue") || 0);

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
        salesId: data.salesId,
        pmId: data.pmId,
        status: ProjectStatus.OBSERVATION,
        startDate: data.startDate || undefined,
        endDate: data.endDate || undefined,
        contractValue: data.contractValue,
        estimatedCost: totals.cost,
        plannedMandays: totals.mandays,
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
                    <FormLabel>Client *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clients?.map((c) => (
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
                    <FormLabel>Selling Price to Client / Revenue (IDR) *</FormLabel>
                    <FormControl><Input type="number" placeholder="0" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle>Team Assignment</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
