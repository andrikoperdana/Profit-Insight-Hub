# SecureProfit Hub

Full-stack web app for an Indonesian IT security consulting firm. Tracks projects from intake to delivery, monitoring profit margins as consultants log billable mandays.

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
- **ProjectExpense** — non-resource costs (SOFTWARE/HARDWARE/LICENSE/TRAVEL/OTHER) with PENDING/APPROVED/REJECTED
- **BillingMilestone** — Terms-of-Payment per project, status PLANNED/INVOICED/PAID/CANCELLED
- **Task** + **TaskAssignee** (M:N) + **TaskDependency** + **TaskTimeLog** — WBS via `parentTaskId`, `billable` flag, finish-to-start deps

## Project lifecycle

`DRAFT (Sales intake) → OBSERVATION (PM completed) → ACTIVE → PAUSE / COMPLETE → CLOSED`.

Intake: Sales fills 4-field form at `/projects/new` (server forces `status=DRAFT`, `salesId`, `pmId=null`). MGMT assigns PM (409 if already set). PM sees `DraftCompletionCard` to fill description/dates/revenue/mandays/cost → transitions to OBSERVATION.

### `PATCH /api/projects/:id` rules (`routes/projects.ts`)

- **SALES** (own only): on DRAFT may edit `{code,name,description,clientId,contractValue}`; on other statuses same fields but no people/client/status changes.
- **PROJECT_MANAGER** (own only): all fields except `salesId`/`pmId`/`clientId`.
- **MANAGEMENT**: full access. Setting `pmId` on DRAFT that already has one → 409.

## Project tabs (`/projects/:id`)

- **Overview** (editable by MGMT/assigned PM/Sales owner; hidden on DRAFT). Yellow banner when essential fields missing. Inline edit → "Review & Save" dialog → PATCH. Client field is Select only for MGMT.
- **Timeline** — drag-and-drop Gantt (`TaskGanttChart` + `GanttBar`): bar body drags whole task, 8-px edge handles resize. PATCH on pointer-up via `useUpdateTask`. `DependencyArrows` SVG draws elbow paths between predecessor and dependent bars; recomputes on drag/resize/scroll. Server doesn't enforce dep timing — toast warns instead.
- **Tasks** — MGMT/PM-of-project create/edit/delete; assignees only change `status` and log hours. Endpoints in `routes/tasks.ts`. Multi-assignee via `assigneeIds[]` (canonical) — omitted = preserved, `[]`/null = clear, non-array = 400. WBS `parentTaskId` (manager-only, ancestor-BFS cycle check). Dependencies `dependencyTaskIds[]` (forward-BFS cycle check). Pickers exclude self+descendants. `Task.billable` defaults true; non-billable time logs don't roll into revenue/margin. `Timesheet.taskId` validates project + assignee. Audit: `task.{created,updated,deleted,time_logged}`.
- **Resources** — 4 sections: Admin Project (single-pick `Project.adminProjectId`), Konsultan team (`ProjectResource` role=KONSULTAN), Technical Writer team (role=TECHNICAL_WRITER), Other Resources (any active user with free-text `roleInProject`, backed by `GET /api/users/active-all` MGMT+PM only).
- **RAID** — `ProjectRaidItem` (type RISK/ASSUMPTION/ISSUE/DEPENDENCY, impact LOW–CRITICAL, likelihood LOW/MEDIUM/HIGH, status OPEN/MITIGATING/CLOSED, owner, mitigation, dueDate). Endpoints in `routes/raid.ts`: `GET/POST /api/projects/:id/raid`, `PATCH/DELETE /api/raid/:itemId`. Read = anyone with project visibility; write = MGMT or assigned PM. Status → CLOSED auto-stamps `closedAt`. UI tab `pages/projects/tabs/RaidTab.tsx` groups by type with 4 KPI cards.
- **Expenses** — `routes/expenses.ts`. Submitters: MGMT, assigned PM, Sales-owner, KONSULTAN/TW/ADMIN_PROJECT staffed as `ProjectResource`, and PRINCIPAL_* when directly involved (themselves staffed OR a direct supervisee — `principalId === self` — staffed on the project, including via `adminProjectId`/`technicalWriterId`). MGMT auto-APPROVED; everyone else PENDING. Approve/reject restricted to PM-of-project + MGMT. **Only APPROVED count toward `actualCost`/margin.** PMDashboard shows pending-expense alert. **List scope**: MGMT/SITE_ADMIN/FINANCE + PM-of-project see all rows on a project; everyone else (Sales, KONSULTAN, TW, ADMIN_PROJECT, PRINCIPAL_*) sees only `createdById === self`. **Receipt PDF**: `GET /api/expenses/:id/receipt` (not in OpenAPI; bearer + blob fetch) returns merged PDF for APPROVED/REJECTED expenses — page 1 receipt with project/expense detail + bordered APPROVED/REJECTED stamp (reviewer name + timestamp + reason), subsequent pages embed evidence (PDF pages copied via `pdf-lib`, PNG/JPEG full-page; WebP gets a placeholder page). Access: creator, MGMT, PM-of-project. `GET /api/expenses/mine` (taken=50, newest first) backs the "Pengajuan Expense Saya" card on Consultant + Principal dashboards with per-row Download Receipt button (also added inline on the project ExpensesTab row).
- **Timesheets** (PM/MGMT tab; `pages/projects/tabs/TimesheetsTab.tsx`) — all timesheet entries logged against the project, filterable by status/user/free-text search, with KPI cards (Total / Approved / Pending / Rejected hours). Backed by `GET /api/timesheets?projectId=...` (server already scopes by role). PM-of-project & MGMT can Approve / Reject (with reason) / Delete per row, plus "Approve All Submitted" for the current filtered view. CSV export uses `exportCsv("timesheets-<projectCode>", ...)`. Mutations invalidate timesheets, project, and project-financials query keys so resource cost & margin refresh immediately.
- **Billing** — `BillingMilestone` table with %, DPP, VAT (vatPercent%), Total, due date, status, invoice #. Status→INVOICED auto-stamps `invoicedAt`; →PAID auto-stamps `paidAt`. DPP/VAT split via `splitVat()` honoring `Project.contractValueIncludesVat`. Banner when total % ≠ 100. Writes restricted to MGMT/assigned PM. Component: `pages/projects/BillingTab.tsx`.

## VAT recap (`/vat-recap`, MGMT only)

`GET /api/billing-milestones/vat-recap?year=YYYY` aggregates INVOICED/PAID milestones across projects. Returns 12-month breakdown + annual totals (DPP, VAT, paidVat, outstandingVat). UI: monthly table + 4 stat cards + CSV export. Hook: `useGetVatRecap`.

## Financials (`routes/.../serializers.ts`)

- `resourceCost` = sum of APPROVED timesheets `(hours/8) × resource.dailyRate`
- `additionalCost` = sum of APPROVED `ProjectExpense.amount`
- `actualCost` = `resourceCost + additionalCost`
- `actualProfit` = `contractValue - actualCost`
- `marginPct` = `actualProfit / contractValue × 100`
- Forecast: linear projection from burn rate

`/api/projects/:id/financials` aggregates approved timesheets per month, pairs with contract value spread across active months.

## Hierarchy & Principal

3 Principal roles supervise delivery teams. PMs report to MGMT. Mapping in `pages/lib/roles.ts` (`PRINCIPAL_TO_REPORT_ROLE`):
- PRINCIPAL_KONSULTAN → KONSULTAN
- PRINCIPAL_TECHNICAL_WRITER → TECHNICAL_WRITER
- PRINCIPAL_ADMIN_PROJECT → ADMIN_PROJECT

**Propose workflow** (`routes/resources.ts`, `routes/principal.ts`): Principal proposes a direct supervisee onto OBSERVATION/ACTIVE projects via `POST /api/projects/:id/resources/propose` (sets `proposedById`, `acceptedAt=null`). PM/MGMT accept via `POST /api/resources/:id/accept`. DELETE allowed for MGMT/PM/supervising Principal. `GET /api/principal/projects-needing-resource` and `/api/users/under-supervision` are Principal-only.

**Visibility**: `canViewProjectFinancials()` returns false for any `PRINCIPAL_*` role — hides Financials/Billing tabs and all contractValue/margin/cost columns including Estimated Cost.

## Resource Planning (`/resource-planning`, PM+MGMT)

`GET /api/resource-planning?startDate=YYYY-MM-DD&weeks=N` returns BU-grouped rows with weekly mandays cells (sum `ProjectResource.plannedMandays` distributed across active project weeks). Cells color-coded: ≥6 destructive, ≥4 amber, >0 emerald. Per-cell tooltip lists project allocations.

## Reports (`/reports`, MGMT + PM)

Generic engine: each report is a `ReportDefinition` (id, scope, filters, columns, optional chart, query) registered in `artifacts/api-server/src/reports/definitions.ts`. Single catalog page (`pages/reports/index.tsx`) + dynamic runner (`pages/reports/[id].tsx`).

Endpoints (`routes/reports.ts`, MGMT+PM only):
- `GET /api/reports` — list reports for caller's role
- `GET /api/reports/options?source=...` — enum options (clients, business-units, pms, projects — PM-scoped)
- `GET /api/reports/:id?<filters>` — execute → `{columns, chart?, rows, totals?}`
- `GET /api/reports/:id/export?format=csv|xlsx|pdf&<filters>` — binary export (NOT in OpenAPI; frontend uses Bearer + blob save). CSV/XLSX cells sanitized against formula injection (`=`, `+`, `-`, `@` prefixes).

PM-scoped reports filter by `pmId === req.user.sub` and intersect any user-supplied `projectId` with the PM's owned set (cannot escape scope).

10 reports shipped: `profitability-per-project`, `margin-trend-by-bu`, `profitability-per-client`, `resource-utilization`, `project-burn-rate`, `pm-workload`, `billing-aging`, `cash-inflow-forecast`, `expense-report`, `ppn-detail` (VAT 11% per invoice).

Sidebar entry "Reports" + shortcut card on both ManagementDashboard and PMDashboard.

## Role-based access

Server-side `requireRole` (`middlewares/auth.ts`):
- **Management**: full
- **PM**: write own projects/resources, approve own-project timesheets
- **Sales**: write clients/projects
- **Konsultan/TW**: log own timesheets only
- **Admin Project**: documents/invoices
- **Finance**: read-only access to all Projects, Clients, Reports (+ exports), VAT Recap, plus MGMT-style dashboard; may upload/delete INVOICE and CONTRACT documents only. No timesheet, billing milestone, or expense write access.
- **HR**: people-ops only. Menu: HR Dashboard, Employees (`/users` read + edit non-sensitive fields `{title, dailyRate, seniority, businessUnitId, managerId, principalId, skillIds}` — NOT name/role/isActive/password on other users, no create/delete), Org Chart (`/org-chart`), Leave Management (`/leaves` view-only paged + CSV), Skill Matrix (read), Skills CRUD, Business Units CRUD, Bench Report, Capacity Planning (read), Resource Planning (read). Hard-denied from Projects (`GET /projects` returns `[]`, `userCanAccessProject` returns false), Timesheets (whole `/timesheets` router 403), and financial dashboard endpoints (`/dashboard/summary|profit-trend|status-breakdown|top-projects` gated on `canViewProjectFinancials` which now includes HR in `FINANCIALS_BLOCKED_ROLES`). HR retains access to `/dashboard/utilization-trend` and `/dashboard/resource-utilization-detail` for the HR Dashboard.

Data scoping: `GET /api/projects` filters by role (PM `pmId`, Sales `salesId`, Konsultan/TW assigned-or-has-timesheet, MGMT/Admin all). `GET /api/dashboard/resource-utilization-detail` MGMT+PM only (PM sees own-project resources).

**Express gotcha**: never `router.use(requireRole(...))` at top of a sub-router mounted via `router.use(subRouter)` (no path prefix) — Express runs sub-router middleware for every request before path matching, rejecting siblings. Apply per-route or mount under a path prefix.

## Dashboards (`pages/dashboard/index.tsx`)

- **MANAGEMENT** → executive KPIs, profit trend, status breakdown, aging buckets, at-risk alert, `<PMAllocationCard />` (per-PM in-flight/active/observation/draft + total contract, color-coded)
- **PROJECT_MANAGER** → PM-scoped active projects, approval inbox + Approve All, team utilization, revenue-vs-profit chart, overdue + pending-expense alerts
- **SALES** → pipeline, revenue-by-client, status pie, 6-month profitability trend
- **KONSULTAN/TECHNICAL_WRITER** → welcome banner, "Log Today's Time Sheet" CTA, 14-day trend, recent submissions, MyTasksCard
- **ADMIN_PROJECT** → closing-doc inbox + alert for projects complete >3 days
- **SITE_ADMIN** → Users + Audit Log management, recent activity feed (exclusive to SITE_ADMIN)
- **HR** → headcount KPIs, headcount per BU, role distribution, utilization trend, leaves today/upcoming, bench summary, skill gaps, new joiners (`HRDashboard.tsx`)

Shared `WelcomeBanner` shows time-aware greeting + role label.

## Pages

`/login`, `/` (dashboard), `/projects`, `/projects/new`, `/projects/:id`, `/timesheets`, `/clients`, `/users` (SITE_ADMIN + HR view/edit-limited), `/skills` (SITE_ADMIN + HR), `/business-units` (SITE_ADMIN + HR), `/resource-planning` (PM/MGMT/HR), `/skill-matrix` (PM/MGMT/HR), `/bench` (PM/MGMT/HR), `/capacity` (PM/MGMT/HR), `/task-templates` (PM/MGMT), `/leaves` (HR/MGMT/PM read-only), `/org-chart` (HR/MGMT/SITE_ADMIN), `/reports` (MGMT/PM), `/vat-recap` (MGMT), `/settings`.

## Performance Reviews (`/performance-reviews`, MGMT/PM/Principal_* only)

Restricted to exactly three reviewer buckets — all other roles (HR, Sales, Finance, Konsultan, TW, Admin Project, Site Admin, and review subjects themselves) get 403 on every endpoint, enforced by a top-level `router.use` role gate (`PERFORMANCE_REVIEW_ROLES`):
- **MANAGEMENT** (PMO Director) → may review subjects whose `role === "PROJECT_MANAGER"` only
- **PROJECT_MANAGER** → may review users staffed on their own projects (via `ProjectResource` / `Project.adminProjectId` / `pmId` link)
- **PRINCIPAL_KONSULTAN / PRINCIPAL_TECHNICAL_WRITER / PRINCIPAL_ADMIN_PROJECT** → may review direct supervisees (`principalId === user.sub`)

Helpers `allowedSubjectIds(user)` + `canReviewSubject()` enforce scope on POST/PATCH/list. Error messages: "Management can only review Project Managers", "Project Managers can only review team members on their own projects", "Principals can only review direct supervisees".

`PerformanceReview` (period Q1–Q4/ANNUAL × periodYear, unique per user+period+year) → DRAFT → SUBMITTED → ACKNOWLEDGED. Reviewer fills `overallRating` (1–5), `summary`, `strengths`, `improvements`, `goals`; subject acknowledges (optional note). `PerformanceReviewProjectRating` (1–5 per project, comment, unique reviewId+projectId) rated by MGMT or `userCanWriteProject` (PM-of-project).

Endpoints in `routes/performance-reviews.ts`:
- `GET/POST /api/performance-reviews` (filter status/year/userId/reviewerId; list scoped to caller's allowed subject set)
- `GET /api/performance-reviews/:id` returns review + projectRatings + computed `metrics` (billableHours, totalHours, utilizationPct vs ~21d×8h/month capacity, projectCount, skillCount, per-project hours, user skills with proficiency, avgProjectRating)
- `PATCH /api/performance-reviews/:id` (reviewer or MGMT, not after ACKNOWLEDGED)
- `POST /api/performance-reviews/:id/submit` (requires overallRating; DRAFT→SUBMITTED)
- `POST /api/performance-reviews/:id/acknowledge` (subject only — but subject must be a role allowed by the top-level gate, so in practice this is only invoked when subject is a PM acknowledging an MGMT review, or a supervisee who happens to also hold a reviewer role)
- `POST /api/performance-reviews/:id/project-ratings` (upsert per project), `DELETE /api/performance-reviews/:id/project-ratings/:ratingId` (MGMT or rating owner)
- `DELETE /api/performance-reviews/:id` (MGMT only, and only when subject is a PM)

Pages: `pages/performance-reviews/index.tsx` (filterable list + create dialog — MGMT picker filtered to PROJECT_MANAGERs; PM picker uses full `/api/users`; Principal falls back to manual entry since `/api/users` is not granted to that role) and `pages/performance-reviews/[id].tsx` (metric KPIs, scoring form, project-ratings panel, hours-per-project + skill profile). Sidebar link visible to MGMT/PM/Principal_* only.

## Phase-2 features

- **Bulk weekly timesheet entry** (`/timesheets` → "Entry Mingguan"). Grid project × 5 hari kerja (Sen–Jum); submit via `POST /api/timesheets/bulk` (max 50 entries). PM/MGMT auto-approved.
- **Leave / availability** (`UserLeave` model, `LeaveType` enum ANNUAL/SICK/TRAINING/UNPAID/OTHER). Self-service log via `/timesheets` → "Log Leave". `GET /api/leaves?startDate&endDate` (MGMT/PM see all, others own only). Resource Planning cells overlay slate "L" marker + tooltip on weeks overlapping a leave.
- **Skill matrix & gap analysis** (`/skill-matrix`, PM/MGMT). `GET /api/skill-matrix` returns `{users, skills, cells, gaps}`. Gap = no holders, or only 1 person, or no Senior/Principal. UI: amber gap-cards + skill×user grid with proficiency 1–5 color coding.
- **Task templates** (`/task-templates`, MGMT manage / PM read+apply). `TaskTemplate` model stores WBS as JSON (`{title, durationDays, offsetDays, parentIndex, billable}[]`). `GET/POST/PATCH/DELETE /api/task-templates` + `POST /api/projects/:id/task-templates/apply` (creates tasks with dates relative to start). "Apply Template" button on project TasksTab.

CRUD endpoints: `GET/POST/PATCH/DELETE /api/skills`, `/api/business-units`.

## Conventions

- Currency via `formatIDR()` in `pages/lib/format.ts`
- Frontend imports hooks from `@workspace/api-client-react` (no subpaths)
- API server uses ESM with `.js` import extensions in TS source
- No emojis in UI
- App.tsx lazy-loads every page except `/login` and `/` via `React.lazy()` + single `<Suspense>`. Global QueryClient: `staleTime: 30_000`, `gcTime: 5min`

## Common tasks

- Regenerate Prisma: `pnpm --filter @workspace/db exec prisma generate`
- Push schema: `pnpm --filter @workspace/db exec prisma db push`
- Regenerate API client/zod: `pnpm --filter @workspace/api-spec run codegen` (post-step `lib/api-spec/scripts/fix-zod-barrel.mjs` rewrites `lib/api-zod/src/index.ts` to only re-export `./generated/api`)
- Reseed DB: `pnpm --filter @workspace/db run seed`
- Add sample report data to existing DB: `pnpm --filter @workspace/db exec tsx src/sample-report-data.ts` (idempotent — dedups by natural keys)

Seed: `lib/db/src/seed.ts`. Idempotent helpers `ensurePrincipals`, `ensureBusinessUnitsAndSkills`, `ensureSampleReportData` run on every invocation. Sample data adds 2nd PM, billing milestones across all aging buckets, expenses with mixed approval status, recent timesheets — all marked with `[sample]` tag in description for safe re-runs.

## Seed credentials (password: `password123`)

Main (`@secureprofit.id`): `management@` (Adi Wibowo), `pm@` (Sari Pratiwi), `pm2@` (Yusuf Maulana — added by sample data), `sales@` (Budi Santoso), `konsultan@` (Rian Hidayat), `konsultan2@` (Dewi Lestari), `writer@` (Ayu Wulandari), `admin@` (Tono Setiawan), `finance@` (Maya Anggraini), `siteadmin@` (Rina Kartika).

Principals + HR (`@itsecasia.com`): `principal.kon.h7q4@` (Bayu Prasetyo), `principal.tw.m9k2@` (Indah Kusumawardani), `principal.ap.r3n8@` (Fajar Nugroho), `hr@` (Sinta Permata).
