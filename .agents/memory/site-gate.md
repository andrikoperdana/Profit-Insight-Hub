---
name: Front-door site gate
description: Why the public-demo gate uses a separate cookie instead of HTTP Basic Auth, and how it's scoped to production.
---

# Front-door site gate

A shared username/password gate can sit in front of the whole app for public demos,
controlled by env vars `SITE_GATE_USER` / `SITE_GATE_PASS` (gate is **disabled** when
`SITE_GATE_PASS` is unset — so dev is open; set them in the **production** environment only).

**Rule:** the gate must NOT use HTTP Basic Auth.
**Why:** the app authenticates every `/api` call with `Authorization: Bearer <jwt>`. Basic
Auth would need the same `Authorization` header → collision. The gate therefore uses a
dedicated HttpOnly signed cookie (`sp_gate`, HMAC of user+pass with `SESSION_SECRET`),
enforced by middleware on `/api` (403 + `X-Site-Gate: required`, exempting `/healthz` and
`/site-gate/*`). The frontend popup checks `/api/site-gate/status` before mounting the app;
`custom-fetch.ts` reloads on a 403 carrying `X-Site-Gate: required`.

**How to apply:** if asked to add/replace a front gate, keep it cookie-based (or use Replit
deployment password protection), never Basic Auth, or you'll break Bearer JWT.

## Public no-login pages (client portal, survey)

Public pages opened by external people who have no site credentials must bypass the gate on
**both** sides or they hit the popup/403:
- Server: site-gate middleware exempts paths under `/api/public/*`; mount the public router
  before the blanket-auth routers.
- Web: `SiteGate.tsx` short-circuits (renders children, skips the status fetch) when
  `window.location.pathname` matches a public route (`/portal/`, `/survey/`).

**Fail-closed rule for public token endpoints:** funnel every failure mode (unknown token,
malformed, disabled, expired, DRAFT, soft-deleted) through one path returning an **identical**
404 body+headers. No length/format pre-check before the DB lookup — a distinct early return is
a token-existence oracle. Payload must be a hand-written whitelist (never reuse projectInclude
/ financials serializers) so cost/margin/rate/documents can't leak.

**Survey vs portal share controls:** both the survey link and client portal now expose
enable/disable + expiry + regenerate (MGMT or owning-PM). Survey gate = `surveyEnabled`
(`@default(true)`, preserving the old "auto-on when CLOSED" behavior) + `surveyExpiresAt`,
funneled through `surveyLinkUnavailable()` in both `/public/surveys/:token` handlers. Known
gap: the survey public endpoints still lack the portal's `noindex`/`no-store` headers and
rate limiting (intentionally left out of scope) — mirror them if hardening the survey link.
