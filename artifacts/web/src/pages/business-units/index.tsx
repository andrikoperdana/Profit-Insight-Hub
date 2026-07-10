import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { canManageUsers, canViewAllUsers } from "@/lib/roles";
import {
  useListBusinessUnits,
  useCreateBusinessUnit,
  useUpdateBusinessUnit,
  useDeleteBusinessUnit,
  getListBusinessUnitsQueryKey,
  type BusinessUnit,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/common/EmptyState";
import { TableSkeleton } from "@/components/common/Loading";
import { Plus, Pencil, Trash2, ShieldAlert, Network } from "lucide-react";

export default function BusinessUnitsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: units, isLoading } = useListBusinessUnits();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessUnit | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListBusinessUnitsQueryKey() });

  const createM = useCreateBusinessUnit({
    mutation: {
      onSuccess: () => { toast({ title: "Business unit created" }); setCreateOpen(false); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e?.message }),
    },
  });
  const updateM = useUpdateBusinessUnit({
    mutation: {
      onSuccess: () => { toast({ title: "Business unit updated" }); setEditing(null); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e?.message }),
    },
  });
  const deleteM = useDeleteBusinessUnit({
    mutation: {
      onSuccess: () => { toast({ title: "Business unit deleted" }); invalidate(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e?.message }),
    },
  });

  if (!canViewAllUsers(user?.role)) {
    return (
      <EmptyState
        title="Access denied"
        description="Only Site Admins can manage business units."
        icon={<ShieldAlert className="h-10 w-10 text-destructive/50" />}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Business Units</h1>
          <p className="text-muted-foreground">
            Group teams by service line (e.g. Pentest, Governance, Solution).
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-bu"><Plus className="h-4 w-4 mr-2" /> New BU</Button>
          </DialogTrigger>
          <BUFormDialog
            title="Add Business Unit"
            onSubmit={(data) => createM.mutate({ data })}
            isPending={createM.isPending}
          />
        </Dialog>
      </div>

      {isLoading ? (
        <TableSkeleton columns={4} rows={4} />
      ) : !units?.length ? (
        <EmptyState
          title="No business units yet"
          description="Create your first BU to start splitting teams by service line."
          icon={<Network className="h-10 w-10 text-muted-foreground/50" />}
        />
      ) : (
        <Card className="overflow-hidden border-border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((b) => (
                <TableRow key={b.id} data-testid={`row-bu-${b.id}`}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-md">{b.description ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{b.memberCount ?? 0}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={b.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-muted text-muted-foreground"}>
                      {b.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(b)} data-testid={`button-edit-bu-${b.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete business unit "${b.name}"?`)) deleteM.mutate({ id: b.id });
                      }}
                      data-testid={`button-delete-bu-${b.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <BUFormDialog
            title="Edit Business Unit"
            initial={editing}
            onSubmit={(data) => updateM.mutate({ id: editing.id, data })}
            isPending={updateM.isPending}
          />
        </Dialog>
      )}
    </div>
  );
}

function BUFormDialog({
  title, initial, onSubmit, isPending,
}: {
  title: string;
  initial?: BusinessUnit;
  onSubmit: (data: { name: string; description?: string | null; isActive?: boolean }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  return (
    <DialogContent className="sm:max-w-[460px]">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Examples: Pentest, Governance, Solution, MSS, Forensic.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div>
          <Label>Name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pentest" data-testid="input-bu-name" />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Offensive security testing services…"
            className="resize-none h-20"
            data-testid="input-bu-description"
          />
        </div>
        {initial && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        )}
      </div>
      <DialogFooter>
        <Button
          disabled={!name.trim() || isPending}
          onClick={() => onSubmit({ name: name.trim(), description: description?.trim() || null, ...(initial ? { isActive } : {}) })}
          data-testid="button-save-bu"
        >
          {isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
