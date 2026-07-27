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

Later the same day the user asked for the fourth queued feature too, without
waiting for its agent:

4. **Xero webhook for instant paid-invoice updates** — POST /api/xero/webhook
   (raw-body express.raw mount before express.json in app.ts + site-gate
   bypass), HMAC-SHA256 base64 signature check against XERO_WEBHOOK_KEY
   (fail closed), empty 200/401 per Xero intent-to-receive, post-ack async
   processing via runPaymentSyncFor(ids) with the SAME status-eligibility
   scope as the poll (never resurrects CANCELLED), global replay rate limit,
   30-min poll kept as backstop.

**How to apply:** if the platform later merges the original task branches,
diff for duplicates: a second splitVat/nextInvoiceNumber in routes, a second
shrink helper or shrink call in attachFromAsset, a second approve/reject UI
block in the mobile expenses screen, or a second Xero webhook route/raw-body
mount. Keep one copy, preferring whichever matches the invariants above.
