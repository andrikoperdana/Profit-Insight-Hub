---
name: DB connection resilience (E57P01) + endpoint caching
description: Why the Prisma datasource carries pool params and how the read-heavy dashboard endpoints are cached.
---

# Serverless Postgres terminates idle connections (E57P01)

Production logs were full of `prisma:error ... terminating connection due to administrator command (SqlState E57P01)`. This is the Replit/Neon-backed Postgres dropping idle pool connections, not an app bug — Prisma reconnects on the next query, but stale connections caused error noise and slow first requests.

**Decision:** the Prisma datasource URL is augmented at client-construction time with `connection_limit`, `pool_timeout`, `connect_timeout` (small pool, bounded timeouts) and the client is cached on `globalThis` in **all** environments (not just dev). The three knobs are overridable via env vars `DB_CONNECTION_LIMIT` / `DB_POOL_TIMEOUT` / `DB_CONNECT_TIMEOUT` (positive-int parse, fallbacks 5/20/10) so the pool can be tuned per environment without a code change. Sizing rule: `(app instances) × DB_CONNECTION_LIMIT < db max_connections`; use PgBouncer in front for large fleets.

**Why:** a smaller pool keeps fewer connections idle long enough to be reaped; bounded timeouts let Prisma fail fast and reconnect instead of hanging. Caching on global in prod guarantees one shared pool per process.

**How to apply:** if you change DB connection setup, preserve these URL params (with env overrides) and the global singleton. Do not pass a raw `DATABASE_URL` straight into `new PrismaClient` without the pool params.

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
