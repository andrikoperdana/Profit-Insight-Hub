# Threat Model

## Project Overview

SecureProfit Hub is a full-stack web application for an Indonesian IT security consulting firm. It tracks projects from intake to delivery, monitors profit margins, and manages consultant timesheets and expenses. It also includes a React Native mobile app and presentation slide artifacts.

**Tech stack:** Node.js + Express (API server, ESM, Pino logging), React + Vite (web), React Native + Expo (mobile), PostgreSQL via Prisma, JWT HS256 auth (SESSION_SECRET), bcryptjs for passwords, Google Identity Services for SSO, Resend for email, OpenAI gpt-5.4 for Executive Copilot, Pipedrive CRM integration, optional Xero accounting integration. Deployed publicly at https://psa4pmo.xyz (Replit Autoscale).

**Users:** ~14 named roles including Management, Project Manager, Sales, Konsultan, Technical Writer, Admin Project, Finance, HR, Principal supervisors, Site Admin, and a seed-only Super Admin.

## Assets

- **User credentials and sessions** — email/password pairs (bcrypt hashed), JWT session tokens, Google SSO ID tokens. Compromise enables account takeover.
- **HR/compensation data** — per-user daily billing rates, seniority, role, manager relationships. Confidential employee data; leakage violates HR policy.
- **Financial data** — project contract values, profit margins, billing milestones, expense records, invoice details. Commercially sensitive; restricted to MGMT/Finance/PM.
- **Application secrets** — SESSION_SECRET (JWT signing), GOOGLE_CLIENT_ID, Pipedrive API key, Xero tokens, OpenAI key, Resend key, DATABASE_URL. Compromise of any allows full system access or data exfiltration.
- **Client PII** — client names, project descriptions, uploaded documents (BAST, invoices, contracts). Leakage breaches client confidentiality.
- **Third-party accounting credentials** — Xero OAuth access/refresh tokens stored in DB. Grants API access to external Xero accounting organization.
- **Audit trail** — Activity log rows for security-sensitive operations.

## Trust Boundaries

- **Browser / API** — all web client requests must be authenticated and authorized server-side; the client is untrusted.
- **Mobile app / API** — same boundary; the Expo app forwards JWT tokens obtained via the same login flow.
- **Mobile landing server / Public internet** — the mobile server at `/mobile/` is publicly reachable, serves an HTML landing page, and is a separate Node.js HTTP server with no auth requirement. Host header injection is a known risk here.
- **API / PostgreSQL** — Prisma ORM used throughout; parameterized queries prevent SQL injection. Only the API server should reach the database.
- **API / External services** — Pipedrive, Xero, Resend, OpenAI. Each uses a server-side API key. Xero tokens are stored plaintext in the DB.
- **Public / Authenticated** — the client portal (`/portal/:token`), survey submission (`/api/public/surveys/:token`), and mobile landing page are the only intentionally public surfaces. All `/api/` routes except auth endpoints and Pipedrive webhook require a Bearer token.
- **Authenticated / Role-restricted** — MGMT sees all; PM sees own projects; Finance, HR, Konsultan, etc. are scoped. Role enforcement uses server-side `requireRole` middleware.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/index.ts` (Express), `artifacts/api-server/src/routes/index.ts` (route registry), `artifacts/mobile/server/serve.js` (mobile HTTP server)
- **Highest-risk code areas:**
  - `routes/users.ts` — IDOR on GET /users/:id (HIGH)
  - `routes/uploads.ts` + `app.ts` — MIME spoofing stored XSS (HIGH) and /api/files/ no per-file authz (MEDIUM)
  - `routes/xero.ts` + `lib/xero.ts` — host-header redirect_uri injection (HIGH), plaintext token storage (HIGH)
  - `routes/change-requests.ts` — PM self-approve financial CRs (HIGH)
  - `routes/dashboard.ts` — /dashboard/utilization missing role check (MEDIUM)
  - `routes/pipedrive.ts` — unauthenticated webhook when secret unconfigured (MEDIUM)
  - `mobile/server/serve.js` — host header XSS in landing page (HIGH)
- **Public surfaces:** `/api/auth/login`, `/api/auth/google`, `/api/auth/google/config`, `/api/pipedrive/webhook`, `/portal/:token`, `/api/public/surveys/:token`, `/mobile/` (landing page)
- **Admin-only surfaces:** `/api/access-requests`, `/api/audit-logs`, `/api/notifications/run-checks`
- **Dev-only:** `artifacts/mockup-sandbox` (Canvas/design), `lib/db/src/seed.ts` (seed script — not production-reachable)

## Threat Categories

### Spoofing

JWT tokens are HS256-signed with a required `SESSION_SECRET` (throws at startup if unset). `requireAuth` re-reads `user.isActive` and `user.role` from the database on every authenticated request. Google SSO verifies ID token audience and `email_verified`. No authentication bypass found.

**Gap:** `jwt.verify()` is called without an explicit `{ algorithms: ["HS256"] }` option — a defense-in-depth gap; not currently exploitable (LOW).

### Tampering

All prices, rates, and financial computations are server-side. Prisma ORM prevents SQL injection throughout.

**Known vulnerability:** A Project Manager can create and self-approve COST/SCHEDULE change requests with no management review, permanently re-baselining project financials (HIGH).

**Known vulnerability:** `POST /performance-reviews/:id/project-ratings` uses a read-scope guard instead of a write-scope guard, allowing unauthorized writes to submitted reviews (MEDIUM).

### Repudiation

Activity rows logged for sensitive project operations. Audit log restricted to SITE_ADMIN. Email notifications dispatched on key events.

### Information Disclosure

**Known vulnerabilities:**
- `GET /users/:id` — no ownership/role check; any authenticated user reads any other user's profile including daily billing rate (HIGH IDOR).
- `GET /dashboard/utilization` — missing role check; all authenticated users can see team utilization (MEDIUM).
- `/api/files/` — served to any authenticated user without per-file project membership check; confidential BAST/invoice PDFs accessible by guessing filenames (MEDIUM).
- Xero `accessToken`/`refreshToken` stored in plaintext in DB — database read yields live credentials for external accounting system (HIGH).

### Denial of Service

**Known vulnerability:** `POST /api/pipedrive/webhook` accepts all requests when `pipedriveWebhookSecret` is unconfigured — unauthenticated callers can trigger repeated Pipedrive syncs (MEDIUM).

**Known vulnerability:** `POST /api/public/surveys/:token` has no rate limiting — holders of a survey token can spam CSAT results (MEDIUM).

### Elevation of Privilege

**Known vulnerability:** MIME-type check on file upload uses `file.mimetype` (client-controlled); uploading an `.html` file yields stored XSS in the application's origin (HIGH).

**Known vulnerability:** Mobile server landing page reflects `X-Forwarded-Host`/`Host` header into HTML without escaping — reflected XSS if the header can be attacker-controlled (HIGH).

**Known vulnerability:** Xero `redirectUri()` built from unvalidated `X-Forwarded-Host` header — can poison OAuth redirect to attacker-controlled domain when `XERO_REDIRECT_URI` env var is not set (HIGH).
