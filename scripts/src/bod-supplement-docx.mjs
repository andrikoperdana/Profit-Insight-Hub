// Build the BOD supplement DOCX (architecture, security, mobile, benefits,
// roadmap, Q&A) from docs/bod-assets/* screenshots + diagrams.
// Usage: node scripts/src/bod-supplement-docx.mjs
// Output: docs/SecureProfit-Hub-BOD-Supplement.docx

import { TextRun } from "docx";
import path from "node:path";

import {
  b,
  bullets,
  caption,
  cover,
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

const OUT = path.resolve("docs/SecureProfit-Hub-BOD-Supplement.docx");

const children = [];

// Cover
children.push(
  ...cover({
    subtitle: "Board of Directors — Supplement: Architecture, Security, Mobile & Roadmap",
  }),
);

// Contents
children.push(
  h1("Contents"),
  ...bullets([
    "1. Architecture & Technology",
    "2. Security & Data Protection",
    "3. The Mobile App",
    "4. Business Benefits — Before and After",
    "5. Product Roadmap",
    "6. Anticipated Board Questions",
  ]),
  spacer(),
  p([
    t("This supplement accompanies the main document, "),
    b("SecureProfit Hub — Product & Business Process Overview"),
    t(
      ", which walks through the end-to-end business process with screenshots. This volume answers the questions that typically follow: what the platform is built on, how data is protected, what the mobile experience looks like, what the investment has changed, and where the product goes next.",
    ),
  ]),
);

// 1. Architecture & Technology
children.push(
  h1("1. Architecture & Technology"),
  p(
    "This chapter gives the Board a one-page picture of what SecureProfit Hub is made of — enough to judge that the platform is soundly built and maintainable, without requiring a technical background.",
  ),
  img("architecture.png", { fromDiagrams: true }),
  caption("Figure 1 — Three ways in, one governed core, one database of record."),
  h2("What it is built on"),
  ...bullets([
    [
      b("Web application — "),
      t("a modern browser application (React); no installation, works on any up-to-date browser."),
    ],
    [
      b("Mobile app — "),
      t(
        "iOS and Android are produced from a single codebase (Expo / React Native), so both platforms stay in step and every improvement ships to both at once.",
      ),
    ],
    [
      b("Application server — "),
      t(
        "a central Node.js service that enforces every business rule: sign-in, role-based access, lifecycle gates, cost and VAT calculations, approvals and the audit trail.",
      ),
    ],
    [
      b("One database — "),
      t(
        "a managed cloud PostgreSQL database is the single system of record. There are no parallel spreadsheets or shadow copies to reconcile.",
      ),
    ],
    [
      b("Shared contract — "),
      t(
        "web and mobile talk to the server through one formally defined API contract, so a rule changed once on the server applies identically everywhere.",
      ),
    ],
  ]),
  h2("Design principles worth knowing"),
  ...bullets([
    [
      b("The server is the referee. "),
      t(
        "Menus and buttons are hidden per role in the interface, but every rule is re-checked on the server for every request — hiding something in the UI is never the only line of defence.",
      ),
    ],
    [
      b("Calculations live in one place. "),
      t(
        "Cost, margin, forecast and VAT figures are computed by one shared routine on the server, so every screen and report shows the same number.",
      ),
    ],
    [
      b("Integrations are isolated. "),
      t(
        "Each connected service is optional and failure-isolated: if Pipedrive, Xero, email or the AI service is unavailable, the core platform keeps operating.",
      ),
    ],
  ]),
  h2("Connected services"),
  table(
    ["Service", "Direction & purpose"],
    [
      [
        "Pipedrive CRM",
        "One-way, on-demand import: open deals become leads in the pipeline view. SecureProfit Hub never writes back to Pipedrive.",
      ],
      [
        "Xero accounting",
        "Invoices for billing milestones are pushed to Xero; a milestone is only marked PAID after Xero confirms full payment.",
      ],
      [
        "Email delivery",
        "Optional alerts for key events (e.g. timesheet submitted). Off by default; Management can enable it with a single switch in Settings.",
      ],
      [
        "AI briefing service",
        "Narrates the Executive Copilot briefing from pre-computed figures. It never receives daily rates, documents or raw timesheets.",
      ],
    ],
    [25, 75],
  ),
);

// 2. Security & Data Protection
children.push(
  h1("2. Security & Data Protection"),
  p(
    "For an IT-security consulting firm, the internal platform must hold itself to the standard we advise clients to meet. Security in SecureProfit Hub is enforced on the server, applied per role, and audited.",
  ),
  h2("Access control — least privilege by default"),
  ...bullets([
    [
      b("Every request is checked. "),
      t(
        "Each of the thirteen roles has an explicit permission set, verified on the server for every single request — including requests from Management.",
      ),
    ],
    [
      b("Daily rates are the most tightly held number. "),
      t(
        "Consultant daily rates are visible only to Management and Project Managers; for everyone else the server redacts the value before it leaves the database.",
      ),
    ],
    [
      b("Financials follow the role, not curiosity. "),
      t(
        "Principals and HR never see project financials; HR is hard-denied project and timesheet data; Finance is read-only on projects.",
      ),
    ],
    [
      b("Deny by default. "),
      t(
        "Broad queries (for example, listing all timesheets) default to “own data only” unless the role is explicitly entitled to more.",
      ),
    ],
  ]),
  h2("Sign-in and sessions"),
  ...bullets([
    [
      b("Passwords are never stored. "),
      t("Only one-way hashes (bcrypt) are kept; nobody — including administrators — can read a password back."),
    ],
    [
      b("Sessions expire. "),
      t("Sign-in produces a signed session token valid for 24 hours; after that, users must sign in again."),
    ],
  ]),
  h2("What clients can and cannot see"),
  p(
    "The client portal is deliberately the most restricted surface: a private link (no account, nothing for the client to manage), read-only progress, no documents and no financials. The link can be revoked at any time, and an invalid link is indistinguishable from a non-existent one — outsiders cannot probe for live projects.",
  ),
  h2("Third parties and the AI service"),
  ...bullets([
    [
      b("AI on a need-to-know basis. "),
      t(
        "The Executive Copilot sends the AI service only pre-computed portfolio figures. Daily rates, documents and raw timesheets never leave the platform, and every number shown is calculated by the platform itself — the AI only writes the narrative.",
      ),
    ],
    [
      b("Integration credentials stay server-side. "),
      t("Pipedrive and Xero credentials are stored as server secrets and are never exposed to browsers or the mobile app."),
    ],
    [
      b("No personal data in logs. "),
      t("Responses from the email provider are never written to logs, so recipient details cannot leak through log files."),
    ],
  ]),
  h2("Infrastructure and audit"),
  ...bullets([
    [b("Encrypted in transit. "), t("All traffic — web, mobile and portal — travels over HTTPS.")],
    [
      b("Managed database. "),
      t("The database is a managed cloud service with encryption at rest, operated by a specialist provider."),
    ],
    [
      b("Audit trail. "),
      t("Key user actions are recorded in an activity log, so changes to projects can be traced to a person and a point in time."),
    ],
  ]),
);

// 3. The Mobile App
children.push(
  h1("3. The Mobile App"),
  p(
    "Consultants spend much of their time at client sites, and hours that are logged late are the main threat to cost accuracy. The mobile app (iOS and Android) puts the daily actions — clocking time, filing expenses, approving — in every consultant's pocket. It talks to the same server as the web application, so every access rule and calculation described in this document applies identically on mobile.",
  ),
  h2("Clock in, clock out"),
  p(
    "The Track screen is a one-tap timer: pick a project, optionally a task, and clock in. The timer keeps running even if the app is closed and is tied to the signed-in user, so a shared device never mixes two people's hours. A manual mode covers retrospective entries.",
  ),
  img("mobile-track.png", { maxH: 620 }),
  caption("Figure 2 — Track Time: one-tap clock-in against a project and task."),
  h2("Timesheets at a glance"),
  p(
    "My Timesheets shows the week's total, what is still awaiting approval, and the status of every entry — the same DRAFT → SUBMITTED → APPROVED flow that feeds project cost on the web.",
  ),
  img("mobile-timesheets.png", { maxH: 620 }),
  caption("Figure 3 — My Timesheets: weekly total and per-entry approval status."),
  h2("Expenses with receipts"),
  p(
    "Consultants file expense claims from the phone, attach the receipt, and follow the claim through approval. Approved expenses flow into project cost exactly as they do on the web; rejected claims show the reviewer's reason.",
  ),
  img("mobile-expenses.png", { maxH: 620 }),
  caption("Figure 4 — My Expenses: submit claims and track approval on the go."),
  p([
    t("Two further tabs round out the app: "),
    b("Approvals"),
    t(" lets Project Managers clear submitted timesheets from anywhere, and "),
    b("Alerts"),
    t(" mirrors the in-app notification bell so nothing waits for a desktop."),
  ]),
);

// 4. Business Benefits
children.push(
  h1("4. Business Benefits — Before and After"),
  p(
    "The clearest way to judge the platform is to compare how the same question was answered before and after. The table below is qualitative by design — demonstration data does not support honest quantitative claims yet, and the Board should expect a measured baseline after the first full quarter of live use.",
  ),
  table(
    ["Question", "Before — spreadsheets", "With SecureProfit Hub"],
    [
      [
        "Is this project profitable?",
        "Reconstructed at quarter-end from separate rate cards, timesheet files and invoice trackers.",
        "Live margin per project, updated the moment hours or expenses are approved, plus a projection to completion.",
      ],
      [
        "Can this project go live / close?",
        "Judgement call; missing paperwork often discovered after the fact.",
        "Hard gates: a project cannot activate without a team, plan, risks and billing plan — and cannot close until every milestone is invoiced and the signed BAST is on file.",
      ],
      [
        "Where did the hours go?",
        "Collected by email at month-end; disputes hard to resolve.",
        "Logged daily (web or phone), approved by the PM, and priced into cost automatically.",
      ],
      [
        "What has been invoiced and paid?",
        "Separate invoice tracker, manually reconciled with the ledger.",
        "Billing milestones pushed to Xero; paid status confirmed by the ledger itself; VAT recap generated from the same data.",
      ],
      [
        "What do we tell the client?",
        "Status decks assembled by hand.",
        "A read-only portal link with live progress — no documents, no financials.",
      ],
      [
        "Who changed what?",
        "No reliable trail.",
        "Activity log on every project; approvals recorded with person and timestamp.",
      ],
    ],
    [22, 36, 42],
  ),
  spacer(),
  p(
    "The common thread: information that used to be assembled after the fact is now a by-product of doing the work. Nobody fills in a spreadsheet for management — the numbers fall out of the process itself.",
  ),
);

// 5. Roadmap
children.push(
  h1("5. Product Roadmap"),
  p(
    "The platform is live and covers the full delivery cycle. The items below are the candidates management considers highest-value next — listed for the Board's visibility and prioritisation, not as commitments with dates.",
  ),
  table(
    ["Candidate", "What it adds"],
    [
      [
        "Receivables ageing",
        "A collections view of invoiced-but-unpaid milestones grouped by age (0–30 / 31–60 / 60+ days), with days-sales-outstanding per client — closing the loop after a project completes with invoices still open.",
      ],
      [
        "Cost threshold alerts",
        "Automatic notification to the PM and Management when a project's actual cost crosses set percentages of the estimate, before margin erosion becomes visible in the monthly view.",
      ],
      [
        "Weighted revenue forecast",
        "Pipeline deals weighted by probability, combined with scheduled billing milestones, giving Management a single six-month revenue projection.",
      ],
      [
        "Staffing suggestions",
        "When a PM staffs a project, the system proposes people from the skill matrix and bench availability instead of a plain name list.",
      ],
      [
        "Digital acceptance in the portal",
        "Clients confirm delivery acceptance (BAST) directly from the portal link, so closing no longer waits for scanned paperwork.",
      ],
      [
        "Weekly management digest",
        "A Monday-morning summary — projects at risk, approvals waiting, invoices due — delivered by email rather than requiring a dashboard visit.",
      ],
    ],
    [28, 72],
  ),
  spacer(),
  p(
    "The mobile app will continue to track the web platform's capabilities, prioritising whatever consultants need most often in the field.",
  ),
);

// 6. Anticipated Board Questions
children.push(
  h1("6. Anticipated Board Questions"),
  h3("“Who can see project margins and consultant rates?”"),
  p(
    "Margins and project financials are limited to Management, the project's stakeholders with financial entitlement, and Finance (read-only). Consultant daily rates are narrower still: only Management and Project Managers ever see them — for anyone else the server removes the figure before the data leaves the database.",
  ),
  h3("“What if a consultant simply doesn't log their hours?”"),
  p(
    "Unlogged hours cannot hide. The Work Hours view compares every delivery person's approved hours against the weekly norm (reduced automatically for recorded leave), so HR and Management see shortfalls per person per week. Because unlogged time also understates project cost, PMs have a second reason to chase it before approving the week.",
  ),
  h3("“Can a project be closed while invoices are still unpaid?”"),
  p(
    "A project cannot reach completion until every billing milestone has been invoiced, but payment itself is a finance matter, not a delivery gate — a client paying at 60 days should not block the delivery team from closing. Unpaid invoices remain visible in Invoice Planning and the VAT recap until Xero confirms payment; the proposed receivables-ageing view (Chapter 5) would sharpen this follow-up further.",
  ),
  h3("“What exactly does a client see in the portal?”"),
  p(
    "Progress only: status, milestones reached and overall timeline. No documents, no financial figures, no names of other clients. The link is read-only, revocable at any time, and an invalid link returns the same response as a non-existent one, so the portal cannot be used to probe for live engagements.",
  ),
  h3("“Can anyone bypass the process — say, activate a project without a plan?”"),
  p(
    "No. The lifecycle gates are enforced by the server for every role, including Management. A blocked transition returns the exact list of missing items rather than failing silently, and the activity log records who made each change and when.",
  ),
  h3("“Is company data safe with the AI briefing feature?”"),
  p(
    "The AI service is on a strict need-to-know diet: it receives only pre-computed portfolio aggregates — never daily rates, documents or raw timesheets — and every number in the briefing is calculated deterministically by the platform, with the AI contributing only the narrative. The briefing is also generated only on demand, when a Management user explicitly requests it.",
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

await writeDocx({
  children,
  outPath: OUT,
  title: "SecureProfit Hub — Board of Directors Supplement",
  description:
    "Architecture, security, mobile, business benefits, roadmap and Q&A supplement for the Board of Directors",
  headerText: "SecureProfit Hub — Board Supplement · Confidential",
});
