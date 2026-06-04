import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  PageBreak,
} from "docx";
import { writeFileSync } from "node:fs";

const ACCENT = "1F7A4D";
const DARK = "0F1B14";
const GREY = "555555";

const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 140 },
    children: [new TextRun({ text, bold: true, color: ACCENT, size: 30 })],
  });
const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 90 },
    children: [new TextRun({ text, bold: true, color: DARK, size: 26 })],
  });
const h3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 160, after: 70 },
    children: [new TextRun({ text, bold: true, color: DARK, size: 23 })],
  });
const p = (runs, opts = {}) =>
  new Paragraph({
    spacing: { after: 120, line: 276 },
    alignment: opts.align,
    children: Array.isArray(runs) ? runs : [new TextRun({ text: runs, size: 22 })],
  });
const bullet = (text, level = 0) =>
  new Paragraph({
    bullet: { level },
    spacing: { after: 60, line: 268 },
    children: Array.isArray(text) ? text : [new TextRun({ text, size: 22 })],
  });
const numItem = (text, ref, level = 0) =>
  new Paragraph({
    numbering: { reference: ref, level },
    spacing: { after: 60, line: 268 },
    children: Array.isArray(text) ? text : [new TextRun({ text, size: 22 })],
  });
const t = (text, bold = false, size = 22, color) =>
  new TextRun({ text, bold, size, color });
const formula = (text) =>
  new Paragraph({
    spacing: { before: 60, after: 120 },
    shading: { fill: "F1F6F2" },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 8 } },
    children: [new TextRun({ text, font: "Consolas", size: 21, color: DARK })],
  });
const cell = (text, opts = {}) =>
  new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.header ? { fill: ACCENT } : opts.alt ? { fill: "F1F6F2" } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: opts.header || opts.bold,
            color: opts.header ? "FFFFFF" : DARK,
            size: 20,
          }),
        ],
      }),
    ],
  });
function table(headers, rows, widths) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((hd, i) => cell(hd, { header: true, width: widths?.[i] })),
  });
  const bodyRows = rows.map(
    (r, ri) =>
      new TableRow({
        children: r.map((c, i) => cell(String(c), { width: widths?.[i], alt: ri % 2 === 1 })),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" },
    },
    rows: [headerRow, ...bodyRows],
  });
}

function buildDoc(children, title) {
  return new Document({
    creator: "SecureProfit Hub",
    title,
    styles: { default: { document: { run: { font: "Calibri", size: 22, color: "1A1A1A" } } } },
    numbering: {
      config: [
        { reference: "prep", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }] },
        { reference: "demo", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }] },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1133, bottom: 1133, left: 1133, right: 1133 } } },
        children,
      },
    ],
  });
}

function cover(subtitle, tag) {
  return [
    new Paragraph({ spacing: { before: 1800 }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: "SecureProfit Hub", bold: true, color: ACCENT, size: 64 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: subtitle, bold: true, color: DARK, size: 34 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: "Project & Profitability Management System for IT Security Consulting",
          italics: true,
          color: GREY,
          size: 24,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
      children: [new TextRun({ text: tag, color: GREY, size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Prepared: June 2026", color: GREY, size: 22 })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// =====================================================================
// FULL ENGLISH DOCUMENT
// =====================================================================
const full = [];
full.push(...cover("Feature & Calculation Reference", "Internal Presentation Material"));

full.push(h1("Table of Contents"));
[
  "1.  Executive Summary",
  "2.  Technology & Architecture",
  "3.  User Roles & Access",
  "4.  Project Lifecycle",
  "5.  Core Features by Module",
  "6.  Calculations in the Application",
  "7.  End-to-End Worked Example",
  "8.  Accounting Integration (Xero)",
  "9.  Security & Access Control",
  "10. Presentation Preparation & Demo Flow",
].forEach((line) => full.push(bullet(line)));
full.push(new Paragraph({ children: [new PageBreak()] }));

full.push(h1("1. Executive Summary"));
full.push(
  p(
    "SecureProfit Hub is a full-stack web application for an IT security consulting firm. It manages the entire journey of a project — from intake by the Sales team, planning by the Project Manager, execution by consultants, through to closing and invoicing — while monitoring profit margins in real time as consultants log billable mandays.",
  ),
);
full.push(h3("Problems it solves"));
full.push(bullet("Slow, manual visibility into project profitability (usually only known once the project ends)."));
full.push(bullet("Timesheets, expenses, and invoicing scattered across many spreadsheets."));
full.push(bullet("Difficulty planning resource capacity and tracking consultant utilization."));
full.push(bullet("Error-prone invoicing and VAT recap calculations."));
full.push(h3("Key value"));
full.push(bullet("Project margin and cost are computed automatically from approved timesheets and expenses."));
full.push(bullet("A single source of truth for projects, resources, billing, and management reporting."));
full.push(bullet("Role-based access so each function only sees what is relevant."));
full.push(bullet("Direct Xero integration for issuing invoices and syncing payments."));

full.push(h1("2. Technology & Architecture"));
full.push(p("The application is built as a monorepo with a clear separation between the interface, the server, and the database."));
full.push(
  table(
    ["Layer", "Technology", "Purpose"],
    [
      ["Frontend", "React + Vite + TypeScript + Tailwind, Recharts charts", "User interface, dashboards, forms, and visualizations"],
      ["Backend", "Node.js + Express, JWT authentication", "Business logic, validation, and APIs"],
      ["Database", "PostgreSQL (via Prisma)", "Stores projects, users, timesheets, and billing"],
      ["API contract", "OpenAPI 3 + schema validation", "Keeps data consistent between server and interface"],
      ["Integration", "Xero Accounting API (OAuth2)", "Invoice issuance & payment synchronization"],
    ],
    [22, 40, 38],
  ),
);

full.push(h1("3. User Roles & Access"));
full.push(p("Every user has a role that determines the modules and data they can access. Summary of the main roles:"));
full.push(
  table(
    ["Role", "Main responsibility"],
    [
      ["Management (PMO Director)", "Full access: all projects, approvals, and every financial figure."],
      ["Project Manager (PM)", "Manages own projects, resources, and approves their team's timesheets."],
      ["Sales", "Creates clients & projects (intake); manages commercial data of own projects."],
      ["Consultant", "Logs own timesheets and updates task status."],
      ["Technical Writer", "Same as consultant, for writing/reporting work."],
      ["Project Admin", "Manages closing documents (BAST / Invoice / Contract)."],
      ["Principal (3 types)", "Supervises delivery teams (Consultant/TW/Admin) — WITHOUT access to financial figures."],
      ["Finance", "Read access to all projects/reports + VAT recap; uploads invoice/contract documents."],
      ["HR", "People operations: employees, leave, skill matrix, bench — no financial access."],
      ["Site Admin", "User administration and system audit logs."],
    ],
    [32, 68],
  ),
);
full.push(
  p([
    t("Important note: ", true),
    t("Principal, delivery (Consultant/TW), and HR roles never see contract value, cost, or margin. The Financials and Billing tabs are automatically hidden from them."),
  ]),
);

full.push(h1("4. Project Lifecycle"));
full.push(p("A project moves through the following statuses:"));
full.push(formula("DRAFT  ->  OBSERVATION  ->  ACTIVE  ->  PAUSE / COMPLETE  ->  CLOSED"));
full.push(
  table(
    ["Status", "Meaning", "Who acts"],
    [
      ["DRAFT", "Initial intake by Sales (4 basic fields).", "Sales"],
      ["OBSERVATION", "PM completes description, dates, revenue, mandays & cost.", "Project Manager"],
      ["ACTIVE", "Project is running; timesheets & expenses begin.", "Delivery team"],
      ["PAUSE / COMPLETE", "Project is paused or finished.", "PM / Management"],
      ["CLOSED", "Project is fully closed.", "Management"],
    ],
    [20, 52, 28],
  ),
);
full.push(
  p([
    t("New invoicing rule: ", true),
    t("a project can only be invoiced once it is ACTIVE or later (ACTIVE, PAUSE, COMPLETE, CLOSED). Projects still in DRAFT or OBSERVATION — i.e. not yet running — cannot issue invoices, push to Xero, or be marked INVOICED/PAID."),
  ]),
);

full.push(h1("5. Core Features by Module"));
full.push(h2("5.1 Role-Based Dashboards"));
full.push(p("Each role gets a dashboard tailored to its needs:"));
full.push(bullet("Management: executive KPIs, profit trend, billing aging, at-risk projects, PM allocation."));
full.push(bullet("Project Manager: active projects, approval inbox, utilization, revenue vs profit, alerts."));
full.push(bullet("Sales: pipeline, revenue per client, profitability trend."));
full.push(bullet("Consultant/TW: log-time prompt, trend, and my-tasks list."));
full.push(bullet("Project Admin: closing-document inbox."));
full.push(bullet("HR: headcount, business-unit/role distribution, leave, bench, skill gaps."));

full.push(h2("5.2 Project Management & Its Tabs"));
full.push(p("Each project has a detail page with the following functional tabs:"));
full.push(bullet([t("Overview — ", true), t("summary & editing of core data via a 'Review & Save' dialog.")]));
full.push(bullet([t("Timeline (Gantt) — ", true), t("task scheduling with drag-and-drop, resize, and dependency arrows.")]));
full.push(bullet([t("Tasks (WBS) — ", true), t("hierarchical work breakdown, multi-assignee, finish-to-start dependencies, billable flag.")]));
full.push(bullet([t("Resources — ", true), t("staffing of Consultant & Technical Writer teams, Project Admin, and other resources.")]));
full.push(bullet([t("RAID — ", true), t("register of Risk, Assumption, Issue, Dependency (delivery team only).")]));
full.push(bullet([t("Expenses — ", true), t("non-resource costs with an approval flow; only APPROVED items add to actual cost.")]));
full.push(bullet([t("Timesheets — ", true), t("all time entries on the project, with KPIs and bulk approval.")]));
full.push(bullet([t("Billing — ", true), t("payment milestones with %, DPP, VAT, total, due date, and invoice status.")]));
full.push(bullet([t("Financials — ", true), t("cost, profit, margin, burn rate, and forecast.")]));
full.push(bullet([t("Documents, Closing, Report, Survey, Workstreams, Activity — ", true), t("documents, closing, project reports, customer survey, workstreams, and audit trail.")]));

full.push(h2("5.3 Other Modules & Pages"));
full.push(
  table(
    ["Module", "Function"],
    [
      ["Clients", "Client data management."],
      ["Timesheets (global) + bulk entry", "Time logging & approval across projects; weekly bulk entry."],
      ["Reports", "10 ready-made reports with CSV/XLSX/PDF export."],
      ["Resource Planning", "Weekly manday load per business unit (with leave overlay)."],
      ["Bench & Capacity", "Unallocated consultants and team capacity."],
      ["Skill Matrix", "Mapping of team skills and gap identification."],
      ["Invoice Planning", "Billing projection per period (week/month) per business unit."],
      ["VAT Recap", "12-month + annual VAT recap from INVOICED/PAID invoices."],
      ["Performance Reviews", "Performance appraisal with DRAFT -> SUBMITTED -> ACKNOWLEDGED flow."],
      ["Leaves & Org Chart", "Leave management and organization chart."],
      ["Task Templates", "Reusable WBS templates applied to new projects."],
    ],
    [34, 66],
  ),
);

full.push(new Paragraph({ children: [new PageBreak()] }));
full.push(h1("6. Calculations in the Application"));
full.push(p("This section explains all core formulas the application uses to compute cost, profit, margin, tax, and billing. All currency values are in Rupiah (Rp)."));

full.push(h2("6.1 Resource Cost"));
full.push(p("Labor cost is computed from APPROVED timesheets. Logged hours are converted to days (mandays) on an 8-hour-per-day basis, then multiplied by the resource's daily rate."));
full.push(formula("days (manday) = timesheet hours / 8"));
full.push(formula("resourceCost = SUM( days x daily_rate ) for all APPROVED timesheets"));
full.push(p([t("Note: ", true), t("the rate used is the rate on the project assignment (ProjectResource); if absent, it falls back to the user's default daily rate.")]));

full.push(h2("6.2 Additional Cost"));
full.push(p("Non-labor costs (software, hardware, license, travel, other). Only APPROVED expenses count; PENDING/REJECTED items remain visible for transparency but do not add to cost."));
full.push(formula("additionalCost = SUM( amount ) for all APPROVED ProjectExpense"));

full.push(h2("6.3 Actual Cost, Profit, and Margin"));
full.push(formula("actualCost   = resourceCost + additionalCost"));
full.push(formula("actualProfit = contractValue - actualCost"));
full.push(formula("marginPct    = (actualProfit / contractValue) x 100"));
full.push(p("contractValue is the project's contract value. Margin is expressed as a percentage."));

full.push(h2("6.4 Accrued Cost"));
full.push(p("To monitor cost in flight, the application also computes accrued cost, which includes labor that is SUBMITTED but not yet approved."));
full.push(formula("accruedResourceCost = SUM( days x rate ) for APPROVED + SUBMITTED timesheets"));
full.push(formula("accruedCost = accruedResourceCost + additionalCost"));

full.push(h2("6.5 Fully-Loaded Cost (Overhead)"));
full.push(p("To reflect the company's indirect (overhead) cost, resource cost can be multiplied by a configurable overhead multiplier. This yields a more conservative 'net' cost and margin."));
full.push(formula("loadedResourceCost = resourceCost x overheadMultiplier"));
full.push(formula("netActualCost   = loadedResourceCost + additionalCost"));
full.push(formula("netActualProfit = revenueNet - netActualCost"));
full.push(formula("netMarginPct    = (netActualProfit / revenueNet) x 100"));

full.push(h2("6.6 Burn Rate & Revenue Recognition"));
full.push(p("Completion (burn rate) is measured from actual mandays versus planned mandays, capped at 100%. Revenue is recognized proportionally (following the percentage-of-completion principle / PSAK 72)."));
full.push(formula("burnRatePct = min( (actualMandays / plannedMandays) x 100 , 100 )"));
full.push(formula("recognizedRevenue = (burnRatePct / 100) x revenueNet"));

full.push(h2("6.7 DPP & VAT (Tax Split)"));
full.push(p("The contract value may be VAT-inclusive or VAT-exclusive. DPP is the taxable base (net value), and VAT is computed from it. Default rate is 11%."));
full.push(h3("If the value IS VAT-inclusive:"));
full.push(formula("DPP   = value / (1 + vatRate/100)\nVAT   = value - DPP\nTotal = value"));
full.push(h3("If the value is VAT-exclusive:"));
full.push(formula("DPP   = value\nVAT   = value x (vatRate/100)\nTotal = value + VAT"));

full.push(h2("6.8 Payment Milestones (Billing)"));
full.push(p("Each project can be split into several milestones (Terms of Payment). Each milestone carries a percentage of the contract value (or a fixed amount), then split into DPP, VAT, and Total using the formulas in 6.7."));
full.push(formula("milestone_value = (percentage / 100) x contractValue   (or fixed amount if provided)"));
full.push(p([t("Validation: ", true), t("the application warns when the milestone percentages do not total 100%.")]));

full.push(h2("6.9 Invoice Numbering"));
full.push(p("Invoice numbers are allocated sequentially and uniquely with a year/month format, then a 4-digit sequence, for example:"));
full.push(formula("INV/2026/06/0001 , INV/2026/06/0002 , ..."));
full.push(p("Numbers are allocated inside a race-safe transaction, so no duplicate numbers occur even when several invoices are created at once."));

full.push(h2("6.10 Cost Forecast"));
full.push(p("The forecast linearly projects final cost from the current burn rate. The financial endpoint aggregates approved timesheets per month and compares them against the contract value spread across the project's active months."));

full.push(h2("6.11 VAT Recap"));
full.push(p("The VAT recap sums all INVOICED and PAID invoices into a 12-month + annual breakdown for tax reporting."));

full.push(h2("6.12 Resource Utilization"));
full.push(p("Resource planning shows the manday load per week per person/business unit, accounting for leave (UserLeave). This is used to track consultant utilization and identify bench (idle capacity)."));

full.push(new Paragraph({ children: [new PageBreak()] }));
full.push(h1("7. End-to-End Worked Example"));
full.push(p("Below is an illustrative set of numbers showing how all the formulas connect on a single project."));
full.push(h3("Project assumptions"));
full.push(
  table(
    ["Parameter", "Value"],
    [
      ["Contract value (VAT-inclusive, 11%)", "Rp 1,000,000,000"],
      ["Planned mandays", "100 days"],
      ["Consultant A — daily rate", "Rp 2,000,000"],
      ["Consultant A — approved timesheet", "320 hours (= 40 days)"],
      ["Consultant B — daily rate", "Rp 1,500,000"],
      ["Consultant B — approved timesheet", "160 hours (= 20 days)"],
      ["Approved additional cost (license)", "Rp 20,000,000"],
      ["Overhead multiplier (illustrative)", "1.30"],
    ],
    [60, 40],
  ),
);
full.push(h3("Computed results"));
full.push(
  table(
    ["Component", "Calculation", "Result"],
    [
      ["resourceCost", "(40 x 2,000,000) + (20 x 1,500,000)", "Rp 110,000,000"],
      ["additionalCost", "approved license", "Rp 20,000,000"],
      ["actualCost", "110,000,000 + 20,000,000", "Rp 130,000,000"],
      ["actualProfit", "1,000,000,000 - 130,000,000", "Rp 870,000,000"],
      ["marginPct", "870,000,000 / 1,000,000,000 x 100", "87.0%"],
      ["DPP (revenueNet)", "1,000,000,000 / 1.11", "Rp 900,900,900.90"],
      ["VAT", "1,000,000,000 - 900,900,900.90", "Rp 99,099,099.10"],
      ["burnRatePct", "(60 / 100) x 100", "60%"],
      ["recognizedRevenue", "60% x 900,900,900.90", "Rp 540,540,540.54"],
      ["loadedResourceCost", "110,000,000 x 1.30", "Rp 143,000,000"],
      ["netActualCost", "143,000,000 + 20,000,000", "Rp 163,000,000"],
      ["netActualProfit", "900,900,900.90 - 163,000,000", "Rp 737,900,900.90"],
      ["netMarginPct", "737,900,900.90 / 900,900,900.90 x 100", "81.9%"],
    ],
    [24, 46, 30],
  ),
);
full.push(h3("Billing milestone example"));
full.push(p("Milestone 1 = 30% of the contract value (VAT-inclusive):"));
full.push(
  table(
    ["Component", "Calculation", "Result"],
    [
      ["Milestone value (Total)", "30% x 1,000,000,000", "Rp 300,000,000"],
      ["DPP", "300,000,000 / 1.11", "Rp 270,270,270.27"],
      ["VAT", "300,000,000 - 270,270,270.27", "Rp 29,729,729.73"],
    ],
    [30, 40, 30],
  ),
);

full.push(h1("8. Accounting Integration (Xero)"));
full.push(p("The application connects one-way to Xero (accounting software) to automate billing:"));
full.push(bullet([t("Invoice issuance — ", true), t("billing milestones are pushed as sales invoices (ACCREC) in Xero, including number, due date, and amount.")]));
full.push(bullet([t("Contact sync — ", true), t("client data is automatically created as a Xero Contact if it does not yet exist.")]));
full.push(bullet([t("Payment sync — ", true), t("payment status is pulled from Xero; a milestone is marked PAID only when Xero reports status 'PAID'.")]));
full.push(
  p([
    t("Value accuracy: ", true),
    t("invoices are pushed tax-inclusive so the invoice total exactly matches the milestone value down to the cent (avoiding the 1-cent rounding drift seen previously)."),
  ]),
);

full.push(h1("9. Security & Access Control"));
full.push(bullet("Token-based authentication (JWT) with hashed passwords (bcrypt)."));
full.push(bullet("Role-based access control (RBAC) enforced on the server — not merely hidden in the UI."));
full.push(bullet("Data filtered by role (e.g. a PM only sees own projects; delivery roles see no financial figures)."));
full.push(bullet("An audit trail (Activity) records important changes to projects and billing."));
full.push(bullet("The Xero integration uses OAuth2 with a signed state; invoice numbering is duplicate-safe."));

full.push(new Paragraph({ children: [new PageBreak()] }));
full.push(h1("10. Presentation Preparation & Demo Flow"));
full.push(h3("What to prepare"));
full.push(numItem("A login account for each role you will demo (Management, PM, Sales, Consultant).", "prep"));
full.push(numItem("One sample project already ACTIVE with timesheets, expenses, and billing milestones filled in.", "prep"));
full.push(numItem("A storyline: from Sales intake -> PM planning -> consultant execution -> billing & Xero.", "prep"));
full.push(numItem("This document as a handout, and an internet connection for the Xero demo (optional).", "prep"));
full.push(h3("Suggested demo flow (~15 minutes)"));
full.push(numItem("Log in as Management — show the executive dashboard (KPIs, profit trend, at-risk projects).", "demo"));
full.push(numItem("Open a project — walk through the Overview, Tasks (WBS/Gantt), and Resources tabs.", "demo"));
full.push(numItem("Timesheets & Expenses tabs — show the approval flow and its effect on cost.", "demo"));
full.push(numItem("Financials tab — show cost, margin, burn rate, and forecast updating automatically.", "demo"));
full.push(numItem("Billing tab — create/view a milestone, then 'Send to Xero' to issue an invoice.", "demo"));
full.push(numItem("Close with cross-project modules: Resource Planning, Reports, and VAT Recap.", "demo"));
full.push(h3("Key talking points"));
full.push(bullet("\"Margin is visible from day one, not only after the project ends.\""));
full.push(bullet("\"Every cost figure comes from approved timesheets & expenses — not manual estimates.\""));
full.push(bullet("\"Billing and VAT are automated, connected directly to accounting (Xero).\""));
full.push(bullet("\"Each role only sees what is relevant — financials are protected from the delivery team.\""));

// APPENDIX A — CALCULATION GLOSSARY
full.push(new Paragraph({ children: [new PageBreak()] }));
full.push(h1("Appendix A — Calculation Glossary"));
full.push(
  p("A concise explanation of each financial metric, its formula, and an example figure (referencing the sample project in Section 7: contract value Rp 1,000,000,000 VAT-inclusive at 11%)."),
);
full.push(
  table(
    ["Term", "Meaning", "Formula", "Example"],
    [
      ["resourceCost", "Approved consultant labor cost", "SUM(hours / 8 x daily rate)", "Rp 110,000,000"],
      ["additionalCost", "Approved non-labor cost (license, software, etc.)", "SUM(amount) APPROVED", "Rp 20,000,000"],
      ["actualCost", "Total real project cost", "resourceCost + additionalCost", "Rp 130,000,000"],
      ["actualProfit", "Profit after actual cost", "contractValue - actualCost", "Rp 870,000,000"],
      ["marginPct", "Margin vs contract value (%)", "actualProfit / contractValue x 100", "87.0%"],
      ["DPP (revenueNet)", "Net revenue excluding VAT", "value / 1.11 (inclusive)", "Rp 900,900,900.90"],
      ["VAT (PPN)", "Tax embedded in the contract value", "value - DPP", "Rp 99,099,099.10"],
      ["burnRatePct", "Completion (actual vs planned mandays, max 100%)", "min(actualMandays / plannedMandays x 100, 100)", "60%"],
      ["recognizedRevenue", "Revenue recognized by progress (PSAK 72)", "burnRatePct x DPP", "Rp 540,540,540.54"],
      ["loadedResourceCost", "Labor cost after overhead loading", "resourceCost x overheadMultiplier", "Rp 143,000,000"],
      ["netActualCost", "Fully-loaded total cost (incl. overhead)", "loadedResourceCost + additionalCost", "Rp 163,000,000"],
      ["netActualProfit", "Fully-loaded net profit (vs DPP)", "revenueNet - netActualCost", "Rp 737,900,900.90"],
      ["netMarginPct", "Fully-loaded net margin (%)", "netActualProfit / revenueNet x 100", "81.9%"],
    ],
    [17, 33, 30, 20],
  ),
);
full.push(
  p([
    t("Two kinds of margin: ", true),
    t("marginPct (87.0%) is the quick view — gross contract value minus direct cost only. netMarginPct (81.9%) is the realistic view — net revenue (excluding VAT) minus overhead-loaded cost, so it is always lower and more honest for decision-making."),
  ]),
);

const fullDoc = buildDoc(full, "SecureProfit Hub — Feature & Calculation Reference");
const fullBuf = await Packer.toBuffer(fullDoc);
writeFileSync("exports/SecureProfit-Hub-Features-and-Calculations-EN.docx", fullBuf);
console.log("WROTE exports/SecureProfit-Hub-Features-and-Calculations-EN.docx", fullBuf.length);

// =====================================================================
// 2-PAGE EXECUTIVE SUMMARY (English)
// =====================================================================
const ex = [];
ex.push(
  new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: "SecureProfit Hub", bold: true, color: ACCENT, size: 40 })],
  }),
  new Paragraph({
    spacing: { after: 40 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 4 } },
    children: [new TextRun({ text: "Executive Summary", bold: true, color: DARK, size: 28 })],
  }),
  new Paragraph({
    spacing: { after: 160 },
    children: [
      new TextRun({
        text: "Project & Profitability Management System for IT Security Consulting — June 2026",
        italics: true,
        color: GREY,
        size: 20,
      }),
    ],
  }),
);

ex.push(h3("Overview"));
ex.push(
  p(
    "SecureProfit Hub is a full-stack web application that manages the entire lifecycle of a consulting project — from Sales intake, PM planning, and consultant execution, through to closing, invoicing, and payment. Its core differentiator is real-time profitability: project cost and margin are computed automatically from approved timesheets and expenses, so management sees financial health from day one rather than only at project close.",
  ),
);

ex.push(h3("What it delivers"));
ex.push(bullet("Real-time cost, profit, and margin per project, driven by approved data — not manual estimates."));
ex.push(bullet("End-to-end project workflow: WBS/Gantt scheduling, resourcing, RAID, timesheets, and expenses with approval flows."));
ex.push(bullet("Automated billing: payment milestones with DPP/VAT split, sequential invoice numbering, and direct Xero integration."));
ex.push(bullet("Capacity and people management: resource planning, bench, skill matrix, utilization, leave, and performance reviews."));
ex.push(bullet("Management reporting: role-based dashboards, 10 exportable reports, invoice planning, and annual VAT recap."));
ex.push(bullet("Role-based access control: financial figures are protected from delivery, principal, and HR roles."));

ex.push(h3("How the numbers work (at a glance)"));
ex.push(
  table(
    ["Metric", "Formula"],
    [
      ["Resource cost", "SUM(hours/8 x daily rate) for APPROVED timesheets"],
      ["Additional cost", "SUM(amount) for APPROVED expenses"],
      ["Actual cost / profit", "resourceCost + additionalCost ; contractValue - actualCost"],
      ["Margin", "(actualProfit / contractValue) x 100"],
      ["DPP / VAT (inclusive)", "DPP = value / 1.11 ; VAT = value - DPP (11% default)"],
      ["Revenue recognized", "(actualMandays / plannedMandays, max 100%) x net revenue"],
    ],
    [30, 70],
  ),
);

ex.push(h3("Why it matters"));
ex.push(
  p(
    "The firm gains early warning on margin erosion, a single source of truth replacing fragmented spreadsheets, faster and error-free invoicing connected to accounting, and clear visibility into consultant utilization — all under enforced, role-appropriate access. The result is tighter project governance and protected profitability.",
  ),
);
ex.push(
  p([
    t("Demo in ~15 minutes: ", true),
    t("Management dashboard -> a live project (Overview, Tasks, Resources) -> Timesheets/Expenses approval -> Financials (margin, burn rate, forecast) -> Billing 'Send to Xero' -> cross-project Reports & VAT Recap."),
  ]),
);

const exDoc = buildDoc(ex, "SecureProfit Hub — Executive Summary");
const exBuf = await Packer.toBuffer(exDoc);
writeFileSync("exports/SecureProfit-Hub-Executive-Summary-EN.docx", exBuf);
console.log("WROTE exports/SecureProfit-Hub-Executive-Summary-EN.docx", exBuf.length);
