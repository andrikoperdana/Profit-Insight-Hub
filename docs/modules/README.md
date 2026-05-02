# SecureProfit Hub — Technical Documentation

Per-module technical reference for the SecureProfit Hub platform. Each document covers routes, UI components, data model, API surface, role-based access, and the primary user flows for one module.

## Stack at a glance

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TypeScript, TailwindCSS, shadcn/ui, Recharts, Wouter, TanStack Query |
| Backend | Node.js, Express, Zod validation |
| Data | PostgreSQL via Prisma ORM |
| Auth | JWT (HTTP-only cookie), bcrypt password hashing |
| Contract | OpenAPI spec → Orval-generated React Query hooks + Zod schemas |

## Roles

The platform uses six roles. Most authorization is enforced server-side via middleware on each route.

| Role | Short code | Scope |
|------|------------|-------|
| Management | `MANAGEMENT` | Full read/write across all modules |
| Admin Project | `ADMIN_PROJECT` | Project lifecycle administration, partial governance |
| Project Manager | `PM` | Owned projects, approvals, capacity |
| Sales | `SALES` | Pipeline, clients, owned project creation |
| Consultant | `CONSULTANT` | Assigned projects, own timesheets |
| Technical Writer | `TW` | Assigned projects (deliverables), own timesheets |

## Modules

1. [Dashboard](./01-dashboard.md) — role-aware home screens, KPIs, activity feed.
2. [Projects & Clients](./02-projects-clients.md) — project lifecycle, client CRM, document attachments.
3. [Resources & Capacity](./03-resources-capacity.md) — assignments, utilization, calendar planning.
4. [Profitability & Finance](./04-profitability-finance.md) — margin tracking, what-if scenarios.
5. [Timesheets & Approvals](./05-timesheets-approvals.md) — labor tracking and multi-stage approval.
6. [Business Intelligence & CSAT](./06-business-intelligence-csat.md) — analytics and customer satisfaction.
7. [Governance & RBAC](./07-governance-rbac.md) — users, settings, audit log.

## Conventions used in these docs

- **Routes** — frontend paths (Wouter) and backend endpoints (Express). All API routes are prefixed by `/api`.
- **Roles** — comma-separated short codes; "All" means every authenticated user.
- **DB models** — Prisma model names. Check `artifacts/api-server/prisma/schema.prisma` for the canonical definition.
- **Flows** — the happy-path sequence for the primary use case in that module.
