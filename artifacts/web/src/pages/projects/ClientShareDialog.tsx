import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Share2, Copy, RefreshCw } from "lucide-react";

type ShareState = {
  enabled: boolean;
  token: string | null;
  expiresAt: string | null;
};

function portalUrl(token: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${window.location.origin}${base}/portal/${token}`;
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function ClientShareDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<ShareState>({
    queryKey: ["client-share", projectId],
    queryFn: () => customFetch<ShareState>(`/api/projects/${projectId}/client-share`),
    enabled: open,
  });

  const mutate = useMutation({
    mutationFn: (payload: { enabled?: boolean; expiresAt?: string | null; regenerate?: boolean }) =>
      customFetch<ShareState>(`/api/projects/${projectId}/client-share`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (next) => {
      qc.setQueryData(["client-share", projectId], next);
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e?.message || "Could not update share settings", variant: "destructive" });
    },
  });

  const url = data?.token ? portalUrl(data.token) : null;

  function copyLink() {
    if (!url) return;
    navigator.clipboard.writeText(url).then(
      () => toast({ title: "Link copied", description: "The portal link has been copied to your clipboard." }),
      () => toast({ title: "Copy failed", description: "Please copy the link manually.", variant: "destructive" }),
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid="button-client-share">
          <Share2 className="h-4 w-4" />
          Share with client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Client progress portal</DialogTitle>
          <DialogDescription>
            Share a read-only link so your client can follow project progress, milestones, and invoice
            status. Financial costs and margins are never shown.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : (
          <div className="space-y-5 py-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base">Enable portal link</Label>
                <p className="text-xs text-muted-foreground">Turn the shareable link on or off.</p>
              </div>
              <Switch
                checked={!!data?.enabled}
                disabled={mutate.isPending}
                onCheckedChange={(v) => mutate.mutate({ enabled: v })}
                data-testid="switch-client-share"
              />
            </div>

            {data?.enabled && url && (
              <>
                <div className="space-y-2">
                  <Label>Shareable link</Label>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={url} className="font-mono text-xs" data-testid="input-portal-url" />
                    <Button variant="outline" size="icon" onClick={copyLink} aria-label="Copy link">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="portal-expiry">Expiry date (optional)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="portal-expiry"
                      type="date"
                      value={toDateInput(data.expiresAt)}
                      disabled={mutate.isPending}
                      onChange={(e) =>
                        mutate.mutate({ expiresAt: e.target.value ? e.target.value : null })
                      }
                      data-testid="input-portal-expiry"
                    />
                    {data.expiresAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={mutate.isPending}
                        onClick={() => mutate.mutate({ expiresAt: null })}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    After this date the link stops working until you update it.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div>
                    <Label className="text-base">Regenerate link</Label>
                    <p className="text-xs text-muted-foreground">
                      Creates a new link and immediately disables the old one.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={mutate.isPending}
                    onClick={() => mutate.mutate({ regenerate: true })}
                    data-testid="button-regenerate-link"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Regenerate
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
