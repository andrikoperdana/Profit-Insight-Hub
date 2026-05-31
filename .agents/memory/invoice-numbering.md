---
name: Invoice numbering & generation
description: How BillingMilestone invoice numbers are allocated and why uniqueness must be enforced at the DB level
---

# Invoice numbering (BillingMilestone)

Auto-format is `INV/YYYY/MM/NNNN`, sequence derived per year/month prefix by scanning existing `BillingMilestone.invoiceNumber` and taking max+1.

`BillingMilestone.invoiceNumber` is dual-purpose: a manager can set it manually (free text) via the milestone edit dialog, OR it is auto-allocated when an invoice is generated. Generation preserves an explicitly-set number; it only auto-allocates when blank.

**Why:** scan-then-max+1 has a race — two concurrent generations in the same month can mint the same number, which is an accounting-integrity bug for a financial document.

**How to apply:** the column carries a DB `@unique` constraint. The generate-invoice handler builds the PDF + updates the milestone + archives the Document inside one transaction, wrapped in a retry loop that recomputes the number on a `P2002` clash (only when auto-allocating). Never drop the unique constraint or move number allocation outside the retrying transaction. Status eligibility (not CANCELLED) is re-checked inside the transaction to avoid stale-read races.

The generated PDF is archived as a `Document` (type INVOICE) linked via `Document.billingMilestoneId`; re-download serves that stored snapshot (409 if never generated).

The company/bank issuer block is now a single-row `InvoiceSetting` table (id="default"), editable in-app by FINANCE/MANAGEMENT at `/invoice-settings`. `getInvoiceIssuer()` reads that row and falls back per-field to `DEFAULT_INVOICE_ISSUER` (env-overridable) when blank/missing. `buildInvoicePdf` takes the resolved issuer via `data.issuer` (not a direct import), so already-archived PDFs keep their original details and only newly generated ones reflect edits. Seed `ensureInvoiceSetting()` is non-clobbering (early-returns if the row exists) so in-app edits survive reseeds.
