// Shared helpers for the BOD document builders (overview + supplement).

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SCREENS = path.resolve("docs/bod-assets/screens");
const DIAGRAMS = path.resolve("docs/bod-assets/diagrams");

export function pngSize(buf) {
  // PNG IHDR: width @16..20, height @20..24 (big-endian)
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

export const MAX_W = 600; // px at 96dpi ≈ 6.25in usable width
export const MAX_H = 780; // keep tall full-page captures on one page

export function img(file, { fromDiagrams = false, maxW = MAX_W, maxH = MAX_H } = {}) {
  const p = path.join(fromDiagrams ? DIAGRAMS : SCREENS, file);
  const buf = readFileSync(p);
  const { w, h } = pngSize(buf);
  let outW = maxW;
  let outH = Math.round((h / w) * outW);
  if (outH > maxH) {
    outH = maxH;
    outW = Math.round((w / h) * outH);
  }
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 40 },
    children: [
      new ImageRun({ type: "png", data: buf, transformation: { width: outW, height: outH } }),
    ],
  });
}

export function caption(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text, italics: true, size: 18, color: "64748B" })],
  });
}

export function h1(text, { pageBreak = true } = {}) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: pageBreak,
    spacing: { before: 240, after: 160 },
    children: [new TextRun({ text })],
  });
}

export function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text })],
  });
}

export function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 100 },
    children: [new TextRun({ text })],
  });
}

export function p(text, opts = {}) {
  const runs = Array.isArray(text) ? text : [new TextRun({ text })];
  return new Paragraph({
    spacing: { after: 140, line: 300 },
    alignment: AlignmentType.JUSTIFIED,
    children: runs,
    ...opts,
  });
}

export function b(text) {
  return new TextRun({ text, bold: true });
}
export function t(text) {
  return new TextRun({ text });
}

export function bullets(items) {
  return items.map(
    (item) =>
      new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 80, line: 280 },
        children: Array.isArray(item) ? item : [new TextRun({ text: item })],
      }),
  );
}

const CELL_MARGIN = { top: 80, bottom: 80, left: 120, right: 120 };
const THIN = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };
const CELL_BORDERS = { top: THIN, bottom: THIN, left: THIN, right: THIN };

export function headerCell(text, widthPct) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: "0F172A" },
    margins: CELL_MARGIN,
    borders: CELL_BORDERS,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 20 })],
      }),
    ],
  });
}

export function cell(content, widthPct, { bold = false, fill } = {}) {
  const items = Array.isArray(content) ? content : [content];
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    margins: CELL_MARGIN,
    borders: CELL_BORDERS,
    shading: fill ? { type: ShadingType.CLEAR, fill } : undefined,
    children: items.map(
      (line) =>
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: line, bold, size: 20 })],
        }),
    ),
  });
}

export function table(headers, rows, widths) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((hd, i) => headerCell(hd, widths[i])),
      }),
      ...rows.map(
        (r, ri) =>
          new TableRow({
            children: r.map((c, i) =>
              cell(c, widths[i], { bold: i === 0, fill: ri % 2 === 1 ? "F8FAFC" : undefined }),
            ),
          }),
      ),
    ],
  });
}

export function spacer() {
  return new Paragraph({ spacing: { after: 200 }, children: [] });
}

export function cover({ subtitle, date = "July 2026" }) {
  return [
    new Paragraph({ spacing: { before: 2400 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "SecureProfit Hub", bold: true, size: 72, color: "0F172A" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
      children: [
        new TextRun({
          text: "Professional Services Automation Platform",
          size: 32,
          color: "B91C1C",
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
      children: [new TextRun({ text: subtitle, size: 28, color: "334155" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 300 },
      children: [new TextRun({ text: date, size: 24, color: "64748B" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 3000 },
      children: [
        new TextRun({
          text: "All screenshots in this document are taken from the live system populated with demonstration data.",
          italics: true,
          size: 20,
          color: "94A3B8",
        }),
      ],
    }),
  ];
}

export async function writeDocx({ children, outPath, title, description, headerText }) {
  const doc = new Document({
    creator: "SecureProfit Hub",
    title,
    description,
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22, color: "1E293B" } },
        heading1: {
          run: { font: "Calibri", size: 36, bold: true, color: "0F172A" },
          paragraph: { spacing: { before: 240, after: 160 } },
        },
        heading2: {
          run: { font: "Calibri", size: 28, bold: true, color: "B91C1C" },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        heading3: {
          run: { font: "Calibri", size: 24, bold: true, color: "334155" },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 }, // 2cm
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: headerText, size: 16, color: "94A3B8" })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "94A3B8" }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  writeFileSync(outPath, buf);
  console.log(`written: ${outPath} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
}
