import { format } from "date-fns";
import { id } from "date-fns/locale";

export function formatIDR(n: number | undefined | null): string {
  if (n == null) return "Rp 0";
  return "Rp " + Math.round(n).toLocaleString("id-ID");
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
