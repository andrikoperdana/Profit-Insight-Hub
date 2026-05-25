import { format } from "date-fns";
import { id } from "date-fns/locale";

export function formatIDR(n: number | undefined | null): string {
  if (n == null) return "Rp 0";
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

const CURRENCY_PREFIXES: Record<string, string> = {
  IDR: "Rp",
  USD: "US$",
  SGD: "S$",
  EUR: "€",
  AUD: "A$",
  JPY: "¥",
  MYR: "RM",
  GBP: "£",
};

export const SUPPORTED_CURRENCIES = ["IDR", "USD", "SGD", "EUR", "AUD", "JPY", "MYR", "GBP"];

export function formatMoney(
  n: number | undefined | null,
  currency: string | undefined | null = "IDR",
  options?: { decimals?: number }
): string {
  const code = (currency || "IDR").toUpperCase();
  const prefix = CURRENCY_PREFIXES[code] ?? code + " ";
  if (n == null) return `${prefix} 0`;
  const decimals = options?.decimals ?? (code === "IDR" || code === "JPY" ? 0 : 2);
  const value = decimals === 0 ? Math.round(n) : Number(n.toFixed(decimals));
  return `${prefix} ${value.toLocaleString("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function formatPct(n: number | undefined | null): string {
  if (n == null) return "0.0%";
  return n.toFixed(1) + "%";
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd MMM yyyy", { locale: id });
  } catch (e) {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string | undefined | null): string {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd MMM yyyy HH:mm", { locale: id });
  } catch (e) {
    return dateStr;
  }
}
