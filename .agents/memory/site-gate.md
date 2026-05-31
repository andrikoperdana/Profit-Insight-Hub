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
