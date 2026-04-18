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

User, Client, Project, ProjectResource (per-project staffing with planned mandays + daily rate), Timesheet (DRAFT → SUBMITTED → APPROVED/REJECTED), Document (BAST/INVOICE/CONTRACT/REPORT/OTHER, base64 data URL in DB), Activity (audit trail).

## Project lifecycle statuses

OBSERVATION (lead/proposal) → ACTIVE (delivering) → PAUSE / COMPLETE → CLOSED.

## Financials computation

Computed in `artifacts/api-server/src/lib/serializers.ts`:
- `actualCost` = sum over APPROVED timesheets of `(hours / 8) * resource.dailyRate`
- `actualProfit` = `contractValue - actualCost`
- `marginPct` = `actualProfit / contractValue * 100`
- Forecast: linear projection of cost based on burn rate

`/api/projects/:id/financials` aggregates approved timesheets per month and pairs with contract value spread evenly across active months for chart rendering.

## Role-based access

Enforced server-side via `requireRole` middleware in `artifacts/api-server/src/middlewares/auth.ts`:
- Management: full access
- Project Manager: write projects/resources, approve timesheets for projects where they are PM
- Sales: write clients/projects
- Konsultan / Technical Writer: log own timesheets only
- Admin Project: upload documents and invoices

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
- Regenerate API client/zod: `pnpm --filter @workspace/api-spec run codegen`
- Reseed DB: `pnpm --filter @workspace/db run seed`

## Conventions

- All currency formatted as IDR via `formatIDR()` in `artifacts/web/src/lib/format.ts`
- Frontend imports hooks from `@workspace/api-client-react` (not subpaths)
- API server uses ESM with `.js` import extensions in TypeScript source
- No emojis in UI
