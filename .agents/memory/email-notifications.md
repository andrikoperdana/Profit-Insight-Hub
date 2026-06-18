---
name: Email notifications (Resend)
description: How/why email delivery is wired into the notification system, the important-only scope, and rollout/logging guardrails.
---

# Email notifications (Resend)

Email is a **best-effort side effect of `notifyUser`** (api-server `lib/email.ts`): after the in-app `Notification` row is created (the source of truth), important-only types are emailed via the Resend REST API (raw `fetch`, no SDK dependency — Node 24 native fetch). The send is fired **without awaiting** in request handlers, has a 5s `AbortController` timeout, and never throws.

## Product decisions (the "why")
- **Important-only scope, not all notifications.** Owner chose "start with important, expand if quota stays safe." Set = `timesheet.submitted/approved/rejected`, `expense.rejected`, `INVOICE_DUE_SOON`, `PROJECT_OVERRUN`, `LOW_MARGIN`.
  **Why:** Resend free tier is 100 emails/day, 3000/month; emailing every notification per-event (esp. timesheet-awaiting-approval) could blow the cap. Expand the `EMAIL_NOTIFICATION_TYPES` set later if volume allows.
- **No scheduler.** Daily rules (`notificationRules.ts`) still only fire when Management opens the dashboard (`POST /api/notifications/run-checks`); emails go out then. Owner explicitly declined a scheduled deployment for guaranteed daily sends.

## Guardrails (do not regress)
- **Never log the raw provider response body.** Resend error JSON can echo the recipient address / message content (PII). Log only `{status, domain, errorCode}` (errorCode = parsed `name`), plus `{type,userId,domain}` for the outcome. Never log the API key or full email address.
- **Rollout safety levers (env, optional):** `EMAIL_SEND_ALLOWLIST` (comma list — if set, ONLY those exact addresses receive mail) and `EMAIL_SEND_BLOCKLIST_DOMAINS`. Seed/test users have `@secureprofit.id` / `@itsecasia.com` addresses that may bounce on the freshly-verified domain and hurt sender reputation — **set the allowlist to a known-good test address before first go-live, then clear it** to enable everyone.
- Placeholder domains (`example.com`, `test.com`, `localhost`, …) and deleted/inactive users are always skipped.
- Other env overrides (sane defaults in code): `EMAIL_FROM` (default `SecureProfit Hub <notifications@mail.psa4pmo.xyz>`), `APP_BASE_URL` (default `https://psa4pmo.xyz`, used for email links), `EMAIL_REPLY_TO`.

## Infra
- Domain `mail.psa4pmo.xyz` verified in Resend for **sending only** (receiving off), region Tokyo. `RESEND_API_KEY` in Replit Secrets, readable from the bash shell (so live send tests via a `/tmp/*.mjs` run work; the code_execution sandbox cannot read it).
- Smoke-test recipients: Resend provides `delivered@resend.dev` / `bounced@resend.dev` / `complained@resend.dev` — use `delivered@resend.dev` to validate key+domain+from without a real inbox or reputation risk.
- **Production needs a republish** to pick up code changes; the dev workflow restart only affects the dev environment.
