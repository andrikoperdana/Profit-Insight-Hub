import { prisma } from "@workspace/db";

/**
 * Shared invoice math + numbering, used by the PDF invoice generator
 * (routes/billing-milestones.ts), the Xero invoice push (routes/xero.ts) and
 * revenue recognition (routes/revenue-recognition.ts) so billing stays
 * consistent everywhere.
 *
 * NOTE: routes/invoice-planning.ts intentionally still has its own splitVat
 * copy — it rounds differently, and reconciling the two is a separate planned
 * task. Don't point it here without aligning that behavior first.
 */

/** Split a gross amount into DPP (taxable base), VAT and total. */
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

/**
 * Allocate the next sequential invoice number for the given date in the format
 * INV/YYYY/MM/NNNN. The sequence is derived from existing BillingMilestone
 * invoiceNumbers sharing the same year/month prefix.
 *
 * This is a scan-then-increment, so callers MUST write the returned number
 * under the BillingMilestone.invoiceNumber unique constraint and retry on
 * P2002 (see the retry loops in routes/billing-milestones.ts and
 * routes/xero.ts) — never assume the returned value is still free.
 */
export async function nextInvoiceNumber(date: Date): Promise<string> {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const prefix = `INV/${year}/${month}/`;
  const existing = await prisma.billingMilestone.findMany({
    where: { invoiceNumber: { startsWith: prefix } },
    select: { invoiceNumber: true },
  });
  let max = 0;
  for (const row of existing) {
    const suffix = row.invoiceNumber?.slice(prefix.length) ?? "";
    const n = parseInt(suffix, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}
