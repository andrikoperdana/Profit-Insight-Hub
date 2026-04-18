import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/lib/auth";
import { canCreateProject } from "@/lib/roles";
import { 
  useGetProject, 
  useUpdateProject, 
  useDeleteProject,
  useListProjectResources,
  useAddProjectResource,
  useRemoveProjectResource,
  useGetProjectFinancials,
  useListProjectDocuments,
  useCreateProjectDocument,
  useDeleteDocument,
  useListTimesheets,
  useApproveTimesheet,
  useRejectTimesheet,
  useListUsers,
} from "@workspace/api-client-react";
import { 
  getGetProjectQueryKey,
  getListProjectResourcesQueryKey,
  getGetProjectFinancialsQueryKey,
  getListProjectDocumentsQueryKey,
  getListTimesheetsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  ArrowLeft, Edit, Trash2, Plus, FileText, Download, Users, 
  Clock, DollarSign, LayoutDashboard, FileUp, X, Check, XCircle
} from "lucide-react";
import { formatIDR, formatPct, formatDate, formatDateTime } from "@/lib/format";
import { MarginBadge, ProjectStatusBadge, TimesheetStatusBadge } from "@/components/common/Badges";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingPage, TableSkeleton } from "@/components/common/Loading";
import { ProjectStatus, DocumentType, UserRole } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
  Bar, BarChart
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function ProjectDetail() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("overview");

  const { data: project, isLoading: loadingProject } = useGetProject(id, {
    query: { queryKey: getGetProjectQueryKey(id), enabled: !!id }
  });

  const deleteProject = useDeleteProject({
    mutation: {
      onSuccess: () => {
        toast({ title: "Project deleted" });
        setLocation("/projects");
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Failed to delete", description: err.message });
      }
    }
  });

  const isPMOrAdmin = user?.role === UserRole.MANAGEMENT || user?.role === UserRole.PROJECT_MANAGER;

  if (loadingProject) return <LoadingPage />;
  if (!project) return <EmptyState title="Project not found" description="This project may have been deleted." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="icon" onClick={() => setLocation("/projects")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">{project.name}</h1>
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="text-muted-foreground font-mono text-sm">{project.code} • {project.clientName}</p>
          </div>
        </div>
        
        {isPMOrAdmin && (
          <div className="flex items-center space-x-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Project?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the project and all associated records including timesheets, resources, and documents.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteProject.mutate({ id })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {deleteProject.isPending ? "Deleting..." : "Delete Project"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger value="overview" className="data-[state=active]:bg-background"><LayoutDashboard className="h-4 w-4 mr-2" /> Overview</TabsTrigger>
          <TabsTrigger value="resources" className="data-[state=active]:bg-background"><Users className="h-4 w-4 mr-2" /> Resources</TabsTrigger>
          <TabsTrigger value="timesheets" className="data-[state=active]:bg-background"><Clock className="h-4 w-4 mr-2" /> Timesheets</TabsTrigger>
          <TabsTrigger value="financials" className="data-[state=active]:bg-background"><DollarSign className="h-4 w-4 mr-2" /> Financials</TabsTrigger>
          <TabsTrigger value="documents" className="data-[state=active]:bg-background"><FileText className="h-4 w-4 mr-2" /> Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="m-0">
          <ProjectOverviewTab project={project} isPMOrAdmin={isPMOrAdmin} />
        </TabsContent>
        <TabsContent value="resources" className="m-0">
          <ProjectResourcesTab projectId={id} isPMOrAdmin={isPMOrAdmin} />
        </TabsContent>
        <TabsContent value="timesheets" className="m-0">
          <ProjectTimesheetsTab projectId={id} isPMOrAdmin={isPMOrAdmin} />
        </TabsContent>
        <TabsContent value="financials" className="m-0">
          <ProjectFinancialsTab projectId={id} />
        </TabsContent>
        <TabsContent value="documents" className="m-0">
          <ProjectDocumentsTab projectId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// OVERVIEW TAB
// ------------------------------------------------------------------------------------------------
function ProjectOverviewTab({ project, isPMOrAdmin }: { project: any, isPMOrAdmin: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const updateProject = useUpdateProject({
    mutation: {
      onSuccess: () => {
        toast({ title: "Project updated" });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
        setIsEditOpen(false);
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Update failed", description: err.message });
      }
    }
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-6">
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Project Details</CardTitle>
            {isPMOrAdmin && (
              <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
                <Edit className="h-4 w-4 mr-2" /> Edit
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-muted-foreground">Description</Label>
              <p className="mt-1 text-sm">{project.description || <span className="italic text-muted-foreground">No description provided</span>}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Client</Label>
                <p className="font-medium mt-1">{project.clientName}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <div className="mt-1"><ProjectStatusBadge status={project.status} /></div>
              </div>
              <div>
                <Label className="text-muted-foreground">Project Manager</Label>
                <p className="font-medium mt-1">{project.pmName || "-"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Sales Rep</Label>
                <p className="font-medium mt-1">{project.salesName || "-"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Start Date</Label>
              <p className="font-medium mt-1">{formatDate(project.startDate)}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">End Date</Label>
              <p className="font-medium mt-1">{formatDate(project.endDate)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>Quick Financials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Contract Value</Label>
              <p className="text-2xl font-bold font-mono mt-1">{formatIDR(project.contractValue)}</p>
            </div>
            <div className="pt-4 border-t border-border">
              <Label className="text-muted-foreground">Current Margin</Label>
              <div className="mt-1 text-2xl"><MarginBadge marginPct={project.marginPct} className="text-lg py-1 px-3" /></div>
            </div>
            <div className="pt-4 border-t border-border">
              <Label className="text-muted-foreground">Mandays Usage</Label>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span>{project.actualMandays || 0} / {project.plannedMandays} days</span>
                <span className="font-bold">{project.plannedMandays ? Math.round(((project.actualMandays || 0) / project.plannedMandays) * 100) : 0}%</span>
              </div>
              <div className="mt-2 h-2 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary" 
                  style={{ width: `${Math.min(100, project.plannedMandays ? ((project.actualMandays || 0) / project.plannedMandays) * 100 : 0)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isPMOrAdmin && (
        <EditProjectDialog 
          open={isEditOpen} 
          onOpenChange={setIsEditOpen} 
          project={project} 
          updateProject={updateProject} 
        />
      )}
    </div>
  );
}

function EditProjectDialog({ open, onOpenChange, project, updateProject }: any) {
  const form = useForm({
    defaultValues: {
      name: project.name,
      description: project.description || "",
      status: project.status,
      startDate: project.startDate?.split('T')[0] || "",
      endDate: project.endDate?.split('T')[0] || "",
      contractValue: project.contractValue,
      estimatedCost: project.estimatedCost,
      plannedMandays: project.plannedMandays,
    }
  });

  const onSubmit = (data: any) => {
    updateProject.mutate({ id: project.id, data });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>Update project details.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-1">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>Project Name</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="status" render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {Object.values(ProjectStatus).map((status) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="startDate" render={({ field }) => (
                <FormItem><FormLabel>Start Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="endDate" render={({ field }) => (
                <FormItem><FormLabel>End Date</FormLabel><FormControl><Input type="date" {...field} /></FormControl></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField control={form.control} name="contractValue" render={({ field }) => (
                <FormItem><FormLabel>Contract Value</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="estimatedCost" render={({ field }) => (
                <FormItem><FormLabel>Est. Cost</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="plannedMandays" render={({ field }) => (
                <FormItem><FormLabel>Mandays</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={updateProject.isPending}>Save Changes</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------
// RESOURCES TAB
// ------------------------------------------------------------------------------------------------
function ProjectResourcesTab({ projectId, isPMOrAdmin }: { projectId: string, isPMOrAdmin: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);

  const { data: resources, isLoading } = useListProjectResources(projectId, {
    query: { queryKey: getListProjectResourcesQueryKey(projectId) }
  });
  const { data: users } = useListUsers();

  const addResource = useAddProjectResource({
    mutation: {
      onSuccess: () => {
        toast({ title: "Resource added" });
        queryClient.invalidateQueries({ queryKey: getListProjectResourcesQueryKey(projectId) });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId) }); // actual cost/mandays might change
        setIsAddOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Failed to add", description: err.message });
      }
    }
  });

  const removeResource = useRemoveProjectResource({
    mutation: {
      onSuccess: () => {
        toast({ title: "Resource removed" });
        queryClient.invalidateQueries({ queryKey: getListProjectResourcesQueryKey(projectId) });
      }
    }
  });

  const form = useForm({
    defaultValues: { userId: "", roleInProject: "", plannedMandays: 0, dailyRate: 0 }
  });

  const onSubmit = (data: any) => {
    addResource.mutate({ projectId, data });
  };

  const handleUserSelect = (userId: string) => {
    form.setValue("userId", userId);
    const user = users?.find(u => u.id === userId);
    if (user?.dailyRate) {
      form.setValue("dailyRate", user.dailyRate);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Team Allocation</h3>
        {isPMOrAdmin && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Add Resource</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Resource</DialogTitle>
                <DialogDescription>Assign a team member to this project.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="userId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>User</FormLabel>
                      <Select onValueChange={handleUserSelect} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select user" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {users?.filter(u => u.isActive && u.role !== UserRole.ADMIN_PROJECT).map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="roleInProject" render={({ field }) => (
                    <FormItem><FormLabel>Role in Project (Optional)</FormLabel><FormControl><Input placeholder="Lead Pentester" {...field} /></FormControl></FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="plannedMandays" render={({ field }) => (
                      <FormItem><FormLabel>Planned Mandays</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="dailyRate" render={({ field }) => (
                      <FormItem><FormLabel>Daily Rate (IDR)</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl></FormItem>
                    )} />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={addResource.isPending}>Add Resource</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="border-border shadow-sm">
        {isLoading ? <TableSkeleton /> : !resources?.length ? (
          <EmptyState title="No resources" description="No team members assigned to this project yet." icon={<Users className="h-10 w-10 text-muted-foreground/50" />} />
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Team Member</TableHead>
                <TableHead>Project Role</TableHead>
                <TableHead className="text-right">Planned Days</TableHead>
                <TableHead className="text-right">Actual Days</TableHead>
                <TableHead className="text-right">Daily Rate</TableHead>
                {isPMOrAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map((res) => {
                const initials = res.userName.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
                return (
                  <TableRow key={res.id}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-8 w-8 border border-border"><AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback></Avatar>
                        <div>
                          <p className="font-medium">{res.userName}</p>
                          <p className="text-xs text-muted-foreground">{res.userRole}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{res.roleInProject || "-"}</TableCell>
                    <TableCell className="text-right">{res.plannedMandays}</TableCell>
                    <TableCell className="text-right font-medium">{res.actualMandays}</TableCell>
                    <TableCell className="text-right font-mono">{formatIDR(res.dailyRate)}</TableCell>
                    {isPMOrAdmin && (
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => removeResource.mutate({ projectId, resourceId: res.id })}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// TIMESHEETS TAB
// ------------------------------------------------------------------------------------------------
function ProjectTimesheetsTab({ projectId, isPMOrAdmin }: { projectId: string, isPMOrAdmin: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: timesheets, isLoading } = useListTimesheets({ projectId }, {
    query: { queryKey: getListTimesheetsQueryKey({ projectId }) }
  });

  const approve = useApproveTimesheet({
    mutation: {
      onSuccess: () => {
        toast({ title: "Timesheet approved" });
        queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey({ projectId }) });
      }
    }
  });

  const reject = useRejectTimesheet({
    mutation: {
      onSuccess: () => {
        toast({ title: "Timesheet rejected" });
        queryClient.invalidateQueries({ queryKey: getListTimesheetsQueryKey({ projectId }) });
      }
    }
  });

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold">Logged Timesheets</h3>
      
      <Card className="border-border shadow-sm">
        {isLoading ? <TableSkeleton /> : !timesheets?.length ? (
          <EmptyState title="No timesheets" description="No timesheets have been logged for this project." icon={<Clock className="h-10 w-10 text-muted-foreground/50" />} />
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                {isPMOrAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {timesheets.map((ts) => (
                <TableRow key={ts.id}>
                  <TableCell className="font-medium whitespace-nowrap">{formatDate(ts.workDate)}</TableCell>
                  <TableCell>{ts.userName}</TableCell>
                  <TableCell>{ts.hours}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={ts.description || ""}>{ts.description || "-"}</TableCell>
                  <TableCell><TimesheetStatusBadge status={ts.status} /></TableCell>
                  {isPMOrAdmin && (
                    <TableCell className="text-right space-x-2">
                      {ts.status === "SUBMITTED" && (
                        <>
                          <Button size="sm" variant="ghost" className="text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10" onClick={() => approve.mutate({ id: ts.id })}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <RejectTimesheetDialog tsId={ts.id} reject={reject} />
                        </>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function RejectTimesheetDialog({ tsId, reject }: any) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const onSubmit = () => {
    reject.mutate({ id: tsId, data: { reason } }, {
      onSuccess: () => setOpen(false)
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10">
          <XCircle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Timesheet</DialogTitle>
          <DialogDescription>Please provide a reason for rejection.</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label>Reason</Label>
          <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Incomplete description..." className="mt-2" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={onSubmit} disabled={!reason || reject.isPending}>Reject</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------
// FINANCIALS TAB
// ------------------------------------------------------------------------------------------------
function ProjectFinancialsTab({ projectId }: { projectId: string }) {
  const { data: fin, isLoading } = useGetProjectFinancials(projectId, {
    query: { queryKey: getGetProjectFinancialsQueryKey(projectId) }
  });

  if (isLoading) return <LoadingPage />;
  if (!fin) return <EmptyState title="No financial data" description="Financial tracking is not available for this project." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Contract Value</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold font-mono">{formatIDR(fin.contractValue)}</p></CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Actual Cost</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold font-mono text-destructive">{formatIDR(fin.actualCost)}</p></CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Actual Profit</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold font-mono text-primary">{formatIDR(fin.actualProfit)}</p></CardContent>
        </Card>
        <Card className="border-border shadow-sm bg-muted/20">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Current Margin</CardTitle></CardHeader>
          <CardContent><MarginBadge marginPct={fin.marginPct} className="text-xl px-3 py-1" /></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-border shadow-sm">
          <CardHeader>
            <CardTitle>Monthly Performance</CardTitle>
            <CardDescription>Cost vs Revenue over time</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {fin.monthly && fin.monthly.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fin.monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCst" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `Rp ${v/1000000}M`} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <RechartsTooltip formatter={(value: number) => formatIDR(value)} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--chart-1))" fill="url(#colorRev)" />
                  <Area type="monotone" dataKey="cost" stroke="hsl(var(--destructive))" fill="url(#colorCst)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Not enough data to plot trend</div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle>Forecast vs Estimate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Estimated Cost</span>
                  <span className="font-medium font-mono">{formatIDR(fin.estimatedCost)}</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Forecast Cost</span>
                  <span className={`font-medium font-mono ${fin.forecastCost > fin.estimatedCost ? 'text-destructive' : ''}`}>{formatIDR(fin.forecastCost)}</span>
                </div>
              </div>
              <div className="pt-4 border-t border-border">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Estimated Profit</span>
                  <span className="font-medium font-mono text-primary">{formatIDR(fin.estimatedProfit)}</span>
                </div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Forecast Profit</span>
                  <span className={`font-medium font-mono ${fin.forecastProfit < fin.estimatedProfit ? 'text-destructive' : 'text-primary'}`}>{formatIDR(fin.forecastProfit)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle>Budget Burn Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-end mb-2">
                <span className="text-3xl font-bold">{fin.burnRatePct.toFixed(1)}%</span>
                <span className="text-sm text-muted-foreground">of estimated cost</span>
              </div>
              <div className="h-4 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full ${fin.burnRatePct > 100 ? 'bg-destructive' : 'bg-primary'}`} 
                  style={{ width: `${Math.min(100, fin.burnRatePct)}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// DOCUMENTS TAB
// ------------------------------------------------------------------------------------------------
function ProjectDocumentsTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [fileBase64, setFileBase64] = useState<string>("");

  const { data: documents, isLoading } = useListProjectDocuments(projectId, {
    query: { queryKey: getListProjectDocumentsQueryKey(projectId) }
  });

  const uploadDoc = useCreateProjectDocument({
    mutation: {
      onSuccess: () => {
        toast({ title: "Document uploaded" });
        queryClient.invalidateQueries({ queryKey: getListProjectDocumentsQueryKey(projectId) });
        setIsUploadOpen(false);
        setFileBase64("");
        form.reset();
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Upload failed", description: err.message });
      }
    }
  });

  const deleteDoc = useDeleteDocument({
    mutation: {
      onSuccess: () => {
        toast({ title: "Document deleted" });
        queryClient.invalidateQueries({ queryKey: getListProjectDocumentsQueryKey(projectId) });
      }
    }
  });

  const form = useForm({
    defaultValues: { type: DocumentType.OTHER, fileName: "", invoiceNumber: "", invoiceAmount: 0, invoiceStatus: "", notes: "" }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      form.setValue("fileName", file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFileBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = (data: any) => {
    if (!fileBase64) {
      toast({ variant: "destructive", title: "Error", description: "Please select a file to upload" });
      return;
    }
    uploadDoc.mutate({ projectId, data: { ...data, fileUrl: fileBase64 } });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Project Documents</h3>
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><FileUp className="h-4 w-4 mr-2" /> Upload Document</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label>File</Label>
                  <Input type="file" onChange={handleFileChange} />
                </div>
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Document Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {Object.values(DocumentType).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                {form.watch("type") === DocumentType.INVOICE && (
                  <div className="grid grid-cols-2 gap-4 border p-4 rounded-md bg-muted/20">
                    <FormField control={form.control} name="invoiceNumber" render={({ field }) => (
                      <FormItem><FormLabel>Invoice Number</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="invoiceAmount" render={({ field }) => (
                      <FormItem><FormLabel>Amount</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl></FormItem>
                    )} />
                  </div>
                )}
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notes (Optional)</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={uploadDoc.isPending || !fileBase64}>Upload</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border shadow-sm">
        {isLoading ? <TableSkeleton /> : !documents?.length ? (
          <EmptyState title="No documents" description="Upload BAST, contracts, or invoices here." icon={<FileText className="h-10 w-10 text-muted-foreground/50" />} />
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Uploaded By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="font-medium text-primary hover:underline cursor-pointer flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                      {doc.fileName}
                    </div>
                    {doc.type === DocumentType.INVOICE && doc.invoiceNumber && (
                      <div className="text-xs text-muted-foreground mt-1">Inv: {doc.invoiceNumber} • {formatIDR(doc.invoiceAmount)}</div>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline">{doc.type}</Badge></TableCell>
                  <TableCell>{doc.uploadedByName}</TableCell>
                  <TableCell>{formatDateTime(doc.uploadedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" title="Download" onClick={() => {
                       const link = document.createElement('a');
                       link.href = doc.fileUrl;
                       link.download = doc.fileName;
                       link.click();
                    }}>
                      <Download className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => deleteDoc.mutate({ projectId, documentId: doc.id })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
