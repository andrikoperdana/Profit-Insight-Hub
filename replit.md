# SecureProfit Hub

Full-stack web application for an Indonesian IT security consulting firm. Tracks consulting projects from observation through delivery, monitoring profit margins in real time as consultants log billable mandays. Roles: Management, Project Manager, Sales, Konsultan, Technical Writer, Admin Project, three Principal supervisors, and Site Admin.

## Architecture

- **Monorepo**: pnpm workspace with shared `lib/` packages and `artifacts/` for runnable apps
- **Frontend** (`artifacts/web`): React + Vite + TypeScript + Tailwind v4 + shadcn/ui + Recharts, wouter for routing, dark theme by default with cyber-green accent
- **Backend** (`artifacts/api-server`): Node + Express + Pino, JWT auth (HS256), bcryptjs hashing
- **Database** (`lib/db`): PostgreSQL via Prisma ORM (user-mandated). Schema in `lib/db/prisma/schema.prisma`. Generated client output to `lib/db/src/generated/client/` and re-exported from `lib/db/src/index.ts`
- **API contract** (`lib/api-spec`): Single OpenAPI 3 source at `openapi.yaml`, codegen produces React Query hooks in `lib/api-client-react` and zod validators in `lib/api-zod`
- **Auth flow**: `POST /api/auth/login` returns `{ token, user }`. Frontend stores token in `localStorage["auth_token"]`; `lib/api-client-react/src/custom-fetch.ts` automatically attaches `Authorization: Bearer` and redirects to `/login` on 401

## Domain entities (Prisma)

- **User** — `seniority` (`JUNIOR/MID/SENIOR/PRINCIPAL`), `businessUnitId`, `managerId` (PM → PMO), `principalId` (delivery user → Principal supervisor)
- **BusinessUnit** — `name unique`, optional `description`, `isActive`. Seeded: Pentest, GRC, Threat Hunting
- **Skill** + **UserSkill** join (M:N) — `name unique`, optional `category`, `isActive`
- **Client**, **Project**, **Activity** (audit trail), **Document** (BAST/INVOICE/CONTRACT/REPORT/OTHER, base64 in DB)
- **ProjectResource** — per-project staffing with planned mandays + daily rate
- **Timesheet** — `DRAFT → SUBMITTED → APPROVED/REJECTED`, optional `taskId` linking the entry to a Task
- **ProjectExpense** — non-resource project costs (SOFTWARE/HARDWARE/LICENSE/TRAVEL/OTHER) with approval workflow (see below)
- **BillingMilestone** — Terms-of-Payment milestone per project (see Billing tab)
- **Task** — per-project work items with TODO/IN_PROGRESS/BLOCKED/DONE status, `billable` flag, `parentTaskId` self-relation (WBS), optional start/end dates
- **TaskAssignee** (M:N join Task↔User) — multi-assignee model, replaces single-assignee. Legacy `Task.assigneeId` kept as a mirror of the first assignee for backward compat
- **TaskDependency** — `(taskId, dependsOnTaskId)` unique join for finish-to-start dependencies
- **TaskTimeLog** — clock-in entries by any assignee against a Task; cascades on task delete

## Project lifecycle

`DRAFT (Sales intake, awaiting PMO assignment) → OBSERVATION (PM completed details) → ACTIVE (delivering) → PAUSE / COMPLETE → CLOSED`.

### Draft intake flow (Sales → PMO → PM)

1. **Sales** opens `/projects/new` — minimal 4-field intake form (Name + SPK + Client + Project Value). Server forces `status=DRAFT`, `salesId=req.user.sub`, `pmId=null` regardless of body.
2. **PMO Director (MANAGEMENT)** sees the project under a purple "Pending PM Assignment" card on dashboard; "Assign PM" PATCHes `pmId`. The 409 invariant prevents reassigning if a PM is already set on a DRAFT project.
3. **PM** sees the project on their dashboard under "New project(s) assigned to you". The `DraftCompletionCard` (rendered above tabs only when `status === DRAFT`) collects Description, Start/End dates, Revenue, Planned Mandays, Estimated Cost, then transitions to OBSERVATION.

### PATCH /api/projects/:id authorization rules

Field-level + ownership guards in `routes/projects.ts`:
- **SALES**: only own projects (`salesId === userId`).
  - On DRAFT: allowed fields = `{code, name, description, clientId, contractValue}`; everything else returns 403.
  - On any other status: same descriptive/financial fields PM can change, but cannot reassign people (`salesId`/`pmId`), reassign the client (`clientId`), or change `status`/`statusChangeReason`.
- **PROJECT_MANAGER**: only own assignments (`pmId === userId`); all fields except `salesId`/`pmId`/`clientId`.
- **MANAGEMENT**: full access. Setting `pmId` on a DRAFT that already has one returns 409.

## Project detail tabs (`/projects/:id`)

### Overview (editable)

Editable by MANAGEMENT, the assigned PM, or the project's Sales owner via "Edit" button (hidden on DRAFT). Yellow banner on non-DRAFT when essential fields are missing (Client, Start/End, Contract Value, Planned Mandays, Estimated Cost, Description). Save uses inline edit → "Review & Save" confirmation dialog → "Confirm & Save" PATCH. The Client field is a Select only for MANAGEMENT; PM/Sales see read-only (and `PM_FORBIDDEN` / `SALES_ONGOING_FORBIDDEN` reject any direct attempt to change `clientId` on in-flight projects).

### Timeline (drag-n-drop Gantt with dependencies)

`TaskGanttChart` uses a per-bar `GanttBar` subcomponent: pointer-down on the bar body drags the whole task (shifts both start & end by the same number of days), pointer-down on the left/right 8-px edge handles resizes that side. Drag is preview-only via local state; on pointer-up the new dates are PATCHed via `useUpdateTask`. A `DependencyArrows` SVG overlay measures bar bounding rects against the lanes container and draws elbow paths with arrowheads from each predecessor's right edge to its dependent's left edge; recomputes on drag-tick, window resize/scroll, and `ResizeObserver` lanes-resize so arrows stay aligned. If a drop violates a dependency (start < predecessor's end+1), the change is still saved (server doesn't enforce timing) but a toast warns the PM.

### Tasks

MGMT and the PM-of-project can create/edit/delete tasks; assignees may change `status` only and log hours. Endpoints in `routes/tasks.ts`:

- `GET /api/projects/:id/tasks` — same visibility as `/projects/:id/resources` (MGMT/ADMIN_PROJECT all; PM own; Sales own; Konsultan/TW only if a resource on the project).
- `POST /api/projects/:id/tasks`, `PATCH /api/tasks/:taskId`, `DELETE /api/tasks/:taskId`
- `GET /api/tasks/mine`
- `GET/POST /api/tasks/:taskId/time-logs` — assignee logs `hours ∈ (0, 24]` with optional `note` and `loggedAt`.

**Multi-assignee**: POST/PATCH accept `assigneeIds: string[]` (canonical); legacy `assigneeId` still honored. PATCH semantics:
- `assigneeIds` omitted → preserved.
- `assigneeIds: []` or `null` → unassign all.
- Not an array of strings → 400 (never silently coerce).

Replacement runs in a Prisma transaction (deleteMany → createMany → task.update). Visibility/permission checks OR the legacy `assigneeId` with the join. Serializer returns both `assignees: [{userId, name}]` and the legacy `assigneeId/assigneeName` (first assignee).

**WBS (parent/child)**: POST/PATCH accept `parentTaskId` (manager-only, ancestor-BFS cycle check). Serializer returns `parentTaskId` and `subtaskCount`. TasksTab form has a "Parent Task" select; the table renders rows in DFS tree order with depth-based indentation and a `└` glyph for child rows.

**Dependencies**: POST/PATCH accept `dependencyTaskIds: string[]` (manager-only, forward-BFS cycle check). TasksTab form has a "Depends On (predecessors)" checkbox grid; both Parent and Depends-On pickers exclude self + descendants so the UI never offers cycles the server would reject.

**Billable flag**: `Task.billable` defaults true. Toggle in form; non-billable tasks render an amber badge and time logs against them are recorded for visibility but do **not** roll into revenue/margin.

**Timesheet ↔ Task linkage**: `Timesheet.taskId` is optional. `POST /api/timesheets` validates that the task belongs to the chosen project AND the caller is one of its assignees. List serializer returns `taskId` + `taskTitle`, surfaced as a "Task" column on My/Team Timesheets and CSV exports. Log Time dialog shows a Task select filtered by chosen project.

Audit actions: `task.{created,updated,deleted,time_logged}`. Hooks: `useListProjectTasks`, `useCreateProjectTask`, `useUpdateTask`, `useDeleteTask`, `useListMyTasks`, `useListTaskTimeLogs`, `useLogTaskTime`. Components: `pages/projects/TasksTab.tsx` and `MyTasksCard` inside `ConsultantDashboard.tsx`.

### Resources (fleksibel role)

Four sections:
1. **Admin Project** — single-pick on `Project.adminProjectId`
2. **Konsultan Team** — multi-pick `ProjectResource` with `userRole === KONSULTAN` (cap 2-projek lama sudah dihapus)
3. **Technical Writer Team** — multi-pick `ProjectResource` with `userRole === TECHNICAL_WRITER`
4. **Resource Lainnya** — fleksibel: MGMT/PM bisa tambahkan user manapun (Sales, MANAGEMENT, SOC role kustom, dll) sebagai `ProjectResource` dengan free-text `roleInProject` (contoh: "SOC Manager", "Security Engineer"). Backed by `GET /api/users/active-all` (MGMT + PM only) — return semua user aktif tanpa filter role. Dialog memaksa `roleInProject` non-empty saat mode `OTHER`.

### Expenses (PM cost capture beyond resources, with approval workflow)

`ProjectExpense.status ∈ {PENDING, APPROVED, REJECTED}` with `approvedById/approvedByName/approvedAt/rejectionReason`. Endpoints in `routes/expenses.ts`:
- `GET /api/projects/:id/expenses` — open to any authenticated user with project visibility.
- `POST /api/projects/:id/expenses` — anyone with project visibility may submit. MGMT submissions auto-APPROVED.
- `POST /api/expenses/:id/approve` and `POST /api/expenses/:id/reject` (`{ reason }`) — PM-of-project or MANAGEMENT only.
- `DELETE /api/expenses/:expenseId` — MGMT or PM-of-project.

Categories: `SOFTWARE`, `HARDWARE`, `LICENSE`, `TRAVEL`, `OTHER`. **Only APPROVED expenses count in `actualCost` / `additionalCost` / margin.** ExpensesTab shows status badges, approve/reject buttons (gated on `isApprover && status === PENDING`), and a "Pending Approval" summary stat. PMDashboard shows an amber "Expense Menunggu Persetujuan" card when any PENDING expense exists for projects in the PM's scope. Audit: `expense.{created,deleted,approved,rejected}`. Hooks: `useListProjectExpenses`, `useAddProjectExpense`, `useRemoveProjectExpense`, `useApproveProjectExpense`, `useRejectProjectExpense`.

### Billing (Terms of Payment milestones)

`BillingMilestone` — `name`, `description?`, `percentage`, `amount?` override, `dueDate?`, `status ∈ PLANNED/INVOICED/PAID/CANCELLED`, `invoiceNumber?`, `invoicedAt?`, `paidAt?`, `sortOrder`. Endpoints in `routes/billing-milestones.ts`:
- `GET/POST /api/projects/:id/billing-milestones` — read open to anyone with project visibility; writes restricted to MGMT or assigned PM.
- `PATCH/DELETE /api/billing-milestones/:milestoneId`

Setting status to `INVOICED` auto-stamps `invoicedAt`; `PAID` auto-stamps `paidAt` (if not provided). The **Billing** tab on `/projects/:id` (gated to roles that can view financials) renders milestone table with % allocated, computed/override amount, due date, status badge, invoice number, and a banner when total % > 100 or < 100. Audit: `billing_milestone.{created,updated,deleted}`. Hooks: `useListBillingMilestones`, `useCreateBillingMilestone`, `useUpdateBillingMilestone`, `useDeleteBillingMilestone`. Component: `pages/projects/BillingTab.tsx`.

## Financials computation

Computed in `routes/.../serializers.ts`:
- `resourceCost` = sum over APPROVED timesheets of `(hours / 8) * resource.dailyRate`
- `additionalCost` = sum of **APPROVED** `ProjectExpense.amount` for the project
- `actualCost` = `resourceCost + additionalCost`
- `actualProfit` = `contractValue - actualCost`
- `marginPct` = `actualProfit / contractValue * 100`
- Forecast: linear projection of cost based on burn rate

`/api/projects/:id/financials` aggregates approved timesheets per month and pairs with contract value spread evenly across active months for chart rendering.

## Hierarchy & Principal roles

Three Principal roles supervise delivery teams: **PRINCIPAL_KONSULTAN**, **PRINCIPAL_TECHNICAL_WRITER**, **PRINCIPAL_ADMIN_PROJECT**. PMs report to MANAGEMENT (PMO Director). Mapping in `pages/lib/roles.ts` (`PRINCIPAL_TO_REPORT_ROLE`):

- PRINCIPAL_KONSULTAN → KONSULTAN
- PRINCIPAL_TECHNICAL_WRITER → TECHNICAL_WRITER
- PRINCIPAL_ADMIN_PROJECT → ADMIN_PROJECT

### Resource propose workflow (Principal → PM)

Principals can propose a supervisee onto an OBSERVATION/ACTIVE project that lacks an assigned resource of the role they supervise. PM has final say. Endpoints in `routes/resources.ts` and `routes/principal.ts`:

- `POST /api/projects/:id/resources/propose` — Principal-only; proposed `userId` must be a direct supervisee (`User.principalId === req.user.sub`); creates `ProjectResource` with `proposedById`/`proposedAt` set and `acceptedAt` null.
- `POST /api/resources/:resourceId/accept` — MGMT or the project's PM; sets `acceptedAt`.
- `DELETE /api/resources/:resourceId` — MGMT, project's PM, or supervising Principal of the row's user.
- `GET /api/principal/projects-needing-resource` — Principal-only.
- `GET /api/users/under-supervision` — Principal-only.

Audit: `resource.{proposed,accepted}`. Hooks: `useProposeProjectResource`, `useAcceptProjectResource`, `useListProjectsNeedingResource`, `useListUsersUnderSupervision`. Page: `pages/dashboard/PrincipalDashboard.tsx`.

### Principal visibility constraints

Principals never see commercial figures: `canViewProjectFinancials()` returns false for any role starting with `PRINCIPAL_`, hiding the Financials/Billing tabs and all contractValue/margin/cost columns. Estimated Cost on Overview also sits inside the financials gate.

## Resource Planning matrix

Page: `/resource-planning` (PM + MANAGEMENT). `GET /api/resource-planning?startDate=YYYY-MM-DD&weeks=N` returns rows grouped per Business Unit, each row showing weekly planned mandays cells (sum of `ProjectResource.plannedMandays` distributed across active project weeks). Cells color-coded by load (>=6 destructive, >=4 amber, >0 emerald) with per-cell tooltip listing project allocations.

## Role-based access

Enforced server-side via `requireRole` middleware in `middlewares/auth.ts`:
- **Management**: full access
- **Project Manager**: write projects/resources, approve timesheets for projects where they are PM
- **Sales**: write clients/projects
- **Konsultan / Technical Writer**: log own timesheets only
- **Admin Project**: upload documents and invoices

Server-side data scoping:
- `GET /api/projects` filters by role: PM → own (`pmId`), Sales → own (`salesId`), Konsultan/TW → assigned or has timesheet, Management/Admin → all.
- `GET /api/dashboard/resource-utilization-detail` restricted to Management + PM, with PM seeing only resources working on own projects.

**Express router gotcha**: avoid `router.use(requireRole(...))` at the top of a sub-router mounted via `router.use(subRouter)` (no path prefix). Express runs the sub-router's middleware for *every* incoming request before path matching, so a router-level `requireRole` will reject requests destined for *other* sibling routers. Apply `requireAuth` / `requireRole` per-route, or mount the router under a path prefix (`router.use("/bi", biRouter)`).

## Role-based dashboards

`pages/dashboard/index.tsx` routes per role:
- **MANAGEMENT** → `ManagementDashboard` (executive KPIs, profit trend, status breakdown, aging buckets, at-risk-projects alert, `<PMAllocationCard />` showing each PM's in-flight/active/observation/draft counts + total contract value, color-coded by load `>=6 destructive, >=4 amber`)
- **PROJECT_MANAGER** → `PMDashboard` (PM-scoped active projects, approval inbox with Approve All, my-team utilization, revenue-vs-profit chart, overdue-approval alert, pending-expense alert)
- **SALES** → `SalesDashboard` (own pipeline, revenue-by-client, status pie, 6-month profitability trend)
- **KONSULTAN / TECHNICAL_WRITER** → `ConsultantDashboard` (welcome banner, prominent "Log Today's Time Sheet" CTA, 14-day trend, recent submissions, MyTasksCard)
- **ADMIN_PROJECT** → `AdminProjectDashboard` (closing-doc inbox + alert for projects complete >3 days)
- **SITE_ADMIN** → `SiteAdminDashboard` (Users + Audit Log management, recent activity feed). User administration and audit log are exclusive to SITE_ADMIN.

Shared `WelcomeBanner` (`components/dashboard/WelcomeBanner.tsx`) shows time-aware greeting + role label.

## Pages & sidebar

`/login`, `/` (dashboard), `/projects`, `/projects/new`, `/projects/:id`, `/timesheets`, `/clients`, `/users` (SITE_ADMIN), `/skills` (SITE_ADMIN), `/business-units` (SITE_ADMIN), `/resource-planning` (PM/MGMT), `/settings`.

Skill catalog: `Skill` model (`name unique`, optional `category`, `isActive`). CRUD endpoints `GET/POST /api/skills`, `PATCH/DELETE /api/skills/:id`. Business Units: `GET/POST /api/business-units`, `PATCH/DELETE /api/business-units/:id`.

## Conventions

- All currency formatted as IDR via `formatIDR()` in `pages/lib/format.ts`
- Frontend imports hooks from `@workspace/api-client-react` (not subpaths)
- API server uses ESM with `.js` import extensions in TypeScript source
- No emojis in UI
- Frontend route splitting: `App.tsx` lazy-loads every page except `/login` and `/` (Dashboard) via `React.lazy()` + a single `<Suspense>` boundary; global QueryClient sets `staleTime: 30_000` + `gcTime: 5min`

## Common tasks

- Regenerate Prisma: `pnpm --filter @workspace/db exec prisma generate`
- Push schema: `pnpm --filter @workspace/db exec prisma db push`
- Regenerate API client/zod: `pnpm --filter @workspace/api-spec run codegen` (post-step `lib/api-spec/scripts/fix-zod-barrel.mjs` rewrites `lib/api-zod/src/index.ts` to only re-export `./generated/api`, avoiding the orval-generated barrel ambiguity between zod schemas in `api.ts` and TS interfaces in `generated/types/`)
- Reseed DB: `pnpm --filter @workspace/db run seed`

Seed file: `lib/db/src/seed.ts`. Idempotent `ensureBusinessUnitsAndSkills()` block creates 3 BUs + 11 skills (Web/Mobile/Infra Pentest, Red Team, SWIFT/ISO 27001/SOC 2/PCI DSS Audit, DFIR, Threat Hunting, Technical Writing) and assigns sensible seniority + BU + skills to existing seeded users on every run.

## Seed credentials (password: `password123`)

Main accounts (`@secureprofit.id`):
- `management@` — Adi Wibowo (MANAGEMENT)
- `pm@` — Sari Pratiwi (PROJECT_MANAGER)
- `sales@` — Budi Santoso (SALES)
- `konsultan@` — Rian Hidayat (KONSULTAN)
- `konsultan2@` — Dewi Lestari (KONSULTAN)
- `writer@` — Ayu Wulandari (TECHNICAL_WRITER)
- `admin@` — Tono Setiawan (ADMIN_PROJECT)
- `siteadmin@` — Rina Kartika (SITE_ADMIN)

Principals (`@itsecasia.com`):
- `principal.kon.h7q4@` — Bayu Prasetyo (PRINCIPAL_KONSULTAN)
- `principal.tw.m9k2@` — Indah Kusumawardani (PRINCIPAL_TECHNICAL_WRITER)
- `principal.ap.r3n8@` — Fajar Nugroho (PRINCIPAL_ADMIN_PROJECT)
