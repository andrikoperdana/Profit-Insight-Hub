/**
 * Canonical VAT split for billing amounts — the single source of truth for
 * DPP (taxable base) / VAT / total math, shared by:
 *   - the api-server: invoice PDF generation, Xero invoice push, revenue
 *     recognition and invoice planning (re-exported via
 *     artifacts/api-server/src/lib/invoicing.ts)
 *   - the web UI: project Billing tab and project summary Billing section
 *
 * Any change here alters generated invoices AND every screen that previews
 * them, in lockstep — that is the point. Never fork a local copy again.
 */
export function splitVat(
  gross: number,
  vatPct: number,
  includesVat: boolean,
): { dpp: number; vat: number; total: number } {
  if (!isFinite(gross) || gross <= 0) return { dpp: 0, vat: 0, total: 0 };
  if (includesVat) {
    const dpp = gross / (1 + vatPct / 100);
    return { dpp, vat: gross - dpp, total: gross };
  }
  const vat = gross * (vatPct / 100);
  return { dpp: gross, vat, total: gross + vat };
}
