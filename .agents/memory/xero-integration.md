---
name: Xero accounting integration
description: Durable correctness/security rules for the one-way Xero (OAuth2 + Accounting API) integration — invoice push idempotency, payment-paid detection, OAuth state.
---

# Xero integration rules

One-way integration (manual SDK-less REST): push BillingMilestones → ACCREC sales
invoices, sync Clients → Xero Contacts, pull payment status → mark milestone PAID.
Single tenant, singleton `XeroConnection` row. 30-min poller + manual triggers.

## Invoice push must be idempotent under concurrency
Pushing a milestone to Xero creates an external side effect that cannot be rolled
back, so two concurrent requests must never both create an invoice.
- Serialize per-milestone with a Postgres **advisory lock** (`pg_try_advisory_lock`)
  — works across autoscale instances since the lock lives in the shared DB. Re-check
  `xeroInvoiceId` *under the lock* before calling Xero.
- **Reserve the `invoiceNumber` on the milestone row BEFORE calling Xero**, with a
  retry loop on Prisma P2002. The DB unique constraint on `BillingMilestone.invoiceNumber`
  arbitrates cross-milestone sequence allocation; reserving first means a sequence
  clash can never leave an orphaned/duplicate invoice in Xero.
**Why:** scan-then-max+1 number allocation is race-prone (see invoice-numbering memory),
and a clash *after* the Xero call orphans a real invoice in the customer's books.
**How to apply:** any new code path that creates external invoices must hold the
per-entity advisory lock and reserve the local number before the external call.

## Mark PAID only on explicit Xero Status === "PAID"
Do **not** infer paid from `AmountDue === 0`. Voided/deleted/credited invoices also
have zero due and would be falsely marked PAID, corrupting in-app financial status.

## Connect button must break out of the Replit preview iframe
The "Connect to Xero" click navigates the browser to `login.xero.com`, which refuses
to be framed. In the Replit dev preview the app runs inside an iframe, so a plain
`window.location.href = url` loads the OAuth page *inside the iframe* and Xero shows a
refused/error page. Navigate `window.top.location` (with a `window.open(_blank)`
fallback for cross-origin top access) so the redirect escapes the iframe. Production
(no iframe) is unaffected.
**Separately:** the derived `redirect_uri` (`https://<host>/api/xero/callback`, from
x-forwarded-host) must be registered in the Xero developer app or Xero rejects authorize.

## Authorize URL scope must be %20-encoded, not "+"
Building the authorize URL with `URLSearchParams` encodes the spaces between scopes
as `+`. Xero treats a literal `+` in the query as part of the scope value, so the
space-separated scopes collapse into one invalid token and Xero returns
`invalid_scope` (500 error page). Build the query manually with `encodeURIComponent`
(space -> %20). **Why:** in a URL query component `+` is a literal plus per RFC 3986,
not a space; only form bodies treat `+` as space. **How to apply:** never use
URLSearchParams for OAuth authorize URLs whose values contain spaces.
Scope set is intentionally minimal — `accounting.invoices accounting.contacts
offline_access` only (NEW granular scopes; see note below). The OpenID scopes
(openid/profile/email) were removed: we never read the Xero user's identity, and
requesting scopes the app isn't granted triggers invalid_scope. Keep `offline_access`
(refresh token) — it is required.

## App type must be Web app (Auth Code), NOT Custom Connection
Our integration is the interactive Auth Code flow (Connect button -> login.xero.com
authorize -> redirect to /api/xero/callback). A **Custom Connection** (machine-to-
machine, client_credentials grant) has no authorize flow, so every authorize attempt
returns `invalid_scope` regardless of encoding or scope set — this looks identical to
an encoding bug but is a Xero-portal app-type mismatch.
**Diagnose without user action:** POST client_credentials to identity.xero.com/connect/token
with the app's id/secret. `unauthorized_client` => standard Auth Code app (good).
`invalid_scope`/"Client credentials scope validation failed" => the client *accepts*
client_credentials => it's a Custom Connection (wrong type for our flow).
**Fix is in the Xero developer portal**, not code: create a "Web app" / Auth Code
integration, register the production `<domain>/api/xero/callback` redirect, and put its
client id/secret in XERO_CLIENT_ID/XERO_CLIENT_SECRET.

## Use Xero's NEW granular scopes, not the legacy broad ones
Root cause of a stubborn `invalid_scope` (June 2026): Xero migrated to granular scopes.
**Apps created after 2 March 2026 only get the new scopes**; the legacy broad
`accounting.transactions` no longer exists for them and returns invalid_scope, while
overlapping scopes (`accounting.contacts`, `accounting.settings`) keep working — which
makes it look like a partial/region restriction but is NOT. Mapping that matters here:
broad `accounting.transactions` -> granular **`accounting.invoices`** (read+write invoices),
plus `accounting.banktransactions`, `accounting.creditnotes`, etc. for other tx types.
`accounting.contacts` is unchanged. Full list is on the app's Configuration page.
**Diagnostic that pinpoints which scope is refused:** loop each scope through the
authorize URL with a *valid registered redirect*; reaching `/identity/user/login` = scope
OK, `/identity/error` (page body contains `invalid_scope`) = scope refused.
Our code only POSTs /Invoices, POSTs /Contacts, GETs /Invoices -> needs exactly
`accounting.invoices accounting.contacts offline_access`.

## OAuth state must fail closed
`/api/xero/callback` is intentionally unauthenticated and site-gate-bypassed; it trusts
only the HMAC-signed `state`. The signing secret (`SESSION_SECRET`) must have **no
default fallback** — refuse to sign/verify state if it is missing, or a predictable
secret lets an attacker forge state and complete a connection.
