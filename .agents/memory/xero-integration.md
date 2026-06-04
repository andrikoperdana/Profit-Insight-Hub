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

## App binds to ONE org; switching orgs needs soft-disconnect + stale-id cleanup
`completeConnection` auto-picks the first ORGANISATION tenant from `/connections`
(`find(ORGANISATION) ?? tenants[0]`) and stores its `tenantId`; every API call sends
that stored `Xero-tenant-id`. If the user authorizes the wrong org (e.g. a "Personal"
/ demo org instead of their real company) the sync *succeeds* but contacts/invoices
land in the wrong org — looks like a silent failure but is an org mismatch (confirm
via `XeroConnection.tenantName`).
**To recover by switching orgs:** stored `Client.xeroContactId` / `BillingMilestone.
xeroInvoiceId` belong to the OLD org and are invalid in the new one, and the UI only
shows the sync button when the id is null — so they must be cleared on org change.
`disconnect()` is therefore a **soft delete** (stamps `disconnectedAt`, keeps the row)
so `completeConnection` can compare the previous `tenantId` to the newly connected one
and, only when they differ, clear those ids in the SAME `$transaction` as the upsert.
Same-org reconnect must KEEP the ids (re-creating a contact with a duplicate Name hits
Xero's unique-name error). `getConnectionInfo`/`getValidAccessToken` must treat a
`disconnectedAt`-stamped row as not connected.
**Why:** hard-deleting on disconnect loses the org memory, so the disconnect→connect
path (the only reconnect UX) couldn't detect the switch and left stale ids.

## Invoice line items need AccountCode + TaxType (and the scope to discover them)
AUTHORISED ACCREC invoices fail Xero 400 ValidationException ("Account code or ID must be
specified" + "The TaxType field is mandatory") unless every LineItem carries a revenue
`AccountCode` and a `TaxType`. Reading `/Accounts` and `/TaxRates` to discover valid values
requires the `accounting.settings.read` scope — `accounting.invoices`/`contacts` alone give
401 on those endpoints. **Why:** the minimal-scope push omitted both fields and both scopes.
**How to apply:** keep `accounting.settings.read` in SCOPES; discover a revenue account
(prefer code 200 / SALES type) and a tax type whose EffectiveRate matches the project VAT,
cache per-tenant, allow env overrides. Adding a scope needs the user to disconnect+reconnect
(re-consent) before discovery works.

## Don't send an explicit TaxAmount alongside a TaxType
Let Xero compute the tax from the matched TaxType (rate == project VAT). Sending both an
explicit `TaxAmount` and a `TaxType` risks a 0.01 rounding-mismatch validation rejection.
Tax-exclusive UnitAmount=DPP + an N% TaxType yields gross = DPP×(1+N%) which still equals
the milestone total for both VAT-inclusive and VAT-exclusive contracts.

## App wraps every Xero failure as 502 — surface ValidationErrors
The push route returns 502 on any Xero error, so a 400 ValidationException shows as "HTTP
502" in the UI. Parse `Elements[].ValidationErrors` (and `LineItems[].ValidationErrors`)
into the error detail and pass it through, or the real reason is invisible. Note the failed
push leaves the milestone with a reserved invoiceNumber + INVOICED status but null
xeroInvoiceId; retry is safe (number reused, status preserved, guard is on xeroInvoiceId).

## OAuth state must fail closed
`/api/xero/callback` is intentionally unauthenticated and site-gate-bypassed; it trusts
only the HMAC-signed `state`. The signing secret (`SESSION_SECRET`) must have **no
default fallback** — refuse to sign/verify state if it is missing, or a predictable
secret lets an attacker forge state and complete a connection.

## Callback must be mounted BEFORE blanket-auth sub-routers
The unauthenticated OAuth callback returned `{"error":"Unauthorized"}` (a 401, NOT the
site-gate's `site_gate_required`) even though the callback route itself omits requireAuth.
**Why:** most sub-routers (users, clients, projects, ...) apply auth via a top-level
`router.use(requireAuth)` and are mounted with `router.use(subRouter)` (no path prefix).
A request that matches no route falls through every router in order; the Xero router was
mounted LAST, so the no-Bearer callback hit the first blanket-auth router (users) and got
401 before reaching the callback handler. The app-level site gate bypasses the callback,
but in-router blanket auth does not. **How to apply:** any unauthenticated route (OAuth
callbacks, webhooks) must be mounted in the router chain *before* the first sub-router that
has a top-level `router.use(requireAuth/requireRole)` — or those routers must not use
blanket auth (see the express-sub-router gotcha in replit.md).
