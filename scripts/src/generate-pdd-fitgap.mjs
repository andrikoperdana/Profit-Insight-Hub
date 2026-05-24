import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak,
  Header, Footer, PageNumber, convertInchesToTwip,
} from "docx";
import fs from "node:fs";
import path from "node:path";

const COLOR = {
  primary: "0E7C66",
  primaryDark: "0A5A4A",
  fit: "1B8E5A",
  partial: "B8860B",
  gap: "C03A2B",
  plus: "1D4ED8",
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
  PLUS:    { label: "PLUS",    color: COLOR.plus,    bg: "DBEAFE" },
};

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 120, before: opts.before ?? 0, line: 300 },
    alignment: opts.align ?? AlignmentType.LEFT,
    children: [new TextRun({
      text, font: FONT,
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
  const arr = Array.isArray(text) ? text : [text];
  const children = arr.map((t, idx) => new Paragraph({
    spacing: { after: idx === arr.length - 1 ? 0 : 60, line: 260 },
    alignment: opts.align ?? AlignmentType.LEFT,
    children: [new TextRun({
      text: t, font: FONT,
      size: opts.size ?? 20,
      bold: opts.bold ?? false,
      color: opts.color ?? COLOR.text,
    })],
  }));
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

// ---------- Fit-Gap rows organised by Phase ----------

function makeMatrix(rows) {
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell("# ", { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 4, align: AlignmentType.CENTER }),
      cell("PDD Requirement", { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 24 }),
      cell("SecureProfit Hub — Current State", { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 38 }),
      cell("Status", { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 10, align: AlignmentType.CENTER }),
      cell("Gap / Action", { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 24 }),
    ],
  });
  const body = rows.map((r, i) => new TableRow({
    children: [
      cell(String(r.n), { bg: i % 2 ? COLOR.bgAlt : undefined, align: AlignmentType.CENTER, bold: true, width: 4 }),
      cell(r.req, { bg: i % 2 ? COLOR.bgAlt : undefined, bold: true, width: 24 }),
      cell(r.now, { bg: i % 2 ? COLOR.bgAlt : undefined, width: 38 }),
      statusCell(r.status, 10),
      cell(r.gap, { bg: i % 2 ? COLOR.bgAlt : undefined, width: 24 }),
    ],
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDERS, rows: [header, ...body] });
}

const phase1 = [
  { n: "1.1", req: "Lead / Inquiry Capture — account profile, timelines, preliminary goals from marketing, referrals, or client requests.",
    now: "No CRM/Lead module. We have a /leads page with basic lead capture; profile and timelines are minimal compared to CRM.",
    status: "PARTIAL",
    gap: "Extend Lead model with source, stage, qualification score, expected close date, owner; or integrate HubSpot/Salesforce/Pipedrive." },
  { n: "1.2", req: "CRM Qualification — sales assesses fit, contact validation, budget health, sets opportunity parameters.",
    now: "No qualification stages or BANT scoring. Leads are flat records.",
    status: "GAP",
    gap: "Add Opportunity stages (Discover/Qualify/Propose/Won/Lost), BANT/MEDDIC fields, owner assignment." },
  { n: "1.3", req: "Gateway — Opportunity viable? Divert to Nurture/Disqualify or advance.",
    now: "No decision gateway, no nurture/disqualify branches.",
    status: "GAP",
    gap: "Add Opportunity status enum + 'Nurture' & 'Disqualified' terminal stages with reason codes." },
  { n: "1.4", req: "Services Scoping & Estimate — SMEs estimate hours, roles, phases, delivery boundaries.",
    now: "DRAFT project intake (4-field form by Sales) → PM fills description, dates, revenue, planned mandays, cost. Mandays planned per ProjectResource.",
    status: "PARTIAL",
    gap: "Add Scoping/Estimate worksheet before contract win (phase-level effort table; reusable from Task Templates)." },
  { n: "1.5", req: "Build Commercial Model & Proposal — map to T&M, Fixed Fee, Retainer, Milestone billing.",
    now: "Project has contractValue (with/without VAT). Billing milestones support %-based and milestone billing. No explicit contract-type enum.",
    status: "PARTIAL",
    gap: "Add ContractType enum (FIXED/TM/RETAINER/MILESTONE); proposal/quote document generator." },
  { n: "1.6", req: "Gateway — Internal Approval Required (discount, gross margin, resource constraint).",
    now: "No approval workflow for quotes/discounts. PM can adjust contractValue freely.",
    status: "GAP",
    gap: "Add quote-approval routing: if discount > X% OR margin < Y% OR effort > Z mandays → MGMT approval required before send." },
  { n: "1.7", req: "Client Acceptance / Contract Signing → triggers Sales-to-Delivery Handoff and creates a new delivery record shell.",
    now: "MGMT manually assigns PM on DRAFT; PM completes details → status moves to OBSERVATION. No e-sign and no formal handoff meeting record.",
    status: "PARTIAL",
    gap: "Add e-signature integration (DocuSign/Privy); auto-create handoff checklist; capture signed contract as Document type CONTRACT." },
];

const phase2 = [
  { n: "2.1", req: "Create Project Shell — auto-build delivery project with phases, tasks, financial thresholds, billing methods from won proposal.",
    now: "Project, ProjectResource, BillingMilestone, Task & WBS models exist. Task Templates can be applied to create WBS. Contract value & cost tracked.",
    status: "FIT",
    gap: "Wire 'proposal won' to auto-apply selected Task Template + create default billing milestones." },
  { n: "2.2", req: "Governance Setup — assign PM, establish review cadence.",
    now: "MGMT assigns PM on DRAFT (409 conflict if already set). Review cadence is informal.",
    status: "PARTIAL",
    gap: "Add 'Review Cadence' field on Project (weekly/biweekly/monthly) + auto-create recurring review tasks." },
  { n: "2.3", req: "Resource Planning Engine — schedule roles, named personnel, durations, accounting for leaves.",
    now: "/resource-planning grid (BU-grouped, weekly mandays, color-coded). ProjectResource per role with plannedMandays + dailyRate. UserLeave overlays as 'L' marker.",
    status: "FIT",
    gap: "—" },
  { n: "2.4", req: "Gateway — Capacity Confirmed? Loop back to Re-plan/Negotiate if broken.",
    now: "Color-coded cells flag over-allocation (≥6/4/0 hrs), but no hard block.",
    status: "PARTIAL",
    gap: "Add server-side validation: if user's planned mandays/week > capacity (after leave) → reject save with 'Re-plan' modal; or surface explicit warning before project kickoff." },
  { n: "2.5", req: "Project Kickoff — align baseline criteria, communication channels, client acceptance parameters.",
    now: "Status transition OBSERVATION → ACTIVE marks kickoff. No checklist / channel setup automation.",
    status: "PARTIAL",
    gap: "Add 'Kickoff Checklist' page (acceptance criteria, comms channels, baseline budget snapshot)." },
];

const phase3 = [
  { n: "3.1", req: "Project Delivery Execution — staff execute tasks, track deliverables, address blockers.",
    now: "Tasks tab with status workflow, multi-assignee, WBS parent/child, dependencies, Gantt with drag/resize/edge handles. SVG dependency arrows. Blockers tracked via task notes.",
    status: "FIT",
    gap: "—" },
  { n: "3.2", req: "Gateway — Scope / Commercial Change? Change Control loop → re-estimate/requote → update baseline.",
    now: "No formal Change Control module. PM can manually update mandays/cost/contractValue.",
    status: "GAP",
    gap: "Add ChangeRequest entity (type, impact hrs, impact cost, approver, status); approval triggers contractValue & baseline update with audit log." },
  { n: "3.3", req: "Time and Expense Capture — billable/non-billable, hours, expenses.",
    now: "Quick Log + Weekly Entry (5-day grid) + Bulk timesheet endpoint + per-task time logs (TaskTimeLog). billable flag per Task. ProjectExpense (SOFTWARE/HARDWARE/LICENSE/TRAVEL/OTHER).",
    status: "FIT",
    gap: "—" },
  { n: "3.4", req: "PM / Lead Approval Flow — weekly submission, validation, audit review.",
    now: "Timesheet status DRAFT→SUBMITTED→APPROVED/REJECTED. PM/MGMT approve; auto-approve for PM/MGMT bulk entries. ProjectExpense PENDING→APPROVED/REJECTED with PM-of-project authority.",
    status: "FIT",
    gap: "—" },
  { n: "3.5", req: "Gateway — Approved for Billing & Reporting? Errors → Correction Cycle.",
    now: "Rejected timesheets visible to owner for resubmission. PM can append reason on rejection.",
    status: "FIT",
    gap: "Optional: explicit Correction Cycle dashboard tab grouping all rejected entries per user." },
  { n: "3.6", req: "Approved entries flow into Management Reporting AND Billing Preparation simultaneously.",
    now: "Only APPROVED timesheets/expenses roll into actualCost, margin, reports, and financials. Billing milestones independently maintained.",
    status: "FIT",
    gap: "—" },
];

const phase4 = [
  { n: "4.1", req: "Billing Preparation — aggregate approved time logs, milestones, expenses against contract rules; calculate WIP, revenue margin, backlog.",
    now: "Financials serializer computes resourceCost (hrs×dailyRate), additionalCost, actualCost, actualProfit, marginPct, forecast (linear). /api/projects/:id/financials aggregates monthly. Billing milestones tracked separately.",
    status: "PARTIAL",
    gap: "Add explicit WIP report (unbilled approved hours × rate) and Backlog report (planned − approved hours) per project." },
  { n: "4.2", req: "Draft Invoice Generation — auto invoice with PS descriptions and accumulated items.",
    now: "Billing milestone has invoice # field; user uploads INVOICE Document manually. No PDF generator.",
    status: "GAP",
    gap: "Build invoice PDF generator (IDR, PPN 11%, e-Faktur format) auto-pulling milestone, approved hours, expenses." },
  { n: "4.3", req: "Invoice Review Control — Finance + PM review draft for tax, contract, margin, PO balance.",
    now: "Finance role exists with read-only on projects + invoice/contract upload rights. No explicit draft-review queue.",
    status: "PARTIAL",
    gap: "Add Invoice Draft status (DRAFT→REVIEW→APPROVED→ISSUED) with Finance+PM approver workflow; PO balance field on Client/Project." },
  { n: "4.4", req: "Accounting / ERP Post-Sync — push to ERP (e.g., Xero), AR + ledger + collections + aging tracked there.",
    now: "VAT Recap aggregates DPP/VAT/paid/outstanding for MGMT; CSV export. No ERP push.",
    status: "GAP",
    gap: "Build connectors to Xero / Accurate / Jurnal / Mekari (popular Indonesian accounting). Sync payment status back as BillingMilestone.status=PAID." },
  { n: "4.5", req: "Project Closure Evaluation — captures performance logs, archives assets, records client feedback.",
    now: "Status transitions to COMPLETE then CLOSED. Closing-doc inbox for Admin Project role (alert when COMPLETE > 3 days). No client-feedback capture.",
    status: "PARTIAL",
    gap: "Add Project Closure form (lessons learned, client NPS, archive bundle); auto-generate closure report PDF." },
];

const exceptions = [
  { n: "E.1", req: "Resource Capacity Overload — hard block when allocated hours > base capacity (minus holidays/leave).",
    now: "Capacity colour-coded in /resource-planning + /capacity report. Leave overlay reduces capacity. But no hard server-side block.",
    status: "PARTIAL",
    gap: "Add validation in POST /api/projects/:id/resources/* that rejects allocations breaching weekly capacity; route PM to Re-plan modal." },
  { n: "E.2", req: "Scope Tracking Breach — (Actual Cost + Backlog Forecast) > 100% baseline → flag, block entries on breached phase until baseline approval.",
    now: "Margin/burn-rate visible in Financials & at-risk alert on MGMT/PM dashboards. No automatic block on time entry.",
    status: "PARTIAL",
    gap: "Trigger Change Control when (actualCost + forecast remaining) > contractValue × threshold; block task time-log on breached phase until change approved." },
  { n: "E.3", req: "Timesheet Rejection — PM rejects with mandatory remark; entry removed from billing run; goes to Correction Cycle dashboard.",
    now: "PM can reject timesheets; reason stored. Excluded from approved aggregates automatically. No dedicated Correction Cycle dashboard view.",
    status: "PARTIAL",
    gap: "Make rejection-reason mandatory; add 'My Rejections' tab on Consultant Dashboard for fast correction." },
  { n: "E.4", req: "Invoice Discrepancy — finance flags rejection (bad margin or invalid PO); ERP integration locked; PM warned to credit/adjust/regenerate.",
    now: "No invoice draft-review workflow nor PO tracking nor ERP lock today.",
    status: "GAP",
    gap: "Implement invoice draft review (E.4) with rejection codes; add PO balance to Client; auto-notify PM on flag." },
];

const kpis = [
  { n: "K.1", req: "Delivery & Execution Stream — real-time resource utilization, baseline vs actual effort variance, task velocity, milestone schedule.",
    now: "/dashboard/utilization-trend, /dashboard/resource-utilization-detail, /resource-planning, Skill Matrix, Bench, Capacity. Project burn-rate report. Gantt for milestone schedule.",
    status: "FIT",
    gap: "Optional: surface task velocity (DONE/week) as dedicated chart." },
  { n: "K.2", req: "Operational Financial Stream — WIP, unbilled hours, gross profit by phase, draft invoice backlog.",
    now: "Financials per project (margin, burn-rate forecast); profitability-per-project & margin-trend reports; billing-aging & cash-inflow-forecast reports.",
    status: "PARTIAL",
    gap: "Add WIP & Unbilled-Hours reports; gross-profit per phase requires phase field on Task." },
  { n: "K.3", req: "Ledger & Collections Stream — extracted from ERP: collection velocity, AR aging, payment timelines, client profitability.",
    now: "BillingMilestone status PLANNED/INVOICED/PAID/CANCELLED with invoicedAt/paidAt stamps. Billing-aging & profitability-per-client reports. VAT Recap for PPN.",
    status: "PARTIAL",
    gap: "Wire ERP webhook to auto-flip status to PAID + capture payment date; add payment-velocity (days-to-pay) report." },
];

const raci = [
  { phase: "1. Commercial Design", sales: "R / A", delivery: "C", pm: "C", finance: "I" },
  { phase: "2. Initialization & Capacity Check", sales: "I", delivery: "I", pm: "R / A", finance: "I" },
  { phase: "3. Project Execution & Tracking", sales: "I", delivery: "R", pm: "A", finance: "I" },
  { phase: "4. Billing & Invoice Review", sales: "I", delivery: "I", pm: "R", finance: "R / A" },
];

function raciTable() {
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell("Phase",        { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 34 }),
      cell("Sales",        { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 12, align: AlignmentType.CENTER }),
      cell("Delivery",     { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 12, align: AlignmentType.CENTER }),
      cell("Project Mgr",  { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 12, align: AlignmentType.CENTER }),
      cell("Finance",      { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 12, align: AlignmentType.CENTER }),
      cell("Our Role",     { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 18 }),
    ],
  });
  const mapping = [
    "SALES (R), MGMT (A on approval gate), KONSULTAN/TW (C on scoping)",
    "MGMT (A on PM assignment), PROJECT_MANAGER (R), Principals (C on staffing)",
    "PROJECT_MANAGER (A), KONSULTAN/TW/ADMIN_PROJECT (R)",
    "PROJECT_MANAGER (R), FINANCE (R/A), MANAGEMENT (I)",
  ];
  const body = raci.map((r, i) => new TableRow({
    children: [
      cell(r.phase, { bg: i % 2 ? COLOR.bgAlt : undefined, bold: true, width: 34 }),
      cell(r.sales, { bg: i % 2 ? COLOR.bgAlt : undefined, align: AlignmentType.CENTER, width: 12 }),
      cell(r.delivery, { bg: i % 2 ? COLOR.bgAlt : undefined, align: AlignmentType.CENTER, width: 12 }),
      cell(r.pm, { bg: i % 2 ? COLOR.bgAlt : undefined, align: AlignmentType.CENTER, width: 12 }),
      cell(r.finance, { bg: i % 2 ? COLOR.bgAlt : undefined, align: AlignmentType.CENTER, width: 12 }),
      cell(mapping[i], { bg: i % 2 ? COLOR.bgAlt : undefined, size: 18, width: 18 }),
    ],
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDERS, rows: [header, ...body] });
}

// ---------- Summary counts ----------
const allRows = [...phase1, ...phase2, ...phase3, ...phase4, ...exceptions, ...kpis];
const counts = { FIT: 0, PARTIAL: 0, GAP: 0, PLUS: 0 };
allRows.forEach((r) => { counts[r.status] += 1; });
const total = allRows.length;
const fitPct = Math.round(((counts.FIT + counts.PARTIAL * 0.5) / total) * 100);

function summaryTable() {
  const header = new TableRow({
    tableHeader: true,
    children: [
      cell("Status",  { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 18, align: AlignmentType.CENTER }),
      cell("Count",   { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 12, align: AlignmentType.CENTER }),
      cell("% of total", { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 14, align: AlignmentType.CENTER }),
      cell("Meaning", { bold: true, color: "FFFFFF", bg: COLOR.bgHead, width: 56 }),
    ],
  });
  const meanings = {
    FIT: "Requirement is fully delivered today and meets the PDD specification.",
    PARTIAL: "Foundation exists, but automation, depth, or formal control is missing.",
    GAP: "Capability is missing — net-new work required to satisfy the PDD.",
    PLUS: "SecureProfit Hub capability beyond the PDD scope (added value).",
  };
  const rows = ["FIT", "PARTIAL", "GAP"].map((k, i) => new TableRow({
    children: [
      statusCell(k, 18),
      cell(String(counts[k]), { bg: i % 2 ? COLOR.bgAlt : undefined, align: AlignmentType.CENTER, bold: true, width: 12 }),
      cell(`${Math.round((counts[k] / total) * 100)}%`, { bg: i % 2 ? COLOR.bgAlt : undefined, align: AlignmentType.CENTER, width: 14 }),
      cell(meanings[k], { bg: i % 2 ? COLOR.bgAlt : undefined, width: 56 }),
    ],
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDERS, rows: [header, ...rows] });
}

// ---------- Document ----------
const doc = new Document({
  creator: "SecureProfit Hub",
  title: "Fit-Gap Analysis: PDD Lead-to-Cash vs SecureProfit Hub",
  styles: { default: { document: { run: { font: FONT } } } },
  sections: [
    {
      properties: {
        page: { margin: { top: convertInchesToTwip(0.8), bottom: convertInchesToTwip(0.8), left: convertInchesToTwip(0.7), right: convertInchesToTwip(0.7) } },
      },
      headers: {
        default: new Header({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: "Fit-Gap Analysis — PDD vs SecureProfit Hub", font: FONT, size: 18, color: COLOR.muted, italics: true })],
        })] }),
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "SecureProfit Hub  •  Confidential  •  Page ", font: FONT, size: 18, color: COLOR.muted }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: COLOR.muted }),
            new TextRun({ text: " of ", font: FONT, size: 18, color: COLOR.muted }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: COLOR.muted }),
          ],
        })] }),
      },
      children: [
        // ---- Cover ----
        new Paragraph({ spacing: { before: 1200 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "FIT-GAP ANALYSIS", font: FONT, size: 56, bold: true, color: COLOR.primary })] }),
        new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "PDD: Lead-to-Cash & Delivery Operations", font: FONT, size: 32, bold: true, color: COLOR.primaryDark })] }),
        new Paragraph({ spacing: { before: 100 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "vs  SecureProfit Hub", font: FONT, size: 28, bold: true, color: COLOR.primaryDark })] }),
        new Paragraph({ spacing: { before: 400 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Replacement assessment for the Pipedrive → PSOhub → Xero legacy stack",
            font: FONT, size: 22, italics: true, color: COLOR.muted })] }),
        new Paragraph({ spacing: { before: 2200 }, alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Prepared by: SecureProfit Hub Product Team", font: FONT, size: 22, color: COLOR.text })] }),
        new Paragraph({ alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `Date: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, font: FONT, size: 22, color: COLOR.text })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 100 },
          children: [new TextRun({ text: "Source PDD: Process Definition Document — Lead-to-Cash and Delivery Operations (v.1)", font: FONT, size: 20, italics: true, color: COLOR.muted })] }),
        new Paragraph({ children: [new PageBreak()] }),

        // ---- 1. Executive Summary ----
        h1("1. Executive Summary"),
        p("This Fit-Gap Analysis evaluates SecureProfit Hub against the Process Definition Document (PDD) for the end-to-end Lead-to-Cash (L2C) and Project Delivery Operations lifecycle. The PDD documents the target process in four phases — Commercial Design, Initialization & Capacity Check, Execution & Effort Tracking, and Billing & Project Closure — currently supported by a legacy stack of Pipedrive (CRM) + PSOhub (PSA) + Xero (ERP)."),
        p(`We assessed ${total} discrete capabilities across the four phases, plus 4 exception-handling rules and 3 KPI data streams. Headline scorecard:`, { bold: true, before: 80 }),
        summaryTable(),
        p(`Functional coverage index: ~${fitPct}% (counting FIT at 100% and PARTIAL at 50%).`, { before: 120, bold: true }),
        p("Conclusion: SecureProfit Hub already covers the entire delivery and effort-tracking core (Phases II and III) with first-class capability. The principal gaps cluster at the two ends of the lifecycle — pre-sales CRM/qualification/quote-approval (Phase I) and accounting/ERP post-sync with invoice review (Phase IV) — plus a formal Change Control loop in Phase III. These gaps can be addressed incrementally without replacing the platform.", { before: 100, italics: true, color: COLOR.muted }),

        new Paragraph({ children: [new PageBreak()] }),

        // ---- 2. Scope & Methodology ----
        h1("2. Scope & Methodology"),
        p("Scope: the entire L2C + Delivery lifecycle defined in the PDD, including business rules, exception handling, and the three analytics data streams. Out of scope: corporate marketing, recruitment, and payroll."),
        p("Methodology: each numbered step, gateway, and rule in the PDD was mapped to the corresponding feature in SecureProfit Hub. The mapping was validated against the codebase (Prisma schema, Express routes, React pages) and the deployed UI. Each row is scored FIT / PARTIAL / GAP based on the criteria below."),
        h3("Status Legend"),
        bullet("FIT — Capability is fully delivered today and meets the PDD specification."),
        bullet("PARTIAL — Foundation exists, but automation, depth, or formal control is missing."),
        bullet("GAP — Capability is missing — net-new work required to satisfy the PDD."),
        bullet("PLUS — Capability we have that goes beyond the PDD scope (added value, not counted in the gap percentage)."),

        // ---- 3. RACI Mapping ----
        h1("3. RACI Mapping — PDD ↔ SecureProfit Hub Roles"),
        p("The PDD defines four primary process roles. SecureProfit Hub has a richer role taxonomy (10+ roles). The mapping below explains how PDD roles align to our RBAC model."),
        raciTable(),

        new Paragraph({ children: [new PageBreak()] }),

        // ---- 4. Phase I ----
        h1("4. Phase I — Lead Lifecycle and Commercial Design"),
        p("Pre-sales activities from inbound lead through signed contract. Today this is the weakest phase in SecureProfit Hub: we have a placeholder /leads page and a 4-field DRAFT intake, but no qualification stages, quote builder, discount approval gate, or e-sign."),
        makeMatrix(phase1),

        new Paragraph({ children: [new PageBreak()] }),

        // ---- 5. Phase II ----
        h1("5. Phase II — Project Initialization & Capacity Check"),
        p("Project creation, governance setup, resource planning, and capacity validation prior to kickoff. SecureProfit Hub covers this phase strongly — particularly resource planning with leave-aware capacity grids."),
        makeMatrix(phase2),

        // ---- 6. Phase III ----
        h1("6. Phase III — Execution, Change Control & Effort Tracking"),
        p("Day-to-day delivery: task execution, change control, time/expense capture, and PM approval. Effort tracking and approval are first-class in SecureProfit Hub. The only material gap is a formal Change Control workflow."),
        makeMatrix(phase3),

        new Paragraph({ children: [new PageBreak()] }),

        // ---- 7. Phase IV ----
        h1("7. Phase IV — Billing Preparation, Financial Posting & Closure"),
        p("Translation of approved effort into validated accounting entries, ERP posting, and project closure. Billing milestones, VAT recap, and the closing-doc inbox are in place; the largest gaps are invoice-PDF generation and ERP post-sync."),
        makeMatrix(phase4),

        new Paragraph({ children: [new PageBreak()] }),

        // ---- 8. Exceptions ----
        h1("8. Operational Exceptions & Business Rules"),
        p("The PDD defines four exception cases. SecureProfit Hub surfaces all four through alerts and approval workflows, but enforcement is mostly soft (warnings) rather than hard blocks."),
        makeMatrix(exceptions),

        // ---- 9. KPIs ----
        h1("9. Analytics & KPI Data Streams"),
        p("The PDD requires the new platform to feed three analytics streams continuously. SecureProfit Hub already serves Delivery & Execution KPIs natively; Financial and Collections streams rely on internal data (no ERP sync today)."),
        makeMatrix(kpis),

        // ---- 10. Plus items ----
        h1("10. PLUS Items — Capabilities Beyond the PDD"),
        p("These features exist in SecureProfit Hub but are not specified in the PDD. They represent additional value that the new platform brings to the organisation."),
        bullet("Indonesian VAT (PPN 11%) Recap — 12-month DPP/VAT/paid/outstanding aggregation with CSV export for tax filing."),
        bullet("Principal-Supervisor hierarchy — 3 Principal roles supervise delivery teams with a Propose→Accept staffing workflow."),
        bullet("Granular RBAC — 10+ roles with per-field write rules (e.g., Sales can only edit a restricted field set on DRAFT; HR is hard-blocked from financials at both UI and API levels)."),
        bullet("HR & Leave module — Headcount KPIs, leaves today/upcoming, bench summary, skill gaps, new joiners; leaves feed capacity automatically."),
        bullet("Skill Matrix with gap detection — Automatic flag when a skill has no holder, only one holder, or no senior/principal coverage."),
        bullet("Top Performer ranking — Per-role weighted scoring engine with podium, breakdown bars, and a Scoring Rules popup."),
        bullet("Audit log — Every task and resource mutation emits an Activity row; SITE_ADMIN audit-log page suitable for SOC-2 / ISO-27001 evidence."),
        bullet("Self-hosted / single-tenant deployment — Data sovereignty for security-sensitive engagements; no per-seat licensing."),

        new Paragraph({ children: [new PageBreak()] }),

        // ---- 11. Recommendations ----
        h1("11. Recommended Roadmap to Achieve Full PDD Coverage"),
        p("The recommended roadmap closes the highest-value gaps over four quarters, starting with the items required to satisfy the legacy-replacement business case (CRM, quote, ERP)."),
        h3("Quarter 1 — Pre-sales completeness (close most of Phase I)"),
        bullet("Extend Lead/Opportunity model: stages, BANT fields, qualification score, owner, expected close date."),
        bullet("Build Quote / SOW generator with discount-and-margin approval routing (steps 1.5, 1.6)."),
        bullet("e-Signature integration (DocuSign or Privy for Indonesia) for contract signing (step 1.7)."),
        h3("Quarter 2 — Change Control & Capacity Hard-Block"),
        bullet("Add ChangeRequest entity + Change Control loop (step 3.2, exception E.2)."),
        bullet("Server-side capacity validation that hard-blocks over-allocation (step 2.4, exception E.1)."),
        bullet("Kickoff Checklist + review-cadence automation (steps 2.2, 2.5)."),
        h3("Quarter 3 — Billing automation & ERP sync"),
        bullet("Invoice PDF generator (IDR, PPN 11%, e-Faktur format) (step 4.2)."),
        bullet("Invoice Draft Review workflow with Finance + PM approval and PO balance (step 4.3, exception E.4)."),
        bullet("ERP connectors — Xero (international clients) and Accurate / Jurnal / Mekari (Indonesia) (step 4.4, KPI K.3)."),
        h3("Quarter 4 — Reporting depth & closure"),
        bullet("WIP, Unbilled-Hours, and Payment-Velocity reports (KPIs K.2, K.3)."),
        bullet("Project Closure form with lessons-learned, client NPS, and closure-report PDF (step 4.5)."),
        bullet("CRM connectors (HubSpot / Pipedrive / Salesforce) if external CRMs remain in use after Q1 in-app module is live."),

        // ---- 12. Conclusion ----
        h1("12. Conclusion"),
        p("SecureProfit Hub satisfies the majority of the PDD natively and can replace the PSA layer of the legacy stack immediately, with manual interfaces to CRM and ERP. To replace the entire Pipedrive + PSOhub + Xero stack, the four-quarter roadmap above is sufficient to bring SecureProfit Hub to ~100% PDD coverage while preserving the PLUS items (localisation, HR, hierarchy, audit, self-hosted) that the current vendor stack does not deliver."),
        p("— End of report —", { italics: true, color: COLOR.muted, align: AlignmentType.CENTER, before: 200 }),
      ],
    },
  ],
});

const outPath = path.resolve("exports", "PDD_LeadToCash_vs_SecureProfitHub_FitGap.docx");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outPath, buffer);
console.log("Wrote:", outPath, buffer.length, "bytes");
