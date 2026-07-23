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
import { writeFileSync, mkdirSync } from "node:fs";

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
const p = (runs) =>
  new Paragraph({
    spacing: { after: 120, line: 276 },
    children: Array.isArray(runs) ? runs : [new TextRun({ text: runs, size: 22 })],
  });
const bullet = (text, level = 0) =>
  new Paragraph({
    bullet: { level },
    spacing: { after: 60, line: 268 },
    children: Array.isArray(text) ? text : [new TextRun({ text, size: 22 })],
  });
const t = (text, bold = false, size = 22, color) => new TextRun({ text, bold, size, color });
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
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

const c = [];

// ------------------------------------------------------------------ cover
c.push(new Paragraph({ spacing: { before: 1800 }, children: [] }));
c.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: "SecureProfit Hub", bold: true, color: ACCENT, size: 64 })],
  }),
);
c.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [new TextRun({ text: "Release Notes — July 2026 Update", bold: true, color: DARK, size: 34 })],
  }),
);
c.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [
      new TextRun({
        text: "Six new capabilities for project closing, expense control, time governance, and rate management",
        italics: true,
        color: GREY,
        size: 24,
      }),
    ],
  }),
);
c.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 600 },
    children: [new TextRun({ text: "Internal Documentation", color: GREY, size: 22 })],
  }),
);
c.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Prepared: July 23, 2026", color: GREY, size: 22 })],
  }),
);
c.push(pageBreak());

// ------------------------------------------------------------------ summary
c.push(h1("What's New — At a Glance"));
c.push(
  p(
    "This update delivers six features that tighten the link between delivery work and commercial outcomes: milestone-level BAST tracking, hyperlink documents with evidence-enforced closing, cash advance and purchase order expense handling with settlement, task-based time logging with hour caps, a 360-degree feedback cycle wired into the project closing gate, and time-phased cost/selling rates per resource.",
  ),
);
c.push(
  table(
    ["#", "Feature", "Who benefits", "Where in the app"],
    [
      ["1", "BAST linked to billing milestones", "PM, Admin Project, Finance", "Documents tab, Billing tab"],
      ["2", "Hyperlink documents + evidence-enforced closing checklist", "PM, Admin Project", "Documents tab, Closing tab"],
      ["3", "Cash Advance & Purchase Order expenses with settlement", "PM, Finance, Management", "Expenses tab"],
      ["4", "Mandatory task on time entries + planned-hour caps", "Consultants, TW, Admin Project, PM", "Timesheets, My Timesheets"],
      ["5", "360-degree feedback + stricter project closing gate", "PM, delivery team, Management", "Project closing flow"],
      ["6", "Cost & selling rate periods per resource", "PM, Management", "Resources tab (rate history)"],
    ],
    [5, 38, 27, 30],
  ),
);
c.push(pageBreak());

// ------------------------------------------------------------------ F1
c.push(h1("1. BAST Linked to Billing Milestones"));
c.push(
  p(
    "A BAST (handover certificate) can now be tied to the specific billing milestone it covers, instead of living as a loose project document.",
  ),
);
c.push(h2("What changed"));
c.push(bullet("When uploading or editing a BAST document, you can select the billing milestone it belongs to."));
c.push(bullet("The Billing tab shows, per milestone, whether its BAST is already on file."));
c.push(bullet("Milestone linkage is optional — a project-level BAST without a milestone is still valid."));
c.push(h2("Why it matters"));
c.push(
  p(
    "Finance and Admin Project can see at a glance which invoiced milestones are backed by a signed handover document, closing a common audit gap before invoicing.",
  ),
);

// ------------------------------------------------------------------ F2 (F5 in feature codes)
c.push(h1("2. Hyperlink Documents & Evidence-Enforced Closing Checklist"));
c.push(h2("What changed"));
c.push(
  bullet([
    t("Link documents: ", true),
    t(
      "a document can now be registered as an external link (SharePoint, Google Drive, etc.) instead of a file upload. Only secure https URLs are accepted.",
    ),
  ]),
);
c.push(bullet([t("New document type: ", true), t("REPORT, alongside BAST, INVOICE, CONTRACT, and OTHER.")]));
c.push(
  bullet([
    t("Evidence enforcement: ", true),
    t("closing checklist items can no longer be marked Done without their supporting document:"),
  ]),
);
c.push(bullet("BAST Signed requires at least one BAST document.", 1));
c.push(bullet("Final Report Delivered requires at least one REPORT document.", 1));
c.push(bullet("Invoice Issued requires an INVOICE document or an invoiced milestone.", 1));
c.push(bullet("Items can still be marked N/A where genuinely not applicable.", 1));
c.push(h2("Why it matters"));
c.push(
  p(
    "The closing checklist now reflects reality: a project cannot claim its deliverables are done unless the evidence exists in the system, whether uploaded or linked.",
  ),
);

// ------------------------------------------------------------------ F3
c.push(h1("3. Cash Advance & Purchase Order Expenses with Settlement"));
c.push(h2("What changed"));
c.push(
  bullet([
    t("Two new expense categories: ", true),
    t("Cash Advance (money issued up front) and Purchase Order (with a PO number field)."),
  ]),
);
c.push(
  bullet([
    t("Cash advance settlement: ", true),
    t(
      "after the work is done, an approved cash advance is settled with the actual amount spent. The project cost then counts the settled amount, not the original advance.",
    ),
  ]),
);
c.push(bullet("Settlement records who settled, when, and at what amount."));
c.push(bullet("As before, only approved expenses count toward project cost; management submissions auto-approve."));
c.push(h2("Why it matters"));
c.push(
  p(
    "Cash advances no longer distort project profitability. Margins are computed from what was actually spent, and outstanding (unsettled) advances are visible until they are closed out.",
  ),
);
c.push(pageBreak());

// ------------------------------------------------------------------ F4
c.push(h1("4. Mandatory Task on Time Entries & Planned-Hour Caps"));
c.push(h2("What changed"));
c.push(
  bullet([
    t("Task is mandatory ", true),
    t("for Consultants, Technical Writers, and Admin Project when logging time — every hour is now attributable to a work-breakdown task."),
  ]),
);
c.push(
  bullet([
    t("Planned-hour cap: ", true),
    t(
      "a task can carry a planned-hours budget. When set, total logged hours across all users (draft, submitted, and approved) cannot exceed it.",
    ),
  ]),
);
c.push(
  bullet(
    "When a cap would be exceeded, the entry is rejected with a clear message that includes the remaining hours available on the task.",
  ),
);
c.push(h2("Why it matters"));
c.push(
  p(
    "Time tracking now doubles as budget control. PMs can bound effort per task and get automatic enforcement instead of discovering overruns after approval.",
  ),
);

// ------------------------------------------------------------------ F5 (F6)
c.push(h1("5. 360-Degree Feedback & Stricter Project Closing Gate"));
c.push(h2("What changed"));
c.push(
  bullet([
    t("Automatic 360 cycle: ", true),
    t(
      "when a project is marked Complete, the system automatically creates peer review pairs — the PM reviews each accepted team member, and each team member reviews the PM.",
    ),
  ]),
);
c.push(
  bullet([
    t("Client survey auto-release: ", true),
    t("the client satisfaction survey token is issued automatically at Complete, with no manual step."),
  ]),
);
c.push(bullet([t("New Closed gate: ", true), t("a project can only move from Complete to Closed when:")]));
c.push(bullet("All 360 feedback forms have been submitted.", 1));
c.push(bullet("The lessons-learned note on the closing checklist is filled in.", 1));
c.push(bullet("For client projects, at least one client survey response has been received.", 1));
c.push(
  bullet(
    "If requirements are missing, the system reports exactly which items are outstanding. Non-commercial projects (internal, presales, training) are exempt from the survey requirement.",
  ),
);
c.push(h2("Why it matters"));
c.push(
  p(
    "Closing a project now guarantees the learning loop happened: peer feedback, client voice, and lessons learned are captured while the engagement is still fresh — not skipped under delivery pressure.",
  ),
);
c.push(pageBreak());

// ------------------------------------------------------------------ F6 (F2)
c.push(h1("6. Cost & Selling Rate Periods per Resource"));
c.push(h2("What changed"));
c.push(
  bullet([
    t("Rate history: ", true),
    t(
      "each project resource now keeps a dated history of cost rates (and optional selling rates). A new period takes effect from its chosen date forward.",
    ),
  ]),
);
c.push(
  bullet([
    t("Historical accuracy: ", true),
    t(
      "approved timesheets are always costed at the rate that was in effect on the work date. Raising a rate mid-project never reprices work that was already done.",
    ),
  ]),
);
c.push(
  bullet(
    "The first rate change automatically records the original rate as a baseline from project start, protecting all earlier timesheets.",
  ),
);
c.push(
  bullet(
    "The Resources tab gains a rate-history dialog (visible to Management and the assigned PM) to view periods and add new ones.",
  ),
);
c.push(bullet("Daily rates remain hidden from roles without rate visibility, exactly as before."));
c.push(h2("Why it matters"));
c.push(
  p(
    "Mid-project rate adjustments (promotions, renegotiations) are now safe: financials stay historically correct, margins reflect the true cost timeline, and there is a full audit trail of who cost what, when.",
  ),
);

// ------------------------------------------------------------------ access summary
c.push(h1("Access & Permissions Summary"));
c.push(
  table(
    ["Capability", "Who can do it"],
    [
      ["Link a BAST to a milestone", "Management, assigned PM, Admin Project (document editors)"],
      ["Add link-type documents", "Same roles as file documents"],
      ["Mark closing checklist items Done", "Management, assigned PM (with required evidence)"],
      ["Submit Cash Advance / PO expenses", "Project team (Management auto-approved)"],
      ["Settle a cash advance", "Management, assigned PM"],
      ["Log time without a task", "Only roles outside Consultant / TW / Admin Project"],
      ["Set planned hours on a task", "Management, PM (task editors)"],
      ["Submit 360 feedback", "PM and accepted project resources (their own forms)"],
      ["View / add rate periods", "Management and assigned PM; rates stay hidden from other roles"],
    ],
    [45, 55],
  ),
);
c.push(
  p([
    t("Compatibility: ", true),
    t(
      "all six features are additive. Existing projects, documents, expenses, and timesheets continue to work unchanged; new rules apply from this release onward.",
    ),
  ]),
);

const doc = new Document({
  creator: "SecureProfit Hub",
  title: "SecureProfit Hub — Release Notes, July 2026",
  styles: { default: { document: { run: { font: "Calibri", size: 22, color: "1A1A1A" } } } },
  sections: [
    {
      properties: { page: { margin: { top: 1133, bottom: 1133, left: 1133, right: 1133 } } },
      children: c,
    },
  ],
});

mkdirSync("exports", { recursive: true });
const buf = await Packer.toBuffer(doc);
writeFileSync("exports/SecureProfit-Hub-Release-Notes-July-2026.docx", buf);
console.log("WROTE exports/SecureProfit-Hub-Release-Notes-July-2026.docx", buf.length);
