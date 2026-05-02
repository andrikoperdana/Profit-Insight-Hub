# 4. Profitability & Finance

Live margin tracking per project plus what-if scenario planning.

## Purpose

Every project has a fixed contract value and an evolving actual cost (timesheets × cost rate + fixed expenses). The Finance module computes margin in real time and lets PMs simulate changes ("what if we add 2 senior consultants for 4 weeks?") before committing.

## Routes

### Frontend
Embedded inside Project Detail; surfaced in dashboards.

| Path | Surface |
|------|---------|
| `/projects/:id` → Financials tab | Margin breakdown, cost categories |
| `/projects/:id` → Scenario tab | What-if calculator |
| `/` (Management) | Top-line revenue / cost / margin charts |

### Backend
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/projects/:id/financials` | Computed: revenue, actual cost, committed cost, margin %, cost per role |
| GET | `/projects/:id/whatif?...` | Same shape with overrides (extra users, extended dates) applied |
| GET | `/dashboard/profit-trend` | Aggregated monthly series across permitted projects |

## Computation

```
revenue            = Project.contractValue
actualLaborCost    = Σ approved Timesheet.hours × User.costRate
committedCost      = Σ ProjectResource.allocationHours × User.costRate
                     for the remaining schedule
otherCosts         = Σ Project.expenses (recorded line items)
totalCost          = actualLaborCost + committedCost + otherCosts
margin             = revenue - totalCost
marginPct          = margin / revenue × 100
```

What-if appends synthetic `ProjectResource` rows / date extensions before the same calculation runs — original data is never mutated.

## Components

| Component | Notes |
|-----------|-------|
| `FinancialsTab` | KPI tiles + cost breakdown table + margin trend line |
| `ScenarioTab` | Form inputs (add role, weeks, allocation) → table compares baseline vs. scenario |
| `ManagementDashboard` profit charts | Monthly revenue/cost/margin |

## Data model

No dedicated tables — the module is a pure read/aggregation layer over:

- `Project` (contract value, expenses)
- `ProjectResource` (committed cost)
- `Timesheet` (actual cost; only `APPROVED` rows count)
- `User` (cost rate)

## RBAC

| Role | Access |
|------|--------|
| Management | All projects, all financials |
| Admin Project | All projects, all financials |
| PM | Owned projects only |
| Sales / Consultant / TW | No access; endpoints return 403 |

## Primary flow (margin review)

1. PM opens Project Detail → Financials.
2. Frontend calls `/projects/:id/financials`.
3. Cards show contract value, actual cost, projected margin %.
4. PM clicks Scenario → adjusts inputs → frontend calls `/projects/:id/whatif?addRole=Senior&weeks=4&allocation=80`.
5. Side-by-side delta table renders. Nothing is persisted.
