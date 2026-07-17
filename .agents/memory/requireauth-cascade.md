---
name: requireAuth no-prefix cascade
description: Why authed prod requests took 10-40s — dozens of stacked requireAuth DB lookups across no-prefix sub-routers; keep the idempotency guard.
---

# requireAuth cascade across no-prefix sub-routers

**Rule:** `requireAuth` must keep its `if (req.user) return next()` idempotency guard, and any new per-request middleware that touches the DB must be idempotent the same way.

**Why:** ~37 sub-routers are mounted with NO path prefix in `routes/index.ts`, each starting with `router.use(requireAuth)`. Express runs every earlier router's middleware before the target route matches, so one authed request executed up to 37 sequential `user.findUnique` calls. On the remote Singapore prod DB (~1.1s per query from the US deployment) this stacked into 10-40s per request — latency was a linear function of the router's mount position (notifications pos ~17 → 18.8s; executive-copilot last → 40.6s; login, which has no cascade, → 2.4s). Dev DB is local (~2ms/lookup) so the bug was invisible in development.

**How to apply:**
- Diagnosing "every authed endpoint slow, login fast, healthz instant"? Suspect middleware multiplied by mount position before blaming the DB/pool.
- Quantized latency (endpoint time ≈ N × constant) → count DB round trips per request including middleware re-runs.
- Don't trust workspace→DB benchmarks to clear the app: the multiplier only shows where per-query latency is high (deployment→remote region).
- Prefer mounting shared auth ONCE at the top-level router; if per-router guards stay, they must be no-ops on re-entry.
