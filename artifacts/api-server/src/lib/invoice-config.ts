/**
 * Issuer (company) details printed on generated invoices.
 *
 * These are placeholders for Phase 1. Override any value without a code change
 * by setting the matching environment variable. Address lines are separated by
 * a pipe character, e.g. INVOICE_COMPANY_ADDRESS="Jl. Sudirman No. 1|Jakarta 10220".
 */
export const INVOICE_ISSUER = {
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
  bankName: process.env.INVOICE_BANK_NAME ?? "Bank (set INVOICE_BANK_NAME)",
  bankAccountName: process.env.INVOICE_BANK_ACCOUNT_NAME ?? "PT IT Security Asia",
  bankAccountNumber:
    process.env.INVOICE_BANK_ACCOUNT_NUMBER ?? "000-000-0000 (set INVOICE_BANK_ACCOUNT_NUMBER)",
} as const;
