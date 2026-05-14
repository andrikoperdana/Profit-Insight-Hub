import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { ColumnSpec, ReportDefinition, ReportResult } from "./types.js";

function fmt(value: unknown, col: ColumnSpec): string {
  if (value === null || value === undefined || value === "") return "";
  switch (col.type) {
    case "currency": {
      const n = Number(value) || 0;
      return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
    }
    case "percent": {
      const n = Number(value) || 0;
      return `${n.toFixed(col.fixed ?? 1)}%`;
    }
    case "number": {
      const n = Number(value) || 0;
      return col.fixed !== undefined ? n.toFixed(col.fixed) : String(n);
    }
    case "date": {
      const d = new Date(String(value));
      if (isNaN(d.getTime())) return String(value);
      return d.toISOString().slice(0, 10);
    }
    case "month": {
      // value: "YYYY-MM"
      return String(value);
    }
    default:
      return String(value);
  }
}

function neutralizeFormula(s: string): string {
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) return "'" + s;
  return s;
}

function escapeCsv(s: string): string {
  const safe = neutralizeFormula(s);
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function exportCsv(def: ReportDefinition, result: ReportResult): string {
  const headers = def.columns.map((c) => escapeCsv(c.label));
  const lines = [headers.join(",")];
  for (const row of result.rows) {
    const cells = def.columns.map((c) => escapeCsv(fmt(row[c.key], c)));
    lines.push(cells.join(","));
  }
  if (result.totals) {
    const cells = def.columns.map((c, i) =>
      escapeCsv(i === 0 ? "TOTAL" : c.total ? fmt(result.totals![c.key], c) : ""),
    );
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

export async function exportXlsx(def: ReportDefinition, result: ReportResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SecureProfit Hub";
  wb.created = new Date();
  const ws = wb.addWorksheet(def.name.slice(0, 30));
  ws.columns = def.columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: c.width ? Math.min(c.width / 7, 40) : 18,
  }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  for (const row of result.rows) {
    const r: Record<string, unknown> = {};
    for (const c of def.columns) {
      const v = row[c.key];
      if (c.type === "currency" || c.type === "number" || c.type === "percent") {
        r[c.key] = v === null || v === undefined ? null : Number(v);
      } else if (c.type === "date") {
        r[c.key] = v ? new Date(String(v)) : null;
      } else {
        const s = v === null || v === undefined ? "" : String(v);
        r[c.key] = neutralizeFormula(s);
      }
    }
    const added = ws.addRow(r);
    for (const c of def.columns) {
      const cell = added.getCell(c.key);
      if (c.type === "currency") cell.numFmt = '"Rp"#,##0;[Red]-"Rp"#,##0';
      else if (c.type === "percent") cell.numFmt = `0.${"0".repeat(c.fixed ?? 1)}"%"`;
      else if (c.type === "number") cell.numFmt = c.fixed ? `0.${"0".repeat(c.fixed)}` : "0";
      else if (c.type === "date") cell.numFmt = "yyyy-mm-dd";
    }
  }
  if (result.totals) {
    const r: Record<string, unknown> = {};
    for (const c of def.columns) {
      const v = result.totals[c.key];
      r[c.key] = v === null || v === undefined ? null : (c.type === "currency" || c.type === "number" || c.type === "percent" ? Number(v) : v);
    }
    const added = ws.addRow({ ...r, [def.columns[0]!.key]: "TOTAL" });
    added.font = { bold: true };
    added.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  }
  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr as ArrayBuffer);
}

export function exportPdf(def: ReportDefinition, result: ReportResult): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 32 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).fillColor("#0f172a").text(def.name, { align: "left" });
    doc.fontSize(9).fillColor("#64748b").text(def.description, { align: "left" });
    doc.moveDown(0.4);
    doc.fontSize(8).fillColor("#94a3b8").text(`Generated: ${new Date().toLocaleString("id-ID")}`, { align: "left" });
    doc.moveDown(0.6);

    const startX = doc.page.margins.left;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const totalWeight = def.columns.reduce((s, c) => s + (c.width ?? 100), 0);
    const colWidths = def.columns.map((c) => ((c.width ?? 100) / totalWeight) * usableWidth);

    let y = doc.y;
    const rowHeight = 18;
    const headerHeight = 22;

    // Header
    doc.rect(startX, y, usableWidth, headerHeight).fill("#0f172a");
    doc.fillColor("#ffffff").fontSize(8);
    let x = startX;
    def.columns.forEach((c, i) => {
      doc.text(c.label, x + 4, y + 7, { width: colWidths[i]! - 8, align: c.align ?? "left", lineBreak: false });
      x += colWidths[i]!;
    });
    y += headerHeight;

    const drawRow = (row: Record<string, unknown>, isTotal = false) => {
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      if (isTotal) {
        doc.rect(startX, y, usableWidth, rowHeight).fill("#e2e8f0");
        doc.fillColor("#0f172a").font("Helvetica-Bold");
      } else {
        doc.fillColor("#1e293b").font("Helvetica");
      }
      doc.fontSize(8);
      let xx = startX;
      def.columns.forEach((c, i) => {
        const value = isTotal && i === 0 ? "TOTAL" : (isTotal && !c.total) ? "" : fmt(row[c.key], c);
        doc.text(value, xx + 4, y + 5, { width: colWidths[i]! - 8, align: c.align ?? "left", lineBreak: false, ellipsis: true });
        xx += colWidths[i]!;
      });
      doc.strokeColor("#e2e8f0").lineWidth(0.5).moveTo(startX, y + rowHeight).lineTo(startX + usableWidth, y + rowHeight).stroke();
      y += rowHeight;
    };

    for (const row of result.rows) drawRow(row);
    if (result.totals) drawRow(result.totals, true);

    doc.end();
  });
}
