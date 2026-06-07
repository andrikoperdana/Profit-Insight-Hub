# SecureProfit Hub

Full-stack web app for an Indonesian IT security consulting firm. Tracks projects from intake to delivery, monitoring profit margins as consultants log billable mandays.

> This README is a high-level map, not an exhaustive spec — detailed behavior lives in the code. Keep it concise.

## Stack

- **Monorepo**: pnpm workspace (`lib/` shared, `artifacts/` runnable apps)
- **Frontend** (`artifacts/web`): React + Vite + TS + Tailwind v4 + shadcn/ui + Recharts, wouter routing, dark cyber-green theme
- **Backend** (`artifacts/api-server`): Node + Express + Pino, JWT auth (HS256), bcryptjs
- **DB** (`lib/db`): PostgreSQL via Prisma. Schema in `lib/db/prisma/schema.prisma`; client generated to `lib/db/src/generated/client/`
- **API contract** (`lib/api-spec`): OpenAPI 3 → React Query hooks (`lib/api-client-react`) + zod schemas (`lib/api-zod`)
- **Auth**: `POST /api/auth/login` → `{ token, user }`. Token in `localStorage["auth_token"]`; `lib/api-client-react/src/custom-fetch.ts` attaches `Authorization: Bearer` and redirects to `/login` on 401

## Roles

Management (PMO Director), Project Manager, Sales, Konsultan, Technical Writer, Admin Project, Principal supervisors (KONSULTAN/TECHNICAL_WRITER/ADMIN_PROJECT), Finance, HR, Site Admin.

## Domain (Prisma)

- **User** — `seniority` JUNIOR/MID/SENIOR/PRINCIPAL, `businessUnitId`, `managerId` (PM→PMO), `principalId` (delivery user→Principal)
- **BusinessUnit**, **Skill** + **UserSkill** join — seeded BUs: Pentest, GRC, Threat Hunting; 11 skills
- **Client**, **Project**, **Activity** (audit), **Document** (BAST/INVOICE/CONTRACT/REPORT/OTHER, base64)
- **ProjectResource** — staffing with planned mandays + daily rate
- **Timesheet** — DRAFT→SUBMITTED→APPROVED/REJECTED, optional `taskId`
- **ProjectExpense** — non-resource costs (SOFTWARE/HARDWARE/LICENSE/TRAVEL/OTHER), PENDING/APPROVED/REJECTED
- **BillingMilestone** — Terms-of-Payment per project, status PLANNED/INVOICED/PAID/CANCELLED
- **Task** + **TaskAssignee** (M:N) + **TaskDependency** + **TaskTimeLog** — WBS via `parentTaskId`, `billable` flag, finish-to-start deps
- **ProjectRaidItem**, **PerformanceReview** (+ `PerformanceReviewProjectRating`), **UserLeave**, **TaskTemplate**

## Project lifecycle

`DRAFT (Sales intake) → OBSERVATION (PM completed) → ACTIVE → PAUSE / COMPLETE → CLOSED`.

**ACTIVE transition gate** (`routes/projects.ts` PATCH, mirrors the CLOSED gate; all roles incl. MGMT): any non-ACTIVE→ACTIVE move requires, validated against effective state (incoming body overrides stored) — core Overview fields (client, description, start/end date, contractValue>0, plannedMandays>0, estimatedCost>0), assigned `pmId`, ≥1 `ProjectResource`, ≥1 `Task`, ≥1 `ProjectRaidItem`, and `BillingMilestone` percentages summing to 100%. Fails 400 `ACTIVATION_REQUIREMENTS_INCOMPLETE` with a `missing[]` list.

**COMPLETE transition gate** (same handler; all roles): any non-COMPLETE→COMPLETE move requires all tasks DONE, no `Timesheet` in SUBMITTED, no `ProjectExpense` in PENDING, no `BillingMilestone` still PLANNED, no `ProjectRaidItem` still OPEN, and ≥1 latest BAST `Document`. `statusChangeReason` already enforced earlier. Fails 400 `COMPLETION_REQUIREMENTS_INCOMPLETE` with a `missing[]` list.

Intake: Sales fills the form at `/projects/new` (server forces `status=DRAFT`, `salesId`, `pmId=null`). Form includes a **required Resource Requirements** section: budget-only rows (role, headcount, mandays/person, daily rate — no person picker; no `ProjectResource` created) that compute total mandays + initial estimated cost/profit, sent as `estimatedCost`/`plannedMandays` on both create paths (manual `POST /api/projects` and `POST /api/leads/:id/convert`). Server enforces `plannedMandays > 0` for Sales create and for lead convert so the initial cost can't be bypassed. PM later assigns real people in the Resources tab. MGMT assigns PM (409 if already set). PM uses `DraftCompletionCard` to fill/adjust description/dates/revenue/mandays/cost → OBSERVATION.

`PATCH /api/projects/:id` (`routes/projects.ts`):
- **SALES** (own only): on DRAFT may edit `{code,name,description,clientId,contractValue}`; on other statuses same fields, no people/client/status changes.
- **PROJECT_MANAGER** (own only): all fields except `salesId`/`pmId`/`clientId`.
- **MANAGEMENT**: full. Setting `pmId` on a DRAFT that already has one → 409.

## Project tabs (`/projects/:id`)

Editable by MGMT/assigned-PM/Sales-owner unless noted. Each tab has its own route file under `routes/`.

- **Overview** — inline edit → "Review & Save" dialog → PATCH. Hidden on DRAFT; yellow banner when essential fields missing. Client field is a Select only for MGMT.
- **Timeline** — drag-and-drop Gantt (`TaskGanttChart`/`GanttBar`): body drags, edge handles resize, PATCH on pointer-up. `DependencyArrows` SVG elbow paths. Server doesn't enforce dep timing — toast warns.
- **Tasks** (`routes/tasks.ts`) — MGMT/PM create/edit/delete; assignees only change `status` + log hours. Multi-assignee `assigneeIds[]` (omit=preserve, `[]`/null=clear, non-array=400). WBS `parentTaskId` + `dependencyTaskIds[]` both BFS cycle-checked; pickers exclude self+descendants. `Task.billable` default true; non-billable hours don't roll into revenue/margin.
- **Resources** — 4 sections: Admin Project (single `Project.adminProjectId`), Konsultan team & Technical Writer team (`ProjectResource` by role), Other Resources (free-text `roleInProject`, via `GET /api/users/active-all`, MGMT+PM only).
- **RAID** (`routes/raid.ts`) — `ProjectRaidItem` (type/impact/likelihood/status/owner/mitigation/dueDate). Read = delivery team only (MGMT, PM, KONSULTAN, PRINCIPAL_* via `canViewRaid()`, mirrored FE/server), further scoped per-project; write = MGMT/assigned-PM. CLOSED auto-stamps `closedAt`.
- **Expenses** (`routes/expenses.ts`) — submitters: MGMT, assigned-PM, Sales-owner, staffed KONSULTAN/TW/ADMIN_PROJECT, and PRINCIPAL_* when themselves or a direct supervisee is staffed. MGMT auto-APPROVED, others PENDING. Approve/reject = PM-of-project + MGMT. **Only APPROVED count toward `actualCost`/margin.** List scope: MGMT/SITE_ADMIN/FINANCE + PM-of-project see all rows; everyone else sees only own. Receipt PDF `GET /api/expenses/:id/receipt` (not in OpenAPI; bearer+blob) merges a stamped receipt page + evidence via `pdf-lib`; access = creator/MGMT/PM-of-project. `GET /api/expenses/mine` backs the "My Expenses" cards.
- **Timesheets** (`routes/timesheets.ts`) — all entries on the project, filterable + KPI cards. PM-of-project & MGMT Approve/Reject/Delete + "Approve All Submitted". Backed by `GET /api/timesheets?projectId=...`. Mutations invalidate timesheets/project/financials keys.
- **Billing** — `BillingMilestone` with %, DPP, VAT, Total, due date, status, invoice #. INVOICED→stamp `invoicedAt`, PAID→`paidAt`. DPP/VAT via `splitVat()` honoring `Project.contractValueIncludesVat`. Banner when total % ≠ 100. Write = MGMT/assigned-PM.

## Financials (`routes/.../serializers.ts`)

- `resourceCost` = Σ APPROVED timesheets `(hours/8) × resource.dailyRate`
- `additionalCost` = Σ APPROVED `ProjectExpense.amount`
- `actualCost = resourceCost + additionalCost`; `actualProfit = contractValue − actualCost`; `marginPct = actualProfit / contractValue × 100`
- Forecast: linear projection from burn rate. `/api/projects/:id/financials` aggregates approved timesheets per month vs contract value spread across active months.
- **Forecast single source of truth**: `computeBurnRateForecast()` + `computeProfitOutlook()` (serializers.ts). `/financials`, `/whatif` base, and `serializeProject.profitOutlook` all derive forecastCost/forecastProfit from these — never recompute inline. When `actualMandays === 0` the forecast falls back to the intake estimate (avoids reporting ~100% profit before any cost accrues).
- **Profit Outlook** (`computeProfitOutlook`): plain-language "will this profit?" view comparing Initial Estimate → Actual (so far) → Projected (final), each with profit/loss IDR + margin %. Status `EARLY` (work logged but progress < `EARLY_PROGRESS_PCT` 20% → "Too Early to Tell", since the burn-rate sample is too small to extrapolate; takes precedence) / `PROFIT` / `THIN` (forecast margin < `THIN_MARGIN_PCT` 10%) / `LOSS_RISK` (forecast profit < 0). Also returns `progressPct` (= `burnRatePct`, mandays burn) so the FE shows "Projection based on current spending rate · X% of work done". Returned as `profitOutlook` on Project (null for `FINANCIALS_BLOCKED_ROLES`) and ProjectFinancials. FE: `ProfitOutlookPanel` (full, top of FinancialsTab) + `ProfitOutlookCompact` (OverviewTab). Note: MARGIN/Health read actuals-so-far while Profit Outlook projects to completion, so a young project can legitimately show high margin + projected loss simultaneously — this is by design, not a bug.
- **Project Health** (`computeHealthScore`, 0-100, HEALTHY/AT_RISK/CRITICAL; margin30/raid20/expenses15/billing20/schedule15) surfaced via `HealthBadge` (pass `showLabel` for friendly "At Risk · 72/100" form). Both Health + Outlook gated by `canViewProjectFinancials`.

## Hierarchy & Principal

3 Principal roles supervise delivery teams; PMs report to MGMT. Mapping `PRINCIPAL_TO_REPORT_ROLE` in `lib/roles.ts` (KONSULTAN / TECHNICAL_WRITER / ADMIN_PROJECT).

- **Propose workflow** (`routes/resources.ts`, `routes/principal.ts`): Principal proposes a direct supervisee onto OBSERVATION/ACTIVE projects (`POST /api/projects/:id/resources/propose`, sets `proposedById`, `acceptedAt=null`); PM/MGMT accept (`POST /api/resources/:id/accept`). `GET /api/principal/projects-needing-resource` + `/api/users/under-supervision` are Principal-only.
- **Visibility**: `canViewProjectFinancials()` is false for any `PRINCIPAL_*` — hides Financials/Billing tabs and all contractValue/margin/cost columns.

## Feature pages (key behaviors)

- **VAT recap** (`/vat-recap`, MGMT) — `GET /api/billing-milestones/vat-recap?year=YYYY` aggregates INVOICED/PAID into a 12-month + annual breakdown.
- **Resource Planning** (`/resource-planning`, PM/MGMT/HR + Principal_*) — `GET /api/resource-planning?startDate&weeks=N`, BU-grouped weekly mandays cells. Principals scoped to supervisees (`principalId === self`); TtlCache key namespaced per-principal so scoped vs full-workforce payloads never cross-contaminate.
- **Bench Report** (`/bench`, PM/MGMT/HR + Principal_*) — uses `GET /api/dashboard/resource-utilization-detail`, which already scopes Principals to supervisees.
- **Skill matrix** (`/skill-matrix`, PM/MGMT/HR) — `GET /api/skill-matrix` → `{users, skills, cells, gaps}`. Gap = no holders / only 1 / no Senior+Principal.
- **Reports** (`/reports`, MGMT+PM) — generic engine: `ReportDefinition`s in `reports/definitions.ts`; catalog `pages/reports/index.tsx` + runner `[id].tsx`. Endpoints `GET /api/reports`, `/options`, `/:id`, `/:id/export?format=csv|xlsx|pdf` (export not in OpenAPI; bearer+blob; cells sanitized vs formula injection). PM-scoped reports filter `pmId === sub` and intersect supplied `projectId` with owned set. 10 reports shipped.
- **Invoice Planning** (`/invoice-planning`, MGMT/FINANCE + PM/ADMIN_PROJECT/SALES own-scope) — `GET /api/invoice-planning?mode=week|month&periods=N`, BillingMilestones bucketed by dueDate into project×period cells, grouped by PM's BU. UI rolls up per-BU totals per period (collapsible drill-down to projects) + grand total.
- **Client Progress Portal** (`/portal/:token`, public no-login) — read-only single-project view for a client: progress % (avg of top-level task progressPercent; fallback status), friendly status, timeline/milestones, billing/payment status. NO documents; NO financials (cost/margin/rates server-enforced via hand-written whitelist in `routes/client-portal.ts`, never projectInclude). Public `GET /api/public/client-portal/:token` (mounted before blanket-auth; rate-limited; noindex; **identical 404** for unknown/malformed/disabled/expired/DRAFT/deleted — no token-existence oracle). MGMT/owner-PM manage via `GET/PUT /api/projects/:id/client-share` (enable/disable, regenerate token, expiry date); share UI is `ClientShareDialog` in the project header. Site gate bypassed for `/api/public/*` (server) and `/portal/`,`/survey/` (web `SiteGate`).
- **Work Hours Compliance** (`/work-hours`, HR/MGMT/Principal_*) — required roles (`WORK_HOURS_REQUIRED_ROLES` in `lib/roles.ts`, mirrored FE/server: PM, KONSULTAN, TECHNICAL_WRITER, all 3 PRINCIPAL_*) must log 40h/week (8h × Mon-Fri business days). Recorded `UserLeave` lowers the target by 8h per distinct leave business day (`computeWorkHoursSummary` in `lib/work-hours.ts` — leave days are a **union of dates** so overlapping leave rows never double-reduce). `loggedHours` = non-REJECTED timesheet hours; `pendingHours` = SUBMITTED (shown separately). Status MET/ON_TRACK/BEHIND/AT_RISK vs `expectedToDateHours` (business days elapsed). Endpoints: `GET /api/work-hours/me` (own summary, week/month/year) + `GET /api/work-hours/team` (per-handler `canViewWorkHoursTeam` 403 gate — no top-of-router `requireRole`; scoped HR=all required staff / MGMT=PMs / Principal=`principalId === self`) + `GET /api/work-hours/team/export?format=csv|xlsx` (download; not in OpenAPI; bearer+blob; reuses the same `buildTeamReport` scope so each role exports only its permitted rows; CSV/XLSX cells formula-injection sanitized; export buttons in the page header). Self-view `WorkHoursCard` (returns null for exempt roles) embeds on PM/Principal/Consultant dashboards and reuses `LeaveDialog`. Exempt: Admin Project, Sales, Finance, HR, MGMT, Site Admin (card hidden).
- **Performance Reviews** (`/performance-reviews`, MGMT/PM/Principal_* only) — top-level `router.use` gate (`PERFORMANCE_REVIEW_ROLES`); all other roles 403. MGMT reviews PMs only; PM reviews users on own projects; Principal reviews direct supervisees. `allowedSubjectIds()`/`canReviewSubject()` enforce scope. `PerformanceReview` DRAFT→SUBMITTED→ACKNOWLEDGED; `GET /:id` returns review + projectRatings + computed metrics.
- **Phase-2**: bulk weekly timesheet entry (`POST /api/timesheets/bulk`, max 50); leave/availability (`UserLeave`, overlaid on Resource Planning); task templates (`TaskTemplate` WBS-as-JSON, `POST /api/projects/:id/task-templates/apply`).

CRUD: `GET/POST/PATCH/DELETE /api/skills`, `/api/business-units`.

## Role-based access

Server `requireRole` (`middlewares/auth.ts`):
- **Management**: full
- **PM**: write own projects/resources, approve own-project timesheets
- **Sales**: write clients/projects
- **Konsultan/TW**: log own timesheets only
- **Admin Project**: documents/invoices

**Time tracking menu visibility** (`Sidebar.tsx`): the "Time Tracking" (`/timesheets`) link is hidden for Site Admin, Finance, HR, **and now Management + Sales** — these roles don't log their own hours. Sales also loses the "My Timesheet" personal view (kept My Tasks/My Expenses). Routes stay reachable (no `allowRoles` change) so PM/MGMT team-oversight isn't broken; this is a UI-menu change only.
- **Finance**: read-only all Projects/Clients/Reports(+exports)/VAT Recap + MGMT-style dashboard; may upload/delete INVOICE+CONTRACT docs only. No timesheet/billing/expense writes.
- **HR**: people-ops only — HR Dashboard, Employees (`/users` read + edit non-sensitive fields only, no create/delete), Org Chart, Leaves (view), Skill Matrix (read), Skills/BU CRUD, Bench, Capacity (read), Resource Planning (read). Hard-denied Projects, Timesheets, and financial dashboard endpoints (`canViewProjectFinancials` includes HR in `FINANCIALS_BLOCKED_ROLES`); retains `/dashboard/utilization-trend` + `/dashboard/resource-utilization-detail`.

Data scoping: `GET /api/projects` filters by role (PM `pmId`, Sales `salesId`, Konsultan/TW assigned-or-has-timesheet, MGMT/Admin all). `GET /api/dashboard/resource-utilization-detail` MGMT+PM (PM sees own-project resources).

## Dashboards (`pages/dashboard/index.tsx`)

Per-role: MANAGEMENT (executive KPIs, profit trend, aging, at-risk, `PMAllocationCard`); PROJECT_MANAGER (active projects, approval inbox, utilization, revenue-vs-profit, alerts); SALES (pipeline, revenue-by-client, profitability trend); KONSULTAN/TW (log-time CTA, trend, `MyTasksCard`); ADMIN_PROJECT (closing-doc inbox); SITE_ADMIN (users + audit log + activity feed); HR (`HRDashboard.tsx` — headcount, BU/role distribution, leaves, bench, skill gaps). Shared `WelcomeBanner`.

## Pages

`/login`, `/` (dashboard), `/projects`, `/projects/new`, `/projects/:id`, `/timesheets`, `/clients`, `/users` (SITE_ADMIN + HR), `/skills` (SITE_ADMIN + HR), `/business-units` (SITE_ADMIN + HR), `/resource-planning` (PM/MGMT/HR/Principal_*), `/skill-matrix` (PM/MGMT/HR), `/bench` (PM/MGMT/HR/Principal_*), `/capacity` (PM/MGMT/HR), `/task-templates` (PM/MGMT), `/leaves` (HR/MGMT/PM read-only), `/org-chart` (HR/MGMT/SITE_ADMIN), `/reports` (MGMT/PM), `/invoice-planning` (MGMT/FINANCE/PM/ADMIN_PROJECT/SALES), `/vat-recap` (MGMT), `/performance-reviews` (MGMT/PM/Principal_*), `/work-hours` (HR/MGMT/Principal_*), `/settings`, `/my-tasks` `/my-timesheets` `/my-expenses`. Principals on Resource Planning/Bench are scoped to their supervisees.

## Gotchas (do not regress)

- **Express sub-router middleware**: never `router.use(requireRole(...))` at the top of a sub-router mounted via `router.use(subRouter)` (no path prefix) — Express runs it for every request before path matching, rejecting siblings. Apply per-route or mount under a prefix.
- **Timesheet `?scope=all`** (`routes/timesheets.ts`) is **default-deny**: only MANAGEMENT sees all, PM sees own+own-project, everyone else forced to `userId === self`. Allowlist new roles; never extend a denylist.
- **`MY_VIEW_ROLES`** (App.tsx) is the single source of truth for the "My …" pages — same list used by Sidebar's `canSeeMyViews`. Add a role there once to expose all three.
- **Scoped endpoint caches**: any TtlCache key must encode caller scope (see Resource Planning) or one role will serve another role's payload.

## Conventions

- Currency via `formatIDR()` (`pages/lib/format.ts`)
- Frontend imports hooks from `@workspace/api-client-react` (no subpaths)
- API server uses ESM with `.js` import extensions in TS source
- No emojis in UI
- App.tsx lazy-loads every page except `/login` and `/` (`React.lazy()` + single `<Suspense>`). Global QueryClient: `staleTime: 30_000`, `gcTime: 5min`

## User preferences

- **All user-facing strings in the app must be English**, including toast titles/descriptions, dialog copy, table headers, button labels, placeholders, and server-side error `reason` messages that surface in the UI. The user chats in Bahasa Indonesia, but the product UI is English-only.

## Common tasks

- Regenerate Prisma: `pnpm --filter @workspace/db exec prisma generate`
- Push schema: `pnpm --filter @workspace/db exec prisma db push`
- Regenerate API client/zod: `pnpm --filter @workspace/api-spec run codegen` (post-step `fix-zod-barrel.mjs` rewrites `lib/api-zod/src/index.ts` to only re-export `./generated/api`)
- Reseed DB: `pnpm --filter @workspace/db run seed`
- Add sample report data: `pnpm --filter @workspace/db exec tsx src/sample-report-data.ts` (idempotent)

Seed (`lib/db/src/seed.ts`): idempotent helpers `ensurePrincipals`, `ensureBusinessUnitsAndSkills`, `ensureSampleReportData` run every invocation. Sample data (2nd PM, billing milestones across aging buckets, mixed-status expenses, recent timesheets) is tagged `[sample]` for safe re-runs.

**Sample timesheet hours cap** (`lib/db/src/cap-daily-hours.ts`): three generators (base seed, `sample-report-data.ts`, `sample-demo-enrichment.ts`) can each log the same user on overlapping days/projects, which previously stacked into impossible totals (300h+/week) that broke Work Hours Compliance. `capUserDailyHours()` runs as the final step of both `seed.ts` and `sample-demo-enrichment.ts` and scales any (user, UTC day) over 8h down to exactly 8h via an exact largest-remainder half-hour allocator (`allocateDailyHours`). It is `syntheticOnly` by default — it only reduces generator-tagged rows (U+200B marker or `[sample]`) and reserves real human-entered hours in the day budget, so re-running against a DB with real data never mutates real timesheets. `sample-demo-enrichment.ts` additionally plans timesheets per-user-per-week (UTC-Monday key) capped to 40h/week and distributed across Mon-Fri ≤8h/day, headroom-aware against existing rows.

## Seed credentials (password: `password123`)

- Main (`@secureprofit.id`): `management@` (Adi Wibowo), `pm@` (Sari Pratiwi), `pm2@` (Yusuf Maulana — from sample data), `sales@` (Budi Santoso), `konsultan@` (Rian Hidayat), `konsultan2@` (Dewi Lestari), `writer@` (Ayu Wulandari), `admin@` (Tono Setiawan), `finance@` (Maya Anggraini), `siteadmin@` (Rina Kartika).
- Principals + HR (`@itsecasia.com`): `principal.kon.h7q4@` (Bayu Prasetyo), `principal.tw.m9k2@` (Indah Kusumawardani), `principal.ap.r3n8@` (Fajar Nugroho), `hr@` (Sinta Permata).
