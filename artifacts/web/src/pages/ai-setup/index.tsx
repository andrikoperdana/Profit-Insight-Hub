import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import {
  AlertTriangle,
  Bot,
  BookOpen,
  CheckCircle2,
  Clipboard,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  ShieldAlert,
  Sparkles,
  XCircle,
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
import { useToast } from "@/hooks/use-toast";

type AiFeature = {
  name: string;
  description: string;
};

type AiSetupStatus = {
  configured: boolean;
  baseUrlConfigured: boolean;
  baseUrlValid: boolean;
  baseUrl: string | null;
  apiKeyConfigured: boolean;
  model: string;
  modelSource: "environment" | "default";
  features: AiFeature[];
};

type TestResult = {
  ok: true;
  model: string;
  latencyMs: number;
  message: string;
};

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <Badge variant={ok ? "secondary" : "outline"}>
      {ok ? "Configured" : "Missing"}
    </Badge>
  );
}

export default function AiSetupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [warningOpen, setWarningOpen] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [data, setData] = useState<AiSetupStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setData(await customFetch<AiSetupStatus>("/api/ai-setup"));
    } catch (error) {
      toast({
        title: "Unable to load AI setup",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accepted) void load();
  }, [accepted]);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await customFetch<TestResult>("/api/ai-setup/test", {
        method: "POST",
      });
      setTestResult(result);
      toast({ title: "AI connection test passed" });
    } catch (error) {
      toast({
        title: "AI connection test failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast({ title: "Variable name copied" });
  };

  return (
    <>
      <AlertDialog open={warningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              AI server configuration only
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                This page is only for checking the server-side AI provider configuration.
                It does not manage prompts, business data, user permissions, or provider billing.
              </span>
              <span className="block font-medium text-foreground">
                Never paste an API key into this page, source code, logs, chat, or screenshots.
                Configure secrets directly on the server.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setLocation("/")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAccepted(true);
                setWarningOpen(false);
              }}
            >
              I understand, continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!accepted ? null : (
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Bot className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight">AI Setup</h1>
              </div>
              <p className="mt-1 text-muted-foreground">
                Check the shared AI provider used by every SecureProfit AI feature.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || testing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Server secrets are not editable here</AlertTitle>
            <AlertDescription>
              This page reports configuration status and runs a minimal provider test. It never
              displays, accepts, stores, or returns the AI API key.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Server className="h-4 w-4" /> API base URL
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <StatusBadge ok={Boolean(data?.baseUrlConfigured && data?.baseUrlValid)} />
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {data?.baseUrl ?? "Not configured"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" /> API key
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <StatusBadge ok={Boolean(data?.apiKeyConfigured)} />
                <p className="text-xs text-muted-foreground">
                  Secret value is never displayed.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" /> Active model
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Badge variant="outline">{data?.model ?? "Loading..."}</Badge>
                <p className="text-xs text-muted-foreground">
                  Source: {data?.modelSource === "environment" ? "AI_MODEL" : "application default"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className={data?.configured ? "border-emerald-500/40" : "border-destructive/40"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {data?.configured ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                Connection test
              </CardTitle>
              <CardDescription>
                Sends a minimal, data-free request to verify the endpoint, API key, and model.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={() => void testConnection()}
                disabled={loading || testing || !data?.configured}
              >
                {testing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Test AI connection
              </Button>
              {!data?.configured ? (
                <p className="text-sm text-destructive">
                  Configure the missing server variables before running the test.
                </p>
              ) : null}
              {testResult ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <AlertTitle>Connection successful</AlertTitle>
                  <AlertDescription>
                    {testResult.message} Model: {testResult.model}. Response time:{" "}
                    {testResult.latencyMs.toLocaleString()} ms.
                  </AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-primary/30 bg-primary/[0.02]">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>AI Setup Guide</CardTitle>
                  <CardDescription className="mt-1">
                    Follow these steps on every new or self-hosted SecureProfit server.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" defaultValue={["before", "configure"]}>
                <AccordionItem value="before">
                  <AccordionTrigger>Before you begin</AccordionTrigger>
                  <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                    <ul className="list-disc space-y-1 pl-5">
                      <li>
                        Choose a provider that supports the OpenAI Chat Completions contract,
                        including the request options required by the selected model.
                      </li>
                      <li>
                        Prefer HTTPS for external providers. HTTP is acceptable only for a trusted
                        internal or loopback provider endpoint.
                      </li>
                      <li>Check provider quota, rate limits, and model permissions.</li>
                      <li>Use a server-side key; never embed it in the web or mobile app.</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="configure">
                  <AccordionTrigger>Configure the server</AccordionTrigger>
                  <AccordionContent className="space-y-4 text-sm text-muted-foreground">
                    <p>Set these environment variables in the server&apos;s secret manager:</p>
                    {[
                      ["AI_INTEGRATIONS_OPENAI_BASE_URL", "OpenAI-compatible API base URL"],
                      ["AI_INTEGRATIONS_OPENAI_API_KEY", "Provider API key; keep it secret"],
                      ["AI_MODEL", "Optional model override; defaults to gpt-5.4"],
                    ].map(([name, description]) => (
                      <div
                        key={name}
                        className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-mono text-xs font-medium text-foreground">{name}</p>
                          <p className="text-xs">{description}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => void copy(name)}>
                          <Clipboard className="mr-2 h-4 w-4" /> Copy name
                        </Button>
                      </div>
                    ))}
                    <ol className="list-decimal space-y-1 pl-5">
                      <li>Save the variables without printing their values.</li>
                      <li>Restart the API server so the AI client loads the new configuration.</li>
                      <li>Return to this page and click Refresh.</li>
                      <li>Run Test AI connection.</li>
                    </ol>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="errors">
                  <AccordionTrigger>Troubleshooting test failures</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    <ul className="list-disc space-y-2 pl-5">
                      <li><strong className="text-foreground">Authentication:</strong> verify the key and its model permissions.</li>
                      <li><strong className="text-foreground">Model not found:</strong> set AI_MODEL to a model available from the provider.</li>
                      <li><strong className="text-foreground">Connection or timeout:</strong> verify DNS, HTTPS, firewall, and the base URL.</li>
                      <li><strong className="text-foreground">Rate limit or quota:</strong> check the provider account and retry later.</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="security">
                  <AccordionTrigger>Security warning</AccordionTrigger>
                  <AccordionContent className="space-y-3 text-sm text-muted-foreground">
                    <ul className="list-disc space-y-1 pl-5">
                      <li>Never expose the API key through an EXPO_PUBLIC or VITE variable.</li>
                      <li>Never store the key in Git, screenshots, documentation, or logs.</li>
                      <li>Rotate the key immediately if it may have been exposed.</li>
                      <li>Restrict access to this page and its API to SUPER_ADMIN.</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Features using this configuration</CardTitle>
              <CardDescription>
                A failed shared AI connection affects every feature below.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {(data?.features ?? []).map((feature) => (
                <div key={feature.name} className="rounded-lg border p-4">
                  <p className="font-medium">{feature.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}