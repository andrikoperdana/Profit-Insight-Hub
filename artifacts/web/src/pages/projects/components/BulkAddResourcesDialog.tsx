import { useMemo, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAddProjectResourcesBulk,
  getListProjectResourcesQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, Users, AlertTriangle, X } from "lucide-react";

type Candidate = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  title?: string | null;
  dailyRate?: number | null;
  activeProjectCount?: number;
  atCapacity?: boolean;
};

type Variant = "KONSULTAN" | "TECHNICAL_WRITER" | "OTHER";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  variant: Variant;
  candidates: Candidate[];
  workstreamId: string | null;
};

const VARIANT_LABEL: Record<Variant, string> = {
  KONSULTAN: "Konsultan",
  TECHNICAL_WRITER: "Technical Writer",
  OTHER: "Other Resource",
};

export function BulkAddResourcesDialog({
  open,
  onOpenChange,
  projectId,
  variant,
  candidates,
  workstreamId,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<
    Record<string, { plannedMandays: string; dailyRate: string; roleInProject: string }>
  >({});
  const [bulkMandays, setBulkMandays] = useState("");
  const [bulkRate, setBulkRate] = useState("");
  const [bulkRoleInProject, setBulkRoleInProject] = useState("");

  useEffect(() => {
    if (open) {
      setStep(1);
      setSearch("");
      setSelectedIds(new Set());
      setRows({});
      setBulkMandays("");
      setBulkRate("");
      setBulkRoleInProject("");
    }
  }, [open]);

  const bulkMutation = useAddProjectResourcesBulk({
    mutation: {
      onSuccess: (res: any) => {
        queryClient.invalidateQueries({ queryKey: getListProjectResourcesQueryKey(projectId) });
        queryClient.invalidateQueries({ queryKey: ["users-available", "KONSULTAN"] });
        queryClient.invalidateQueries({ queryKey: ["users-available", "TECHNICAL_WRITER"] });
        queryClient.invalidateQueries({ queryKey: ["users-active-all"] });
        const created = Number(res?.createdCount ?? 0);
        const errs = Array.isArray(res?.errors) ? res.errors : [];
        if (errs.length === 0) {
          toast({
            title: `${created} resource(s) added`,
            description: "All selected members were assigned to this project.",
          });
          onOpenChange(false);
        } else {
          const sample = errs
            .slice(0, 3)
            .map((e: any) => `${e.userName ?? e.userId}: ${e.reason}`)
            .join(" • ");
          toast({
            title: `${created} succeeded, ${errs.length} failed`,
            description: errs.length > 3 ? `${sample} … (+${errs.length - 3} more)` : sample,
            variant: created > 0 ? "default" : "destructive",
          });
          if (created > 0) onOpenChange(false);
        }
      },
      onError: (e: any) =>
        toast({
          title: "Bulk add failed",
          description: e?.message ?? "Could not add resources",
          variant: "destructive",
        }),
    },
  });

  const filteredCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.title ?? "").toLowerCase().includes(q),
    );
  }, [search, candidates]);

  const allFilteredSelected =
    filteredCandidates.length > 0 &&
    filteredCandidates.every((c) => selectedIds.has(c.id));

  const toggleAllFiltered = () => {
    const next = new Set(selectedIds);
    if (allFilteredSelected) {
      filteredCandidates.forEach((c) => next.delete(c.id));
    } else {
      filteredCandidates.forEach((c) => next.add(c.id));
    }
    setSelectedIds(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selectedIds.has(c.id)),
    [candidates, selectedIds],
  );

  const goToStep2 = () => {
    if (selectedIds.size === 0) {
      toast({ title: "No one selected", description: "Check at least one team member.", variant: "destructive" });
      return;
    }
    const seed: typeof rows = {};
    selectedCandidates.forEach((c) => {
      seed[c.id] = {
        plannedMandays: rows[c.id]?.plannedMandays ?? "10",
        dailyRate:
          rows[c.id]?.dailyRate ??
          (c.dailyRate != null && c.dailyRate > 0 ? String(c.dailyRate) : "1500000"),
        roleInProject: rows[c.id]?.roleInProject ?? "",
      };
    });
    setRows(seed);
    setStep(2);
  };

  const updateRow = (
    id: string,
    field: "plannedMandays" | "dailyRate" | "roleInProject",
    value: string,
  ) => {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id]!, [field]: value } }));
  };

  const applyBulkMandays = () => {
    if (!bulkMandays.trim()) return;
    setRows((prev) => {
      const next = { ...prev };
      selectedCandidates.forEach((c) => {
        next[c.id] = { ...next[c.id]!, plannedMandays: bulkMandays };
      });
      return next;
    });
  };
  const applyBulkRate = () => {
    if (!bulkRate.trim()) return;
    setRows((prev) => {
      const next = { ...prev };
      selectedCandidates.forEach((c) => {
        next[c.id] = { ...next[c.id]!, dailyRate: bulkRate };
      });
      return next;
    });
  };
  const applyBulkRoleInProject = () => {
    if (!bulkRoleInProject.trim()) return;
    setRows((prev) => {
      const next = { ...prev };
      selectedCandidates.forEach((c) => {
        next[c.id] = { ...next[c.id]!, roleInProject: bulkRoleInProject };
      });
      return next;
    });
  };

  const handleSubmit = () => {
    const resources = selectedCandidates.map((c) => {
      const row = rows[c.id]!;
      return {
        userId: c.id,
        roleInProject: row.roleInProject || undefined,
        plannedMandays: Number(row.plannedMandays) || 0,
        dailyRate: Number(row.dailyRate) || 0,
        workstreamId,
      };
    });
    // Pre-flight check: in OTHER variant, every row needs roleInProject.
    if (variant === "OTHER") {
      const missing = resources.filter((r) => !r.roleInProject || !String(r.roleInProject).trim());
      if (missing.length > 0) {
        toast({
          title: `${missing.length} row(s) missing Role on Project`,
          description: "Fill 'Role on Project' for every row (or use Apply to all).",
          variant: "destructive",
        });
        return;
      }
    }
    bulkMutation.mutate({ id: projectId, data: { resources } as any });
  };

  const totalEstCost = selectedCandidates.reduce((sum, c) => {
    const row = rows[c.id];
    if (!row) return sum;
    return sum + (Number(row.plannedMandays) || 0) * (Number(row.dailyRate) || 0);
  }, 0);
  const totalMd = selectedCandidates.reduce(
    (sum, c) => sum + (Number(rows[c.id]?.plannedMandays) || 0),
    0,
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Add {VARIANT_LABEL[variant]} (Multiple)
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Pick one or more team members, then click Next to set mandays & rate per person."
              : `Set mandays & daily rate for ${selectedCandidates.length} selected member(s). Use 'Apply to all' to set every row at once.`}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-3">
            <Input
              placeholder="Search by name, email, or title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              data-testid="bulk-search"
            />
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={toggleAllFiltered}
                disabled={filteredCandidates.length === 0}
              >
                {allFilteredSelected ? "Clear all on page" : "Select all on page"} ({filteredCandidates.length})
              </button>
              <Badge variant="outline" data-testid="bulk-selected-count">
                {selectedIds.size} selected
              </Badge>
            </div>
            <div className="max-h-96 overflow-y-auto border border-border rounded-md divide-y divide-border">
              {filteredCandidates.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {candidates.length === 0
                    ? "No members available to add."
                    : "No results match your search."}
                </div>
              ) : (
                filteredCandidates.map((c) => {
                  const checked = selectedIds.has(c.id);
                  return (
                    <label
                      key={c.id}
                      htmlFor={`bulk-cand-${c.id}`}
                      className="flex items-center gap-3 p-3 hover:bg-muted/40 cursor-pointer"
                      data-testid={`bulk-cand-${c.id}`}
                    >
                      <Checkbox
                        id={`bulk-cand-${c.id}`}
                        checked={checked}
                        onCheckedChange={() => toggleOne(c.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {c.name}
                          {c.atCapacity && (
                            <Badge variant="outline" className="text-amber-500 border-amber-500/50">
                              <AlertTriangle className="h-3 w-3 mr-1" /> At capacity
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {c.title ?? c.role ?? ""}
                          {c.email ? ` • ${c.email}` : ""}
                        </div>
                      </div>
                      {typeof c.activeProjectCount === "number" && (
                        <div className="text-xs text-muted-foreground shrink-0">
                          {c.activeProjectCount} active
                        </div>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Bulk-apply row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 bg-muted/40 border border-border rounded-md">
              <div>
                <Label className="text-xs">Apply Mandays to All</Label>
                <div className="flex gap-1 mt-1">
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g. 10"
                    value={bulkMandays}
                    onChange={(e) => setBulkMandays(e.target.value)}
                  />
                  <Button size="sm" variant="outline" onClick={applyBulkMandays}>Apply</Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Apply Daily Rate (IDR) to All</Label>
                <div className="flex gap-1 mt-1">
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="e.g. 1500000"
                    value={bulkRate}
                    onChange={(e) => setBulkRate(e.target.value)}
                  />
                  <Button size="sm" variant="outline" onClick={applyBulkRate}>Apply</Button>
                </div>
              </div>
              {variant === "OTHER" && (
                <div>
                  <Label className="text-xs">Apply Role on Project to All</Label>
                  <div className="flex gap-1 mt-1">
                    <Input
                      placeholder="e.g. SOC Analyst"
                      value={bulkRoleInProject}
                      onChange={(e) => setBulkRoleInProject(e.target.value)}
                    />
                    <Button size="sm" variant="outline" onClick={applyBulkRoleInProject}>Apply</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Per-row table */}
            <div className="max-h-80 overflow-y-auto border border-border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2 font-medium">Name</th>
                    {variant === "OTHER" && <th className="p-2 font-medium">Role on Project</th>}
                    <th className="p-2 font-medium w-24">Mandays</th>
                    <th className="p-2 font-medium w-36">Daily Rate</th>
                    <th className="p-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCandidates.map((c) => {
                    const row = rows[c.id]!;
                    return (
                      <tr key={c.id} className="border-t border-border">
                        <td className="p-2">
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.title ?? c.role ?? ""}</div>
                        </td>
                        {variant === "OTHER" && (
                          <td className="p-2">
                            <Input
                              value={row.roleInProject}
                              onChange={(e) => updateRow(c.id, "roleInProject", e.target.value)}
                              placeholder="Role on project"
                            />
                          </td>
                        )}
                        <td className="p-2">
                          <Input
                            type="number"
                            inputMode="numeric"
                            value={row.plannedMandays}
                            onChange={(e) => updateRow(c.id, "plannedMandays", e.target.value)}
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            inputMode="numeric"
                            value={row.dailyRate}
                            onChange={(e) => updateRow(c.id, "dailyRate", e.target.value)}
                          />
                        </td>
                        <td className="p-2 text-right">
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              const next = new Set(selectedIds);
                              next.delete(c.id);
                              setSelectedIds(next);
                              const r = { ...rows };
                              delete r[c.id];
                              setRows(r);
                              if (next.size === 0) setStep(1);
                            }}
                            title="Remove from selection"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <div>Total mandays: <span className="font-mono font-medium text-foreground">{totalMd.toLocaleString()}</span></div>
              <div>Estimated cost: <span className="font-mono font-medium text-foreground">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(totalEstCost)}</span></div>
            </div>
          </div>
        )}

        <DialogFooter className="flex sm:justify-between gap-2">
          <div>
            {step === 2 && (
              <Button variant="outline" onClick={() => setStep(1)} disabled={bulkMutation.isPending}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bulkMutation.isPending}>
              Cancel
            </Button>
            {step === 1 ? (
              <Button onClick={goToStep2} disabled={selectedIds.size === 0} data-testid="bulk-next">
                Next ({selectedIds.size}) <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={bulkMutation.isPending || selectedCandidates.length === 0}
                data-testid="bulk-submit"
              >
                {bulkMutation.isPending ? "Saving…" : `Add ${selectedCandidates.length} Resource(s)`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BulkAddResourcesDialog;
