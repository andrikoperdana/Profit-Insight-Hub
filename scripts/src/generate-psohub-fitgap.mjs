import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak,
  Header, Footer, PageNumber, LevelFormat, convertInchesToTwip, TabStopType, TabStopPosition,
} from "docx";
import fs from "node:fs";
import path from "node:path";

const COLOR = {
  primary: "0E7C66",
  primaryDark: "0A5A4A",
  accent: "B8860B",
  fit: "1B8E5A",
  partial: "B8860B",
  gap: "C03A2B",
  na: "6B7280",
  text: "111827",
  muted: "4B5563",
  bgHead: "0E7C66",
  bgAlt: "F1F5F4",
  border: "D1D5DB",
};

const FONT = "Calibri";

const STATUS = {
  FIT:     { label: "FIT",     color: COLOR.fit,     bg: "DCFCE7" },
  PARTIAL: { label: "PARTIAL", color: COLOR.partial, bg: "FEF3C7" },
  GAP:     { label: "GAP",     color: COLOR.gap,     bg: "FEE2E2" },
  PLUS:    { label: "PLUS",    color: COLOR.primary, bg: "DBEAFE" },
};

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 120, before: opts.before ?? 0, line: 300 },
    alignment: opts.align ?? AlignmentType.LEFT,
    children: [new TextRun({
      text,
      font: FONT,
      size: opts.size ?? 22,
      bold: opts.bold ?? false,
      italics: opts.italics ?? false,
      color: opts.color ?? COLOR.text,
    })],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, font: FONT, size: 36, bold: true, color: COLOR.primary })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    children: [new TextRun({ text, font: FONT, size: 28, bold: true, color: COLOR.primaryDark })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 100 },
    children: [new TextRun({ text, font: FONT, size: 24, bold: true, color: COLOR.text })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 80, line: 280 },
    children: [new TextRun({ text, font: FONT, size: 22, color: COLOR.text })],
  });
}

function cell(text, opts = {}) {
  const children = Array.isArray(text)
    ? text.map((t) => new Paragraph({
        spacing: { after: 60, line: 260 },
        alignment: opts.align ?? AlignmentType.LEFT,
        children: [new TextRun({ text: t, font: FONT, size: opts.size ?? 20, bold: opts.bold ?? false, color: opts.color ?? COLOR.text })],
      }))
    : [new Paragraph({
        spacing: { after: 0, line: 260 },
        alignment: opts.align ?? AlignmentType.LEFT,
        children: [new TextRun({ text, font: FONT, size: opts.size ?? 20, bold: opts.bold ?? false, color: opts.color ?? COLOR.text })],
      })];
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.bg ? { type: ShadingType.CLEAR, color: "auto", fill: opts.bg } : undefined,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    verticalAlign: "center",
    children,
  });
}

function statusCell(key, width) {
  const s = STATUS[key];
  return cell(s.label, { bg: s.bg, color: s.color, bold: true, align: AlignmentType.CENTER, width });
}

const BORDERS = {
  top:    { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
  left:   { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
  right:  { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
  insideVertical:   { style: BorderStyle.SINGLE, size: 4, color: COLOR.border },
};

function fitGapTable(rows) {
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell("Capability", { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 22 }),
      cell("PSOHub",     { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 28 }),
      cell("SecureProfit Hub", { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 28 }),
      cell("Status",     { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 10, align: AlignmentType.CENTER }),
      cell("Gap / Action", { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 12 }),
    ],
  });
  const body = rows.map((r, i) => new TableRow({
    children: [
      cell(r.cap,    { bold: true, bg: i % 2 ? COLOR.bgAlt : undefined, width: 22 }),
      cell(r.pso,    { bg: i % 2 ? COLOR.bgAlt : undefined, width: 28 }),
      cell(r.us,     { bg: i % 2 ? COLOR.bgAlt : undefined, width: 28 }),
      statusCell(r.status, 10),
      cell(r.gap,    { bg: i % 2 ? COLOR.bgAlt : undefined, width: 12 }),
    ],
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDERS,
    rows: [header, ...body],
  });
}

function summaryTable(items) {
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell("Status",  { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 20, align: AlignmentType.CENTER }),
      cell("Count",   { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 15, align: AlignmentType.CENTER }),
      cell("Meaning", { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 65 }),
    ],
  });
  const body = items.map((it, i) => new TableRow({
    children: [
      statusCell(it.key, 20),
      cell(String(it.count), { bg: i % 2 ? COLOR.bgAlt : undefined, align: AlignmentType.CENTER, bold: true, width: 15 }),
      cell(it.meaning, { bg: i % 2 ? COLOR.bgAlt : undefined, width: 65 }),
    ],
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDERS, rows: [header, ...body] });
}

// ---------------- DATA ----------------

const fitGapRows = [
  // CRM Integration
  { cap: "CRM Integration", pso: "Native two-way sync with HubSpot, Salesforce, Microsoft Dynamics 365. Closed deals auto-create contracts and projects; activity-feed visibility back into the CRM.",
    us: "No CRM integration. Internal Clients table + Sales role for manual intake (4-field DRAFT form → MGMT assigns PM).",
    status: "GAP",
    gap: "Build connectors (HubSpot first, then Salesforce). Add 'deal-to-project' automation." },

  // Contract types
  { cap: "Contract Types", pso: "Fixed fee, time & material, installment, and recurring contracts. Role-based multi-rate billing on the same user.",
    us: "Contract value per project (with/without VAT). Resource staffing uses ProjectResource with planned mandays × daily rate (per-resource rate, not per-role).",
    status: "PARTIAL",
    gap: "Add contract-type enum (FIXED/T&M/RETAINER); allow multi-rate per role." },

  // Quotes & SOW
  { cap: "Quotes & SOW", pso: "Digital quote/SOW builder with e-signature; quote converts directly into a project.",
    us: "No quote/SOW module. Projects start in DRAFT after sales intake; no digital signing.",
    status: "GAP",
    gap: "Add Quote/SOW entity, PDF generator, and e-sign (DocuSign or open-source)." },

  // Kanban
  { cap: "Task Kanban Board", pso: "Kanban task boards with drag-drop status changes.",
    us: "Tasks tab supports status updates, multi-assignee, WBS parent/child, and dependencies — but list view only, no Kanban swimlanes.",
    status: "PARTIAL",
    gap: "Add Kanban view on TasksTab grouped by status." },

  // Gantt
  { cap: "Gantt Chart", pso: "Gantt charts for resource and timeline planning.",
    us: "Interactive Gantt (TaskGanttChart) with drag-to-move, edge-resize, and SVG dependency arrows.",
    status: "FIT",
    gap: "—" },

  // Predictive AI
  { cap: "Predictive Project Management", pso: "AI Copilot forecasts timelines, resource needs, budget overruns; smart insights with auto-generated charts.",
    us: "Linear burn-rate forecast on Financials endpoint; no AI/ML.",
    status: "GAP",
    gap: "Phase-2 AI Copilot (LLM + project history) for budget/at-risk prediction." },

  // Time tracking — self driving
  { cap: "Self-driving Time Tracking", pso: "Browser extension, calendar (Outlook/Google) integration, mobile app, automatic time capture.",
    us: "Manual Quick Log + Weekly Entry grid (5 days) + per-task time logs. No calendar sync, no mobile app, no browser ext.",
    status: "PARTIAL",
    gap: "Build calendar add-in; mobile (Expo) timesheet app; auto-suggest from calendar events." },

  // Timesheet approval
  { cap: "Timesheet Approval", pso: "PMs approve, modify, or reject time entries.",
    us: "Full approval workflow: DRAFT → SUBMITTED → APPROVED/REJECTED, PM/MGMT-only approve; auto-approve for bulk PM/MGMT entries.",
    status: "FIT",
    gap: "—" },

  // Expenses
  { cap: "Expense Tracking", pso: "Expense logging with calendar integrations and real-time insight.",
    us: "ProjectExpense (SOFTWARE/HARDWARE/LICENSE/TRAVEL/OTHER) with PENDING/APPROVED/REJECTED workflow. Only APPROVED rolls into actualCost/margin.",
    status: "FIT",
    gap: "—" },

  // Invoicing - milestone
  { cap: "Milestone Invoicing", pso: "Smart invoicing: recurring, installment, milestone, time & material. Auto-triggers when service hours exceed allotment.",
    us: "BillingMilestone table with %, DPP, VAT, due date, status PLANNED→INVOICED→PAID. Indonesian VAT split (vatPercent honoring contractValueIncludesVat).",
    status: "PARTIAL",
    gap: "Add recurring/retainer schedule; auto-trigger when actual hours > planned." },

  // Invoice PDF
  { cap: "Invoice PDF / Multi-language", pso: "Detailed editable invoice templates, multi-language labels.",
    us: "Invoice number stamped on milestone; PDF generation not built in (relies on uploaded Document of type INVOICE).",
    status: "GAP",
    gap: "Built-in IDR invoice template generator (PPN 11%) with Bahasa/English toggle." },

  // Accounting integration
  { cap: "Accounting Integration", pso: "Two-way sync with QuickBooks, Xero, Exact Online, Moneybird.",
    us: "No accounting integration; VAT Recap exports CSV for manual entry.",
    status: "GAP",
    gap: "Build connector to Accurate / Jurnal / Mekari (popular Indonesian accounting) and Xero." },

  // Resource Management
  { cap: "Resource Capacity Planning", pso: "AI Copilot smart-schedules by role + skill + availability; planned vs used hours.",
    us: "/resource-planning grid (BU-grouped, weekly mandays, color-coded). Leave overlay. Skill Matrix + Bench report + Capacity report — but allocation is manual.",
    status: "PARTIAL",
    gap: "Add auto-suggest staffing using skill match + availability score." },

  // Reporting
  { cap: "Reporting", pso: "Built-in reports + OData live feed for PowerBI/Tableau/Excel.",
    us: "10 shipped reports (profitability, margin trend, billing aging, cash forecast, VAT, etc.) with CSV/XLSX/PDF export. No OData endpoint.",
    status: "PARTIAL",
    gap: "Expose read-only OData/JSON-API for PowerBI; embed dashboard option." },

  // AI Copilot
  { cap: "AI Copilot / Smart Alerts", pso: "Copilot alerts on budget overrun, utilization issues, overdue payments and tasks; conversational insights.",
    us: "Static alerts: at-risk projects, pending expenses, overdue tasks, closing-doc inbox. No conversational AI.",
    status: "PARTIAL",
    gap: "Add LLM-backed chat over project data; proactive Slack/Email digests." },

  // Hierarchy
  { cap: "Org / Reporting Hierarchy", pso: "Standard team membership; no explicit Principal-supervisor model documented.",
    us: "Explicit Principal-Consultant/TW/Admin hierarchy + Propose-Accept resource staffing workflow + Org Chart.",
    status: "PLUS",
    gap: "Unique to us; preserve as differentiator." },

  // VAT
  { cap: "Indonesian VAT (PPN 11%) Recap", pso: "Not localized for Indonesia.",
    us: "MGMT-only VAT Recap (12-month DPP/VAT/paid/outstanding) + CSV export. DPP/VAT split honoring contractValueIncludesVat.",
    status: "PLUS",
    gap: "Unique to us; expand to e-Faktur XML export for DJP." },

  // HR
  { cap: "HR & Leave Management", pso: "Limited HR scope (capacity only).",
    us: "Dedicated HR role + dashboard: headcount, BU distribution, leaves, bench, skill gaps, new joiners. UserLeave model (ANNUAL/SICK/TRAINING/UNPAID/OTHER) feeds capacity planning.",
    status: "PLUS",
    gap: "Unique to us; consider payroll module Phase-2." },

  // Skill matrix
  { cap: "Skill Matrix & Gap Analysis", pso: "Skill data feeds smart scheduling; no public gap-analysis UI.",
    us: "/skill-matrix grid (user × skill, proficiency 1–5) + automatic gap detection (no holders / 1 holder / no senior).",
    status: "PLUS",
    gap: "Unique to us; surface gap to Sales pipeline for upsell training." },

  // Top performers
  { cap: "Performance Ranking", pso: "Utilization metrics in reports; no explicit top-performer module.",
    us: "Top Performers feature: per-role weighted scoring (margin, utilization, deliverables, etc.) with podium, full table, Scoring Rules popup.",
    status: "PLUS",
    gap: "Unique to us; expand with peer feedback / 360-review." },

  // Documents
  { cap: "Document Management", pso: "Quotes/SOW + invoice templates; otherwise basic.",
    us: "Document model (BAST/INVOICE/CONTRACT/OTHER) stored as base64 per project. Closing-doc inbox for Admin Project role.",
    status: "FIT",
    gap: "Move from base64 to object storage for scalability." },

  // Mobile
  { cap: "Mobile App", pso: "iOS + Android native mobile apps.",
    us: "Web-only (responsive). No native mobile.",
    status: "GAP",
    gap: "Build Expo (React Native) timesheet + leave + approval app." },

  // Languages
  { cap: "Multi-language", pso: "English, Dutch, French, German.",
    us: "English UI with Indonesian domain labels (BAST, PPN, Mandays).",
    status: "PARTIAL",
    gap: "Add full Bahasa Indonesia i18n switch." },

  // Pricing/deployment
  { cap: "Pricing / Deployment Model", pso: "Cloud SaaS, $12.50+/user/month, 30-day free trial.",
    us: "Self-hosted / Replit deploy, single-tenant, no per-seat licensing.",
    status: "PLUS",
    gap: "Differentiator for compliance-sensitive Indonesian customers (data sovereignty)." },

  // Audit log
  { cap: "Audit Log", pso: "Standard activity feed (CRM-side).",
    us: "Dedicated Activity audit log + /audit-logs page (SITE_ADMIN). Every task create/update/delete/time_logged emits an Activity row.",
    status: "PLUS",
    gap: "Unique to us; export for SOC-2 / ISO-27001 evidence." },

  // Role granularity
  { cap: "Role-based Access Control", pso: "Standard PSA roles.",
    us: "10+ granular roles (MGMT, PM, Sales, Konsultan, TW, Admin Project, 3× Principal, Finance, HR, Site Admin) with field-level write rules.",
    status: "PLUS",
    gap: "Unique to us; document role matrix for compliance audits." },
];

const summary = (() => {
  const acc = { FIT: 0, PARTIAL: 0, GAP: 0, PLUS: 0 };
  fitGapRows.forEach((r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; });
  return [
    { key: "FIT",     count: acc.FIT,     meaning: "Capability is fully delivered in SecureProfit Hub and parity (or better) with PSOHub." },
    { key: "PARTIAL", count: acc.PARTIAL, meaning: "Capability exists but is shallower, missing automation, or limited in scope vs PSOHub." },
    { key: "GAP",     count: acc.GAP,     meaning: "Capability missing in SecureProfit Hub — net-new work required if needed." },
    { key: "PLUS",    count: acc.PLUS,    meaning: "SecureProfit Hub feature with no equivalent in PSOHub (our differentiator)." },
  ];
})();

// ---------------- DOCUMENT ----------------

const doc = new Document({
  creator: "SecureProfit Hub",
  title: "Fit-Gap Analysis: SecureProfit Hub vs PSOHub",
  styles: {
    default: { document: { run: { font: FONT } } },
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.8),
            bottom: convertInchesToTwip(0.8),
            left: convertInchesToTwip(0.7),
            right: convertInchesToTwip(0.7),
          },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "Fit-Gap Analysis — SecureProfit Hub vs PSOHub", font: FONT, size: 18, color: COLOR.muted, italics: true })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "SecureProfit Hub  •  Confidential  •  Page ", font: FONT, size: 18, color: COLOR.muted }),
              new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: COLOR.muted }),
              new TextRun({ text: " of ", font: FONT, size: 18, color: COLOR.muted }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: COLOR.muted }),
            ],
          })],
        }),
      },
      children: [
        // Cover
        new Paragraph({ spacing: { before: 1200 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "FIT-GAP ANALYSIS", font: FONT, size: 56, bold: true, color: COLOR.primary })] }),
        new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "SecureProfit Hub  vs  PSOHub", font: FONT, size: 36, bold: true, color: COLOR.primaryDark })] }),
        new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Professional Services Automation — Feature Parity, Differentiators, and Roadmap Implications",
            font: FONT, size: 24, italics: true, color: COLOR.muted })] }),
        new Paragraph({ spacing: { before: 2000 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Prepared by: SecureProfit Hub Product Team", font: FONT, size: 22, color: COLOR.text })] }),
        new Paragraph({ alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `Date: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, font: FONT, size: 22, color: COLOR.text })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100 },
          children: [new TextRun({ text: "Source: www.psohubapp.com (psohub.com) — public website & documentation", font: FONT, size: 20, italics: true, color: COLOR.muted })] }),
        new Paragraph({ children: [new PageBreak()] }),

        // 1. Executive Summary
        h1("1. Executive Summary"),
        p("PSOHub is a mature, cloud-hosted Professional Services Automation (PSA) platform best known for its deep CRM-first workflow (HubSpot, Salesforce, Microsoft Dynamics 365), automated contract-to-invoice automation, and an AI Copilot for resource scheduling and budget alerts. It is sold per-user from USD 12.50/user/month."),
        p("SecureProfit Hub is a single-tenant, self-hosted PSA built specifically for Indonesian IT-security consultancies. It covers the full intake-to-collection lifecycle with strong localisation (PPN 11% VAT recap, BAST/INVOICE document model, Indonesian role taxonomy) and several capabilities PSOHub does not offer out of the box: an explicit Principal-supervisor hierarchy, HR/leave module, skill matrix with gap analysis, granular per-role access control, audit log, and a Top-Performer ranking engine."),
        p("The analysis below scores 26 capabilities. Headline result:", { bold: true, before: 80 }),
        summaryTable(summary),
        p("In short: SecureProfit Hub already matches PSOHub on the core PSA loop (projects, Gantt, timesheets, approvals, milestone billing, expenses, reporting). The main gaps are CRM/accounting connectors, native quote/e-sign, mobile app, and an AI Copilot. Our differentiators are localisation, HR depth, hierarchy, audit, and self-hosted deployment — all valuable to compliance-sensitive Indonesian customers.", { before: 100, italics: true, color: COLOR.muted }),

        new Paragraph({ children: [new PageBreak()] }),

        // 2. Methodology
        h1("2. Methodology"),
        p("PSOHub capabilities were collected from the public marketing website (psohubapp.com and psohub.com), the official documentation portal (help.psohub.com), and third-party catalogue listings (GetApp). We mapped each PSOHub capability to the equivalent feature in SecureProfit Hub by reading the codebase (Prisma schema, Express routes, React pages) and reviewing the deployed UI."),
        h3("Status Legend"),
        bullet("FIT — SecureProfit Hub delivers the capability at parity or better."),
        bullet("PARTIAL — Capability exists but is shallower than PSOHub or missing automation."),
        bullet("GAP — Capability missing from SecureProfit Hub today."),
        bullet("PLUS — SecureProfit Hub feature with no direct PSOHub equivalent (differentiator)."),

        // 3. Product Snapshots
        h1("3. Product Snapshots"),
        h2("3.1 PSOHub at a glance"),
        bullet("Target market: SMB/Mid-market professional services (marketing, IT services, consulting, architecture, engineering, accounting). Global."),
        bullet("Core modules: CRM Integration, Contract Management, Project Management, Time & Expense, Invoicing & Billing, Resource Management, Reporting & AI Copilot, Quotes & SOW."),
        bullet("Differentiators: Native HubSpot/Salesforce/Dynamics sync, AI Copilot, recurring-contract automation, OData live reporting, browser extension + mobile app."),
        bullet("Integrations: HubSpot, Salesforce, Dynamics 365, QuickBooks, Xero, Exact Online, Moneybird, bexio, Teams, Slack, Zapier, Outlook/Google Calendar."),
        bullet("Pricing: 4 tiers (Essentials, Professional, Enterprise, Premium Support). From USD 12.50/user/month, 30-day free trial."),
        bullet("Languages: English, Dutch, French, German."),
        bullet("Deployment: Cloud SaaS, web + iOS + Android."),

        h2("3.2 SecureProfit Hub at a glance"),
        bullet("Target market: Indonesian IT-security consultancies (Pentest, GRC, Threat Hunting business units). Tailored for PMO + delivery teams + finance."),
        bullet("Core modules: Project lifecycle (Draft→Observation→Active→Pause/Complete→Closed), Tasks/WBS/Gantt, Resource Planning, Timesheets (Quick Log + Weekly Entry + bulk), Expenses, Billing Milestones with PPN 11%, VAT Recap, Reports (10 shipped), HR/Leave, Skill Matrix, Top Performers."),
        bullet("Differentiators: Principal-Supervisor hierarchy, granular 10+ role RBAC, audit log, Indonesian VAT recap & DPP/VAT split, self-hosted/single-tenant, open codebase."),
        bullet("Integrations: None today (intentional — single-tenant private deployment)."),
        bullet("Pricing: No per-seat licensing (internal product / self-hosted)."),
        bullet("Languages: English UI with Indonesian domain terminology."),
        bullet("Deployment: Web (React + Vite) on Replit / self-hosted Node + Postgres."),

        new Paragraph({ children: [new PageBreak()] }),

        // 4. Detailed Fit-Gap Matrix
        h1("4. Detailed Fit-Gap Matrix"),
        p("The matrix below maps every PSOHub capability we identified to the equivalent (or missing) feature in SecureProfit Hub. Rows tagged PLUS are capabilities that exist in our product but not in PSOHub."),
        fitGapTable(fitGapRows),

        new Paragraph({ children: [new PageBreak()] }),

        // 5. Key Differentiators
        h1("5. Where SecureProfit Hub wins (PLUS items)"),
        p("These are net-positive features our customers get out of the box that PSOHub does not advertise:"),
        bullet("Localisation for Indonesia — PPN 11% VAT recap, DPP/VAT split honouring contract VAT inclusivity, BAST closing-document workflow, Indonesian role labels."),
        bullet("Principal-Supervisor hierarchy — 3 Principal roles (Konsultan, Technical Writer, Admin Project) with Propose→Accept staffing flow; PMs report to PMO Director."),
        bullet("Granular RBAC — 10+ roles with per-field write rules (e.g. Sales can only edit code/name/client/value on DRAFT; HR is hard-blocked from financials)."),
        bullet("HR & Leave module — Headcount KPIs, leaves today/upcoming, bench summary, skill gaps, new joiners; UserLeave feeds capacity planning automatically."),
        bullet("Skill Matrix with gap detection — Automatic flagging of skills with no holders, 1 holder, or no senior/principal coverage."),
        bullet("Top Performer ranking — Per-role weighted scoring engine (FIT/PARTIAL/GAP scoring rubric per role) with podium, breakdown bars, and a Scoring Rules popup explaining methodology."),
        bullet("Audit log — Every task and resource mutation emits an Activity row; SITE_ADMIN audit-log page suitable for SOC-2 / ISO-27001 evidence."),
        bullet("Self-hosted / single-tenant — Data sovereignty for compliance-sensitive engagements; no per-seat licensing cost."),

        // 6. Key Gaps
        h1("6. Where PSOHub wins (our GAPs)"),
        p("These are PSOHub capabilities we do not have today and should consider for the roadmap:"),
        bullet("CRM Integration — HubSpot / Salesforce / Dynamics 365 two-way sync. High commercial value for prospects who already run a CRM."),
        bullet("Quotes & SOW with e-signature — Quote-to-project automation; closes the pre-sales gap before our DRAFT intake."),
        bullet("Accounting integration — QuickBooks / Xero / Exact / Moneybird. For Indonesia, target Accurate, Jurnal, Mekari."),
        bullet("Built-in invoice PDF generator — We currently rely on uploaded INVOICE documents; PSOHub generates branded multi-language invoices automatically."),
        bullet("Mobile app — PSOHub has iOS + Android. Build an Expo (React Native) companion for timesheet + leave + approval."),
        bullet("AI Copilot — Predictive budget/timeline alerts, conversational insights, auto-scheduling. LLM-based opportunity."),
        bullet("Self-driving time tracking — Calendar (Outlook/Google) integration, browser extension, auto-capture."),
        bullet("OData / live BI feed — PowerBI / Tableau live connection beyond CSV exports."),

        // 7. Partial Items
        h1("7. Partial parity — where we have foundations but need depth"),
        bullet("Contract types — Add fixed-fee/T&M/retainer enum; allow multi-rate per role per user."),
        bullet("Milestone invoicing — Add recurring/retainer schedule and auto-trigger when actual hours exceed plan."),
        bullet("Resource planning — Add auto-suggest staffing based on skill match × availability score."),
        bullet("Reporting — Expose read-only OData/JSON-API; offer embeddable dashboards."),
        bullet("Multi-language — Full Bahasa Indonesia i18n in addition to English."),
        bullet("Kanban view — Add board grouping by status on the Tasks tab (Gantt + List + Kanban)."),

        // 8. Recommendations
        h1("8. Recommended Roadmap (next 12 months)"),
        h3("Quarter 1 — Close the most-asked gaps"),
        bullet("Built-in invoice PDF generator (Bahasa/English, PPN 11%, e-Faktur compatible)."),
        bullet("Kanban view on Tasks tab."),
        bullet("Full Bahasa Indonesia i18n."),
        h3("Quarter 2 — Mobile & CRM"),
        bullet("Expo mobile app: timesheet, leave, expense capture, push approvals."),
        bullet("HubSpot integration v1 (deal-to-project automation)."),
        h3("Quarter 3 — Automation"),
        bullet("Recurring / retainer billing schedule + auto-trigger on hour overrun."),
        bullet("Accounting connector for Accurate / Jurnal."),
        bullet("OData feed for PowerBI."),
        h3("Quarter 4 — AI Copilot"),
        bullet("LLM chat over project data (budget, utilization, at-risk)."),
        bullet("Auto-suggest staffing based on skill + availability scoring."),
        bullet("Proactive Slack / Email digests for PMs and MGMT."),

        // 9. Conclusion
        h1("9. Conclusion"),
        p("SecureProfit Hub already matches PSOHub on the full core PSA loop (projects, Gantt, timesheets with approval, expenses with approval, milestone billing, expense control, reporting with export). It exceeds PSOHub on localisation, HR depth, organisational hierarchy, governance/audit, and data sovereignty."),
        p("The strategic gap is around external connectivity (CRM, accounting), pre-sales (quote/SOW + e-sign), mobility, and AI assistance. A focused 12-month roadmap can close the highest-leverage gaps while preserving the strong differentiators that make SecureProfit Hub the right choice for Indonesian IT-security consultancies."),
        p("— End of report —", { italics: true, color: COLOR.muted, align: AlignmentType.CENTER, before: 200 }),
      ],
    },
  ],
});

const outPath = path.resolve("exports", "SecureProfitHub_vs_PSOHub_FitGap.docx");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buffer);
console.log("Wrote:", outPath, buffer.length, "bytes");
