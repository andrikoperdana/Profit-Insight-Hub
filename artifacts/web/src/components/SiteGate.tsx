import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import itsecLogo from "@assets/Logo_Cybersecurity_Delivered_White_1781007162611.png";
import itsecLogoDark from "@assets/Logo_Cybersecurity_Delivered_1781007513207.png";

const API_BASE = import.meta.env.BASE_URL + "api";

type GateStatus = { enabled: boolean; authorized: boolean };

/**
 * Front-door gate. On mount it asks the API whether a shared site password is
 * required. When it is and the visitor hasn't entered it, the entire app is
 * replaced by a full-screen popup until they authenticate. The gate cookie is
 * set HttpOnly by the server, so this is just the UI in front of it.
 */
export function SiteGate({ children }: { children: ReactNode }) {
  // Public, no-login pages (client portal, customer survey) must never show the
  // front-door password popup — they are meant to be opened by external people
  // who don't have site credentials. The API enforces their own access rules.
  const isPublicPath = /\/(portal|survey)\//.test(window.location.pathname);
  const [status, setStatus] = useState<GateStatus | null>(
    isPublicPath ? { enabled: false, authorized: true } : null,
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPublicPath) return;
    let active = true;
    fetch(`${API_BASE}/site-gate/status`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { enabled: false, authorized: true }))
      .then((s: GateStatus) => {
        if (active) setStatus(s);
      })
      .catch(() => {
        // If the status check fails, fail open — the API itself still enforces
        // the gate, so a network blip here can't expose data.
        if (active) setStatus({ enabled: false, authorized: true });
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/site-gate/login`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError("Invalid username or password");
        return;
      }
      setStatus({ enabled: true, authorized: true });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Still checking — render nothing to avoid a flash of the app behind the gate.
  if (status === null) return null;

  if (!status.enabled || status.authorized) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <img src={itsecLogoDark} alt="ITSEC" className="mx-auto mb-3 h-10 w-auto block dark:hidden" />
          <img src={itsecLogo} alt="ITSEC" className="mx-auto mb-3 h-10 w-auto hidden dark:block" />
          <h1 className="text-lg font-semibold text-foreground">SecureProfit Hub</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This site is private. Enter the access credentials to continue.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gate-username">Username</Label>
            <Input
              id="gate-username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gate-password">Password</Label>
            <Input
              id="gate-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Verifying…" : "Enter"}
          </Button>
        </form>
      </div>
    </div>
  );
}
