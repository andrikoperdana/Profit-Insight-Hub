---
name: Workflow restart orphans hold ports (strictPort decks)
description: Why a slides/vite workflow restart fails with DIDNT_OPEN_A_PORT even though the app is healthy, and how to fix it.
---

# Failed workflow restarts leave orphaned processes holding the port

When `restart_workflow` times out with `DIDNT_OPEN_A_PORT`, the SIGKILL does **not**
always reap the actual child (`pnpm` → `sh -c` → `node vite`). The orphaned node
process gets reparented to init and keeps holding its TCP port. The artifact still
binds and serves correctly when run by hand, so the app itself is not broken — only
the next restart is wedged.

For vite artifacts with `server.strictPort: true` (the slides scaffold uses this), the
next start fails hard with `Port NNNNN is already in use` instead of falling back, so
the workflow can never recover until the orphan is killed. Artifacts **without**
strictPort (e.g. mockup-sandbox, the web app) instead fall back to PORT+1, show
"running", but the proxy still routes to the canonical port served by the old orphan —
leaving a redundant zombie on the +1 port.

**Why:** restarting one workflow under load can also trip *other* workflows' startup
probes; chained failed restarts pile up orphans across api-server (8080),
secureprofit-deck (23670), etc. Symptom in `getWorkflowStatus`: `openPorts: null` while
the log shows vite "ready". `ss`/`lsof` in the agent sandbox return empty (no privilege)
so they are useless for diagnosis here.

**How to apply:**
- Diagnose by mapping processes to artifacts via cwd, not by port tools:
  `for pid in $(ls /proc|grep -E '^[0-9]+$'); do echo $pid $(readlink /proc/$pid/cwd); done`
- Kill orphans by **exact cwd match** (safe: the agent shell's cwd is the repo root):
  loop pids, `kill` those whose `/proc/<pid>/cwd` equals `…/artifacts/<slug>`. This reaps
  both the `sh -c` wrapper and its node child.
- Never `pkill -f "<slug>/node_modules"` — the pattern matches the agent's own bash
  command line and SIGTERMs your shell (exit 143).
- After freeing the canonical port, restart the workflow; it binds and the probe passes.
- Restart workflows **one at a time** after a port is confirmed free; parallel/under-load
  restarts re-trigger the probe failures.
- Changing the artifact's assigned port (artifact.toml) does NOT help if the failure is an
  orphan on the old port — and only matters when the new port is genuinely free.
