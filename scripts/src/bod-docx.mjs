// Build the BOD overview DOCX from docs/bod-assets/* screenshots + diagrams.
// Usage: node scripts/src/bod-docx.mjs
// Output: docs/SecureProfit-Hub-BOD-Overview.docx

import { AlignmentType, Paragraph, TextRun } from "docx";
import path from "node:path";

import {
  b,
  bullets,
  caption,
  h1,
  h2,
  h3,
  img,
  p,
  spacer,
  t,
  table,
  writeDocx,
} from "./bod-docx-lib.mjs";

const OUT = path.resolve("docs/SecureProfit-Hub-BOD-Overview.docx");

// ---------- content ----------

const children = [];

// Cover
children.push(
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
    children: [
      new TextRun({
        text: "Board of Directors — Product & Business Process Overview",
        size: 28,
        color: "334155",
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 300 },
    children: [new TextRun({ text: "July 2026", size: 24, color: "64748B" })],
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
);

// Contents overview (manual, no field codes)
children.push(
  h1("Contents"),
  ...bullets([
    "1. Executive Summary",
    "2. The End-to-End Business Process — from CRM lead to closed project",
    "3. Project Lifecycle & Governance Gates",
    "4. Clocking — Timesheets, Approvals and Work-Hours Compliance",
    "5. Billing & Invoicing — Milestones, Xero and VAT",
    "6. Management Reporting & Decision Support",
    "7. Client Experience — Portal and Satisfaction Survey",
    "8. Feature Guide — Module Reference",
    "9. Roles & Access Control",
    "Appendix — Glossary",
  ]),
);

// 1. Executive summary
children.push(
  h1("1. Executive Summary"),
  p([
    b("SecureProfit Hub"),
    t(
      " is the company's single system of record for the entire consulting delivery business: sales pipeline, project execution, consultant time, project cost, invoicing and management reporting. It replaces the patchwork of spreadsheets previously used to track projects and margins with one governed, role-based platform used by every function — Sales, PMO, Project Managers, Consultants, Technical Writers, Finance and HR.",
    ),
  ]),
  p([
    t("The platform is built around one core question: "),
    b("“Is every project still profitable — and will it stay profitable at completion?”"),
    t(
      " Every feature feeds that answer. Consultant hours become project cost the moment they are approved. Billing milestones become cash-flow visibility the moment they are invoiced through Xero. Risks, delays and margin erosion surface automatically on the management dashboard and in the AI Executive Copilot briefing.",
    ),
  ]),
  h2("What the Board should take away"),
  ...bullets([
    [
      b("One flow, no gaps: "),
      t(
        "a deal won in Pipedrive becomes a project request, is assigned to a PM, staffed, executed, invoiced through Xero, delivered with a signed BAST, and closed with a customer satisfaction survey — all inside one system with a full audit trail.",
      ),
    ],
    [
      b("Profitability is live, not retrospective: "),
      t(
        "margin, cost burn and profit outlook are recalculated from approved timesheets and expenses in real time, per project and across the portfolio.",
      ),
    ],
    [
      b("Governance is enforced by the system: "),
      t(
        "a project cannot go active without a team, a task plan, a risk register and a complete billing plan; it cannot close until every billing milestone has been invoiced, every risk is resolved and the signed acceptance document is on file.",
      ),
    ],
    [
      b("Access is least-privilege by design: "),
      t(
        "consultants never see rates or financials; Finance sees accounting views but not delivery internals; clients see progress only, through a secured read-only portal.",
      ),
    ],
  ]),
  img("dashboard.png"),
  caption("Figure 1 — Management dashboard: portfolio KPIs, margins and risk at a glance (demo data)."),
);

// 2. End-to-end process
children.push(
  h1("2. The End-to-End Business Process"),
  p(
    "The diagram below shows the complete journey from a lead in the CRM to a closed, invoiced and evaluated project. The remainder of this chapter walks through each of the eight stages with screenshots from the live system.",
  ),
  img("flow-end-to-end.png", { fromDiagrams: true }),
  caption("Figure 2 — End-to-end business process across eight stages."),

  h2("Stage 1 — Lead Intake (Pipedrive CRM)"),
  p(
    "Open deals are imported from Pipedrive, the sales team's CRM, so the pipeline in SecureProfit Hub always mirrors the commercial reality. Each lead carries its stage (New, Qualified, Proposal, Negotiation, Won, Lost), owner, region, source and value; the pipeline board shows the weighted pipeline value in IDR at the top. Sales can also register leads manually or import them via CSV.",
  ),
  img("leads.png"),
  caption("Figure 3 — Sales pipeline with deals imported from Pipedrive (demo data)."),

  h2("Stage 2 — Bidding Won → Project Request"),
  p(
    "When a bid is won, Sales converts the lead into a project request with one click. The conversion is the only way Sales can create a project — a deliberate control that keeps the pipeline and the project portfolio consistent. The new project enters as a DRAFT carrying the contract value, client and scope description from the lead, and every subsequent change is captured in the audit trail.",
  ),
  img("projects-list.png"),
  caption("Figure 4 — Project portfolio list: status, client, value and margin per project."),

  h2("Stage 3 — PM Assignment"),
  p(
    "New DRAFT requests are flagged on the PMO Director's dashboard. The Director reviews the request and assigns a Project Manager; the project then moves to OBSERVATION. Ownership is explicit — one accountable PM per project — and the assignment itself is audited.",
  ),
  img("project-overview.png"),
  caption("Figure 5 — Project overview: commercial terms, dates, team and status in one place."),

  h2("Stage 4 — Project Setup (OBSERVATION)"),
  p(
    "During OBSERVATION the PM prepares everything required for a controlled start. The system will not allow the project to go ACTIVE until four conditions are met — this is the readiness gate:",
  ),
  ...bullets([
    [b("Staffing plan: "), t("named consultants with planned mandays and daily rates (Resources tab).")],
    [b("Task plan: "), t("a work-breakdown structure with dates and dependencies (Tasks tab).")],
    [b("Risk register: "), t("at least one assessed RAID item — risks, assumptions, issues, dependencies.")],
    [b("Billing plan: "), t("payment milestones that together cover exactly 100% of the contract value.")],
  ]),
  img("project-tasks.png"),
  caption("Figure 6 — Task plan (WBS) with assignees, status and progress."),
  img("project-resources.png"),
  caption("Figure 7 — Staffing plan: planned mandays and daily rates per team member."),
  img("project-raid.png"),
  caption("Figure 8 — RAID register with impact × likelihood risk scoring."),

  h2("Stage 5 — Execution & Monitoring (ACTIVE)"),
  p(
    "Once active, delivery runs on three rails: the task board and Gantt timeline for schedule, timesheets and expenses for cost, and the financials tab for margin. The Gantt view supports drag-and-drop rescheduling, dependency arrows and critical-path highlighting, so the PM sees immediately which delays threaten the end date.",
  ),
  img("project-timeline.png"),
  caption("Figure 9 — Project timeline with Gantt chart and milestones."),
  p(
    "The Financials tab is where cost meets contract. Actual cost is the sum of approved timesheet cost and approved expenses; margin and profit outlook are recalculated continuously, and a burn-rate forecast projects whether the project will still be profitable at completion — long before the final invoice.",
  ),
  img("project-financials.png"),
  caption("Figure 10 — Live project financials: cost breakdown, margin, health and profit outlook."),

  h2("Stage 6 — Invoicing (Xero)"),
  p(
    "Each billing milestone is invoiced when due: the system allocates a sequential invoice number, produces the invoice, and pushes it to Xero with one click. When the client pays, “Sync from Xero” pulls the payment status back and the milestone is marked PAID. Chapter 5 covers billing in detail.",
  ),
  img("project-billing.png"),
  caption("Figure 11 — Billing plan (Terms of Payment) with DPP/VAT split and Xero actions."),

  h2("Stage 7 — Delivery"),
  p(
    "Deliverable reports are produced by the delivery team and technical writers, and all project documents — contract, invoices, reports and the signed acceptance document (BAST) — are stored in the project's document vault, so the complete commercial and delivery record lives with the project.",
  ),
  img("project-documents.png"),
  caption("Figure 12 — Document vault: contract, invoices, reports and BAST in one place."),

  h2("Stage 8 — Closing & Customer Satisfaction"),
  p(
    "Closing is gated just as strictly as starting. A project can only be marked COMPLETE when every task is done, no timesheet or expense approvals are pending, no billing milestone is left unresolved, no risk remains open, and the signed BAST is uploaded. The closing checklist shows exactly what is still missing.",
  ),
  img("project-closing.png"),
  caption("Figure 13 — Closing checklist: the completion gate in action."),
  p(
    "After delivery, the client is invited to complete a short satisfaction survey. Results are stored with the project, giving management a quality signal alongside the financial outcome. The project is then CLOSED and becomes read-only.",
  ),
  img("project-survey.png"),
  caption("Figure 14 — Customer satisfaction survey results on the project record."),
);

// 3. Lifecycle
children.push(
  h1("3. Project Lifecycle & Governance Gates"),
  p(
    "Every project moves through a fixed lifecycle. The two transitions that matter commercially — going active and closing — are protected by server-enforced gates that apply to every role, including Management. A blocked transition returns the exact list of missing items, so there is never ambiguity about what remains.",
  ),
  img("flow-lifecycle.png", { fromDiagrams: true }),
  caption("Figure 15 — Project status lifecycle with readiness and completion gates."),
  ...bullets([
    [b("DRAFT: "), t("a project request from Sales — commercial data only, no delivery activity yet.")],
    [b("OBSERVATION: "), t("a PM is assigned and prepares staffing, tasks, risks and the billing plan.")],
    [
      b("ACTIVE: "),
      t("delivery in progress — time, expenses, billing and progress tracking are all live. A project may be temporarily PAUSED and resumed."),
    ],
    [b("COMPLETE: "), t("all gate conditions met, BAST signed; delivery is finished.")],
    [b("CLOSED: "), t("archived and read-only; the record remains available for reporting and audits.")],
  ]),
  p(
    "Non-commercial projects (internal, pre-sales and training) follow the same lifecycle but skip the billing-plan and BAST requirements, and their reporting is cost-only — so internal work is managed with the same discipline without artificial commercial fields.",
  ),
);

// 4. Clocking
children.push(
  h1("4. Clocking — Timesheets, Approvals and Work-Hours Compliance"),
  p(
    "Consultant time is the company's inventory. The clocking flow is designed so that every billable hour is captured once, approved once, and immediately reflected in project cost — no spreadsheets, no re-keying, no month-end surprises.",
  ),
  img("flow-timesheet.png", { fromDiagrams: true }),
  caption("Figure 16 — From logged hours to project cost and margin."),
  h2("Logging and submitting hours"),
  p(
    "Consultants and technical writers log hours against a specific project and task, from the web application or the mobile app. Entries start as DRAFT and can be edited freely; when submitted, the project's PM is notified in-app (and by email when email notifications are enabled). Each consultant sees a personal history with totals by status.",
  ),
  img("my-timesheets.png"),
  caption("Figure 17 — A consultant's personal timesheet history (demo data)."),
  h2("Approval"),
  p(
    "PMs review submissions in a dedicated Approval Inbox — individually or with “Approve all submitted”. Hours that exceed the staffing plan are flagged before approval, so over-runs are a conscious decision rather than an accident. Rejected entries return to the consultant with a reason for correction and resubmission.",
  ),
  img("approvals.png"),
  caption("Figure 18 — The PM's approval inbox with over-plan warnings."),
  img("project-timesheets.png"),
  caption("Figure 19 — Project-level timesheet view: manday consumption against plan."),
  h2("Cost impact and compliance"),
  ...bullets([
    [
      b("Cost formula: "),
      t("approved hours ÷ 8 × the consultant's daily rate — posted to the project the moment the entry is approved."),
    ],
    [
      b("Utilization: "),
      t("approved hours also feed the bench report, resource planning and capacity views used by the PMO and HR."),
    ],
    [
      b("Work-hours compliance: "),
      t("HR monitors a 40-hour week per person, with approved leave automatically lowering the weekly target."),
    ],
  ]),
  img("work-hours.png"),
  caption("Figure 20 — Work-hours compliance monitoring (HR view)."),
);

// 5. Billing
children.push(
  h1("5. Billing & Invoicing — Milestones, Xero and VAT"),
  p(
    "Billing follows the Terms of Payment agreed with the client: the contract value is split into milestones (for example 30% down payment, 40% mid-delivery, 30% after BAST) that must total exactly 100% before the project can go active. Each milestone amount is automatically split into DPP (taxable base) and 11% VAT.",
  ),
  img("flow-billing.png", { fromDiagrams: true }),
  caption("Figure 21 — Billing flow: milestones to cash, synchronized with Xero."),
  p(
    "When a milestone is invoiced, the system allocates a sequential invoice number (INV/YYYY/MM/NNNN), generates the invoice and pushes it to Xero, the company's accounting ledger. Payment is tracked in Xero by Finance; “Sync from Xero” pulls the status back, and a milestone is marked PAID only when Xero confirms full payment — so revenue recognition in the delivery system always agrees with the books.",
  ),
  img("invoice-planning.png"),
  caption("Figure 22 — Invoice planning: every milestone across the portfolio, bucketed by due date."),
  img("vat-recap.png"),
  caption("Figure 23 — VAT recap: 12-month and annual VAT breakdown for tax reporting."),
);

// 6. Management reporting
children.push(
  h1("6. Management Reporting & Decision Support"),
  p(
    "Management visibility is built in at three levels: the executive dashboard for daily posture, the portfolio monitor and report engine for analysis, and the AI Executive Copilot for a narrated briefing with recommended actions.",
  ),
  h2("Portfolio monitoring"),
  p(
    "The portfolio monitor tracks every active engagement's health, margin, schedule and risk on one screen, so attention lands on the projects that need it. The generic report engine adds exportable reports (CSV, Excel, PDF) across projects, financials, utilization and pipeline.",
  ),
  img("portfolio-monitor.png"),
  caption("Figure 24 — Portfolio monitor: health, margin and risk across all projects."),
  img("reports.png"),
  caption("Figure 25 — Report engine with export to CSV, Excel and PDF."),
  h2("AI Executive Copilot"),
  p([
    t(
      "The Executive Copilot produces a management briefing on demand: portfolio health score, revenue and margin posture, utilization, cash flow, outstanding invoices, delayed and high-risk projects, and a prioritized Top-5 action list. ",
    ),
    b("Every number is computed deterministically from live data"),
    t(
      " — the AI only writes the narrative around figures the system has already calculated, so the briefing is explainable and repeatable. No documents, rates or raw timesheets are ever sent to the AI provider.",
    ),
  ]),
  img("executive-copilot.png"),
  caption("Figure 26 — AI Executive Copilot: narrated portfolio briefing with recommended actions."),
  h2("Financial logic (single source of truth)"),
  ...bullets([
    [b("Actual cost"), t(" = approved timesheet cost + approved expenses.")],
    [b("Actual profit"), t(" = contract value − actual cost; margin % follows directly.")],
    [
      b("Profit outlook"),
      t(
        " projects the position at completion from the current burn rate — a young project can show a healthy margin today and still be flagged as a loss risk at completion.",
      ),
    ],
    [
      b("Earned-value metrics"),
      t(" (CPI, SPI, estimate-at-completion) and a 0–100 health score complete the early-warning picture."),
    ],
  ]),
);

// 7. Client experience
children.push(
  h1("7. Client Experience — Portal and Satisfaction Survey"),
  p(
    "Clients get transparency without access to internals. Each project can issue a secured, read-only portal link showing progress, milestones and timeline — never documents, rates or financials. The link can be revoked at any time, and invalid links reveal nothing about whether a project exists.",
  ),
  img("client-portal.png"),
  caption("Figure 27 — Client portal: read-only progress view, no login required."),
  p(
    "At delivery, the satisfaction survey closes the loop: scores and comments are stored on the project record, giving management a per-client, per-project quality trend alongside the financial result.",
  ),
);

// 8. Feature guide
children.push(
  h1("8. Feature Guide — Module Reference"),
  p("A quick reference of every module in the platform and who uses it."),
  table(
    ["Module", "What it does", "Primary users"],
    [
      ["Dashboard", "Role-specific landing page: KPIs, approvals, alerts and shortcuts.", "All roles"],
      ["Sales Pipeline (Leads)", "Pipedrive-synced deal board; convert won deals into project requests.", "Sales, Management"],
      ["Projects", "Portfolio list and the full project workspace (overview, timeline, tasks, financials, resources, expenses, timesheets, billing, documents, RAID, survey, closing).", "PM, Management, delivery team"],
      ["Time Tracking / My Timesheet", "Log, submit and track personal hours; mobile app supported.", "Consultants, Technical Writers"],
      ["Approval Inbox", "Review and approve submitted timesheets, with over-plan warnings.", "Project Managers"],
      ["Expenses", "Project expense claims with approval flow and receipt PDFs.", "Delivery team, PM, Management"],
      ["Billing & Invoice Planning", "Milestone billing, Xero push/sync, portfolio-wide invoice calendar.", "Management, Finance, PM"],
      ["VAT Recap", "Monthly and annual VAT breakdown of invoiced and paid milestones.", "Management, Finance"],
      ["Resource Planning / Bench / Capacity", "Weekly manday planning by business unit, utilization and availability.", "PMO, Management, HR, Principals"],
      ["Skill Matrix & Skill Development", "Consultant skills inventory and gap view.", "PMO, Management, HR"],
      ["Work Hours", "40-hour week compliance with leave-adjusted targets.", "HR, Management"],
      ["Reports", "Configurable report engine with CSV / Excel / PDF export.", "Management, PM"],
      ["AI Executive Copilot", "Narrated portfolio briefing with deterministic figures and Top-5 actions.", "Management"],
      ["Performance Reviews", "Structured review cycle for delivery staff.", "Management, PM, Principals"],
      ["Client Portal", "Secured read-only progress link per project.", "Clients"],
      ["Settings & Administration", "Users, roles, business units, skills, templates, email notification switch.", "Site Admin, Management"],
    ],
    [22, 53, 25],
  ),
  spacer(),
);

// 9. Roles
children.push(
  h1("9. Roles & Access Control"),
  p(
    "Access is least-privilege and enforced on the server for every request — the user interface only reflects what the server already guarantees. Two safeguards matter most to the Board: commercial data (rates, margins, financials) is invisible to delivery staff, and no role below Management can see the whole portfolio.",
  ),
  table(
    ["Role", "Scope & key permissions"],
    [
      ["Management (PMO Director)", "Full access: portfolio, financials, approvals, billing, reports, copilot. Assigns PMs and controls project status."],
      ["Project Manager", "Runs own projects end-to-end: plans, tasks, resources, RAID, billing; approves timesheets and expenses for own projects. Sees financials and rates for own projects."],
      ["Sales", "Pipeline and clients; creates project requests only by converting won leads; edits own DRAFT requests."],
      ["Consultant / Technical Writer", "Logs own time and expenses, updates assigned tasks. No rates, no financials, no other people's hours."],
      ["Admin Project", "Manages project documents and invoice administration for delivery."],
      ["Principals (3 supervisory roles)", "Supervise their delivery staff: propose staffing, view team utilization and reviews. Never see financials."],
      ["Finance", "Read-only projects/clients/reports, VAT recap, invoice planning; manages invoice and contract documents. No delivery internals."],
      ["HR", "People operations: work hours, leave, skills, bench. Hard-denied from projects, timesheet contents and financials."],
      ["Site Admin", "User and master-data administration, audit view. No commercial data."],
    ],
    [30, 70],
  ),
  spacer(),
  p(
    "Additional safeguards: daily rates are redacted by the server for everyone except Management and Project Managers; timesheet queries default to “own data only” unless the caller is explicitly entitled to more; and the client portal shares progress only — documents and financials are never exposed.",
  ),
);

// Appendix
children.push(
  h1("Appendix — Glossary"),
  table(
    ["Term", "Meaning"],
    [
      ["BAST", "Berita Acara Serah Terima — the client's signed acceptance document; required before a commercial project can close."],
      ["DPP", "Dasar Pengenaan Pajak — the taxable base of an invoice, before VAT."],
      ["VAT 11%", "Indonesian value-added tax applied on top of DPP for each billing milestone."],
      ["Terms of Payment (ToP)", "The agreed split of the contract value into billing milestones (e.g. 30/40/30)."],
      ["RAID", "Risks, Assumptions, Issues, Dependencies — the project risk register."],
      ["WBS", "Work Breakdown Structure — the hierarchical task plan."],
      ["Manday", "One person-day of consulting effort (8 hours)."],
      ["Daily rate", "The internal cost of one consultant manday, used to compute project cost."],
      ["Margin %", "Actual profit as a percentage of contract value."],
      ["Burn rate", "The pace at which planned mandays/budget are being consumed."],
      ["EVM / CPI / SPI", "Earned-value management indicators of cost and schedule efficiency."],
      ["Pipedrive", "The CRM used by Sales; open deals are imported into the pipeline view."],
      ["Xero", "The company's cloud accounting ledger; invoices are pushed to and payment status synced from Xero."],
    ],
    [25, 75],
  ),
  spacer(),
  p([
    new TextRun({
      text: "Prepared with demonstration data. Figures shown in screenshots are illustrative and do not represent actual company results.",
      italics: true,
      color: "64748B",
      size: 20,
    }),
  ]),
);

// ---------- document ----------

await writeDocx({
  children,
  outPath: OUT,
  title: "SecureProfit Hub — Board of Directors Overview",
  description: "Product and business process overview for the Board of Directors",
  headerText: "SecureProfit Hub — Board Overview · Confidential",
});
