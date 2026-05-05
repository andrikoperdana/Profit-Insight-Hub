# SecureProfit Hub

Full-stack web application for an Indonesian IT security consulting firm. Tracks consulting projects from observation through delivery, monitoring profit margins in real time as consultants log billable mandays. Six roles coordinate around the same projects: Management, Project Manager, Sales, Konsultan (security consultant), Technical Writer, and Admin Project.

## Architecture

- **Monorepo**: pnpm workspace with shared `lib/` packages and `artifacts/` for runnable apps
- **Frontend** (`artifacts/web`): React + Vite + TypeScript + Tailwind v4 + shadcn/ui + Recharts, wouter for routing, dark theme by default with cyber-green accent
- **Backend** (`artifacts/api-server`): Node + Express + Pino, JWT auth (HS256), bcryptjs hashing
- **Database** (`lib/db`): PostgreSQL via Prisma ORM (user-mandated). Schema in `lib/db/prisma/schema.prisma`. Generated client output to `lib/db/src/generated/client/` and re-exported from `lib/db/src/index.ts`
- **API contract** (`lib/api-spec`): Single OpenAPI 3 source at `openapi.yaml`, codegen produces React Query hooks in `lib/api-client-react` and zod validators in `lib/api-zod`
- **Auth flow**: `POST /api/auth/login` returns `{ token, user }`. Frontend stores token in `localStorage["auth_token"]`; `lib/api-client-react/src/custom-fetch.ts` automatically attaches `Authorization: Bearer` and redirects to `/login` on 401

## Domain entities (Prisma)

User, Client, Project, ProjectResource (per-project staffing with planned mandays + daily rate), Timesheet (DRAFT → SUBMITTED → APPROVED/REJECTED), Document (BAST/INVOICE/CONTRACT/REPORT/OTHER, base64 data URL in DB), Activity (audit trail), ProjectExpense (additional non-resource project costs: SOFTWARE/HARDWARE/LICENSE/TRAVEL/OTHER), **Task** (per-project work items with TODO/IN_PROGRESS/BLOCKED/DONE status, assignee, optional start/end dates), **TaskTimeLog** (clock-in entries by the assignee against a Task; cascades on task delete).

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
- **SALES**: only their own DRAFT projects (`salesId === userId && status === "DRAFT"`); allowed fields = {`code`, `name`, `description`, `clientId`, `contractValue`}; everything else returns 403.
- **PROJECT_MANAGER**: only own assignments (`pmId === userId`); all fields except `salesId`/`pmId` (cannot reassign).
- **MANAGEMENT**: full access. The PMO assignment invariant returns 409 if attempting to set `pmId` on a DRAFT project that already has one.

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
