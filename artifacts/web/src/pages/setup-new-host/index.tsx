import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldAlert,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type EndpointSet = {
  xeroCallback: string;
  xeroWebhook: string;
  pipedriveWebhook: string;
};

type HostSetup = {
  activeHost: string | null;
  draftHost: string | null;
  previousHost: string | null;
  draftValidatedAt: string | null;
  endpoints: EndpointSet | null;
  xero: {
    configured: boolean;
    redirectUriEnvironmentConfigured: boolean;
    webhookKeyConfigured: boolean;
  };
  pipedrive: {
    configured: boolean;
    managedWebhookId: string | null;
    managedWebhookUrl: string | null;
    webhookSecretConfigured: boolean;
    staleWebhookIds: string[];
    cleanupError: string | null;
    cleanupFailedAt: string | null;
  };
};

function StatusBadge({ ok, yes = "Ready", no = "Needs setup" }: { ok: boolean; yes?: string; no?: string }) {
  return <Badge variant={ok ? "secondary" : "outline"}>{ok ? yes : no}</Badge>;
}

export default function SetupNewHostPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [warningOpen, setWarningOpen] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [data, setData] = useState<HostSetup | null>(null);
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const result = await customFetch<HostSetup>("/api/host-setup");
    setData(result);
    setHost(result.draftHost ?? result.activeHost ?? "");
  };

  useEffect(() => {
    if (!accepted) return;
    void load().catch((error) => {
      toast({ title: "Unable to load host setup", description: String(error), variant: "destructive" });
    });
  }, [accepted]);

  const run = async (name: string, action: () => Promise<unknown>, success: string) => {
    setBusy(name);
    try {
      await action();
      await load();
      toast({ title: success });
    } catch (error) {
      toast({ title: "Action failed", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const endpointRows = useMemo(() => data?.endpoints ? [
    ["Xero OAuth callback", data.endpoints.xeroCallback],
    ["Xero invoice webhook", data.endpoints.xeroWebhook],
    ["Pipedrive deal webhook", data.endpoints.pipedriveWebhook],
  ] as const : [], [data?.endpoints]);

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast({ title: "URL copied" });
  };

  return (
    <>
      <AlertDialog open={warningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Server host changes only
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                This page is only for moving SecureProfit to a new public server host.
                It is not for routine Xero, Pipedrive, tenant, or business-rule changes.
              </span>
              <span className="block font-medium text-foreground">
                A wrong host can break OAuth callbacks and webhook delivery. Continue only
                when the new server, HTTPS certificate, DNS, and API are ready.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setLocation("/")}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setAccepted(true); setWarningOpen(false); }}>
              I understand, continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!accepted ? null : (
        <div className="space-y-6 max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ServerCog className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight">Setup New Host</h1>
              </div>
              <p className="text-muted-foreground mt-1">
                Validate a replacement public server and prepare integration callbacks safely.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={Boolean(busy)}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </div>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Deployment operation</AlertTitle>
            <AlertDescription>
              This wizard changes the trusted integration host only. It does not change DNS,
              Nginx, PM2, server credentials, or the Xero Developer Portal automatically.
            </AlertDescription>
          </Alert>

          <Card className="border-primary/30 bg-primary/[0.02]">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Setup New Host Guide</CardTitle>
                  <CardDescription className="mt-1">
                    Open the sections below and follow the steps in order before activating a new host.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" defaultValue={["before-start", "safe-steps"]}>
                <AccordionItem value="before-start">
                  <AccordionTrigger>Before you begin</AccordionTrigger>
                  <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      Use this menu only when the SecureProfit server&apos;s public address is
                      changing. Do not use it to replace credentials or business settings.
                    </p>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>Confirm that the application and API are running on the new server.</li>
                      <li>Confirm that the new domain&apos;s DNS points to the correct public server IP.</li>
                      <li>Use a valid HTTPS certificate that is not self-signed.</li>
                      <li>Ensure all Xero and Pipedrive environment variables exist on the new server.</li>
                      <li>Keep the old host online until validation and activation are complete.</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="safe-steps">
                  <AccordionTrigger>Safe setup sequence</AccordionTrigger>
                  <AccordionContent>
                    <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                      <li>
                        Enter the HTTPS origin without a path, for example{" "}
                        <span className="font-mono text-foreground">https://activityhub.itsecasia.dev</span>.
                      </li>
                      <li>
                        Click <strong className="text-foreground">Save draft</strong>. This does
                        not change the active host.
                      </li>
                      <li>
                        Click <strong className="text-foreground">Validate DNS, TLS and API</strong>{" "}
                        and continue only when validation succeeds.
                      </li>
                      <li>Copy the generated callback and webhook URLs.</li>
                      <li>
                        Register the Xero callback and webhook in the Xero Developer Portal, then
                        click <strong className="text-foreground">Register / repair webhook</strong>{" "}
                        for Pipedrive.
                      </li>
                      <li>
                        Click <strong className="text-foreground">Activate new host</strong> after
                        completing the provider configuration.
                      </li>
                      <li>Test the Xero connection, Pipedrive import, and webhook delivery.</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="status">
                  <AccordionTrigger>Understanding statuses and controls</AccordionTrigger>
                  <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-md border p-3">
                        <p className="font-medium text-foreground">Active host</p>
                        <p>The host currently trusted for integration callbacks.</p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="font-medium text-foreground">Validated draft</p>
                        <p>The proposed host that has passed DNS, TLS, and API checks.</p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="font-medium text-foreground">Previous host</p>
                        <p>The previous host that can be restored if a problem occurs.</p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="font-medium text-foreground">Ready / Needs setup</p>
                        <p>Provider configuration readiness without exposing its secrets.</p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="after-activation">
                  <AccordionTrigger>After activation</AccordionTrigger>
                  <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                    <ul className="list-disc space-y-1 pl-5">
                      <li>Sign in again and confirm that the main API is accessible.</li>
                      <li>Reconnect the Xero tenant if its OAuth session still points to the old host.</li>
                      <li>Test one Xero synchronization or callback.</li>
                      <li>Test a Pipedrive lead import and webhook delivery.</li>
                      <li>Check the Audit Log to confirm that every change was recorded.</li>
                    </ul>
                    <Alert>
                      <Info className="h-4 w-4" />
                      <AlertTitle>Changes outside this wizard</AlertTitle>
                      <AlertDescription>
                        This wizard does not change DNS, Nginx, PM2, firewall rules, certificates,
                        or environment variables on the server.
                      </AlertDescription>
                    </Alert>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="rollback">
                  <AccordionTrigger>If the new host has a problem</AccordionTrigger>
                  <AccordionContent className="space-y-2 text-sm text-muted-foreground">
                    <p>
                      Click <strong className="text-foreground">Restore previous host</strong> to
                      restore the previous integration host. Then:
                    </p>
                    <ol className="list-decimal space-y-1 pl-5">
                      <li>Confirm that the old host is still online.</li>
                      <li>Restore the previous Xero callback if it was changed.</li>
                      <li>Run Register / repair webhook for Pipedrive again if needed.</li>
                      <li>Check the Audit Log and repeat the integration tests.</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Active host", data?.activeHost ?? "Not set"],
              ["Validated draft", data?.draftValidatedAt ? data.draftHost ?? "—" : "Not validated"],
              ["Previous host", data?.previousHost ?? "Not available"],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardHeader className="pb-2"><CardDescription>{label}</CardDescription></CardHeader>
                <CardContent className="font-mono text-xs break-all">{value}</CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>1. Draft and validate the new host</CardTitle>
              <CardDescription>Enter the HTTPS origin only, without an API path.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-host">Public server host</Label>
                <Input id="new-host" value={host} onChange={(event) => setHost(event.target.value)} placeholder="https://activityhub.itsecasia.dev" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => run("save", () => customFetch("/api/host-setup/draft", { method: "PUT", body: JSON.stringify({ host }) }), "Draft host saved")} disabled={Boolean(busy)}>
                  {busy === "save" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Save draft
                </Button>
                <Button variant="outline" onClick={() => run("validate", () => customFetch("/api/host-setup/validate", { method: "POST" }), "Host validation passed")} disabled={Boolean(busy) || !data?.draftHost}>
                  {busy === "validate" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Validate DNS, TLS and API
                </Button>
              </div>
              {data?.draftValidatedAt ? (
                <p className="text-sm text-emerald-600">Validated at {new Date(data.draftValidatedAt).toLocaleString()}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Generated integration endpoints</CardTitle>
              <CardDescription>Copy these exact URLs to the provider configuration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {endpointRows.length === 0 ? <p className="text-sm text-muted-foreground">Save a draft host to generate endpoints.</p> :
                endpointRows.map(([label, value]) => (
                  <div key={label} className="rounded-lg border p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="text-sm font-medium">{label}</p><p className="text-xs font-mono text-muted-foreground break-all">{value}</p></div>
                    <Button variant="outline" size="sm" onClick={() => void copy(value)}><Clipboard className="h-4 w-4 mr-2" /> Copy</Button>
                  </div>
                ))}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Xero guided setup</CardTitle><CardDescription>Xero portal changes remain manual.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between"><span>Client credentials</span><StatusBadge ok={Boolean(data?.xero.configured)} /></div>
                <div className="flex justify-between"><span>Redirect environment</span><StatusBadge ok={Boolean(data?.xero.redirectUriEnvironmentConfigured)} /></div>
                <div className="flex justify-between"><span>Webhook signing key</span><StatusBadge ok={Boolean(data?.xero.webhookKeyConfigured)} /></div>
                <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1">
                  <li>Register the generated callback in Xero Developer Portal.</li>
                  <li>Register the generated invoice webhook URL.</li>
                  <li>Update APP_BASE_URL/XERO_REDIRECT_URI on the new server.</li>
                  <li>Reconnect the Xero tenant after the host changes.</li>
                </ol>
                <Button variant="outline" asChild><a href="https://developer.xero.com/app/manage" target="_blank" rel="noreferrer">Open Xero Developer Portal <ExternalLink className="h-4 w-4 ml-2" /></a></Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Pipedrive webhook</CardTitle><CardDescription>Create the replacement before removing the old managed webhook.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between"><span>API connection</span><StatusBadge ok={Boolean(data?.pipedrive.configured)} /></div>
                <div className="flex justify-between"><span>Webhook secret</span><StatusBadge ok={Boolean(data?.pipedrive.webhookSecretConfigured)} /></div>
                {data?.pipedrive.managedWebhookUrl ? <p className="text-xs font-mono break-all text-muted-foreground">{data.pipedrive.managedWebhookUrl}</p> : null}
                {data?.pipedrive.staleWebhookIds.length ? (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Old Pipedrive webhook cleanup is incomplete</AlertTitle>
                    <AlertDescription className="space-y-3">
                      <p>
                        The new webhook is active, but {data.pipedrive.staleWebhookIds.length} old
                        webhook{data.pipedrive.staleWebhookIds.length === 1 ? "" : "s"} could not be
                        removed. Duplicate deal deliveries may occur until cleanup succeeds.
                      </p>
                      {data.pipedrive.cleanupError ? (
                        <p className="text-xs break-words">{data.pipedrive.cleanupError}</p>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          run(
                            "pipedrive-cleanup",
                            () =>
                              customFetch("/api/host-setup/pipedrive/cleanup", {
                                method: "POST",
                              }),
                            "Old Pipedrive webhook cleanup retried",
                          )
                        }
                        disabled={Boolean(busy) || !data.pipedrive.configured}
                      >
                        {busy === "pipedrive-cleanup" ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Retry stale webhook cleanup
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}
                <Button onClick={() => run("pipedrive", () => customFetch("/api/host-setup/pipedrive/repair", { method: "POST" }), "Pipedrive webhook registered")} disabled={Boolean(busy) || !data?.draftValidatedAt || !data?.pipedrive.configured}>
                  {busy === "pipedrive" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />} Register / repair webhook
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>3. Activate or restore</CardTitle><CardDescription>Activation updates the trusted integration host after validation.</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button onClick={() => run("activate", () => customFetch("/api/host-setup/activate", { method: "POST" }), "New integration host activated")} disabled={Boolean(busy) || !data?.draftValidatedAt}>
                Activate new host
              </Button>
              <Button variant="outline" onClick={() => run("restore", () => customFetch("/api/host-setup/restore", { method: "POST" }), "Previous integration host restored")} disabled={Boolean(busy) || !data?.previousHost}>
                <RotateCcw className="h-4 w-4 mr-2" /> Restore previous host
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
