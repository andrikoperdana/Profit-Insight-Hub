# SecureProfit Hub

Full-stack web app for an Indonesian IT security consulting firm. Tracks projects from intake to delivery, monitoring profit margins as consultants log billable mandays.

> High-level map, not an exhaustive spec — detailed behavior lives in the code. Keep it concise.

## Stack

- **Monorepo**: pnpm workspace (`lib/` shared, `artifacts/` runnable apps)
- **Frontend** (`artifacts/web`): React + Vite + TS + Tailwind v4 + shadcn/ui + Recharts, wouter routing, dark cyber-green theme
- **Backend** (`artifacts/api-server`): Node + Express + Pino, JWT auth (HS256), bcryptjs
- **DB** (`lib/db`): PostgreSQL via Prisma. Schema `lib/db/prisma/schema.prisma`; client generated to `lib/db/src/generated/client/`
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
- **BillingMilestone** — Terms-of-Payment per project, PLANNED/INVOICED/PAID/CANCELLED
- **Task** + **TaskAssignee** (M:N) + **TaskDependency** + **TaskTimeLog** — WBS via `parentTaskId`, `billable` flag, finish-to-start deps
- **ProjectRaidItem**, **PerformanceReview** (+ `PerformanceReviewProjectRating`), **UserLeave**, **TaskTemplate**, **Notification**

## Project lifecycle

`DRAFT (Sales intake) → OBSERVATION (PM completed) → ACTIVE → PAUSE / COMPLETE → CLOSED`. Gates in `routes/projects.ts` PATCH, all roles incl. MGMT, validated against effective state (incoming body overrides stored), each fails 400 with a `missing[]` list:

- **ACTIVE gate** (`ACTIVATION_REQUIREMENTS_INCOMPLETE`): core Overview fields (client, description, start/end date, contractValue>0, plannedMandays>0, estimatedCost>0), `pmId`, ≥1 `ProjectResource`, ≥1 `Task`, ≥1 `ProjectRaidItem`, `BillingMilestone` % summing to 100.
- **COMPLETE gate** (`COMPLETION_REQUIREMENTS_INCOMPLETE`): all tasks DONE, no SUBMITTED Timesheet, no PENDING ProjectExpense, no PLANNED BillingMilestone, no OPEN ProjectRaidItem, ≥1 latest BAST Document. (`statusChangeReason` enforced earlier.)

Intake: Sales create projects **only** via the Sales Pipeline lead-convert flow (`POST /api/leads/:id/convert`). The manual `POST /api/projects` path is **hard-blocked for SALES** (403 `"Sales must create projects from a won lead in the Sales Pipeline."`); `/projects/new` redirects Sales to `/leads` unless opened with `?leadId=` (the leads page links there per won/eligible lead). Reached via `?leadId=`, the intake form requires a selected lead (no manual/no-lead path) and has a **required Resource Requirements** section using budget-only rows (role, headcount, mandays/person, daily rate — no person picker, no `ProjectResource`) to compute `plannedMandays`/`estimatedCost`; the convert route enforces `plannedMandays > 0` so the initial cost can't be bypassed. Server still forces `status=DRAFT`, `salesId`, `pmId=null`. SALES stays in `writeRoles` (shared by POST + PATCH) so Sales can still edit their own DRAFTs — the lock lives inside the POST handler, not in `writeRoles`. MGMT/PM keep manual create. PM assigns real people later in Resources. MGMT assigns PM (409 if already set). PM uses `DraftCompletionCard` → OBSERVATION.

`PATCH /api/projects/:id` field permissions:
- **SALES** (own only): `{code,name,description,clientId,contractValue}`; no people/client/status changes on non-DRAFT.
- **PROJECT_MANAGER** (own only): all fields except `salesId`/`pmId`/`clientId`.
- **MANAGEMENT**: full. Setting `pmId` on a DRAFT that already has one → 409.

## Project tabs (`/projects/:id`)

Editable by MGMT/assigned-PM/Sales-owner unless noted. Each tab has its own route file under `routes/`.

- **Overview** — inline edit → "Review & Save" dialog → PATCH. Hidden on DRAFT; yellow banner when essential fields missing. Client is a Select only for MGMT.
- **Timeline** — drag-and-drop Gantt (`TaskGanttChart`/`GanttBar`), PATCH on pointer-up; `DependencyArrows` SVG. Server doesn't enforce dep timing — toast warns.
- **Tasks** (`routes/tasks.ts`) — MGMT/PM create/edit/delete; assignees only change `status` + log hours. `assigneeIds[]` (omit=preserve, `[]`/null=clear, non-array=400). `parentTaskId` + `dependencyTaskIds[]` BFS cycle-checked; pickers exclude self+descendants. `billable` default true; non-billable hours don't roll into revenue/margin.
- **Resources** — 4 sections: Admin Project (single `Project.adminProjectId`), Konsultan & Technical Writer teams (`ProjectResource` by role), Other Resources (free-text `roleInProject`, `GET /api/users/active-all`, MGMT+PM only).
- **RAID** (`routes/raid.ts`) — `ProjectRaidItem`. Read = delivery team only (MGMT, PM, KONSULTAN, PRINCIPAL_* via `canViewRaid()`, mirrored FE/server), scoped per-project; write = MGMT/assigned-PM. CLOSED auto-stamps `closedAt`.
- **Expenses** (`routes/expenses.ts`) — submitters: MGMT, assigned-PM, Sales-owner, staffed KONSULTAN/TW/ADMIN_PROJECT, PRINCIPAL_* (self or direct supervisee staffed). MGMT auto-APPROVED, others PENDING. Approve/reject = PM-of-project + MGMT. **Only APPROVED count toward `actualCost`/margin.** List scope: MGMT/SITE_ADMIN/FINANCE + PM-of-project see all; else own only. Receipt PDF `GET /api/expenses/:id/receipt` (not in OpenAPI; bearer+blob; `pdf-lib`; access = creator/MGMT/PM-of-project). `GET /api/expenses/mine` backs "My Expenses".
- **Timesheets** (`routes/timesheets.ts`) — all project entries, filterable + KPI cards. PM-of-project & MGMT Approve/Reject/Delete + "Approve All Submitted". `GET /api/timesheets?projectId=...`. `/approve` & `/reject` guarded SUBMITTED-only (409 otherwise). See **Notifications** below.
- **Billing** — `BillingMilestone` with %, DPP, VAT, Total, due date, status, invoice #. INVOICED→`invoicedAt`, PAID→`paidAt`. DPP/VAT via `splitVat()` honoring `Project.contractValueIncludesVat`. Banner when total % ≠ 100. Write = MGMT/assigned-PM.

## Notifications

Persisted `Notification` rows (`lib/notifications.ts` `notifyUser`), surfaced in the Header bell via `GET /api/notifications` (polled 60s, mark-read/mark-all-read). Timesheet approval events: submit/resubmit/bulk-create notifies the project's PM ("awaiting approval", link `/approvals`); approve (single+bulk) and reject notify the submitter (link `/timesheets`; reject includes reason). Actor==recipient is skipped; `/submit` only notifies on a real transition into SUBMITTED so repeats don't spam. Also used for leads/projects (`lib/leadNotifications.ts`, `lib/notificationRules.ts` — dedup by day).

**Email** (`lib/email.ts`, Resend REST API via native fetch) — best-effort side effect of `notifyUser`: after the in-app row is created, **important types only** are emailed (`timesheet.submitted/approved/rejected`, `expense.rejected`, `INVOICE_DUE_SOON`, `PROJECT_OVERRUN`, `LOW_MARGIN`). Fired without awaiting, never throws, 5s timeout; skips deleted/invalid recipients; never logs the provider response body (PII — log `{status,domain,errorCode}` only). **No scheduler** — daily rules still only fire on MGMT dashboard load. From `notifications@mail.psa4pmo.xyz` (verified). Env levers (optional, sane defaults in code): `EMAIL_SEND_ALLOWLIST` (if set, only those exact addresses get mail — set to a test address before go-live to avoid bouncing seed/test emails, then clear), `EMAIL_SEND_BLOCKLIST_DOMAINS`, `EMAIL_FROM`, `APP_BASE_URL` (email links), `EMAIL_REPLY_TO`.

## Financials (`routes/.../serializers.ts`)

- `resourceCost` = Σ APPROVED timesheets `(hours/8) × resource.dailyRate`; `additionalCost` = Σ APPROVED `ProjectExpense.amount`
- `actualCost = resourceCost + additionalCost`; `actualProfit = contractValue − actualCost`; `marginPct = actualProfit / contractValue × 100`
- **Forecast single source of truth**: `computeBurnRateForecast()` + `computeProfitOutlook()` (serializers.ts). `/financials`, `/whatif` base, and `serializeProject.profitOutlook` all derive forecastCost/forecastProfit from these — never recompute inline. When `actualMandays === 0`, forecast falls back to the intake estimate (avoids ~100% profit before cost accrues).
- **Profit Outlook** (`computeProfitOutlook`): plain-language Initial Estimate → Actual → Projected (each profit/loss IDR + margin %). Status `EARLY` (progress < `EARLY_PROGRESS_PCT` 20% → "Too Early to Tell", takes precedence) / `PROFIT` / `THIN` (forecast margin < `THIN_MARGIN_PCT` 10%) / `LOSS_RISK` (forecast profit < 0). Returns `progressPct` (= mandays burn). Null for `FINANCIALS_BLOCKED_ROLES`. FE: `ProfitOutlookPanel` + `ProfitOutlookCompact`. **By design**: Margin/Health read actuals-so-far while Outlook projects to completion, so a young project can show high margin + projected loss simultaneously.
- **Project Health** (`computeHealthScore`, 0-100, HEALTHY/AT_RISK/CRITICAL; margin30/raid20/expenses15/billing20/schedule15) via `HealthBadge`. Health + Outlook gated by `canViewProjectFinancials`.

## Hierarchy & Principal

3 Principal roles supervise delivery teams; PMs report to MGMT. Mapping `PRINCIPAL_TO_REPORT_ROLE` in `lib/roles.ts`.

- **Propose workflow** (`routes/resources.ts`, `routes/principal.ts`): Principal proposes a direct supervisee onto OBSERVATION/ACTIVE projects (`POST /api/projects/:id/resources/propose`, sets `proposedById`, `acceptedAt=null`); PM/MGMT accept (`POST /api/resources/:id/accept`). `GET /api/principal/projects-needing-resource` + `/api/users/under-supervision` Principal-only.
- **Visibility**: `canViewProjectFinancials()` false for any `PRINCIPAL_*` — hides Financials/Billing tabs and all contractValue/margin/cost columns.

## Feature pages (key behaviors)

- **VAT recap** (`/vat-recap`, MGMT) — `GET /api/billing-milestones/vat-recap?year=YYYY`, INVOICED/PAID into 12-month + annual breakdown.
- **Resource Planning** (`/resource-planning`, PM/MGMT/HR + Principal_*) — `GET /api/resource-planning?startDate&weeks=N`, BU-grouped weekly mandays. Principals scoped to supervisees; TtlCache key namespaced per-principal.
- **Bench Report** (`/bench`, PM/MGMT/HR + Principal_*) — `GET /api/dashboard/resource-utilization-detail` (already scopes Principals to supervisees).
- **Skill matrix** (`/skill-matrix`, PM/MGMT/HR) — `GET /api/skill-matrix` → `{users, skills, cells, gaps}`. Gap = no holders / only 1 / no Senior+Principal.
- **Reports** (`/reports`, MGMT+PM) — generic engine: `ReportDefinition`s in `reports/definitions.ts`; catalog + runner under `pages/reports/`. `GET /api/reports`, `/options`, `/:id`, `/:id/export?format=csv|xlsx|pdf` (export not in OpenAPI; bearer+blob; formula-injection sanitized). PM-scoped reports filter `pmId === sub`. 10 reports.
- **Invoice Planning** (`/invoice-planning`, MGMT/FINANCE + PM/ADMIN_PROJECT/SALES own-scope) — `GET /api/invoice-planning?mode=week|month&periods=N`, BillingMilestones bucketed by dueDate into project×period cells, grouped by PM's BU + roll-up totals.
- **Client Progress Portal** (`/portal/:token`, public no-login) — read-only single-project view: progress %, friendly status, timeline/milestones, billing status. NO documents, NO financials (server whitelist in `routes/client-portal.ts`, never projectInclude). Public `GET /api/public/client-portal/:token` (mounted before blanket-auth; rate-limited; noindex; **identical 404** for unknown/malformed/disabled/expired/DRAFT/deleted — no token oracle). MGMT/owner-PM manage via `GET/PUT /api/projects/:id/client-share` (`ClientShareDialog`). Site gate bypassed for `/api/public/*` (server) and `/portal/`,`/survey/` (web `SiteGate`).
- **Work Hours Compliance** (`/work-hours`, HR/MGMT/Principal_*) — required roles (`WORK_HOURS_REQUIRED_ROLES`, mirrored FE/server: PM, KONSULTAN, TECHNICAL_WRITER, all 3 PRINCIPAL_*) must log 40h/week (8h × Mon-Fri). `UserLeave` lowers target 8h per distinct leave business day (`computeWorkHoursSummary` in `lib/work-hours.ts` — leave days are a **union of dates** so overlapping rows never double-reduce). `loggedHours` = non-REJECTED hours; `pendingHours` = SUBMITTED. Status MET/ON_TRACK/BEHIND/AT_RISK vs `expectedToDateHours`. Endpoints `GET /api/work-hours/me` + `/team` (per-handler `canViewWorkHoursTeam` 403 gate, no top-of-router `requireRole`; HR=all required staff / MGMT=PMs / Principal=`principalId === self`) + `/team/export?format=csv|xlsx` (bearer+blob; same scope; sanitized). Self-view `WorkHoursCard` (null for exempt roles) on PM/Principal/Consultant dashboards, reuses `LeaveDialog`. Exempt: Admin Project, Sales, Finance, HR, MGMT, Site Admin. List paginated 20/page.
- **Performance Reviews** (`/performance-reviews`, MGMT/PM/Principal_* only) — top-level `router.use` gate (`PERFORMANCE_REVIEW_ROLES`). MGMT reviews PMs only; PM reviews users on own projects; Principal reviews direct supervisees (`allowedSubjectIds()`/`canReviewSubject()`). DRAFT→SUBMITTED→ACKNOWLEDGED.
- **Phase-2**: bulk weekly timesheet entry (`POST /api/timesheets/bulk`, max 50); leave/availability (`UserLeave`, overlaid on Resource Planning); task templates (`TaskTemplate` WBS-as-JSON, `POST /api/projects/:id/task-templates/apply`).

CRUD: `GET/POST/PATCH/DELETE /api/skills`, `/api/business-units`.

## Role-based access

Server `requireRole` (`middlewares/auth.ts`): **Management** full; **PM** write own projects/resources + approve own-project timesheets; **Sales** write clients/projects; **Konsultan/TW** log own timesheets; **Admin Project** documents/invoices; **Finance** read-only Projects/Clients/Reports(+exports)/VAT Recap + MGMT-style dashboard, may upload/delete INVOICE+CONTRACT docs only; **HR** people-ops only (HR Dashboard, Employees read + edit non-sensitive only, Org Chart, Leaves view, Skill Matrix read, Skills/BU CRUD, Bench, Capacity/Resource Planning read — hard-denied Projects/Timesheets/financial dashboards; `canViewProjectFinancials` includes HR in `FINANCIALS_BLOCKED_ROLES`; retains utilization endpoints).

Data scoping: `GET /api/projects` by role (PM `pmId`, Sales `salesId`, Konsultan/TW assigned-or-has-timesheet, MGMT/Admin all). `GET /api/dashboard/resource-utilization-detail` MGMT+PM.

**Menu visibility** (`Sidebar.tsx`, UI-only — routes stay reachable so team-oversight isn't broken): "Time Tracking" (`/timesheets`) hidden for Site Admin, Finance, HR, Management, Sales (don't log own hours); Sales also loses "My Timesheet" (keeps My Tasks/My Expenses). "Approval Inbox" (`/approvals`) + Header bell "Pending approvals" are PROJECT_MANAGER-only (MGMT doesn't approve timesheets).

## Dashboards (`pages/dashboard/index.tsx`)

Per-role: MANAGEMENT (executive KPIs, profit trend, aging, at-risk, `PMAllocationCard`); PROJECT_MANAGER (active projects, approval inbox, utilization, revenue-vs-profit, alerts); SALES (pipeline, revenue-by-client, profitability); KONSULTAN/TW (log-time CTA, trend, `MyTasksCard`); ADMIN_PROJECT (closing-doc inbox); SITE_ADMIN (users + audit + activity); HR (`HRDashboard.tsx`). Shared `WelcomeBanner`.

## Pages

`/login`, `/` (dashboard), `/projects`, `/projects/new`, `/projects/:id`, `/timesheets`, `/clients`, `/users` (SITE_ADMIN+HR), `/skills` (SITE_ADMIN+HR), `/business-units` (SITE_ADMIN+HR), `/resource-planning` (PM/MGMT/HR/Principal_*), `/skill-matrix` (PM/MGMT/HR), `/bench` (PM/MGMT/HR/Principal_*), `/capacity` (PM/MGMT/HR), `/task-templates` (PM/MGMT), `/leaves` (HR/MGMT/PM read-only), `/org-chart` (HR/MGMT/SITE_ADMIN), `/reports` (MGMT/PM), `/invoice-planning` (MGMT/FINANCE/PM/ADMIN_PROJECT/SALES), `/vat-recap` (MGMT), `/performance-reviews` (MGMT/PM/Principal_*), `/work-hours` (HR/MGMT/Principal_*), `/approvals` (PM), `/settings`, `/my-tasks`, `/my-timesheets`, `/my-expenses`. Principals on Resource Planning/Bench scoped to supervisees.

## Gotchas (do not regress)

- **Express sub-router middleware**: never `router.use(requireRole(...))` at the top of a sub-router mounted via `router.use(subRouter)` (no path prefix) — runs for every request before path matching, rejecting siblings. Apply per-route or mount under a prefix.
- **Timesheet `?scope=all`** is **default-deny**: only MGMT sees all, PM sees own+own-project, everyone else forced to `userId === self`. Allowlist new roles; never extend a denylist.
- **`MY_VIEW_ROLES`** (App.tsx) is the single source of truth for the "My …" pages — same list used by Sidebar's `canSeeMyViews`.
- **Scoped endpoint caches**: any TtlCache key must encode caller scope (see Resource Planning) or one role serves another's payload.

## Conventions

- Currency via `formatIDR()` (`pages/lib/format.ts`); frontend imports hooks from `@workspace/api-client-react` (no subpaths)
- API server uses ESM with `.js` import extensions in TS source; no emojis in UI
- App.tsx lazy-loads every page except `/login` and `/` (`React.lazy()` + single `<Suspense>`). Global QueryClient: `staleTime: 30_000`, `gcTime: 5min`

## User preferences

- **All user-facing strings in the app must be English** — toast titles/descriptions, dialog copy, table headers, button labels, placeholders, and server-side error `reason` messages that surface in the UI. The user chats in Bahasa Indonesia, but the product UI is English-only.

## Common tasks

- Regenerate Prisma: `pnpm --filter @workspace/db exec prisma generate`; push schema: `... exec prisma db push`
- Regenerate API client/zod: `pnpm --filter @workspace/api-spec run codegen` (post-step `fix-zod-barrel.mjs` rewrites `lib/api-zod/src/index.ts` to only re-export `./generated/api`)
- Reseed DB: `pnpm --filter @workspace/db run seed`; sample report data: `... exec tsx src/sample-report-data.ts` (idempotent)

Seed (`lib/db/src/seed.ts`): idempotent helpers (`ensurePrincipals`, `ensureBusinessUnitsAndSkills`, `ensureSampleReportData`) run every invocation; sample data tagged `[sample]`.

**Sample timesheet hours cap** (`lib/db/src/cap-daily-hours.ts`): generators could stack the same user on overlapping days into impossible totals (300h+/week) that broke Work Hours Compliance. `capUserDailyHours()` (final step of `seed.ts` + `sample-demo-enrichment.ts`) scales any (user, UTC day) over 8h down to 8h via a largest-remainder half-hour allocator. **`syntheticOnly` by default** — only reduces generator-tagged rows (U+200B marker or `[sample]`) and reserves real human hours, so re-running against real data never mutates real timesheets.

## Seed credentials (password: `password123`)

- Main (`@secureprofit.id`): `management@` (Adi Wibowo), `pm@` (Sari Pratiwi), `pm2@` (Yusuf Maulana), `sales@` (Budi Santoso), `konsultan@` (Rian Hidayat), `konsultan2@` (Dewi Lestari), `writer@` (Ayu Wulandari), `admin@` (Tono Setiawan), `finance@` (Maya Anggraini), `siteadmin@` (Rina Kartika).
- Principals + HR (`@itsecasia.com`): `principal.kon.h7q4@` (Bayu Prasetyo), `principal.tw.m9k2@` (Indah Kusumawardani), `principal.ap.r3n8@` (Fajar Nugroho), `hr@` (Sinta Permata).
