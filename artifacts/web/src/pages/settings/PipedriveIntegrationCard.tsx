import { useEffect, useMemo, useState } from "react";
import {
  useGetPipedriveStatus,
  getGetPipedriveStatusQueryKey,
  useRunPipedriveSync,
  useUpdatePipedriveSettings,
  useGetPipedriveStageMappings,
  getGetPipedriveStageMappingsQueryKey,
  useUpdatePipedriveStageMappings,
  useListActiveAllUsers,
  getListActiveAllUsersQueryKey,
  getListLeadsQueryKey,
  type LeadStage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link2, RefreshCw, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const LEAD_STAGES: { value: LeadStage; label: string }[] = [
  { value: "NEW" as LeadStage, label: "New" },
  { value: "QUALIFIED" as LeadStage, label: "Qualified" },
  { value: "PROPOSAL" as LeadStage, label: "Proposal" },
  { value: "NEGOTIATION" as LeadStage, label: "Negotiation" },
  { value: "WON" as LeadStage, label: "Won" },
  { value: "LOST" as LeadStage, label: "Lost" },
];

const NONE = "__none__";
const UNMAPPED = "__unmapped__";

type StageRow = {
  id: number;
  name: string | null;
  pipelineId: number | null;
  orderNr: number | null;
};

export function PipedriveIntegrationCard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: status, isLoading } = useGetPipedriveStatus({
    query: { queryKey: getGetPipedriveStatusQueryKey() },
  });
  const { data: mappingData } = useGetPipedriveStageMappings({
    query: { queryKey: getGetPipedriveStageMappingsQueryKey() },
  });
  const { data: activeUsers } = useListActiveAllUsers({
    query: { queryKey: getListActiveAllUsersQueryKey() },
  });

  const salesUsers = useMemo(
    () => (activeUsers ?? []).filter((u) => u.role === "SALES"),
    [activeUsers],
  );

  // Merge live Pipedrive stages with any existing mappings so every saved
  // mapping stays editable even if its stage was later removed in Pipedrive.
  const stageRows = useMemo<StageRow[]>(() => {
    const rows = new Map<number, StageRow>();
    for (const s of mappingData?.stages ?? []) {
      rows.set(s.id, { id: s.id, name: s.name ?? null, pipelineId: s.pipelineId ?? null, orderNr: s.orderNr ?? null });
    }
    for (const m of mappingData?.mappings ?? []) {
      if (!rows.has(m.pipedriveStageId)) {
        rows.set(m.pipedriveStageId, {
          id: m.pipedriveStageId,
          name: m.label ?? null,
          pipelineId: m.pipedrivePipelineId,
          orderNr: null,
        });
      }
    }
    return Array.from(rows.values()).sort((a, b) => {
      const p = (a.pipelineId ?? 0) - (b.pipelineId ?? 0);
      if (p !== 0) return p;
      return (a.orderNr ?? 0) - (b.orderNr ?? 0) || a.id - b.id;
    });
  }, [mappingData]);

  const [ownerId, setOwnerId] = useState<string>(NONE);
  const [autoSync, setAutoSync] = useState(false);
  const [mapping, setMapping] = useState<Record<number, string>>({});

  useEffect(() => {
    if (status) {
      setOwnerId(status.defaultOwnerId ?? NONE);
      setAutoSync(status.autoSyncEnabled);
    }
  }, [status]);

  useEffect(() => {
    if (mappingData) {
      const next: Record<number, string> = {};
      for (const m of mappingData.mappings) next[m.pipedriveStageId] = m.leadStage;
      setMapping(next);
    }
  }, [mappingData]);

  const sync = useRunPipedriveSync({
    mutation: {
      onSuccess: (res) => {
        toast({
          title: "Pipedrive import complete",
          description: `Imported ${res.imported}, updated ${res.updated}, skipped ${res.skipped}${
            res.errors.length ? `, ${res.errors.length} error(s)` : ""
          }.`,
          variant: res.errors.length ? "destructive" : undefined,
        });
        qc.invalidateQueries({ queryKey: getGetPipedriveStatusQueryKey() });
        qc.invalidateQueries({ queryKey: getListLeadsQueryKey() });
      },
      onError: (e: any) =>
        toast({ title: "Import failed", description: e?.message, variant: "destructive" }),
    },
  });

  const saveSettings = useUpdatePipedriveSettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "Settings saved" });
        qc.invalidateQueries({ queryKey: getGetPipedriveStatusQueryKey() });
      },
      onError: (e: any) =>
        toast({ title: "Could not save settings", description: e?.message, variant: "destructive" }),
    },
  });

  const saveMappings = useUpdatePipedriveStageMappings({
    mutation: {
      onSuccess: () => {
        toast({ title: "Stage mappings saved" });
        qc.invalidateQueries({ queryKey: getGetPipedriveStageMappingsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetPipedriveStatusQueryKey() });
      },
      onError: (e: any) =>
        toast({ title: "Could not save mappings", description: e?.message, variant: "destructive" }),
    },
  });

  const handleSaveOwner = (next: string) => {
    setOwnerId(next);
    saveSettings.mutate({ data: { defaultOwnerId: next === NONE ? null : next } });
  };

  const handleToggleAutoSync = (next: boolean) => {
    setAutoSync(next);
    saveSettings.mutate({ data: { autoSyncEnabled: next } });
  };

  const handleSaveMappings = () => {
    const mappings = stageRows
      .filter((s) => mapping[s.id] && mapping[s.id] !== UNMAPPED)
      .map((s) => ({
        pipedrivePipelineId: s.pipelineId ?? 0,
        pipedriveStageId: s.id,
        leadStage: mapping[s.id] as LeadStage,
        label: s.name,
      }));
    saveMappings.mutate({ data: { mappings } });
  };

  const connected = !!status?.connected;

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" /> Pipedrive CRM
        </CardTitle>
        <CardDescription>
          One-way import of open Pipedrive deals into the Leads pipeline. Deals flow into the app;
          the app never writes back to Pipedrive.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading connection status…</p>
        ) : !connected ? (
          <p className="text-sm text-muted-foreground">
            Pipedrive is not configured on the server. Add the Pipedrive API token to enable this integration.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <div>
                <p className="font-medium">Connected</p>
                <p className="text-xs text-muted-foreground">
                  {status?.lastSyncAt
                    ? `Last import ${new Date(status.lastSyncAt).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}`
                    : "No import has run yet"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md border border-border p-3">
                <p className="text-2xl font-semibold">{status?.importedLeadCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Imported leads</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-2xl font-semibold">{status?.linkedClientCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Linked clients</p>
              </div>
              <div className="rounded-md border border-border p-3">
                <p className="text-2xl font-semibold">{status?.stageMappingCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">Stage mappings</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
                {sync.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Sync now
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label>Default lead owner</Label>
              <p className="text-xs text-muted-foreground">
                Imported leads are assigned to this Sales user when no matching owner is found.
              </p>
              <Select value={ownerId} onValueChange={handleSaveOwner} disabled={saveSettings.isPending}>
                <SelectTrigger data-testid="select-pipedrive-owner">
                  <SelectValue placeholder="Select a Sales user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No default owner</SelectItem>
                  {salesUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="pipedrive-auto-sync">Automatic import</Label>
                <p className="text-xs text-muted-foreground">
                  When on, the server periodically imports open deals from Pipedrive. Leave off to
                  import only when you click Sync now.
                </p>
              </div>
              <Switch
                id="pipedrive-auto-sync"
                checked={autoSync}
                onCheckedChange={handleToggleAutoSync}
                disabled={saveSettings.isPending}
                data-testid="switch-pipedrive-auto-sync"
              />
            </div>

            <div className="space-y-3">
              <div>
                <Label>Stage mapping</Label>
                <p className="text-xs text-muted-foreground">
                  Map each Pipedrive stage to a lead stage. Unmapped stages import as New.
                </p>
              </div>
              {stageRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Pipedrive stages available.</p>
              ) : (
                <div className="space-y-2">
                  {stageRows.map((s) => (
                    <div key={s.id} className="flex items-center gap-3">
                      <div className="flex-1 text-sm">
                        {s.name || `Stage ${s.id}`}
                        {s.pipelineId != null && (
                          <span className="text-xs text-muted-foreground"> · pipeline {s.pipelineId}</span>
                        )}
                      </div>
                      <Select
                        value={mapping[s.id] ?? UNMAPPED}
                        onValueChange={(v) => setMapping((prev) => ({ ...prev, [s.id]: v }))}
                      >
                        <SelectTrigger className="w-44" data-testid={`select-stage-${s.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={UNMAPPED}>Unmapped (New)</SelectItem>
                          {LEAD_STAGES.map((ls) => (
                            <SelectItem key={ls.value} value={ls.value}>
                              {ls.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    onClick={handleSaveMappings}
                    disabled={saveMappings.isPending}
                    data-testid="button-save-stage-mappings"
                  >
                    {saveMappings.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save stage mappings
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
