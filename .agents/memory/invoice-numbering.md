---
name: Invoice numbering & generation
description: How BillingMilestone invoice numbers are allocated and why uniqueness must be enforced at the DB level
---

# Invoice numbering (BillingMilestone)

Auto-format is `INV/YYYY/MM/NNNN`, sequence derived per year/month prefix by scanning existing `BillingMilestone.invoiceNumber` and taking max+1.

`BillingMilestone.invoiceNumber` is dual-purpose: a manager can set it manually (free text) via the milestone edit dialog, OR it is auto-allocated when an invoice is generated. Generation preserves an explicitly-set number; it only auto-allocates when blank.

**Why:** scan-then-max+1 has a race — two concurrent generations in the same month can mint the same number, which is an accounting-integrity bug for a financial document.

**How to apply:** the column carries a DB `@unique` constraint. The generate-invoice handler builds the PDF + updates the milestone + archives the Document inside one transaction, wrapped in a retry loop that recomputes the number on a `P2002` clash (only when auto-allocating). Never drop the unique constraint or move number allocation outside the retrying transaction. Status eligibility (not CANCELLED) is re-checked inside the transaction to avoid stale-read races.

The generated PDF is archived as a `Document` (type INVOICE) linked via `Document.billingMilestoneId`; re-download serves that stored snapshot (409 if never generated). Company/bank issuer block lives in `invoice-config.ts` with env overrides and placeholder defaults (NPWP/bank must be set via `INVOICE_*` env vars for real invoices).
