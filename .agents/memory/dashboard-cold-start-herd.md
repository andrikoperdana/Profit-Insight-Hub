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

## Aggregate overview endpoint (DONE)

The MANAGEMENT/FINANCE dashboard fan-out is now collapsed into ONE
`GET /api/dashboard/overview` (admitted: MANAGEMENT/FINANCE/SUPER_ADMIN only,
others 403). Server does Promise.all of pure compute fns, a module-level 30s
TtlCache + single-flight, then zod-validates (non-fatal: logs a warning, still
serves — availability over strictness on a perf aggregation). The frontend uses a
single `useGetDashboardOverview`; child cards are **prop-driven** and must not
self-fetch when rendered inside the overview dashboard.

Durable rules learned here:

- **Overview cache key is `overview:${role}` — role-uniform, NOT per-user.** This is
  only safe because the admitted roles (MGMT/FINANCE/SUPER_ADMIN) get a
  role-uniform payload; `userId` is passed to compute fns but their per-user
  branches are PM/Principal-only, who are never admitted. **If you ever add
  per-user scoping to an admitted role, add `sub` to the cache key in the same
  change** or one user serves another's payload.
- **FINANCE parity = null-gating, not a separate shape.** The overview returns the
  full key set but nulls the MGMT-only sections (crm/csat/recentActivity/
  pendingAging/utilizationTrend/resourceUtilizationDetail/pmAllocation/
  pendingAssignment) for FINANCE; the frontend renders those as hidden/zero,
  matching the OLD per-endpoint 403 behavior. Keep cards rendering null→empty.
- **A prop-driven card reused elsewhere must keep its own fallback fetch.**
  e.g. BillableUtilizationCard is also used by HRDashboard, so it keeps an
  internal fetch; in ManagementDashboard it's fed via props + gated behind
  `{overview && ...}` so it never double-fetches.
- **Keep `GET /users` lazy.** The Assign-PM dialog's `useListUsers` must be gated
  `enabled: !!selected` (only when the dialog opens) so it doesn't re-add a
  first-load request whenever pending-assignment projects exist. Passing
  `{query:{enabled,...}}` to the generated hook requires an explicit `queryKey`.
