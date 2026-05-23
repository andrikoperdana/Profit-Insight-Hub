import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { canManageClients } from "@/lib/roles";
import { useListClients, useCreateClient } from "@workspace/api-client-react";
import { getListClientsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Mail, Phone, Download } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { exportCsv } from "@/lib/exports";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { TableSkeleton } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination, usePagination } from "@/components/common/Pagination";

const clientSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  contactPerson: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional(),
  industry: z.string().optional(),
});

type ClientFormValues = z.infer<typeof clientSchema>;

export default function ClientsList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: clients, isLoading } = useListClients({
    query: { queryKey: getListClientsQueryKey() }
  });

  const createClient = useCreateClient({
    mutation: {
      onSuccess: () => {
        toast({ title: "Client created successfully" });
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        setIsCreateOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Failed to create client", description: err.message });
      }
    }
  });

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: { name: "", contactPerson: "", email: "", phone: "", industry: "" }
  });

  const onSubmit = (data: ClientFormValues) => {
    createClient.mutate({ data });
  };

  const pager = usePagination(clients);

  function handleExportCsv() {
    const rows = (clients ?? []).map((c) => ({
      Company: c.name,
      Industry: c.industry ?? "",
      ContactPerson: c.contactPerson ?? "",
      Email: c.email ?? "",
      Phone: c.phone ?? "",
      AddedAt: c.createdAt ?? "",
    }));
    exportCsv("clients", rows);
  }

  const hasAccess = canManageClients(user?.role) || user?.role === "FINANCE";
  const isReadOnly = user?.role === "FINANCE";

  if (!hasAccess) {
    return (
      <EmptyState 
        title="Access Denied" 
        description="You don't have permission to view clients." 
        icon={<Building2 className="h-10 w-10 text-muted-foreground/50" />} 
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Clients</h1>
          <p className="text-muted-foreground">Manage client directory and contact info.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleExportCsv}
            disabled={!clients?.length}
            data-testid="button-export-clients-csv"
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            {!isReadOnly && (
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" /> New Client
                </Button>
              </DialogTrigger>
            )}
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create New Client</DialogTitle>
              <DialogDescription>Add a new client to the directory.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name *</FormLabel>
                      <FormControl><Input placeholder="Acme Corp" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="industry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Industry</FormLabel>
                      <FormControl><Input placeholder="Finance, Healthcare, etc." {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contactPerson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Person</FormLabel>
                        <FormControl><Input placeholder="Jane Doe" {...field} value={field.value || ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl><Input placeholder="+62 8..." {...field} value={field.value || ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" placeholder="contact@acme.com" {...field} value={field.value || ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createClient.isPending}>
                    {createClient.isPending ? "Creating..." : "Create Client"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton columns={4} rows={6} />
      ) : !clients?.length ? (
        <EmptyState 
          title="No clients found" 
          description="Get started by creating your first client." 
          icon={<Building2 className="h-12 w-12 text-muted-foreground/50" />}
          action={isReadOnly ? undefined : <Button onClick={() => setIsCreateOpen(true)}><Plus className="h-4 w-4 mr-2" /> Add Client</Button>}
        />
      ) : (
        <Card className="overflow-hidden border-border shadow-sm">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Contact Details</TableHead>
                <TableHead className="text-right">Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.pageItems.map((client) => (
                <TableRow key={client.id} className="group">
                  <TableCell>
                    <div className="font-medium text-foreground">{client.name}</div>
                    {client.industry && <div className="text-xs text-muted-foreground">{client.industry}</div>}
                  </TableCell>
                  <TableCell>
                    {client.contactPerson || <span className="text-muted-foreground italic">Not specified</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col space-y-1 text-sm text-muted-foreground">
                      {client.email && (
                        <div className="flex items-center"><Mail className="h-3 w-3 mr-2" /> {client.email}</div>
                      )}
                      {client.phone && (
                        <div className="flex items-center"><Phone className="h-3 w-3 mr-2" /> {client.phone}</div>
                      )}
                      {!client.email && !client.phone && <span className="italic">No contact details</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {new Date(client.createdAt).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={pager.page}
            pageSize={pager.pageSize}
            total={pager.total}
            totalPages={pager.totalPages}
            onPageChange={pager.setPage}
            onPageSizeChange={pager.setPageSize}
            testId="clients-pagination"
          />
        </Card>
      )}
    </div>
  );
}
