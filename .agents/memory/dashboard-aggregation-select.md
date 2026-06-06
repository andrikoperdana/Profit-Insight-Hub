---
name: Dashboard portfolio aggregation select
description: Use a narrow metrics-only Prisma select (not the full project include) when aggregating every project for dashboard KPIs.
---

# Portfolio aggregation must not use the heavy project include

Dashboard hot paths that load EVERY project to aggregate KPIs (e.g.
`/dashboard/summary`, `/dashboard/profit-trend`) must select only the fields the
metric computation reads, via `projectMetricsSelect` in
`api-server/src/lib/serializers.ts` — never `projectInclude`.

**Why:** `projectInclude` eagerly loads full related rows for every project —
full `user` rows on each resource AND each timesheet (including base64
`avatarDataUrl`), plus RAID items, billing milestones, client/pm/sales, etc.
Aggregation needs none of that; for a portfolio of many projects with long
timesheet history this becomes a large memory/transfer spike.

**How to apply:** `computeMetrics` defines exactly what is needed
(`contractValue`, `estimatedCost`, `plannedMandays`, `vatPercent`,
`contractValueIncludesVat`, `currency`, `exchangeRate`,
`resources[userId,dailyRate]`, `timesheets[hours,status,userId,workDate,
user.dailyRate]`, `expenses[amount,status]`). Keep `projectMetricsSelect` in
sync with `computeMetrics` if either changes, and cast the result to
`ProjectWithRelations` before passing it in. Numbers stay identical because the
same `computeMetrics` runs over the trimmed rows. Routes that need the health
score / serializeProject (which reads RAID + billing) still use `projectInclude`.
