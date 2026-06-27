import type { Response } from "express";
import PDFDocument from "pdfkit";
import { GenerateExecutiveBriefingResponse } from "@workspace/api-zod";
import type { ExecutiveCopilotFacts } from "./executive-copilot.js";

// Professional PDF export of the AI Executive Copilot briefing. All figures are
// rendered from the deterministic `facts` (the single source of truth); the AI
// prose is used only as narrative. Branding mirrors the existing survey/report
// PDFs (dark slate header, green accent). English-only, no emojis.

type BriefingNarrative = ReturnType<
  typeof GenerateExecutiveBriefingResponse.shape.briefing.parse
>;

export interface ExecutiveBriefingPdfData {
  generatedAt: string;
  model: string;
  stale: boolean;
  facts: ExecutiveCopilotFacts;
  briefing: BriefingNarrative;
}

const MARGIN = 60;
const INK = "#0f172a";
const ACCENT = "#22c55e";
const MUTED = "#64748b";
const BODY = "#334155";

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - MARGIN * 2;
}

function formatIDR(n: number | null | undefined): string {
  const rounded = Math.round(n ?? 0);
  const sign = rounded < 0 ? "-" : "";
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `Rp ${sign}${digits}`;
}

function formatPct(n: number | null | undefined): string {
  if (n == null) return "0.0%";
  return `${n.toFixed(1)}%`;
}

function labelColor(label: string): string {
  switch (label) {
    case "HEALTHY":
      return "#16a34a";
    case "AT_RISK":
      return "#d97706";
    default:
      return "#dc2626";
  }
}

function priorityColor(priority: string): string {
  switch (priority.toUpperCase()) {
    case "HIGH":
      return "#dc2626";
    case "MEDIUM":
      return "#d97706";
    default:
      return "#16a34a";
  }
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - MARGIN) {
    doc.addPage();
  }
}

function header(doc: PDFKit.PDFDocument, subtitle: string): void {
  doc.save();
  doc.rect(0, 0, doc.page.width, 90).fillColor(INK).fill();
  doc.restore();
  doc.save();
  doc.rect(0, 90, doc.page.width, 3).fillColor(ACCENT).fill();
  doc.restore();
  doc
    .fillColor(ACCENT)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("SecureProfit Hub", MARGIN, 26);
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(20)
    .text("AI Executive Briefing", MARGIN, 46);
  doc
    .fillColor("#cbd5e1")
    .font("Helvetica")
    .fontSize(9.5)
    .text(subtitle, MARGIN, 72);
  doc.x = MARGIN;
  doc.y = 112;
}

function sectionHeading(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 44);
  doc.moveDown(0.5);
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(12.5)
    .text(text, MARGIN, doc.y);
  const y = doc.y + 2;
  doc.save();
  doc.rect(MARGIN, y, contentWidth(doc), 1.5).fillColor(ACCENT).fill();
  doc.restore();
  doc.moveDown(0.7);
}

function paragraph(doc: PDFKit.PDFDocument, text: string): void {
  const value = (text ?? "").trim();
  if (!value) return;
  ensureSpace(doc, 28);
  doc
    .fillColor(BODY)
    .font("Helvetica")
    .fontSize(9.5)
    .text(value, MARGIN, doc.y, { width: contentWidth(doc), lineGap: 2 });
  doc.moveDown(0.4);
}

interface Metric {
  label: string;
  value: string;
  color?: string;
}

function metricStrip(
  doc: PDFKit.PDFDocument,
  metrics: Metric[],
  cols: number,
): void {
  const cw = contentWidth(doc);
  const colW = cw / cols;
  const rows = Math.ceil(metrics.length / cols);
  let idx = 0;
  for (let r = 0; r < rows; r += 1) {
    ensureSpace(doc, 36);
    const top = doc.y;
    for (let c = 0; c < cols && idx < metrics.length; c += 1, idx += 1) {
      const m = metrics[idx];
      const x = MARGIN + c * colW;
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(7.5)
        .text(m.label.toUpperCase(), x, top, {
          width: colW - 8,
          lineBreak: false,
          ellipsis: true,
        });
      doc
        .fillColor(m.color ?? INK)
        .font("Helvetica-Bold")
        .fontSize(11.5)
        .text(m.value, x, top + 11, {
          width: colW - 8,
          lineBreak: false,
          ellipsis: true,
        });
    }
    doc.x = MARGIN;
    doc.y = top + 34;
  }
}

function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  colW: number[],
  emptyText: string,
): void {
  const left = MARGIN;
  const rowH = 20;
  const totalW = colW.reduce((a, b) => a + b, 0);

  const renderRow = (
    cells: string[],
    opts: { head?: boolean; alt?: boolean } = {},
  ) => {
    ensureSpace(doc, rowH);
    const y = doc.y;
    if (opts.head) {
      doc.save();
      doc.rect(left, y, totalW, rowH).fillColor(INK).fill();
      doc.restore();
      doc.fillColor("#e2e8f0").font("Helvetica-Bold").fontSize(8.5);
    } else {
      if (opts.alt) {
        doc.save();
        doc.rect(left, y, totalW, rowH).fillColor("#f8fafc").fill();
        doc.restore();
      }
      doc.fillColor("#1f2937").font("Helvetica").fontSize(8.5);
    }
    let x = left + 6;
    for (let i = 0; i < cells.length; i += 1) {
      doc.text(cells[i], x, y + 6, {
        width: colW[i] - 12,
        lineBreak: false,
        ellipsis: true,
      });
      x += colW[i];
    }
    doc.x = left;
    doc.y = y + rowH;
  };

  renderRow(headers, { head: true });
  if (rows.length === 0) {
    ensureSpace(doc, 22);
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor(MUTED)
      .text(emptyText, left + 6, doc.y + 4);
    doc.x = left;
    doc.moveDown(0.6);
    return;
  }
  rows.forEach((r, i) => renderRow(r, { alt: i % 2 === 1 }));
  doc.moveDown(0.4);
}

function healthHero(
  doc: PDFKit.PDFDocument,
  score: number,
  label: string,
  headline: string,
): void {
  const cw = contentWidth(doc);
  const boxH = 74;
  const top = doc.y;
  const color = labelColor(label);
  doc.save();
  doc.roundedRect(MARGIN, top, cw, boxH, 8).fillColor("#f1f5f9").fill();
  doc.restore();

  doc
    .fillColor(color)
    .font("Helvetica-Bold")
    .fontSize(36)
    .text(String(score), MARGIN + 20, top + 12, { width: 96, lineBreak: false });
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(7.5)
    .text("/ 100  PORTFOLIO HEALTH", MARGIN + 20, top + 54, {
      width: 130,
      lineBreak: false,
    });

  const rightX = MARGIN + 150;
  const rightW = cw - 170;
  doc
    .fillColor(color)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(label.replace("_", " "), rightX, top + 14, {
      width: rightW,
      lineBreak: false,
    });
  doc
    .fillColor(INK)
    .font("Helvetica")
    .fontSize(10)
    .text(headline ?? "", rightX, top + 32, { width: rightW, lineGap: 1 });

  doc.x = MARGIN;
  doc.y = top + boxH + 12;
}

function buildBriefing(
  doc: PDFKit.PDFDocument,
  data: ExecutiveBriefingPdfData,
): void {
  const { facts, briefing } = data;
  const p = facts.portfolio;

  const gen = new Date(data.generatedAt);
  const genStr = `${gen.toISOString().slice(0, 10)} ${gen
    .toISOString()
    .slice(11, 16)} UTC`;

  header(doc, `Portfolio briefing - generated ${genStr}`);

  // Meta line
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      `Model ${data.model}${data.stale ? "  -  Stale (regenerate for the latest data)" : ""}`,
      MARGIN,
      doc.y,
      { width: contentWidth(doc) },
    );
  doc.moveDown(0.6);

  // Health hero + headline
  healthHero(doc, p.portfolioHealthScore, p.healthLabel, briefing.headline);

  // Portfolio overview
  sectionHeading(doc, "Portfolio Overview");
  metricStrip(
    doc,
    [
      { label: "Total Projects", value: String(p.totalProjects) },
      { label: "Active", value: String(p.activeProjects) },
      { label: "Client Projects", value: String(p.clientProjects) },
      {
        label: "Weighted Margin",
        value: formatPct(p.weightedMarginPct),
        color: p.weightedMarginPct >= 0 ? "#16a34a" : "#dc2626",
      },
    ],
    4,
  );

  // Revenue
  sectionHeading(doc, "Revenue");
  metricStrip(
    doc,
    [
      { label: "Contract Value", value: formatIDR(p.totalContractValue) },
      { label: "Recognized", value: formatIDR(p.totalRecognizedRevenue) },
      { label: "Actual Cost", value: formatIDR(p.totalActualCost) },
      {
        label: "Actual Profit",
        value: formatIDR(p.totalActualProfit),
        color: p.totalActualProfit >= 0 ? "#16a34a" : "#dc2626",
      },
    ],
    4,
  );
  paragraph(doc, briefing.revenueSummary);

  // Margin
  sectionHeading(doc, "Margin");
  paragraph(doc, briefing.marginSummary);

  // Utilization
  sectionHeading(doc, "Utilization");
  metricStrip(
    doc,
    [
      {
        label: "Utilization",
        value: formatPct(facts.utilization.utilizationPct),
      },
      { label: "Headcount", value: String(facts.utilization.headcount) },
      {
        label: "Billable Active",
        value: String(facts.utilization.billableActive),
      },
      {
        label: "Overloaded",
        value: String(facts.utilization.overloaded),
        color: facts.utilization.overloaded > 0 ? "#d97706" : undefined,
      },
    ],
    4,
  );
  paragraph(doc, briefing.utilizationSummary);

  // Consultant availability
  sectionHeading(doc, "Consultant Availability");
  metricStrip(
    doc,
    [
      { label: "Idle", value: String(facts.utilization.idle) },
      {
        label: "Idle > 5 days",
        value: String(facts.utilization.idleLong),
        color: facts.utilization.idleLong > 0 ? "#d97706" : undefined,
      },
      {
        label: "Billable Active",
        value: String(facts.utilization.billableActive),
      },
    ],
    3,
  );
  paragraph(doc, briefing.consultantAvailabilitySummary);

  // Cash flow
  sectionHeading(doc, "Cash Flow");
  metricStrip(
    doc,
    [
      {
        label: "Due in 30 days",
        value: formatIDR(facts.cashFlow.plannedNext30Days),
      },
      {
        label: "Due in 90 days",
        value: formatIDR(facts.cashFlow.plannedNext90Days),
      },
      {
        label: "Outstanding",
        value: formatIDR(facts.cashFlow.outstandingInvoicedAmount),
        color:
          facts.cashFlow.outstandingInvoicedAmount > 0 ? "#d97706" : undefined,
      },
      {
        label: "Paid (90d)",
        value: formatIDR(facts.cashFlow.paidLast90Days),
        color: "#16a34a",
      },
    ],
    4,
  );
  paragraph(doc, briefing.cashFlowSummary);

  // Outstanding invoices
  sectionHeading(doc, "Outstanding Invoices");
  metricStrip(
    doc,
    [
      { label: "Invoiced", value: formatIDR(facts.invoices.invoicedAmount) },
      {
        label: "Paid",
        value: formatIDR(facts.invoices.paidAmount),
        color: "#16a34a",
      },
      {
        label: "Outstanding",
        value: formatIDR(facts.invoices.outstandingAmount),
        color: facts.invoices.outstandingAmount > 0 ? "#d97706" : undefined,
      },
      { label: "Planned", value: formatIDR(facts.invoices.plannedAmount) },
    ],
    4,
  );
  paragraph(doc, briefing.outstandingInvoicesSummary);

  // Delayed projects
  sectionHeading(doc, "Delayed Projects");
  paragraph(doc, briefing.delayedProjectsSummary);
  drawTable(
    doc,
    ["Code", "Project", "Status", "Days Overdue"],
    facts.delayedProjects.map((d) => [
      d.code,
      d.name,
      d.status,
      String(d.daysOverdue),
    ]),
    [110, 205, 60, 100],
    "No delayed projects.",
  );

  // High-risk projects
  sectionHeading(doc, "High-Risk Projects");
  paragraph(doc, briefing.highRiskProjectsSummary);
  drawTable(
    doc,
    ["Code", "Project", "Critical", "High", "Health"],
    facts.highRiskProjects.map((r) => [
      r.code,
      r.name,
      String(r.openCritical),
      String(r.openHigh),
      r.healthScore == null ? "-" : String(r.healthScore),
    ]),
    [110, 185, 55, 55, 70],
    "No high-risk projects.",
  );

  // Recommended actions
  sectionHeading(doc, "Top 5 Recommended Actions");
  const cw = contentWidth(doc);
  briefing.recommendedActions.forEach((a, i) => {
    ensureSpace(doc, 40);
    const top = doc.y;
    doc.save();
    doc.circle(MARGIN + 8, top + 8, 8).fillColor(INK).fill();
    doc.restore();
    doc
      .fillColor("#ffffff")
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .text(String(i + 1), MARGIN, top + 4.5, {
        width: 16,
        align: "center",
        lineBreak: false,
      });

    const textX = MARGIN + 26;
    const textW = cw - 26;
    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(a.title, textX, top, { width: textW - 70, lineBreak: false, ellipsis: true });
    doc
      .fillColor(priorityColor(a.priority))
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(a.priority.toUpperCase(), textX + textW - 64, top + 1, {
        width: 64,
        align: "right",
        lineBreak: false,
      });
    doc
      .fillColor(BODY)
      .font("Helvetica")
      .fontSize(9)
      .text(a.detail, textX, top + 14, { width: textW, lineGap: 1.5 });
    doc.x = MARGIN;
    doc.moveDown(0.6);
  });
}

export function streamExecutiveBriefingPdf(
  res: Response,
  data: ExecutiveBriefingPdfData,
): void {
  const stamp = data.generatedAt.slice(0, 10);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="executive-briefing-${stamp}.pdf"`,
  );

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
  });

  // Stream hardening: stop writing if the document errors or the client
  // disconnects mid-download, so we never leak a dangling writer.
  doc.on("error", () => {
    if (!res.headersSent) res.status(500).end();
  });
  res.on("close", () => {
    if (!res.writableEnded) doc.destroy();
  });

  doc.pipe(res);

  buildBriefing(doc, data);

  // Footer (confidentiality + page numbers) on every page.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    // The footer sits below the bottom margin. Without this, PDFKit treats each
    // footer line as overflow and auto-inserts a blank page per write, so a
    // 3-page briefing balloons to 9. Dropping the bottom margin disables that
    // auto-pagination while we stamp footers.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 40;
    const cw = contentWidth(doc);
    doc
      .fillColor("#94a3b8")
      .font("Helvetica")
      .fontSize(7.5)
      .text("Confidential - for management use only", MARGIN, y, {
        width: cw,
        align: "left",
        lineBreak: false,
      });
    doc
      .fillColor("#94a3b8")
      .font("Helvetica")
      .fontSize(7.5)
      .text(`Page ${i + 1} of ${range.count}`, MARGIN, y, {
        width: cw,
        align: "right",
        lineBreak: false,
      });
  }
  doc.flushPages();

  doc.end();
}
