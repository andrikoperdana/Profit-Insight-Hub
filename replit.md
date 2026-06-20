# SecureProfit Hub

Full-stack web app for an Indonesian IT security consulting firm. Tracks projects from intake to delivery, monitoring profit margins as consultants log billable mandays.

> High-level map, not an exhaustive spec — detailed behavior lives in the code. Keep it concise.

## Stack

- **Monorepo**: pnpm workspace (`lib/` shared, `artifacts/` runnable apps)
- **Frontend** (`artifacts/web`): React + Vite + TS + Tailwind v4 + shadcn/ui + Recharts, wouter routing, dark cyber-green theme
- **Backend** (`artifacts/api-server`): Node + Express + Pino, JWT auth (HS256), bcryptjs
- **DB** (`lib/db`): PostgreSQL via Prisma. Schema `lib/db/prisma/schema.prisma`; client generated to `lib/db/src/generated/client/`
- **API contract** (`lib/api-spec`): OpenAPI 3 → React Query hooks (`lib/api-client-react`) + zod schemas (`lib/api-zod`)
- **Auth**: `POST /api/auth/login` → `{ token, user }`. Token in `localStorage["auth_token"]`; `custom-fetch.ts` attaches `Authorization: Bearer` and redirects to `/login` on 401

## Roles

Management (PMO Director), Project Manager, Sales, Konsultan, Technical Writer, Admin Project, 3 Principal supervisors (KONSULTAN/TECHNICAL_WRITER/ADMIN_PROJECT), Finance, HR, Site Admin, plus a seed-only SUPER_ADMIN. Role helpers live in `lib/roles.ts` (`canViewProjectFinancials`, `canViewDailyRate`, `canViewRaid`, etc.).

## Domain (Prisma)

- **User** — `seniority` JUNIOR/MID/SENIOR/PRINCIPAL, `businessUnitId`, `managerId` (PM→PMO), `principalId` (delivery user→Principal)
- **BusinessUnit**, **Skill** + **UserSkill** — seeded BUs: Pentest, GRC, Threat Hunting; 11 skills
- **Client**, **Project**, **Activity** (audit), **Document** (BAST/INVOICE/CONTRACT/REPORT/OTHER, base64)
- **ProjectResource** (staffing: planned mandays + daily rate), **Timesheet** (DRAFT→SUBMITTED→APPROVED/REJECTED), **ProjectExpense** (PENDING/APPROVED/REJECTED)
- **BillingMilestone** (Terms-of-Payment, PLANNED/INVOICED/PAID/CANCELLED), **Task** (+ TaskAssignee M:N, TaskDependency, TaskTimeLog; WBS via `parentTaskId`, `billable` flag)
- **ProjectRaidItem**, **ChangeRequest**, **ProjectBaseline**, **PerformanceReview**, **UserLeave**, **TaskTemplate**, **Notification**

## Project lifecycle

`DRAFT (Sales intake) → OBSERVATION (PM completed) → ACTIVE → PAUSE / COMPLETE → CLOSED`. Status gates live in `routes/projects.ts` PATCH (apply to all roles incl. MGMT, validated against effective state, fail 400 with a `missing[]` list):

- **ACTIVE gate**: core Overview fields (client, description, dates, contractValue/plannedMandays/estimatedCost > 0), `pmId`, ≥1 ProjectResource, ≥1 Task, ≥1 ProjectRaidItem, BillingMilestone % summing to 100.
- **COMPLETE gate**: all tasks DONE, no SUBMITTED Timesheet, no PENDING Expense, no PLANNED BillingMilestone, no OPEN RAID, ≥1 BAST Document.
- Non-commercial projects (`kind` != CLIENT) skip the billing/BAST gates and hide Billing/Financials revenue.

Intake: Sales create projects **only** via lead-convert (`POST /api/leads/:id/convert`); manual `POST /api/projects` is 403 for SALES. Server forces `status=DRAFT`, `salesId`, `pmId=null`. MGMT/PM keep manual create. PATCH field permissions: SALES (own DRAFT) `{code,name,description,clientId,contractValue}`; PM (own) all except `salesId`/`pmId`/`clientId`; MGMT full (setting `pmId` on a DRAFT that already has one → 409).

## Project tabs (`/projects/:id`)

Editable by MGMT/assigned-PM/Sales-owner unless noted; each tab has its own `routes/` file. A read-only printable digest of all tabs lives at `/projects/:id/summary` (`pages/projects/summary/`).

- **Overview** — inline edit → "Review & Save" dialog → PATCH; hidden on DRAFT.
- **Timeline** — drag-and-drop Gantt + dependency arrows; client-only Critical Path (`gantt/criticalPath.ts`).
- **Tasks** — MGMT/PM CRUD; assignees only change status + log hours. `parentTaskId`/`dependencyTaskIds[]` cycle-checked; `billable` default true (non-billable excluded from revenue/margin).
- **Resources** — Admin Project + Konsultan/TW teams (`ProjectResource`) + free-text Other Resources.
- **RAID** (`routes/raid.ts`) — delivery team read (`canViewRaid`), MGMT/PM write. `riskScore = impact × likelihood` computed (never stored); `responseStrategy` editable.
- **Expenses** (`routes/expenses.ts`) — MGMT auto-APPROVED, others PENDING; only APPROVED count toward `actualCost`. Receipt PDF at `GET /api/expenses/:id/receipt`.
- **Timesheets** (`routes/timesheets.ts`) — PM-of-project & MGMT approve/reject (SUBMITTED-only, else 409); "Approve All Submitted".
- **Billing** — `BillingMilestone` %, DPP/VAT via `splitVat()`; banner when % ≠ 100. Write = MGMT/assigned-PM.
- **Change Requests** (`routes/change-requests.ts`) — SCOPE/SCHEDULE/COST; DRAFT→APPROVED→APPLIED or REJECTED. Apply is atomic (`updateMany` claim in `$transaction`); SCHEDULE/COST apply writes project fields + a new ProjectBaseline.

## Notifications

Persisted `Notification` rows (`lib/notifications.ts` `notifyUser`), surfaced in the Header bell (`GET /api/notifications`, polled 60s). Timesheet submit notifies the PM; approve/reject notifies the submitter. Daily lead/project rules dedup by day and fire only on MGMT dashboard load (no scheduler).

**Email** (`lib/email.ts`, Resend) — best-effort side effect of `notifyUser`, **important types only**. Global kill-switch `AppSetting.emailNotificationsEnabled` **defaults disabled** (Settings → Email Notifications, MGMT/SUPER_ADMIN). Never blocks/throws, 5s timeout, never logs the provider response body (PII). Optional env levers (sane defaults in code): `EMAIL_SEND_ALLOWLIST` (gate rollout vs bouncy seed emails), `EMAIL_SEND_BLOCKLIST_DOMAINS`, `EMAIL_FROM`, `APP_BASE_URL`, `EMAIL_LOGO_URL`, `EMAIL_REPLY_TO`.

## Financials (`routes/.../serializers.ts`)

- `resourceCost` = Σ APPROVED timesheets `(hours/8) × dailyRate`; `additionalCost` = Σ APPROVED expenses; `actualCost = resourceCost + additionalCost`; `actualProfit = contractValue − actualCost`; `marginPct = actualProfit / contractValue × 100`.
- **Forecast single source of truth**: `computeBurnRateForecast()` + `computeProfitOutlook()`; all callers derive from these, never recompute inline. When `actualMandays === 0`, forecast falls back to the intake estimate.
- **Profit Outlook** — Initial Estimate → Actual → Projected; status EARLY/PROFIT/THIN/LOSS_RISK. By design, Margin/Health read actuals-so-far while Outlook projects to completion (a young project can show high margin + projected loss).
- **Health** (`computeHealthScore`, 0-100), **EVM** (`computeEvm`: CPI/SPI/EAC/…, null-safe), **Baseline** (`ProjectBaseline`, one captured on ACTIVE, single-current invariant via `@@unique([projectId,version])`). All gated by `canViewProjectFinancials` (false for all PRINCIPAL_* and HR).

## Hierarchy & Principal

3 Principal roles supervise delivery teams; PMs report to MGMT (`PRINCIPAL_TO_REPORT_ROLE` in `lib/roles.ts`). Principals propose a supervisee onto OBSERVATION/ACTIVE projects (`acceptedAt=null`), PM/MGMT accept. Principals never see financials and are scoped to their supervisees on Resource Planning/Bench.

## Feature pages (route — roles — purpose)

- `/vat-recap` (MGMT) — 12-month + annual VAT breakdown of INVOICED/PAID milestones.
- `/resource-planning` (PM/MGMT/HR/Principal_*) — BU-grouped weekly mandays.
- `/bench` (PM/MGMT/HR/Principal_*) — utilization detail.
- `/skill-matrix` (PM/MGMT/HR) — users × skills + gaps.
- `/reports` (MGMT/PM) — generic report engine (`reports/definitions.ts`); CSV/XLSX/PDF export (sanitized).
- `/invoice-planning` (MGMT/FINANCE/PM/ADMIN_PROJECT/SALES) — milestones bucketed by dueDate.
- `/portal/:token` (public, no login) — read-only client progress; NO documents/financials; identical 404 for any invalid token.
- `/work-hours` (HR/MGMT/Principal_*) — 40h/week compliance; `UserLeave` lowers target (`lib/work-hours.ts`).
- `/performance-reviews` (MGMT/PM/Principal_*) — DRAFT→SUBMITTED→ACKNOWLEDGED.
- Phase-2: bulk timesheet entry, leave/availability, task templates.

## Role-based access

Server `requireRole` (`middlewares/auth.ts`): **MGMT** full; **PM** write own projects/resources + approve own-project timesheets; **Sales** write clients/projects; **Konsultan/TW** log own timesheets; **Admin Project** documents/invoices; **Finance** read-only Projects/Clients/Reports/VAT + MGMT-style dashboard (may upload/delete INVOICE+CONTRACT docs only); **HR** people-ops only (hard-denied Projects/Timesheets/financials). `GET /api/projects` is scoped by role.

**Menu visibility** (`Sidebar.tsx`, UI-only — routes stay reachable): "Time Tracking" hidden for Site Admin/Finance/HR/MGMT/Sales; "Approval Inbox" + bell "Pending approvals" are PROJECT_MANAGER-only.

## Dashboards & pages

Per-role dashboards in `pages/dashboard/index.tsx` (MGMT executive KPIs, PM active/approvals, Sales pipeline, Konsultan/TW log-time, Admin Project closing-docs, Site Admin audit, HR `HRDashboard.tsx`).

Routes: `/login`, `/` (dashboard), `/projects`(+`/new`,`/:id`,`/:id/summary`), `/timesheets`, `/clients`, `/users`, `/skills`, `/business-units`, `/resource-planning`, `/skill-matrix`, `/bench`, `/capacity`, `/task-templates`, `/leaves`, `/org-chart`, `/reports`, `/invoice-planning`, `/vat-recap`, `/performance-reviews`, `/work-hours`, `/approvals`, `/settings`, `/my-tasks`, `/my-timesheets`, `/my-expenses`. (Role gating per page; see `App.tsx`.)

## Gotchas (do not regress)

- **Express sub-router middleware**: never `router.use(requireRole(...))` at the top of a no-prefix sub-router — it runs before path matching and rejects siblings. Apply per-route or mount under a prefix.
- **Timesheet `?scope=all`** is **default-deny**: only MGMT sees all, PM sees own+own-project, everyone else forced to self. Allowlist new roles; never extend a denylist.
- **`MY_VIEW_ROLES`** (App.tsx) is the single source of truth for the "My …" pages — same list used by Sidebar's `canSeeMyViews`.
- **Scoped endpoint caches**: any TtlCache key must encode caller scope or one role serves another's payload.
- **Daily rate** is gated by `canViewDailyRate` (MGMT/PM/SUPER_ADMIN) — narrower than `canViewProjectFinancials`; server redacts the rate to 0 for others.

## Conventions

- Currency via `formatIDR()` (`pages/lib/format.ts`); frontend imports hooks from `@workspace/api-client-react` (no subpaths).
- API server uses ESM with `.js` import extensions in TS source; no emojis in UI.
- App.tsx lazy-loads every page except `/login` and `/`. Global QueryClient: `staleTime: 30_000`, `gcTime: 5min`.

## User preferences

- **All user-facing strings in the app must be English** — toast titles/descriptions, dialog copy, table headers, button labels, placeholders, and server-side error `reason` messages that surface in the UI. The user chats in Bahasa Indonesia, but the product UI is English-only.

## Common tasks

- Regenerate Prisma client: `pnpm --filter @workspace/db run generate`
- **Schema changes use Prisma Migrate** (not `db push`): edit `schema.prisma` → `pnpm --filter @workspace/db run migrate` (creates + applies to dev) → commit the new folder under `lib/db/prisma/migrations/`. Merges auto-apply to the **dev** DB; **production is NOT auto-migrated** — apply prod manually before/after republish: `bash scripts/release-prod-migrate.sh` (or `DATABASE_URL=<prod> pnpm --filter @workspace/db run migrate:deploy`). Full steps in `docs/RELEASE-CHECKLIST.md`. `db push` is guarded behind `ALLOW_DB_PUSH=1`.
- Regenerate API client/zod: `pnpm --filter @workspace/api-spec run codegen`
- Reseed DB: `pnpm --filter @workspace/db run seed` (idempotent; sample data tagged `[sample]`). Demo hours are capped to ≤8h/user/day by `capUserDailyHours()` (synthetic rows only, never real timesheets).

## Seed credentials (password: `password123`)

- Main (`@secureprofit.id`): `management@` (Adi Wibowo), `pm@` (Sari Pratiwi), `pm2@` (Yusuf Maulana), `sales@` (Budi Santoso), `konsultan@` (Rian Hidayat), `konsultan2@` (Dewi Lestari), `writer@` (Ayu Wulandari), `admin@` (Tono Setiawan), `finance@` (Maya Anggraini), `siteadmin@` (Rina Kartika).
- Principals + HR (`@itsecasia.com`): `principal.kon.h7q4@` (Bayu Prasetyo), `principal.tw.m9k2@` (Indah Kusumawardani), `principal.ap.r3n8@` (Fajar Nugroho), `hr@` (Sinta Permata).
