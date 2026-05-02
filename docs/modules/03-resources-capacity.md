# 3. Resources & Capacity

Track who is assigned to which project and forecast availability across the team.

## Purpose

Resourcing answers two questions:

1. **Who is on this project?** — assignments stored on `ProjectResource`, edited from a project's Resources tab.
2. **Do we have capacity for new work?** — utilization & calendar views aggregate assignments + timesheets across the team.

## Routes

### Frontend
| Path | Page |
|------|------|
| `/resources` | `Resources` — global assignment overview |
| `/capacity` | `CapacityPlanning` — calendar / heatmap forward-looking view |
| `/projects/:id` (Resources tab) | Inline add/remove dialog on a single project |

### Backend
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/projects/:id/resources` | Current assignment list for a project |
| POST | `/projects/:id/resources` | Add a user to the project (role + allocation %) |
| DELETE | `/projects/:id/resources/:userId` | Remove an assignment |
| GET | `/capacity/calendar` | Week-by-week assignment matrix for all users |
| GET | `/dashboard/utilization-detail` | Per-user utilization (assigned hours vs. capacity) |

## Components

| Component | Notes |
|-----------|-------|
| `Resources` | Filterable list of all assignments across active projects |
| `CapacityPlanning` | Forward 6–12 week heatmap, colour-coded by utilization % |
| `ResourcesTab` | Add/Remove dialog inside Project Detail |
| `ResourceUtilizationSection` | Embedded card on Management/PM dashboards |

## Data model

| Model | Fields |
|-------|--------|
| `ProjectResource` | `id`, `projectId`, `userId`, `role` (e.g. Lead, Engineer), `allocationPct`, `startDate`, `endDate` |
| `User` | `defaultDailyCapacityHours` used as denominator |
| `Timesheet` | Actuals counted against allocation for utilization |

Utilization formula:

```
utilizationPct(user, week) =
    sum(allocationHours within week)
  / sum(workingDayHours within week)
  × 100
```

## RBAC

| Action | Roles |
|--------|-------|
| View global resources & capacity | Management, PM |
| Assign / remove resources | Management, Admin Project, project-owner PM |
| View own assignments | Consultant, TW (read via dashboard) |

## Primary flow (assigning a consultant)

1. PM opens `Project Detail` → Resources tab.
2. Clicks **Add Resource** → dialog lists available users with current utilization.
3. Selects user, role, allocation %, date range.
4. POST `/projects/:id/resources` → row appears, capacity heatmap updates next time it is visited.
5. Removal: trash icon → DELETE — protected by ownership check.
