import * as XLSX from "@e965/xlsx";

export async function downloadAuthed(url: string, filename: string): Promise<void> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const text = await res.text();
      msg = `${msg} ${text.slice(0, 200)}`;
    } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export function exportSheets(
  fileName: string,
  sheets: { name: string; rows: any[] }[],
) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows ?? []);
    const safeName = s.name.replace(/[\\/?*:[\]]/g, "-").slice(0, 31) || "Sheet";
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${fileName}-${stamp}.xlsx`);
}

// CSV utilities --------------------------------------------------------------

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) {
    s = isNaN(value.getTime()) ? "" : value.toISOString();
  } else if (typeof value === "object") {
    try {
      s = JSON.stringify(value);
    } catch {
      s = String(value);
    }
  } else {
    s = String(value);
  }
  // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR).
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Download an array of plain row objects as a CSV file.
 * Headers are derived from the first row's keys (preserves insertion order)
 * unless `headers` is supplied explicitly.
 *
 * UTF-8 BOM is prepended so Excel opens Indonesian text correctly.
 * Filename is auto-suffixed with the current YYYY-MM-DD date.
 */
export function exportCsv<T extends Record<string, unknown>>(
  fileName: string,
  rows: T[],
  headers?: (keyof T & string)[],
): void {
  const cols: string[] =
    headers ?? (rows.length > 0 ? Object.keys(rows[0]) : []);
  const headerLine = cols.map(csvEscape).join(",");
  const dataLines = rows.map((row) =>
    cols.map((c) => csvEscape((row as Record<string, unknown>)[c])).join(","),
  );
  const csv = [headerLine, ...dataLines].join("\r\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${fileName}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
