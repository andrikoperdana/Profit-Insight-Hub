# 2. Projects & Clients

Core lifecycle module: from observation/RFP, to running project, to BAST and invoice. Includes the client CRM and document attachments.

## Purpose

A project is the central unit of work. Every other module (resources, timesheets, profitability, CSAT) attaches to a Project. Clients hold the contact and billing info that projects reference.

## Routes

### Frontend
| Path | Page |
|------|------|
| `/projects` | `ProjectsList` — searchable, status-filtered table |
| `/projects/new` | `NewProject` — multi-step create form |
| `/projects/:id` | `ProjectDetail` — tabs: Overview, Resources, Financials, Survey, Documents |
| `/clients` | `ClientsList` — CRM list with create/edit dialogs |

### Backend
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/projects` | Paginated list, filtered by status / owner / search |
| POST | `/projects` | Create project |
| GET | `/projects/:id` | Single project with related counts |
| PATCH | `/projects/:id` | Update fields, advance status |
| DELETE | `/projects/:id` | Soft-delete (status → CANCELLED) |
| GET | `/projects/:id/financials` | Margin breakdown (see Profitability module) |
| GET | `/clients` | Paginated client list |
| POST | `/clients` | Create client |
| PATCH | `/clients/:id` | Update client |
| DELETE | `/clients/:id` | Remove client (blocked if linked projects exist) |
| POST | `/uploads` | Upload BAST / Invoice / SOW (returns signed URL or stored path) |

## Lifecycle

```
OBSERVATION → SALES → KICKOFF → ACTIVE → BAST → INVOICE → CLOSED
```

Status transitions are validated server-side. Some transitions require prerequisites (e.g. BAST needs at least one approved timesheet and an uploaded BAST document).

## Components

| Component | Role |
|-----------|------|
| `ProjectsList` | Master list, filter chips |
| `ProjectDetail` | Container with tabs |
| `OverviewTab` | Client, dates, status pill, key facts |
| `ResourcesTab` | Add/Remove consultants (see Resources module) |
| `FinancialsTab` | Contract value, actual cost, margin (see Profitability module) |
| `SurveyTab` | CSAT link & responses (see BI & CSAT module) |
| `DocumentsTab` | Attached SOW / BAST / Invoice files |
| `NewProject` | Wizard with Zod-validated steps |
| `ClientsList` | CRM table |

## Data model

| Model | Notes |
|-------|-------|
| `Project` | `id`, `code`, `name`, `clientId`, `ownerId`, `status`, `contractValue`, `startDate`, `endDate` |
| `Client` | `id`, `name`, `industry`, `contact`, `npwp`, `address` |
| `Document` | `id`, `projectId`, `type` (SOW/BAST/INVOICE/OTHER), `url`, `uploadedById` |
| `ProjectResource` | Join table to `User` (covered in Resources module) |

## RBAC

| Action | Allowed roles |
|--------|---------------|
| Create project | Management, Admin Project, PM, Sales |
| Edit project | Management, Admin Project, project owner (PM) |
| Delete project | Management, Admin Project |
| View any project | Management, Admin Project |
| View assigned project | PM (owner), Consultant / TW (resource) |
| Manage clients | Management, Admin Project, Sales |

Enforcement lives in `requireRole()` middleware plus per-route ownership checks.

## Primary flow (RFP → Closed)

1. **Sales** creates a project in OBSERVATION.
2. Contract signed → status SALES → KICKOFF.
3. **PM** is assigned as owner; consultants attached via Resources tab.
4. Status → ACTIVE; consultants log timesheets.
5. Work complete → upload BAST → status BAST.
6. **Admin Project** issues invoice → status INVOICE.
7. Payment received → status CLOSED; CSAT survey link expires.
