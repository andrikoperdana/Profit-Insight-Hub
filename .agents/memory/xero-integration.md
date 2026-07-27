---
name: Xero accounting integration
description: Durable correctness/security rules for the Xero (OAuth2 + Accounting API) integration — invoice push idempotency, payment-paid detection, two-way amount snapshot, OAuth state.
---

# Xero integration rules

Mostly-push integration (manual SDK-less REST): push BillingMilestones → ACCREC sales
invoices, sync Clients → Xero Contacts, and pull a read-only financial snapshot back
(payment status, outstanding/paid/credited amounts, invoice-number edits).
Single tenant, singleton `XeroConnection` row. 30-min poller + manual triggers.

## Pull-back snapshot reuses /Invoices, no extra scope or CreditNotes endpoint
The amounts pulled back onto BillingMilestone (`xeroAmountDue/Paid/Credited`,
`xeroSyncedAt`) all come from the SAME `GET /Invoices?IDs=` call already used for PAID
detection: invoice total = `AmountDue + AmountPaid + AmountCredited`, so credit notes
are read via the invoice's `AmountCredited` — no separate `/CreditNotes` call and no
new scope beyond `accounting.invoices`. `runPaymentSync` persists this snapshot for
every polled milestone (not just fully-paid ones) and updates `xeroInvoiceNumber` when
Xero staff edited it after issue.
**Why:** treating credit notes as a separate feature would have added scope + endpoint
churn for data already present on the invoice payload.

## Poller scope must include recently-PAID rows, or the snapshot freezes
`runPaymentSync` polls `INVOICED`/`PLANNED` **plus** `PAID` rows whose `paidAt` is
within a 180-day lookback. PAID is terminal, so without the lookback branch a
milestone's invoice-number edits and post-payment credit notes would never refresh
again. Already-PAID rows only get their snapshot refreshed — never re-stamp `paidAt`
or re-flip status (guard `st.fullyPaid && m.status !== "PAID"`).
**Why:** invoice-number corrections and credit notes commonly land AFTER payment.
**How to apply:** the manual "Sync from Xero" button is gated to MANAGEMENT/FINANCE
to match the `POST /xero/sync-payments` ADMIN_ROLES allowlist — the broader
`canPushXero` (incl. PM-of-project) is for the per-row PUSH action, not the pull; do
not reuse it for the sync button or PMs hit 403.

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

## Only running-or-later projects may be invoiced
Invoicing actions (Xero push, generate-invoice PDF, manual PATCH milestone ->
INVOICED/PAID) are gated by `canInvoiceProjectStatus()` — an **allowlist** of
ACTIVE/PAUSE/COMPLETE/CLOSED; blocked for DRAFT/OBSERVATION/NO_NEED_CONSULTANT.
**Why:** a project still in OBSERVATION hasn't started, so issuing invoices for it
is wrong. Allowlist (fail-closed) so a future early-stage status is blocked by
default. The helper is **mirrored** in `api-server/src/lib/roles.ts` and
`web/src/lib/roles.ts` (artifacts can't import each other) — change both together.
**Deliberately NOT guarded:** `runPaymentSync()` (Xero → mark PAID). A milestone can
only carry a `xeroInvoiceId` if it already passed the push guard, and payment sync
must reflect the real-world fact that an already-issued invoice was paid in Xero —
gating it on current project status would desync the app from Xero.

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

## Push invoices tax-INCLUSIVE (gross), never exclusive (DPP)
Send `LineAmountTypes: "Inclusive"` with UnitAmount = the gross milestone total
(`splitVat().total`) and let Xero back-compute DPP + VAT from the matched TaxType. Do NOT
send an explicit `TaxAmount`, and do NOT send tax-EXCLUSIVE DPP. **Why:** exclusive DPP +
Xero-computed tax drifts the invoice total 0.01 below the milestone total (e.g.
71,999,999.99 vs 72,000,000 at 11%); an explicit TaxAmount risks a rounding-mismatch
validation rejection. Inclusive gross makes the invoice total equal the milestone total to
the cent for both VAT-inclusive and VAT-exclusive contracts.

## App wraps every Xero failure as 502 — surface ValidationErrors
The push route returns 502 on any Xero error, so a 400 ValidationException shows as "HTTP
502" in the UI. Parse `Elements[].ValidationErrors` (and `LineItems[].ValidationErrors`)
into the error detail and pass it through, or the real reason is invisible. Note the failed
push leaves the milestone with a reserved invoiceNumber + INVOICED status but null
xeroInvoiceId; retry is safe (number reused, status preserved, guard is on xeroInvoiceId).

## Token refresh must serialize ACROSS instances, not just in-process
Xero rotates the refresh token on every refresh, so two parallel refreshes
invalidate each other. A per-process `refreshInFlight` promise only dedupes
within one instance; under autoscale two instances can still refresh at once.
- Serialize cross-instance with a **transaction-level** advisory lock
  (`pg_advisory_xact_lock`) inside `prisma.$transaction`, then RE-READ the
  connection under the lock and skip the HTTP refresh if another refresher
  already rotated the token. Use a transaction (xact) lock, NOT session-level
  `pg_advisory_lock`/`unlock` in separate `$queryRaw` calls — Prisma's pool can
  run lock and unlock on different connections, so a session lock may never
  release. The xact lock is connection-pinned and auto-releases on commit.
- The refresh holds the lock across an external HTTP call, so **bound the HTTP
  call** (AbortController timeout, e.g. 12s) safely under the transaction
  `timeout` (e.g. 20s); a hung Xero endpoint then aborts cleanly instead of
  stalling the open transaction toward its timeout.
**Why:** parallel token rotation desyncs the stored refresh token and breaks all
later Xero calls until a manual reconnect.
- Call `pg_advisory_xact_lock` via `tx.$executeRaw`, NOT `tx.$queryRaw`. The lock
  function returns `void`, and Prisma's `$queryRaw` tries to deserialize a result
  set — a `void` column fails deserialization and drops the connection (this surfaced
  as a repeating ~30-min poller error that leaked pool connections). `$executeRaw`
  expects no rows and is correct for advisory-lock calls.

## Background payment poller is gated behind an AppSetting, default OFF
The 30-min `runPaymentSync` poller only runs when `getAppSettings().xeroAutoSyncEnabled`
is true (`AppSetting.xeroAutoSyncEnabled Boolean @default(false)`, toggled in Settings →
Business Rules, MANAGEMENT-only). **Why:** the poll added steady background DB/HTTP load
(and, while the $queryRaw bug existed, recurring connection drops) that the org didn't
always want; manual "Sync from Xero" still works regardless. **How to apply:** never
re-enable the poll unconditionally; keep the default OFF. The PUT `/api/app-settings`
validator treats `xeroAutoSyncEnabled` as OPTIONAL (preserve stored value when omitted) so
a stale client sending the old payload shape doesn't 400 or silently reset it.

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

## Redirect URI is server-config-only; tokens encrypted at rest
- `redirectUri()` must NEVER be derived from request headers (Host /
  X-Forwarded-Host/Proto are attacker-controllable → OAuth redirect_uri
  poisoning). Resolve from XERO_REDIRECT_URI → APP_BASE_URL →
  REPLIT_DOMAINS → REPLIT_DEV_DOMAIN and refuse to proceed when none is set.
- XeroConnection access/refresh tokens are AES-256-GCM encrypted at the app
  layer (`tokenCrypto.ts`, `enc:v1:` prefix; key = HKDF of XERO_TOKEN_ENC_KEY
  or SESSION_SECRET). Legacy plaintext rows decrypt as passthrough and get
  re-encrypted on the next refresh. Any new code reading/writing these columns
  must go through encryptToken/decryptToken.
