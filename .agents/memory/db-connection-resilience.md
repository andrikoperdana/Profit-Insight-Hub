---
name: DB connection resilience (E57P01) + endpoint caching
description: Why the Prisma datasource carries pool params and how the read-heavy dashboard endpoints are cached.
---

# Serverless Postgres terminates idle connections (E57P01)

Production logs were full of `prisma:error ... terminating connection due to administrator command (SqlState E57P01)`. This is the Replit/Neon-backed Postgres dropping idle pool connections, not an app bug — Prisma reconnects on the next query, but stale connections caused error noise and slow first requests.

**Decision:** the Prisma datasource URL is augmented at client-construction time with `connection_limit`, `pool_timeout`, `connect_timeout` (small pool, bounded timeouts) and the client is cached on `globalThis` in **all** environments (not just dev).

**Why:** a smaller pool keeps fewer connections idle long enough to be reaped; bounded timeouts let Prisma fail fast and reconnect instead of hanging. Caching on global in prod guarantees one shared pool per process.

**How to apply:** if you change DB connection setup, preserve these URL params and the global singleton. Do not pass a raw `DATABASE_URL` straight into `new PrismaClient` without the pool params.

# Read-heavy dashboard endpoints are cached, not recomputed per request

`GET /api/dashboard/resource-utilization-detail` and `GET /api/resource-planning` were taking 5–9s in prod (heavy `include` loads of the whole workforce + recent timesheets, then in-memory aggregation). Fixed by trimming `include` → `select` (only fields actually consumed) and adding a 30s in-process `TtlCache`.

**Cache-key scoping rule (important):** the key MUST encode the caller's data scope.
- utilization-detail is role/PM/principal-scoped → key is `role:userId`.
- resource-planning currently returns the same global matrix for every authorized role → key is `startDate:weeks` only. **If you ever add role/PM-specific filtering to resource-planning, add the scope to its cache key or you will leak data across callers.**

30s TTL matches the frontend React Query `staleTime`, so staleness is already expected by the client.
