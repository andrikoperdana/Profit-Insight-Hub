import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { canManageUsers, RoleLabels } from "@/lib/roles";
import { useListUsers, useCreateUser, useUpdateUser } from "@workspace/api-client-react";
import { getListUsersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldAlert, Pencil, Download } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { formatIDR } from "@/lib/format";
import { UserRole } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { TableSkeleton } from "@/components/common/Loading";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination, usePagination } from "@/components/common/Pagination";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const NONE = "__none__";

const userSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.nativeEnum(UserRole),
  title: z.string().optional(),
  dailyRate: z.coerce.number().min(0).optional(),
  managerId: z.string().optional(),
  principalId: z.string().optional(),
});

type UserFormValues = z.infer<typeof userSchema>;

const editUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  role: z.nativeEnum(UserRole),
  title: z.string().optional(),
  dailyRate: z.coerce.number().min(0).optional(),
  password: z.string().optional().refine(
    (v) => !v || v.length >= 6,
    { message: "Password must be at least 6 characters" }
  ),
  managerId: z.string().optional(),
  principalId: z.string().optional(),
});

type EditUserFormValues = z.infer<typeof editUserSchema>;

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  title?: string | null;
  dailyRate?: number | null;
  isActive: boolean;
  managerId?: string | null;
  principalId?: string | null;
};

// Which Principal role supervises a given delivery role.
const PRINCIPAL_FOR_ROLE: Partial<Record<UserRole, UserRole>> = {
  [UserRole.KONSULTAN]: UserRole.PRINCIPAL_KONSULTAN,
  [UserRole.TECHNICAL_WRITER]: UserRole.PRINCIPAL_TECHNICAL_WRITER,
  [UserRole.ADMIN_PROJECT]: UserRole.PRINCIPAL_ADMIN_PROJECT,
};

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR)
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadUsersCsv(users: UserRow[]) {
  const headers = ["Name", "Email", "Role", "Title", "Daily Rate (IDR)", "Status"];
  const rows = users.map((u) => [
    u.name,
    u.email,
    RoleLabels[u.role] ?? u.role,
    u.title ?? "",
    u.dailyRate ?? "",
    u.isActive ? "Active" : "Inactive",
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `personnel-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function UsersList() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);

  const { data: users, isLoading } = useListUsers({
    query: { queryKey: getListUsersQueryKey() }
  });

  const createUser = useCreateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "User created successfully" });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setIsCreateOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Failed to create user", description: err.message });
      }
    }
  });

  const updateUser = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Failed to update user", description: err.message });
      }
    }
  });

  const editUserMutation = useUpdateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "User updated successfully" });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setEditingUser(null);
      },
      onError: (err: any) => {
        toast({ variant: "destructive", title: "Failed to update user", description: err.message });
      }
    }
  });

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: "", email: "", password: "password123", role: UserRole.KONSULTAN, title: "", dailyRate: 0, managerId: NONE, principalId: NONE }
  });

  const editForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { name: "", role: UserRole.KONSULTAN, title: "", dailyRate: 0, password: "", managerId: NONE, principalId: NONE }
  });

  useEffect(() => {
    if (editingUser) {
      editForm.reset({
        name: editingUser.name,
        role: editingUser.role,
        title: editingUser.title ?? "",
        dailyRate: editingUser.dailyRate ?? 0,
        password: "",
        managerId: editingUser.managerId ?? NONE,
        principalId: editingUser.principalId ?? NONE,
      });
    }
  }, [editingUser, editForm]);

  // Pools used to populate Manager / Principal selectors.
  const managers = (users ?? []).filter((u: any) => u.role === UserRole.MANAGEMENT && u.isActive);
  const principalsByRole = (role: UserRole | undefined) => {
    const principalRole = role ? PRINCIPAL_FOR_ROLE[role] : undefined;
    if (!principalRole) return [] as any[];
    return (users ?? []).filter((u: any) => u.role === principalRole && u.isActive);
  };

  const onSubmit = (data: UserFormValues) => {
    const payload: Record<string, unknown> = {
      name: data.name,
      email: data.email,
      password: data.password,
      role: data.role,
      title: data.title || undefined,
      dailyRate: data.dailyRate ?? 0,
    };
    if (data.role === UserRole.PROJECT_MANAGER) {
      payload.managerId = data.managerId && data.managerId !== NONE ? data.managerId : null;
    }
    if (PRINCIPAL_FOR_ROLE[data.role]) {
      payload.principalId = data.principalId && data.principalId !== NONE ? data.principalId : null;
    }
    createUser.mutate({ data: payload as any });
  };

  const onEditSubmit = (data: EditUserFormValues) => {
    if (!editingUser) return;
    const payload: Record<string, unknown> = {
      name: data.name,
      role: data.role,
      title: data.title || null,
      dailyRate: data.dailyRate ?? 0,
    };
    if (data.password && data.password.length > 0) {
      payload.password = data.password;
    }
    // Always send hierarchy fields so MGMT can also clear them. For non-applicable
    // roles, force null on the server side.
    payload.managerId = data.role === UserRole.PROJECT_MANAGER && data.managerId && data.managerId !== NONE
      ? data.managerId
      : null;
    payload.principalId = PRINCIPAL_FOR_ROLE[data.role] && data.principalId && data.principalId !== NONE
      ? data.principalId
      : null;
    editUserMutation.mutate({ id: editingUser.id, data: payload as any });
  };

  const watchedCreateRole = form.watch("role");
  const watchedEditRole = editForm.watch("role");

  const toggleStatus = (id: string, currentStatus: boolean) => {
    updateUser.mutate({ id, data: { isActive: !currentStatus } });
  };

  const handleExportCsv = () => {
    if (!users || users.length === 0) {
      toast({ variant: "destructive", title: "No data to export" });
      return;
    }
    downloadUsersCsv(users as UserRow[]);
    toast({ title: "CSV exported", description: `${users.length} users exported.` });
  };

  const hasAccess = canManageUsers(currentUser?.role);
  const pager = usePagination(users as UserRow[] | undefined);

  if (!hasAccess) {
    return (
      <EmptyState 
        title="Access Denied" 
        description="Only PMO Director can view and edit user accounts." 
        icon={<ShieldAlert className="h-10 w-10 text-destructive/50" />} 
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Personnel</h1>
          <p className="text-muted-foreground">Manage user accounts and role assignments.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleExportCsv}
            disabled={!users || users.length === 0}
            data-testid="button-export-csv"
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-new-user">
                <Plus className="h-4 w-4" /> New User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>Add a new personnel to the system.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name *</FormLabel>
                          <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email *</FormLabel>
                          <FormControl><Input type="email" placeholder="john@domain.com" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Initial Password *</FormLabel>
                          <FormControl><Input type="password" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>System Role *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Object.entries(RoleLabels).map(([key, label]) => (
                                <SelectItem key={key} value={key}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Job Title</FormLabel>
                          <FormControl><Input placeholder="Senior Pentester" {...field} value={field.value || ""} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dailyRate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Daily Rate (IDR)</FormLabel>
                          <FormControl><Input type="number" placeholder="1500000" {...field} value={field.value || ""} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <DialogFooter className="pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createUser.isPending}>
                      {createUser.isPending ? "Creating..." : "Create User"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton columns={5} rows={8} />
      ) : !users?.length ? (
        <EmptyState title="No users found" description="No user accounts exist in the system." />
      ) : (
        <Card className="overflow-hidden border-border shadow-sm">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Daily Rate</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pager.pageItems.map((u) => {
                const initials = u.name.split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2);
                return (
                  <TableRow key={u.id} className="group">
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-8 w-8 border border-border">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-foreground">{u.name}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col space-y-1">
                        <Badge variant="outline" className="w-fit bg-secondary text-secondary-foreground border-border">
                          {RoleLabels[u.role]}
                        </Badge>
                        {u.title && <span className="text-xs text-muted-foreground">{u.title}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {u.dailyRate ? formatIDR(u.dailyRate) : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={u.isActive ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"}>
                        {u.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingUser(u as UserRow)}
                          data-testid={`button-edit-${u.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleStatus(u.id, u.isActive)}
                          className={u.isActive ? "text-destructive hover:text-destructive/80" : "text-emerald-500 hover:text-emerald-500/80"}
                          disabled={updateUser.isPending && updateUser.variables?.id === u.id}
                          data-testid={`button-toggle-${u.id}`}
                        >
                          {u.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination
            page={pager.page}
            pageSize={pager.pageSize}
            total={pager.total}
            totalPages={pager.totalPages}
            onPageChange={pager.setPage}
            onPageSizeChange={pager.setPageSize}
            testId="users-pagination"
          />
        </Card>
      )}

      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              {editingUser ? `Update details for ${editingUser.email}. Email cannot be changed.` : ""}
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 py-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl><Input placeholder="John Doe" {...field} data-testid="input-edit-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>System Role *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-role">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(RoleLabels).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Title</FormLabel>
                      <FormControl><Input placeholder="Senior Pentester" {...field} value={field.value || ""} data-testid="input-edit-title" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="dailyRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Daily Rate (IDR)</FormLabel>
                      <FormControl><Input type="number" placeholder="1500000" {...field} value={field.value ?? ""} data-testid="input-edit-rate" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reset Password</FormLabel>
                      <FormControl><Input type="password" placeholder="Leave blank to keep" {...field} value={field.value || ""} data-testid="input-edit-password" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
                <Button type="submit" disabled={editUserMutation.isPending} data-testid="button-save-edit">
                  {editUserMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
