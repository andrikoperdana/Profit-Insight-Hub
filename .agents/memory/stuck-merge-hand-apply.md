---
name: Stuck merges hand-applied on main
description: Three finished task-agent features were re-implemented directly on main after platform merges hung; late-landing merges may duplicate them.
---

On 2026-07-27 three finished task-agent branches sat >25 min at "Resolving
conflicts before applying changes…", so (with user approval) their features
were re-implemented directly on main:

1. **Mobile receipt auto-shrink** — `artifacts/mobile/lib/shrinkImage.ts`
   wired into `attachFromAsset` in the expenses screen (long edge 1600px,
   JPEG 0.7, PDFs untouched, 8MB final guard kept).
2. **Mobile expense approve/reject** — Team view of the expenses screen:
   PENDING rows get Approve/Reject, reject-reason modal, haptics,
   `canDecideExpenses` gate in `lib/roles.ts` (MGMT/SUPER_ADMIN/PM; SALES
   view-only), blanket query invalidation.
3. **Shared invoicing logic** — `api-server/src/lib/invoicing.ts`
   (`splitVat` + `nextInvoiceNumber`) now imported by billing-milestones,
   xero and revenue-recognition routes. invoice-planning.ts and
   lib/dashboard/compute.ts INTENTIONALLY keep their own copies (different
   rounding / missing non-positive guard; separate planned task).

**Why:** the platform merge queue hung; user said to install everything
directly rather than wait.

**How to apply:** if the platform later merges the original task branches
(or the still-running Xero-webhooks task), diff for duplicates: a second
splitVat/nextInvoiceNumber in routes, a second shrink helper or shrink call
in attachFromAsset, or a second approve/reject UI block in the mobile
expenses screen. Keep one copy, preferring whichever matches the invariants
above. The Xero instant-payment-updates task was still actively being worked
by its agent and was NOT re-implemented.
