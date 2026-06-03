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

## OAuth state must fail closed
`/api/xero/callback` is intentionally unauthenticated and site-gate-bypassed; it trusts
only the HMAC-signed `state`. The signing secret (`SESSION_SECRET`) must have **no
default fallback** — refuse to sign/verify state if it is missing, or a predictable
secret lets an attacker forge state and complete a connection.
