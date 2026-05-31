import { prisma } from "@workspace/db";

/**
 * Issuer (company) details printed on generated invoices.
 *
 * The live values are stored in the InvoiceSetting table and are editable by
 * Finance / Management from the app. The constants below are the seed defaults
 * used only when no row exists yet; each can also be pre-seeded via the matching
 * environment variable. Address lines are separated by a pipe character, e.g.
 * INVOICE_COMPANY_ADDRESS="Jl. Sudirman No. 1|Jakarta 10220".
 */
export interface InvoiceIssuer {
  companyName: string;
  brand: string;
  addressLines: string[];
  npwp: string;
  email: string;
  phone: string;
  city: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
}

export const DEFAULT_INVOICE_ISSUER: InvoiceIssuer = {
  companyName: process.env.INVOICE_COMPANY_NAME ?? "PT IT Security Asia",
  brand: process.env.INVOICE_BRAND ?? "SecureProfit Hub",
  addressLines: (process.env.INVOICE_COMPANY_ADDRESS ?? "Jakarta, Indonesia")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean),
  npwp: process.env.INVOICE_COMPANY_NPWP ?? "00.000.000.0-000.000",
  email: process.env.INVOICE_COMPANY_EMAIL ?? "finance@secureprofit.id",
  phone: process.env.INVOICE_COMPANY_PHONE ?? "",
  city: process.env.INVOICE_CITY ?? "Jakarta",
  bankName: process.env.INVOICE_BANK_NAME ?? "Bank (set in Invoice Settings)",
  bankAccountName: process.env.INVOICE_BANK_ACCOUNT_NAME ?? "PT IT Security Asia",
  bankAccountNumber:
    process.env.INVOICE_BANK_ACCOUNT_NUMBER ?? "000-000-0000 (set in Invoice Settings)",
};

export const INVOICE_SETTINGS_ID = "default";

/**
 * Resolve the issuer block for rendering an invoice. Reads the stored
 * InvoiceSetting row and falls back to DEFAULT_INVOICE_ISSUER per field when the
 * row is missing or a value is blank.
 */
export async function getInvoiceIssuer(): Promise<InvoiceIssuer> {
  const row = await prisma.invoiceSetting.findUnique({ where: { id: INVOICE_SETTINGS_ID } });
  if (!row) return DEFAULT_INVOICE_ISSUER;
  return {
    companyName: row.companyName?.trim() || DEFAULT_INVOICE_ISSUER.companyName,
    brand: row.brand?.trim() || DEFAULT_INVOICE_ISSUER.brand,
    addressLines:
      row.addressLines?.length ? row.addressLines : DEFAULT_INVOICE_ISSUER.addressLines,
    npwp: row.npwp?.trim() || DEFAULT_INVOICE_ISSUER.npwp,
    email: row.email?.trim() || DEFAULT_INVOICE_ISSUER.email,
    phone: row.phone?.trim() || DEFAULT_INVOICE_ISSUER.phone,
    city: row.city?.trim() || DEFAULT_INVOICE_ISSUER.city,
    bankName: row.bankName?.trim() || DEFAULT_INVOICE_ISSUER.bankName,
    bankAccountName: row.bankAccountName?.trim() || DEFAULT_INVOICE_ISSUER.bankAccountName,
    bankAccountNumber:
      row.bankAccountNumber?.trim() || DEFAULT_INVOICE_ISSUER.bankAccountNumber,
  };
}
