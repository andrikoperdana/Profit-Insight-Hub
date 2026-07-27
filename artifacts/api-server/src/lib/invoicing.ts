import { prisma } from "@workspace/db";

/**
 * Shared invoice numbering + VAT math, used by the PDF invoice generator
 * (routes/billing-milestones.ts), the Xero invoice push (routes/xero.ts),
 * revenue recognition (routes/revenue-recognition.ts) and invoice planning
 * (routes/invoice-planning.ts) so billing stays consistent everywhere.
 *
 * splitVat itself lives in @workspace/shared so the web UI runs the exact
 * same math as the server; it is re-exported here for server-side imports.
 */
export { splitVat } from "@workspace/shared";

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
