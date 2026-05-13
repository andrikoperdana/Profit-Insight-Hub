# SecureProfit Hub

Full-stack web application for an Indonesian IT security consulting firm. Tracks consulting projects from observation through delivery, monitoring profit margins in real time as consultants log billable mandays. Six roles coordinate around the same projects: Management, Project Manager, Sales, Konsultan (security consultant), Technical Writer, and Admin Project.

## Architecture

- **Monorepo**: pnpm workspace with shared `lib/` packages and `artifacts/` for runnable apps
- **Frontend** (`artifacts/web`): React + Vite + TypeScript + Tailwind v4 + shadcn/ui + Recharts, wouter for routing, dark theme by default with cyber-green accent
- **Backend** (`artifacts/api-server`): Node + Express + Pino, JWT auth (HS256), bcryptjs hashing
- **Database** (`lib/db`): PostgreSQL via Prisma ORM (user-mandated). Schema in `lib/db/prisma/schema.prisma`. Generated client output to `lib/db/src/generated/client/` and re-exported from `lib/db/src/index.ts`
- **API contract** (`lib/api-spec`): Single OpenAPI 3 source at `openapi.yaml`, codegen produces React Query hooks in `lib/api-client-react` and zod validators in `lib/api-zod`
- **Auth flow**: `POST /api/auth/login` returns `{ token, user }`. Frontend stores token in `localStorage["auth_token"]`; `lib/api-client-react/src/custom-fetch.ts` automatically attaches `Authorization: Bearer` and redirects to `/login` on 401

## Recent additions (May 2026 — late)

- **Billing Plan (Terms of Payment)** per project. New `BillingMilestone` model (`name`, `description?`, `percentage`, `amount?` override, `dueDate?`, `status ∈ PLANNED/INVOICED/PAID/CANCELLED`, `invoiceNumber?`, `invoicedAt?`, `paidAt?`, `sortOrder`). Endpoints in `routes/billing-milestones.ts`: `GET/POST /api/projects/:id/billing-milestones` (read open to anyone with project visibility; writes restricted to MGMT or project's PM) and `PATCH/DELETE /api/billing-milestones/:milestoneId`. Setting status to `INVOICED` auto-stamps `invoicedAt`; `PAID` auto-stamps `paidAt` (if not provided). New **Billing** tab on `/projects/:id` (gated to roles that can view financials) renders milestone table with % allocated, computed/override amount, due date, status badge, invoice number, and a banner when total % > 100 or < 100. Audit actions: `billing_milestone.{created,updated,deleted}`. Hooks: `useListBillingMilestones`, `useCreateBillingMilestone`, `useUpdateBillingMilestone`, `useDeleteBillingMilestone`. Component: `artifacts/web/src/pages/projects/BillingTab.tsx`.

- **WBS — parent/child task hierarchy**. `Task.parentTaskId` self-relation (`TaskSubtasks`, `onDelete: Cascade`). POST `/api/projects/:id/tasks` and PATCH `/api/tasks/:taskId` accept `parentTaskId` (manager-only); cycle protection via BFS of ancestors. Serializer returns `parentTaskId` and `subtaskCount`. TasksTab form has a "Parent Task (WBS)" select; the table renders rows in DFS tree order with depth-based indentation and a `└` glyph for child rows.

- **Task dependencies + drag-n-drop Gantt**. New `TaskDependency` join (`taskId`, `dependsOnTaskId`, `@@unique`). Task POST/PATCH accept `dependencyTaskIds: string[]` (manager-only); forward-BFS cycle check rejects circular dependency graphs. TasksTab form has a "Depends On (predecessors)" checkbox grid alongside the "Parent Task" select; both pickers compute the editing task's descendant set and exclude self + descendants so the UI never offers cycles the server would reject. The **Timeline** tab's `TaskGanttChart` was rewritten with a per-bar `GanttBar` subcomponent: pointer-down on the bar body drags the whole task (shifts both start & end by the same number of days), pointer-down on the left/right 8-px edge handles resizes that side. Drag is preview-only via local state; on pointer-up the new dates are PATCHed via `useUpdateTask`. A `DependencyArrows` SVG overlay measures the bar bounding rects against the lanes container and draws elbow paths with arrowheads from each predecessor's right edge to its dependent's left edge; recomputes on drag-tick, window resize/scroll, and `ResizeObserver` lanes-resize so arrows stay aligned. If a drop violates a dependency (start < predecessor's end+1), the change is still saved (server doesn't enforce timing) but a toast warns the PM.

## Recent additions (May 2026)

- **Task.billable** Boolean default true. Toggle in Task form (TasksTab); non-billable tasks render an amber badge in the row. Time logs against non-billable tasks are recorded for visibility but do not roll into revenue/margin downstream.
- **Expense approval workflow**. `ProjectExpense.status ∈ {PENDING, APPROVED, REJECTED}` plus `approvedById/approvedByName/approvedAt/rejectionReason`. Anyone with project visibility may submit; only PM-of-project or MANAGEMENT may approve/reject via `POST /api/expenses/:id/approve` or `POST /api/expenses/:id/reject` (`{ reason }`). MGMT submissions auto-APPROVED. **Only APPROVED expenses count in `actualCost` / `additionalCost` / margin.** ExpensesTab shows status badges, approve/reject buttons (gated on `isApprover && status === PENDING`), and a "Pending Approval" summary stat. PMDashboard shows an amber "Expense Menunggu Persetujuan" card when any PENDING expense exists for projects in the PM's scope.
- **Resource DB** (per-user). `User.seniority` enum (`JUNIOR/MID/SENIOR/PRINCIPAL`), `User.businessUnitId`, and `UserSkill` join (M:N to `Skill`). Users page (`/users`) gained Seniority + Business Unit selects and a Skills checkbox grid in both create + edit dialogs; submitted as `{ seniority, businessUnitId, skillIds[] }` on create/PATCH `/api/users`.
- **Skill catalog** (`Skill` model: `name unique`, optional `category`, `isActive`). CRUD at `/skills` (SITE_ADMIN only). Endpoints `GET/POST /api/skills`, `PATCH/DELETE /api/skills/:id`.
- **Business Units** (`BusinessUnit` model: `name unique`, optional `description`, `isActive`). CRUD at `/business-units` (SITE_ADMIN only). Endpoints `GET/POST /api/business-units`, `PATCH/DELETE /api/business-units/:id`. Seeded BUs: **Pentest**, **GRC**, **Threat Hunting**.
- **Resource Planning matrix** at `/resource-planning` (PM + MANAGEMENT). `GET /api/resource-planning?startDate=YYYY-MM-DD&weeks=N` returns rows grouped per Business Unit, each row showing weekly planned mandays cells (sum of `ProjectResource.plannedMandays` distributed across active project weeks). Cells color-coded by load (>=6 destructive, >=4 amber, >0 emerald) with per-cell tooltip listing project allocations.
- **Sidebar nav additions**: `/resource-planning` under Operations (PM/MGMT); `/business-units` and `/skills` under Admin (SITE_ADMIN).
- **Seed**: idempotent `ensureBusinessUnitsAndSkills()` block creates the 3 BUs + 11 skills (Web/Mobile/Infra Pentest, Red Team, SWIFT/ISO 27001/SOC 2/PCI DSS Audit, DFIR, Threat Hunting, Technical Writing) and assigns sensible seniority + BU + skills to existing seeded users; runs on both fresh seeds and idempotent re-runs.

## Domain entities (Prisma)

User, Client, Project, ProjectResource (per-project staffing with planned mandays + daily rate), Timesheet (DRAFT → SUBMITTED → APPROVED/REJECTED, optional `taskId` linking the entry to a Task), Document (BAST/INVOICE/CONTRACT/REPORT/OTHER, base64 data URL in DB), Activity (audit trail), ProjectExpense (additional non-resource project costs: SOFTWARE/HARDWARE/LICENSE/TRAVEL/OTHER), **Task** (per-project work items with TODO/IN_PROGRESS/BLOCKED/DONE status, **multi-assignee via `TaskAssignee` join table** plus a legacy single `assigneeId` mirror for backward compat, optional start/end dates), **TaskAssignee** (M:N join between Task and User, replaces the single-assignee model — backfilled from the legacy column), **TaskTimeLog** (clock-in entries by any assignee against a Task; cascades on task delete).

### Multi-assignee tasks

Endpoints in `routes/tasks.ts` accept `assigneeIds: string[]` (canonical) on `POST /api/projects/:id/tasks` and `PATCH /api/tasks/:taskId`. The legacy `assigneeId` is still honored for older clients. The PATCH semantics:
- `assigneeIds` omitted → existing assignees preserved.
- `assigneeIds: []` or `null` → unassign all.
- `assigneeIds` not an array of strings → 400 (`assigneeIds must be an array of userId strings`); never silently coerce to "unassign all".
Replacement runs in a Prisma transaction (deleteMany → createMany → task.update). Visibility/permission checks (`/tasks/mine`, time-log read/write, status changes by assignee) all OR the legacy `assigneeId` with the new join. Serializer returns both `assignees: [{userId,name}]` and the legacy `assigneeId/assigneeName` (first assignee) so existing screens (Gantt, etc.) keep rendering.

### Timesheet ↔ Task linkage

`Timesheet.taskId` is optional. `POST /api/timesheets` validates that the task belongs to the chosen project AND the caller is one of its assignees (legacy or join). The list serializer returns `taskId` + `taskTitle`, surfaced as a "Task" column on both My Timesheets and Team Timesheets and in their CSV exports. The Log Time dialog shows a Task select that filters `useListMyTasks()` by the chosen project (resets when project changes).

## Project lifecycle statuses

DRAFT (Sales intake, awaiting PMO assignment) → OBSERVATION (PM completed details) → ACTIVE (delivering) → PAUSE / COMPLETE → CLOSED.

### Draft intake flow (Sales → PMO → PM)

1. **Sales** opens `/projects/new` — sees a minimal 4-field intake form (Name + SPK + Client + Project Value / contractValue) and submits. Server forces `status=DRAFT`, `salesId=req.user.sub`, `pmId=null` regardless of body. The Sales-entered `contractValue` is later pre-filled into the PM's DraftCompletionCard Revenue input.
2. **PMO Director (MANAGEMENT)** sees the project on the dashboard under a purple "Pending PM Assignment" card. Clicking "Assign PM" opens a dialog with a PM dropdown that PATCHes `pmId`. The 409 invariant prevents reassigning if a PM is already set on a DRAFT project.
3. **PM (PROJECT_MANAGER)** sees the project on their dashboard under "New project(s) assigned to you". Clicking "Complete Details" opens `/projects/:id` where a purple `DraftCompletionCard` is rendered above the tabs (visible only when `status === DRAFT`). PM fills Description, Start/End dates, Revenue, Planned Mandays, Estimated Cost, then clicks "Save & Move to Observation" — server validates required fields and transitions status to OBSERVATION.

### Tasks tab (PM/MGMT assigns work, assignee logs hours)

Project detail page → "Tasks" tab (between Timeline and Financials). MGMT and the PM-of-project can create/edit/delete tasks; the assignee can change status and log hours. Logged hours roll up into the per-task `loggedHours` and surface on the **Consultant Dashboard** "My Tasks" card with a quick "Log" dialog. Endpoints in `artifacts/api-server/src/routes/tasks.ts`:

- `GET /api/projects/:id/tasks` — visibility same as `/projects/:id/resources` (MGMT/ADMIN_PROJECT all; PM own; Sales own; Konsultan/TW only if a resource on the project).
- `POST /api/projects/:id/tasks` — MGMT or PM-of-project; assignee must be a `ProjectResource` of that project.
- `GET /api/tasks/mine` — caller's own assigned tasks.
- `PATCH /api/tasks/:taskId` — MGMT/PM may change all fields; assignee may change `status` only.
- `DELETE /api/tasks/:taskId` — MGMT or PM-of-project.
- `GET /api/tasks/:taskId/time-logs` — MGMT/PM-of-project or the assignee.
- `POST /api/tasks/:taskId/time-logs` — assignee only; `hours` ∈ (0, 24]; recorded with optional `note` and `loggedAt`.

Audit actions: `task.created`, `task.updated`, `task.deleted`, `task.time_logged`. Frontend hooks: `useListProjectTasks`, `useCreateProjectTask`, `useUpdateTask`, `useDeleteTask`, `useListMyTasks`, `useListTaskTimeLogs`, `useLogTaskTime`. Components: `artifacts/web/src/pages/projects/TasksTab.tsx` and `MyTasksCard` inside `ConsultantDashboard.tsx`.

### Expenses tab (PM cost capture beyond resources)

PM and Management can open the **Expenses** tab on `/projects/:id` to log additional project costs (software, hardware, license, travel, other). New rows appear in a table with the running "Additional Cost" total and update the project's `additionalCost` / `actualCost` immediately (Financials tab reflects the new total). PM can only add/delete expenses on projects assigned to them; Management has no project-ownership restriction.

### PATCH /api/projects/:id authorization rules

Field-level + ownership guards in `artifacts/api-server/src/routes/projects.ts`:
- **SALES**: only their own projects (`salesId === userId`).
  - On `status === "DRAFT"` (intake): allowed fields = {`code`, `name`, `description`, `clientId`, `contractValue`}; everything else returns 403.
  - On any other status (Overview edits on in-flight projects): may change the same descriptive/financial fields PM can, but cannot reassign people (`salesId`/`pmId`), reassign the client (`clientId`), or change project `status` / `statusChangeReason`.
- **PROJECT_MANAGER**: only own assignments (`pmId === userId`); all fields except `salesId`/`pmId`/`clientId` (cannot reassign people or the client; the client is set during Sales intake).
- **MANAGEMENT**: full access. The PMO assignment invariant returns 409 if attempting to set `pmId` on a DRAFT project that already has one.

### Editable Overview tab

The Overview tab on `/projects/:id` is editable by MANAGEMENT, the assigned PM, or the project's Sales owner via an "Edit" button (hidden on DRAFT, where `DraftCompletionCard` handles intake). When essential fields are missing on a non-DRAFT project (Client, Start/End Date, Contract Value, Planned Mandays, Estimated Cost, Description), a yellow banner prompts the editor to fill them in. Save uses a two-step flow: inline edit → "Review & Save" opens a confirmation dialog showing the proposed values plus a warning listing any still-missing fields; "Confirm & Save" issues the PATCH. The Client field is only shown as a Select when the editor is MANAGEMENT; PMs and Sales see Client as read-only (and the backend's `PM_FORBIDDEN` and `SALES_ONGOING_FORBIDDEN` sets reject any direct attempt to change `clientId` on in-flight projects).

## Financials computation

Computed in `artifacts/api-server/src/lib/serializers.ts`:
- `resourceCost` = sum over APPROVED timesheets of `(hours / 8) * resource.dailyRate`
- `additionalCost` = sum of all `ProjectExpense.amount` rows for the project (software/hardware/license/travel/other purchased outside resource time)
- `actualCost` = `resourceCost + additionalCost`
- `actualProfit` = `contractValue - actualCost`
- `marginPct` = `actualProfit / contractValue * 100`
- Forecast: linear projection of cost based on burn rate

### Additional project expenses (Expenses tab)

PMs and Management can record non-resource costs on `/projects/:id` → "Expenses" tab. Endpoints in `artifacts/api-server/src/routes/expenses.ts`:
- `GET /api/projects/:id/expenses` — open to any authenticated user (mirrors GET /projects/:id visibility).
- `POST /api/projects/:id/expenses` — `requireRole(MANAGEMENT, PROJECT_MANAGER)`; PM additionally restricted to projects where `pmId === userId`.
- `DELETE /api/expenses/:expenseId` — same restrictions as POST.

Allowed categories: `SOFTWARE`, `HARDWARE`, `LICENSE`, `TRAVEL`, `OTHER`. Each create/delete is recorded in the audit log (`expense.created` / `expense.deleted`). The Expenses tab on the project detail page is gated to MANAGEMENT and PROJECT_MANAGER roles. Frontend hooks: `useListProjectExpenses`, `useAddProjectExpense`, `useRemoveProjectExpense` from `@workspace/api-client-react`.

**Express router gotcha:** Avoid `router.use(requireRole(...))` at the top of a sub-router that is mounted via `router.use(subRouter)` (no path prefix). Express runs the sub-router's middleware for *every* incoming request before path matching, so a router-level `requireRole` will reject requests destined for *other* sibling routers (e.g. previously biRouter's router-level `requireRole("MANAGEMENT")` blocked PM requests to `/projects/:id/expenses`). Apply `requireAuth` / `requireRole` per-route instead, or mount the router under a path prefix (`router.use("/bi", biRouter)`).

`/api/projects/:id/financials` aggregates approved timesheets per month and pairs with contract value spread evenly across active months for chart rendering.

## Hierarchy & Principal roles

Three Principal roles supervise delivery teams: **PRINCIPAL_KONSULTAN**, **PRINCIPAL_TECHNICAL_WRITER**, **PRINCIPAL_ADMIN_PROJECT**. Project Managers report to MANAGEMENT (PMO Director). On `User`, `managerId` references the PM's manager (PMO) and `principalId` references the delivery user's Principal supervisor. Mapping in `artifacts/web/src/lib/roles.ts` (`PRINCIPAL_TO_REPORT_ROLE`):

- PRINCIPAL_KONSULTAN → KONSULTAN
- PRINCIPAL_TECHNICAL_WRITER → TECHNICAL_WRITER
- PRINCIPAL_ADMIN_PROJECT → ADMIN_PROJECT

### Resource propose workflow (Principal → PM)

Principals can propose a supervisee onto an OBSERVATION/ACTIVE project that lacks an assigned resource of the role they supervise. The PM has final say. Endpoints in `artifacts/api-server/src/routes/resources.ts` and `routes/principal.ts`:

- `POST /api/projects/:id/resources/propose` — Principal-only; the proposed `userId` must be a direct supervisee (`User.principalId === req.user.sub`); creates a `ProjectResource` with `proposedById`/`proposedAt` set and `acceptedAt` null. Konsultan max-2-active enforcement still applies.
- `POST /api/resources/:resourceId/accept` — MGMT or the project's PM; sets `acceptedAt`.
- `DELETE /api/resources/:resourceId` — MGMT, project's PM, or the supervising Principal of the row's user.
- `GET /api/principal/projects-needing-resource` — Principal-only; returns OBSERVATION/ACTIVE projects with no `ProjectResource` of the supervised role.
- `GET /api/users/under-supervision` — Principal-only; returns the caller's direct reports.

Audit actions: `resource.proposed`, `resource.accepted`. Frontend hooks: `useProposeProjectResource`, `useAcceptProjectResource`, `useListProjectsNeedingResource`, `useListUsersUnderSupervision`. Page: `artifacts/web/src/pages/dashboard/PrincipalDashboard.tsx`.

### Principal visibility constraints

Principals never see commercial figures: `canViewProjectFinancials()` returns false for any role starting with `PRINCIPAL_`, hiding the Financials tab and all contractValue/margin/cost columns. The Estimated Cost field on Overview likewise sits inside the financials gate.

### PM Allocation card

`ManagementDashboard` renders a `<PMAllocationCard />` showing every active PROJECT_MANAGER with their in-flight (ACTIVE+OBSERVATION), active, observation, draft project counts and total in-flight contract value. Color-coded by load (>=6 destructive, >=4 amber).

### Principal seed credentials (password: `password123`, @itsecasia.com)

- `principal.kon.h7q4@itsecasia.com` — Bayu Prasetyo (PRINCIPAL_KONSULTAN)
- `principal.tw.m9k2@itsecasia.com` — Indah Kusumawardani (PRINCIPAL_TECHNICAL_WRITER)
- `principal.ap.r3n8@itsecasia.com` — Fajar Nugroho (PRINCIPAL_ADMIN_PROJECT)

## Resources tab — fleksibel role

Resources tab pada `/projects/:id` punya empat section:
1. **Admin Project** (single-pick on `Project.adminProjectId`)
2. **Konsultan Team** (multi-pick `ProjectResource` dengan `userRole === KONSULTAN`; cap 2-projek lama sudah dihapus)
3. **Technical Writer Team** (multi-pick `ProjectResource` dengan `userRole === TECHNICAL_WRITER`)
4. **Resource Lainnya** — fleksibel: MGMT/PM bisa tambahkan user manapun (Sales, MANAGEMENT, SOC role kustom, dll) sebagai `ProjectResource` dengan free-text `roleInProject` (contoh: "SOC Manager", "Security Engineer", "Junior Security Engineer", "Sales Support"). Tabel ini menampilkan semua resource yang `userRole` bukan KONSULTAN/TECHNICAL_WRITER. Backed by endpoint baru `GET /api/users/active-all` (MGMT + PM only) — return semua user aktif tanpa filter role. Dialog memaksa `roleInProject` non-empty saat mode `OTHER`.

## Role-based access

Enforced server-side via `requireRole` middleware in `artifacts/api-server/src/middlewares/auth.ts`:
- Management: full access
- Project Manager: write projects/resources, approve timesheets for projects where they are PM
- Sales: write clients/projects
- Konsultan / Technical Writer: log own timesheets only
- Admin Project: upload documents and invoices

Server-side data scoping:
- `GET /api/projects` filters by role: PM → own (`pmId`), Sales → own (`salesId`), Konsultan/TW → assigned or has timesheet, Management/Admin → all.
- `GET /api/dashboard/resource-utilization-detail` restricted to Management + PM, with PM seeing only resources working on own projects.

## Role-based dashboards

`artifacts/web/src/pages/dashboard/index.tsx` routes per role to a dedicated dashboard:
- MANAGEMENT → `ManagementDashboard` (executive KPIs, profit trend, status breakdown, aging buckets, at-risk-projects alert)
- PROJECT_MANAGER → `PMDashboard` (PM-scoped active projects, approval inbox quick action with Approve All, my-team utilization, revenue-vs-profit chart, overdue-approval alert)
- SALES → `SalesDashboard` (own pipeline, revenue-by-client, status pie, 6-month profitability trend)
- KONSULTAN / TECHNICAL_WRITER → `ConsultantDashboard` (welcome banner, prominent "Log Today's Time Sheet" CTA with today's hours, 14-day trend, recent submissions)
- ADMIN_PROJECT → `AdminProjectDashboard` (closing-doc inbox + alert for projects complete >3 days)
- SITE_ADMIN → `SiteAdminDashboard` (Users + Audit Log management, recent activity feed). User administration and the audit log were moved off the PMO Director sidebar and are now exclusive to SITE_ADMIN.

Shared `WelcomeBanner` (`artifacts/web/src/components/dashboard/WelcomeBanner.tsx`) shows a time-aware greeting + role label.

## Pages

`/login`, `/` (dashboard), `/projects`, `/projects/new`, `/projects/:id`, `/timesheets`, `/clients`, `/users` (Management only), `/settings`.

## Seed credentials (password: `password123`)

- `management@secureprofit.id` — Adi Wibowo (MANAGEMENT)
- `pm@secureprofit.id` — Sari Pratiwi (PROJECT_MANAGER)
- `sales@secureprofit.id` — Budi Santoso (SALES)
- `konsultan@secureprofit.id` — Rian Hidayat (KONSULTAN)
- `konsultan2@secureprofit.id` — Dewi Lestari (KONSULTAN)
- `writer@secureprofit.id` — Ayu Wulandari (TECHNICAL_WRITER)
- `admin@secureprofit.id` — Tono Setiawan (ADMIN_PROJECT)
- `siteadmin@secureprofit.id` — Rina Kartika (SITE_ADMIN)

Seed file: `lib/db/src/seed.ts`. Re-run with `pnpm --filter @workspace/db run seed`.

## Common tasks

- Regenerate Prisma: `pnpm --filter @workspace/db exec prisma generate`
- Push schema: `pnpm --filter @workspace/db exec prisma db push`
- Regenerate API client/zod: `pnpm --filter @workspace/api-spec run codegen` (post-step `lib/api-spec/scripts/fix-zod-barrel.mjs` rewrites `lib/api-zod/src/index.ts` to only re-export `./generated/api`, avoiding the orval-generated barrel ambiguity between zod schemas in `api.ts` and TS interfaces in `generated/types/`)
- Reseed DB: `pnpm --filter @workspace/db run seed`

## Conventions

- All currency formatted as IDR via `formatIDR()` in `artifacts/web/src/lib/format.ts`
- Frontend imports hooks from `@workspace/api-client-react` (not subpaths)
- API server uses ESM with `.js` import extensions in TypeScript source
- No emojis in UI
- Frontend route splitting: `App.tsx` lazy-loads every page except `/login` and `/` (Dashboard) via `React.lazy()` + a single `<Suspense>` boundary, and the global QueryClient sets `staleTime: 30_000` + `gcTime: 5min` to cut redundant refetches on tab/back-nav.
