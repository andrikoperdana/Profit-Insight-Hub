import * as XLSX from "xlsx";

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
