---
name: DB connection resilience (E57P01) + endpoint caching
description: Why the Prisma datasource carries pool params and how the read-heavy dashboard endpoints are cached.
---

# Serverless Postgres terminates idle connections (E57P01)

Production logs were full of `prisma:error ... terminating connection due to administrator command (SqlState E57P01)`. This is the Replit/Neon-backed Postgres dropping idle pool connections, not an app bug — Prisma reconnects on the next query, but stale connections caused error noise and slow first requests.

**Decision:** the Prisma datasource URL is augmented at client-construction time with `connection_limit`, `pool_timeout`, `connect_timeout` (small pool, bounded timeouts) and the client is cached on `globalThis` in **all** environments (not just dev). The three knobs are overridable via env vars `DB_CONNECTION_LIMIT` / `DB_POOL_TIMEOUT` / `DB_CONNECT_TIMEOUT` (positive-int parse, fallbacks 5/20/10) so the pool can be tuned per environment without a code change. Sizing rule: `(app instances) × DB_CONNECTION_LIMIT < db max_connections`; use PgBouncer in front for large fleets.

**Why:** a smaller pool keeps fewer connections idle long enough to be reaped; bounded timeouts let Prisma fail fast and reconnect instead of hanging. Caching on global in prod guarantees one shared pool per process.

**How to apply:** if you change DB connection setup, preserve these URL params (with env overrides) and the global singleton. Do not pass a raw `DATABASE_URL` straight into `new PrismaClient` without the pool params.

## Retry layer is idempotent-only — never blanket-retry writes

The shared client wraps every op in a `$extends({ query: { $allOperations } })` retry that re-runs on transient connection errors (E57P01 / P1001/P1002/P1008/P1017 / "Server has closed the connection" etc.), capped by `DB_MAX_ATTEMPTS` (default 3) with jittered exponential backoff.

**Rule:** auto-retry is gated to **idempotent ops only** — pure reads, plus single-row `update`s whose `data` has no atomic numeric operator (increment/decrement/multiply/divide). create / createMany / upsert / delete / deleteMany / updateMany / atomic-increment updates / raw writes are **never** auto-retried.

**Why:** a connection can die *after* the server committed but *before* Prisma gets the ack; re-running a non-idempotent write would double-apply (duplicate rows, double increments). Architect review FAILed an earlier blanket `$allOperations` write-retry for exactly this. Idempotent-only retry is the most we can do safely at the shared-client layer.

**Transaction safety:** `$allOperations` also wraps ops *inside* `$transaction(async tx => …)`, but `query` is bound to that tx connection, so a retry just fails out on the doomed connection — it cannot escape the tx or re-acquire an advisory lock. The outer `$transaction` wrapper is not intercepted, so multi-statement / advisory-lock flows (xero.ts, pipedrive.ts) are never auto-replayed.

**How to apply:** if you need to retry a non-idempotent write, do it at the call site with explicit idempotency (e.g. a natural unique key + upsert, or a dedup token), not by widening `isRetriableOperation`.

## Dev vs prod DB topology + opt-in PgBouncer routing

**Topology (non-obvious):** dev and prod are **separate databases**. Dev `DATABASE_URL` is the Replit-managed Helium DB (internal host alias `helium`, runtime-managed — never hand-edit). Prod runtime is an **external Neon (Singapore)** reached via the **direct** endpoint; that same Neon is what `PROD_DATABASE_URL` (a manual secret) points at, used only by migration scripts. So the direct-endpoint idle reaping (E57P01) is a prod-only phenomenon you can't reproduce against dev/Helium.

**The deeper E57P01 cure = talk to Neon's pooler, gated by a flag.** `buildDatasourceUrl` (runtime-only; Prisma Migrate never calls it) has `applyNeonPgBouncer`: when env `DB_USE_PGBOUNCER` is truthy AND host matches `ep-*.…neon.tech`, it rewrites the endpoint-id label to `…-pooler` and forces `pgbouncer=true`. Strict no-op for any non-Neon host (Helium alias, localhost) and already-pooled hosts. `DB_USE_PGBOUNCER=1` is set in **production scope only**.

**Why a flag + transform instead of editing the secret:** runtime `DATABASE_URL` is runtime-managed (can't set), and a pooled URL holds credentials (would need `requestEnvVar`). The transform needs no secret access, leaves **migrations on the direct endpoint** (they read the raw env), and is **instantly reversible**: delete the prod `DB_USE_PGBOUNCER` env var + republish reverts to direct, no code change. Takes effect only after a **republish**.

**Pooler compat for this app:** Neon pooler = PgBouncer **transaction** mode → `pgbouncer=true` disables prepared statements (required). `pg_advisory_xact_lock` inside `$transaction` is fine (transaction-scoped). Do **not** route session-scoped features through this client (session `pg_advisory_lock`, `LISTEN/NOTIFY`, temp tables, session GUCs). Verify any new pooler host with `psql … -c 'select 1'` before enabling — the `-pooler` insert is deterministic but confirm it resolves.

# Graceful shutdown lives in the API server, NOT the shared db lib

**Rule:** SIGTERM/SIGINT handlers (server.close → prisma.$disconnect → process.exit, with a ~10s force-exit timeout) live in `artifacts/api-server/src/index.ts`, never in `lib/db`.

**Why:** registering a `process.on("SIGTERM")` listener anywhere overrides Node's default "exit on SIGTERM" behavior. If a shared lib (imported by seed scripts AND the server) swallowed SIGTERM without an explicit exit, the platform restart (SIGTERM → SIGKILL) would hang until SIGKILL. The HTTP server owns the lifecycle, so shutdown belongs there, and it MUST guarantee a process.exit (success path + force-exit timeout).

**How to apply:** keep any signal handling out of `lib/db`; if you add shutdown logic, always pair it with a bounded force-exit so restarts can't hang.

# Read-heavy dashboard endpoints are cached, not recomputed per request

`GET /api/dashboard/resource-utilization-detail` and `GET /api/resource-planning` were taking 5–9s in prod (heavy `include` loads of the whole workforce + recent timesheets, then in-memory aggregation). Fixed by trimming `include` → `select` (only fields actually consumed) and adding a 30s in-process `TtlCache`.

**Cache-key scoping rule (important):** the key MUST encode the caller's data scope.
- utilization-detail is role/PM/principal-scoped → key is `role:userId`.
- resource-planning currently returns the same global matrix for every authorized role → key is `startDate:weeks` only. **If you ever add role/PM-specific filtering to resource-planning, add the scope to its cache key or you will leak data across callers.**

30s TTL matches the frontend React Query `staleTime`, so staleness is already expected by the client.
