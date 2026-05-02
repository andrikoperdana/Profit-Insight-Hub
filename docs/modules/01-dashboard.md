# 1. Dashboard

Role-aware landing page that surfaces the metrics, alerts, and tasks each user needs first.

## Purpose

Every login lands on `/`. The dashboard composes a different set of widgets depending on the user's role so that a Consultant sees their assignments, a PM sees their portfolio health, and Management sees company-wide KPIs.

## Routes

### Frontend
| Path | Page |
|------|------|
| `/` | `Dashboard` (`pages/Dashboard/index.tsx`) — switchboard that renders the per-role view |

### Backend (`/api/dashboard`)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/dashboard/summary` | Top-line KPIs (active projects, revenue MTD, utilization, pending approvals) |
| GET | `/dashboard/profit-trend` | Monthly revenue vs. cost vs. margin series |
| GET | `/dashboard/status-breakdown` | Project counts per status |
| GET | `/dashboard/top-projects` | Largest contracts by value or margin |
| GET | `/dashboard/recent-activity` | Audit-style activity feed for the user's scope |
| GET | `/dashboard/pending-aging` | BAST/Invoices waiting too long |
| GET | `/dashboard/utilization` | Headline utilization % for the company or owned projects |

## Components

| Component | When it renders |
|-----------|-----------------|
| `WelcomeBanner` | Always — greeting + role badge |
| `ManagementDashboard` | Role = Management |
| `PMDashboard` | Role = PM |
| `SalesDashboard` | Role = Sales |
| `ConsultantDashboard` | Role = Consultant or TW |
| `AdminProjectDashboard` | Role = Admin Project |
| `ResourceUtilizationSection` | Management, PM |

All charts use Recharts; KPI cards use shadcn/ui `Card` primitives.

## Data model

| Model | Used for |
|-------|----------|
| `User` | Identifies the viewer, scopes data |
| `Project` | Status counts, top projects, profit trend |
| `Timesheet` | Cost rollups for profit trend, utilization |
| `Activity` | Recent activity feed |

## RBAC

| Role | What they see |
|------|---------------|
| Management | All projects, all KPIs, company-wide utilization |
| Admin Project | All projects, lifecycle and document KPIs |
| PM | Owned projects only — margin, capacity, pending approvals |
| Sales | Pipeline metrics + owned projects |
| Consultant / TW | Assigned projects, this week's timesheet status |

Server-side filtering happens inside each `/dashboard/*` handler based on `req.user.role` and `req.user.id`. The frontend does not gate by role beyond which sub-component to render.

## Primary flow

1. User authenticates → JWT cookie set.
2. Browser navigates to `/`.
3. `Dashboard` reads `req.user.role` from `/api/auth/me`.
4. The role-specific component issues parallel queries against `/api/dashboard/*`.
5. Each KPI card and chart renders independently with TanStack Query loading states.
