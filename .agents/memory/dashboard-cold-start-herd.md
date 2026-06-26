---
name: Dashboard cold-start herd reduction
description: Why the MGMT dashboard feels slow in prod and the code-side levers that shrink the first-load request burst.
---

# Dashboard cold-start thundering herd

Prod runs on Replit **autoscale** with a **remote Neon DB**. Perceived "prod is slow"
is almost always the **first dashboard load after idle**, not steady-state load:
the instance cold-starts (~4s) AND the MANAGEMENT/FINANCE dashboard fans out to
~20 concurrent API calls that all contend on the cold instance + cold DB pool, so
the worst ones balloon to 13–50s. Once warm, the same endpoints are 30–250ms.

## Durable rules (code-side mitigations)

- **Never use `refetchOnMount:"always"` + `staleTime:0` on dashboard widget queries.**
  It bypasses the server's 30s TtlCache and forces a network hit on every mount,
  amplifying the cold-start herd. Let them inherit the global 30s React Query
  `staleTime` instead.
  **Why:** the server already caches these aggregations 30s; forcing a refetch
  just multiplies cold-start contention for no freshness benefit.

- **The notification rules engine (`runAllNotificationChecks`) is heavy and is
  fired from every MGMT dashboard load** (`POST /api/notifications/run-checks`).
  It is throttled in `routes/notifications.ts` via a module-level ~10-min TTL of
  the last result + in-flight coalescing (concurrent triggers await one run).
  **Failures are never cached** (only assign the cache after the run resolves).
  Per-day notification dedup (`notifyOnceDaily`) is unaffected — the only tradeoff
  is a new qualifying condition may surface up to ~10 min late.
  **Why:** rules already dedup per-day, so re-scanning on every load is pure waste
  that piles onto the cold-start burst.

- **Keep the rule checks free of N+1.** `checkLateTimesheets` must batch the
  "has a recent timesheet" lookup (single `findMany distinct userId` + Set), never
  a `findFirst` per consultant.

## If cold-load still hurts after the above

Architect-endorsed next lever (not yet done): a single aggregate
`GET /api/dashboard/overview` (Promise.all of existing computations, one response)
to collapse ~8 dashboard calls into 1. Scope narrowly: MANAGEMENT/FINANCE/
SUPER_ADMIN only, `requireFinancialView` where commercial data appears, cache key
must encode role/scope, include only dashboard-owned widgets — leave Header
notifications and broad `useListProjects` out. Costs OpenAPI + codegen + frontend
refactor risk, so only do it if logs still show excessive fan-out.
