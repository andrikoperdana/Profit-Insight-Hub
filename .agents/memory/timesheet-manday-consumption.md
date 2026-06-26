---
name: Timesheet manday consumption enrichment
description: How consumed-vs-planned manday data is surfaced at timesheet approval, why it is approver-gated, and the cumulative bulk-approval pitfall.
---

# Timesheet manday consumption at approval

When approving timesheets, the UI surfaces consumed-vs-planned mandays (8h = 1 manday) per-person and project-level, and warns (awareness only — no hard server block) when approving would push over plan.

## Approver-only enrichment (security)
The GET /timesheets list is enriched with consumption fields ONLY for approvers (approval scope, or a project filter requested by MGMT/SUPER_ADMIN or the project's own PM). Ordinary submitters must receive the base serializer with NO manday fields.

**Why:** the consumption numbers are team-wide aggregates (everyone's approved hours on the project). Returning them to a rank-and-file consultant who queries `?projectId=` would leak other people's totals. Single-row approve/reject responses stay unenriched too.

**How to apply:** keep the gate on any new path that returns these fields; never widen it to a non-approver role. Verify with a curl as a consultant — the manday keys must be absent.

## Cumulative bulk-approval warning (correctness)
Per-row over-plan checks compare ONE pending row against the already-APPROVED baseline. For "Approve All" / bulk-approve, that under-counts: several rows each safe alone can collectively cross the plan.

**Why:** every row carries the same approved baseline for its (project,user)/project keys; checking each independently never accumulates the other selected pending hours.

**How to apply:** bulk paths must seed a running total once per key from the baseline, then add each selected entry's hours/8 in turn and flag rows that cross planned. The shared helper `countCumulativeOverPlan` does this; route every batch confirm through it, not through a per-row filter.
