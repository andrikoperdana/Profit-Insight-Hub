import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } from "docx";
import { writeFileSync, mkdirSync } from "node:fs";

const P = (t, opts = {}) => new Paragraph({ children: [new TextRun({ text: t, ...opts })], spacing: { after: 80 } });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, bold: true })], spacing: { before: 240, after: 120 } });
const Bullet = (t) => new Paragraph({ text: t, bullet: { level: 0 }, spacing: { after: 60 } });

const cell = (text, opts = {}) => new TableCell({
  width: { size: opts.w || 25, type: WidthType.PERCENTAGE },
  shading: opts.header ? { fill: "1F2937" } : (opts.fill ? { fill: opts.fill } : undefined),
  children: [new Paragraph({
    children: [new TextRun({ text: String(text), bold: !!opts.header || !!opts.bold, color: opts.header ? "FFFFFF" : (opts.color || "000000"), size: 18 })],
    alignment: opts.align || AlignmentType.LEFT,
  })],
});
const makeTable = (headers, rows, widths) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { header: true, w: widths?.[i] })) }),
    ...rows.map((r) => new TableRow({ children: r.map((c, i) => {
      if (i === r.length - 1) {
        const s = String(c);
        const fill = s.startsWith("Full") ? "DCFCE7" : s.startsWith("Partial") ? "FEF3C7" : s.startsWith("Missing") ? "FEE2E2" : "F3F4F6";
        return cell(c, { w: widths?.[i], fill });
      }
      return cell(c, { w: widths?.[i] });
    }) })),
  ],
});

const matrix = [
  ["CRM / Pipeline", "Lead pipeline kanban, weighted forecasting, lost-reason analytics", "Lead pipeline + analytics + activities log", "Full"],
  ["CRM Integration", "HubSpot, Salesforce, Dynamics, Pipedrive", "Standalone (no external CRM)", "N/A"],
  ["Project setup from deal", "One-click from CRM deal", "Lead → Project converter built-in", "Full"],
  ["Project planning", "Gantt chart + Kanban board", "Drag-drop Gantt + WBS + dependencies", "Full"],
  ["Pre-sales budget worksheet", "Calculation sheet with line items", "Only contractValue at intake — no line-item worksheet", "Partial"],
  ["Contract types (Fixed Fee, T&M, Retainer, Expense)", "Four contract types", "Only implicit Fixed Fee", "Missing"],
  ["Task management", "Multi-assignee, dependencies, kanban view", "Multi-assignee, dependencies, WBS — no kanban view", "Partial"],
  ["Time tracking", "Calendar plugin, mobile, timesheet", "Web timesheet + task time log", "Partial"],
  ["Timesheet approval", "PM approve / reject / modify", "DRAFT → SUBMITTED → APPROVED / REJECTED workflow", "Full"],
  ["Expense tracking", "With attachments + tax", "With approval — no attachment upload yet", "Partial"],
  ["Invoicing", "Auto invoice generator from milestone", "Billing Milestone (manual invoice numbers) — no PDF gen", "Partial"],
  ["Quotes / SOW with digital signing", "Quote → SOW → signature", "—", "Missing"],
  ["Project status alerts", "Budget overrun, milestone alerts", "Pending-expense & overdue alerts only", "Partial"],
  ["Resource planning", "Weekly capacity heatmap, utilization", "BU-grouped weekly planning page", "Full"],
  ["Resource capacity (planned vs actual)", "Workload chart", "Planning + Financials cover this", "Full"],
  ["Dashboards & reports", "Standard dashboards + Excel export", "6 role-specific dashboards + 10 reports + CSV/XLSX/PDF", "Full"],
  ["VAT / Tax report", "Tax field on expense + invoice", "VAT Recap 12-month, SPT-ready", "Full"],
  ["Multi-currency", "USD / EUR", "IDR only", "N/A"],
  ["Client / Guest portal", "Named guest accounts", "—", "Missing"],
  ["AI Copilot", "Auto notifications + natural-language Q&A", "—", "Missing"],
  ["Email notifications", "Built-in", "—", "Missing"],
  ["Mobile app", "iOS / Android", "Web responsive only", "Partial"],
  ["Audit log", "Activity tracking", "Activity table + Site Admin viewer", "Full"],
  ["Role-based access", "Per-user permission", "9 roles + Principal hierarchy", "Full"],
  ["SaaS pricing / free trial", "$25-40 / user / month", "Self-hosted, internal", "N/A"],
];

// Coverage calculation: exclude N/A items.
let full = 0, partial = 0, missing = 0, na = 0;
for (const row of matrix) {
  const s = row[3];
  if (s === "Full") full++;
  else if (s === "Partial") partial++;
  else if (s === "Missing") missing++;
  else na++;
}
const scored = full + partial + missing;
const score = full + partial * 0.5;
const coveragePct = ((score / scored) * 100).toFixed(1);

const highPrio = [
  ["1", "Contract types (T&M, Retainer, Expense-only)", "Medium", "High — many security engagements run as retainer"],
  ["2", "Pre-sales budget worksheet / calculation sheet", "Medium", "High — itemised cost estimate before contract"],
  ["3", "Auto-generate invoice PDF from milestone", "Small", "High — Admin Project sends straight to client"],
  ["4", "Expense attachments (receipts, invoices)", "Small", "High — required for tax audit"],
  ["5", "Email notifications", "Medium", "High"],
  ["6", "Automatic budget-overrun alert", "Small", "Medium — catches losing projects early"],
  ["7", "Quotes / SOW with digital signing", "Large", "Medium — needs e-sign integration"],
];

const medPrio = [
  ["8", "Kanban board view on Tasks tab", "Small", "Medium"],
  ["9", "Client / Guest portal (read-only progress view)", "Medium-Large", "Medium"],
  ["10", "Mobile-friendly time logging", "Medium", "Medium — for consultants on-site"],
  ["11", "AI assistant / chat over project data", "Large", "Low — nice-to-have"],
];

const doc = new Document({
  creator: "SecureProfit Hub",
  title: "Fit-Gap Analysis: SecureProfit Hub vs PSOhub",
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  sections: [{
    children: [
      new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Fit-Gap Analysis", bold: true, size: 40 })], spacing: { after: 120 } }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "SecureProfit Hub vs PSOhub", size: 28, color: "555555" })], spacing: { after: 240 } }),
      P("PSOhub is a global Professional Services Automation (PSA) platform with 5+ years on the market, tightly integrated with HubSpot and Salesforce. This document compares its core capabilities against SecureProfit Hub.", { italics: true }),

      H1("Executive Summary — Coverage Score"),
      P(`SecureProfit Hub currently covers approximately ${coveragePct}% of PSOhub's relevant capability surface.`, { bold: true }),
      P("Scoring method: each comparable item is weighted Full = 1.0, Partial = 0.5, Missing = 0.0. N/A items (multi-currency, external CRM integration, SaaS pricing) are excluded because they do not apply to a standalone Indonesian internal app."),
      makeTable(
        ["Bucket", "Count", "Weight", "Contribution"],
        [
          ["Full coverage", String(full), "× 1.0", String(full)],
          ["Partial coverage", String(partial), "× 0.5", (partial * 0.5).toFixed(1)],
          ["Missing", String(missing), "× 0.0", "0.0"],
          ["N/A (excluded)", String(na), "—", "—"],
          ["Total scored items", String(scored), "", score.toFixed(1)],
          ["Coverage", "", "", `${coveragePct}%`],
        ],
        [40, 15, 15, 30]
      ),

      H1("1. Fit-Gap Matrix"),
      P("Status legend: Full · Partial · Missing · N/A."),
      makeTable(["Capability area", "PSOhub", "SecureProfit Hub", "Status"], matrix, [22, 28, 32, 18]),

      H1("2. Where SecureProfit Hub is stronger than PSOhub"),
      Bullet("Indonesia-specific VAT recap — PPN 11%, SPT Masa-ready, 12-month breakdown. Not available in PSOhub."),
      Bullet("Principal / supervisor hierarchy — 3 Principal roles propose resources and scope financial visibility. Tailored to Indonesian IT-security consultancies."),
      Bullet("Richer report catalogue — 10 ready-made reports (margin trend by BU, billing aging, cash-inflow forecast, etc.)."),
      Bullet("More granular role-based access — 9 roles + Sales-only Pipeline + Principal supervision."),
      Bullet("Built-in lead analytics — funnel, weighted pipeline, lost-reason breakdown — a mini-CRM out of the box."),

      H1("3. High-priority gaps (clear ROI)"),
      makeTable(["#", "Gap", "Effort", "Value"], highPrio, [6, 54, 16, 24]),

      H1("4. Medium-priority gaps"),
      makeTable(["#", "Gap", "Effort", "Value"], medPrio, [6, 54, 16, 24]),

      H1("5. Not applicable for SecureProfit Hub"),
      Bullet("HubSpot / Salesforce integration — SecureProfit Hub is standalone with its own pipeline."),
      Bullet("Multi-currency — Indonesian clients invoice in IDR."),
      Bullet("SaaS pricing / free trial — this is an internal application, not sold per seat."),

      H1("6. Recommended next three steps"),
      P("To close the gap on what consultants use daily:"),
      Bullet("Step 1 — Expense attachments + auto-invoice PDF (~1 session). Direct impact on Admin Project and tax audit."),
      Bullet("Step 2 — Contract types (Retainer, T&M) (1–2 sessions). Opens new business models."),
      Bullet("Step 3 — Email notifications via Resend (1–2 sessions). Already scoped."),
      P(`After these three steps, projected coverage rises from ${coveragePct}% to roughly 78–82%.`, { italics: true }),

      new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "— End of document —", italics: true, color: "888888" })] }),
    ],
  }],
});

const buf = await Packer.toBuffer(doc);
mkdirSync("exports", { recursive: true });
const out = "exports/FitGap_SecureProfitHub_vs_PSOhub_EN.docx";
writeFileSync(out, buf);
console.log("Wrote", out, buf.length, "bytes — coverage:", coveragePct + "%", "(full:", full, "partial:", partial, "missing:", missing, "n/a:", na, ")");
