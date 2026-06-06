import { prisma } from "./index.js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// ---------------------------------------------------------------------------
// Demo data enrichment for the "real" SecureProfit Hub projects.
//
// Fills every project tab with realistic, demo-ready content: WBS tasks,
// approved timesheets (so margins stop showing 100%), expenses, RAID items,
// documents, customer-survey responses, status reports, a closing checklist
// for completed projects, and an activity trail.
//
// IDEMPOTENT & NON-DESTRUCTIVE: every row this script creates carries an
// invisible zero-width-space (U+200B) marker in a text field. Re-running first
// deletes only rows that carry the marker, then recreates them. Real,
// human-entered data (no marker) is never touched. The marker does not render
// in the UI.
//
// Target set (selected dynamically, adapts to whichever DB it runs against):
//   - every SPH-WS-* workstream project
//   - every SPH-2026-* project that is ACTIVE or COMPLETE
//   - SPK-2026-205 (SIEM) and SPK-08-2006 (Pentest Mobile)
// Test/scratch projects (SPK NNNN, F-*, PKS *, drafts) are excluded.
// ---------------------------------------------------------------------------

const ZWSP = "\u200B"; // invisible marker for safe, idempotent re-runs
const tag = (s: string) => s + ZWSP;

const DAY = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round = (n: number, step = 0.5) => Math.round(n / step) * step;

// Deterministic pseudo-random in [0,1) seeded by a string, so re-runs and
// dev/prod produce the same "shape" of data per project code.
function seeded(code: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function mondaysBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const d = new Date(start);
  // advance to Monday
  const dow = d.getUTCDay(); // 0=Sun
  const delta = (dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  while (d <= end) {
    out.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

async function brandedPdf(opts: {
  kind: string;
  title: string;
  lines: [string, string][];
  footer?: string;
}): Promise<string> {
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 420]);
  const { width, height } = page.getSize();
  const ink = rgb(0.06, 0.09, 0.16);
  const accent = rgb(0.13, 0.77, 0.37);
  const muted = rgb(0.39, 0.45, 0.55);

  page.drawRectangle({ x: 0, y: height - 64, width, height: 64, color: ink });
  page.drawText("SecureProfit Hub", { x: 28, y: height - 30, size: 15, font: bold, color: accent });
  page.drawText(opts.kind.toUpperCase(), { x: 28, y: height - 50, size: 9, font: helv, color: rgb(0.85, 0.9, 0.95) });

  page.drawText(opts.title, { x: 28, y: height - 92, size: 13, font: bold, color: ink });

  let y = height - 130;
  for (const [label, value] of opts.lines) {
    page.drawText(label, { x: 28, y, size: 8, font: bold, color: muted });
    page.drawText(value, { x: 28, y: y - 13, size: 11, font: helv, color: ink });
    y -= 34;
  }
  page.drawText(opts.footer ?? "Generated for demonstration purposes.", {
    x: 28, y: 24, size: 8, font: helv, color: muted,
  });
  const bytes = await pdf.save();
  return "data:application/pdf;base64," + Buffer.from(bytes).toString("base64");
}

const RAID_POOL: {
  type: "RISK" | "ASSUMPTION" | "ISSUE" | "DEPENDENCY";
  title: string;
  description: string;
  impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  likelihood: "LOW" | "MEDIUM" | "HIGH";
  status: "OPEN" | "MITIGATING" | "CLOSED";
  mitigation: string;
}[] = [
  { type: "RISK", title: "Client environment access delays", description: "VPN and test-account provisioning from the client may slip, compressing the testing window.", impact: "HIGH", likelihood: "MEDIUM", status: "MITIGATING", mitigation: "Escalate access requests at kickoff; agree on an access SLA in the engagement charter." },
  { type: "RISK", title: "Scope creep on additional assets", description: "Client may request additional in-scope assets mid-engagement without a change order.", impact: "MEDIUM", likelihood: "MEDIUM", status: "OPEN", mitigation: "Document scope in the SOW; route additions through formal change control." },
  { type: "ISSUE", title: "Production testing window conflicts", description: "Maintenance freeze overlaps with the planned active testing window.", impact: "MEDIUM", likelihood: "HIGH", status: "MITIGATING", mitigation: "Shift intrusive tests to the staging mirror; coordinate a dedicated window with ops." },
  { type: "ASSUMPTION", title: "Client provides up-to-date architecture docs", description: "Assessment timeline assumes current network and application architecture diagrams are available.", impact: "MEDIUM", likelihood: "LOW", status: "OPEN", mitigation: "Confirm document availability during discovery; allow buffer for reverse-engineering." },
  { type: "DEPENDENCY", title: "Third-party SOC platform onboarding", description: "Reporting deliverables depend on the client's SIEM/SOC tenant being provisioned in time.", impact: "HIGH", likelihood: "MEDIUM", status: "OPEN", mitigation: "Track vendor onboarding weekly; identify a fallback log-export path." },
  { type: "RISK", title: "Key consultant availability", description: "Lead consultant is shared across two engagements during the peak testing phase.", impact: "MEDIUM", likelihood: "LOW", status: "CLOSED", mitigation: "Secured backup consultant and front-loaded the critical testing tasks." },
];

const LESSONS = [
  "The team was very professional and the weekly status cadence kept us well informed of progress.",
  "Final report was thorough and clearly prioritized. A more concise executive summary would help next time.",
  "Penetration test results matched our expectations; remediation guidance was practical and actionable.",
  "Excellent communication throughout. We would happily engage SecureProfit Hub again for the next cycle.",
  "Strong technical depth from the consultants. Kickoff could be scheduled one week earlier going forward.",
];
const SURVEY_PEOPLE = [
  { name: "Mr. Budi Santoso", email: "budi.santoso@client.example" },
  { name: "Mrs. Rina Wijaya", email: "rina.wijaya@client.example" },
  { name: "Mr. Andi Pratama", email: null as string | null },
];

const CLOSING_ITEMS = [
  { key: "final_report_delivered", label: "Final report delivered to client" },
  { key: "bast_signed", label: "BAST (handover) signed by client" },
  { key: "invoice_issued", label: "Final invoice issued" },
  { key: "payment_received", label: "Payment received in full" },
  { key: "lessons_learned", label: "Lessons learned captured" },
  { key: "documents_archived", label: "Project documents archived" },
];

async function main() {
  const NOW = new Date();

  const approver = await prisma.user.findFirst({ where: { role: "MANAGEMENT", isActive: true } });
  if (!approver) throw new Error("No MANAGEMENT user found to act as approver.");

  const questions = await prisma.surveyQuestion.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
  });

  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      OR: [
        { code: { startsWith: "SPH-WS-" } },
        { code: { startsWith: "SPH-2026-" }, status: { in: ["ACTIVE", "COMPLETE"] } },
        { code: { in: ["SPK-2026-205", "SPK-08-2006"] } },
      ],
    },
    orderBy: { code: "asc" },
    include: {
      resources: { include: { user: true } },
      workstreams: { orderBy: { sortOrder: "asc" } },
    },
  });

  console.log(`Enriching ${projects.length} project(s). NOW=${NOW.toISOString().slice(0, 10)}\n`);

  for (const p of projects) {
    const isComplete = p.status === "COMPLETE";
    const isImpl = /SOC|SIEM|implement|hardening|migrasi|migration|tier/i.test(p.name);

    // ---- timing window ----
    const start = p.startDate ?? addDays(NOW, -90);
    const end = p.endDate ?? addDays(start, 150);
    let wStart = start;
    let wEnd = isComplete ? end : end < NOW ? end : NOW;
    if (wStart > NOW) {
      wStart = addDays(NOW, -28); // not yet started: simulate ~4 weeks of prep work
      wEnd = NOW;
    }
    if (wEnd <= wStart) wEnd = addDays(wStart, 21);

    const elapsedFrac = clamp((Math.min(NOW.getTime(), end.getTime()) - start.getTime()) / Math.max(1, end.getTime() - start.getTime()), 0, 1);
    const completion = isComplete ? 1 : clamp(0.4 + elapsedFrac * 0.5, 0.4, 0.85);

    let weeks = mondaysBetween(wStart, wEnd);
    if (!isComplete && weeks.length < 3) {
      wStart = addDays(NOW, -21); // recently started: ensure enough logged weeks for a rich demo
      weeks = mondaysBetween(wStart, wEnd);
    }
    if (weeks.length === 0) weeks.push(wStart);

    const resources = p.resources;
    const wsList = p.workstreams;
    const wsFor = (rid: string | null) => rid ?? (wsList[0]?.id ?? null);

    // ---- wipe prior demo rows (marker only) ----
    await prisma.timesheet.deleteMany({ where: { projectId: p.id, description: { contains: ZWSP } } });
    await prisma.task.deleteMany({ where: { projectId: p.id, description: { contains: ZWSP } } });
    await prisma.projectExpense.deleteMany({ where: { projectId: p.id, description: { contains: ZWSP } } });
    await prisma.projectRaidItem.deleteMany({ where: { projectId: p.id, description: { contains: ZWSP } } });
    await prisma.document.deleteMany({ where: { projectId: p.id, notes: { contains: ZWSP } } });
    await prisma.projectReport.deleteMany({ where: { projectId: p.id, note: { contains: ZWSP } } });
    await prisma.surveyResponse.deleteMany({ where: { projectId: p.id, submitterName: { contains: ZWSP } } });
    await prisma.activity.deleteMany({ where: { projectId: p.id, message: { contains: ZWSP } } });

    // ---- WBS tasks ----
    const phases: { title: string; subs: string[] }[] = [
      { title: "Kickoff & Planning", subs: ["Kickoff meeting & scope confirmation", "Resource & schedule planning"] },
      { title: "Assessment & Discovery", subs: ["Information gathering & enumeration", "Control / vulnerability assessment"] },
      { title: isImpl ? "Implementation & Configuration" : "Execution & Testing", subs: [isImpl ? "Platform deployment & hardening" : "Exploitation & testing", "Findings validation"] },
      { title: "Reporting", subs: ["Draft report preparation", "Report review & finalization"] },
      { title: "Closure", subs: ["Client presentation & walkthrough", "Project closure & handover"] },
    ];
    const totalSpan = wEnd.getTime() - wStart.getTime() || DAY * 30;
    const phaseTasks: { id: string }[] = [];
    const execSubByResource = new Map<string, string>(); // userId -> taskId for timesheet linking
    let phaseIdx = 0;
    for (const phase of phases) {
      const pStartFrac = phaseIdx / phases.length;
      const pEndFrac = (phaseIdx + 1) / phases.length;
      const ps = new Date(wStart.getTime() + totalSpan * pStartFrac);
      const pe = new Date(wStart.getTime() + totalSpan * pEndFrac);
      const phaseDone = isComplete || pEndFrac <= completion;
      const phaseActive = !phaseDone && pStartFrac < completion;
      const status = phaseDone ? "DONE" : phaseActive ? "IN_PROGRESS" : "TODO";
      const progress = phaseDone ? 100 : phaseActive ? 50 : 0;

      const parent = await prisma.task.create({
        data: {
          projectId: p.id,
          workstreamId: wsList[phaseIdx % Math.max(1, wsList.length)]?.id ?? null,
          title: phase.title,
          description: tag(`${phase.title} phase for ${p.name}.`),
          status,
          progressPercent: progress,
          billable: true,
          startDate: ps,
          endDate: pe,
          createdById: approver.id,
        },
      });
      phaseTasks.push({ id: parent.id });

      let subIdx = 0;
      for (const subTitle of phase.subs) {
        const r = resources[(phaseIdx + subIdx) % Math.max(1, resources.length)];
        const subDone = isComplete || pEndFrac <= completion;
        const subActive = !subDone && pStartFrac < completion;
        const sub = await prisma.task.create({
          data: {
            projectId: p.id,
            parentTaskId: parent.id,
            workstreamId: r ? wsFor(r.workstreamId) : parent.workstreamId,
            title: subTitle,
            description: tag(subTitle),
            status: subDone ? "DONE" : subActive ? "IN_PROGRESS" : "TODO",
            progressPercent: subDone ? 100 : subActive ? 60 : 0,
            billable: !/closure|handover/i.test(subTitle),
            startDate: addDays(ps, subIdx),
            endDate: pe,
            assigneeId: r?.userId ?? null,
            createdById: approver.id,
            assignees: r ? { create: [{ userId: r.userId }] } : undefined,
          },
        });
        if (phaseIdx === 2 && r) execSubByResource.set(r.userId, sub.id);
        subIdx++;
      }
      phaseIdx++;
    }

    // ---- timesheets (APPROVED) ----
    let resourceCost = 0;
    let tsCount = 0;
    for (const r of resources) {
      if (!r.dailyRate || r.dailyRate <= 0 || !r.plannedMandays) continue;
      const totalHours = r.plannedMandays * completion * 8;
      let perWeek = round(clamp(totalHours / weeks.length, 0, 45));
      if (perWeek < 1) continue;
      const linkedTask = execSubByResource.get(r.userId) ?? null;
      for (const wk of weeks) {
        const h = round(perWeek * (0.85 + seeded(p.code + r.userId + wk.toISOString(), 7) * 0.3));
        if (h < 1) continue;
        await prisma.timesheet.create({
          data: {
            projectId: p.id,
            workstreamId: wsFor(r.workstreamId),
            userId: r.userId,
            taskId: linkedTask,
            workDate: wk,
            hours: h,
            description: tag(`${r.roleInProject ?? "Consulting"} work — week of ${wk.toISOString().slice(0, 10)}`),
            status: "APPROVED",
            approvedById: approver.id,
            approvedAt: addDays(wk, 5),
          },
        });
        resourceCost += (h / 8) * r.dailyRate;
        tsCount++;
      }
    }

    // ---- expenses ----
    const creator = resources.find((r) => r.user.role === "PROJECT_MANAGER") ?? resources[0];
    const expDefs: { category: string; description: string; amount: number; status: "APPROVED" | "PENDING" | "REJECTED" }[] = [
      { category: "TRAVEL", description: "Client site visits and transportation", amount: 8_000_000 + Math.round(seeded(p.code, 1) * 17) * 1_000_000, status: "APPROVED" },
      { category: "SOFTWARE", description: "Specialized testing tools subscription", amount: 12_000_000 + Math.round(seeded(p.code, 2) * 18) * 1_000_000, status: "APPROVED" },
      { category: "OTHER", description: "Miscellaneous operational costs", amount: 4_000_000 + Math.round(seeded(p.code, 3) * 8) * 1_000_000, status: "PENDING" },
      { category: "HARDWARE", description: "Test devices and peripherals", amount: 6_000_000 + Math.round(seeded(p.code, 4) * 9) * 1_000_000, status: "REJECTED" },
    ];
    if (isImpl) {
      expDefs.push({
        category: "LICENSE",
        description: "Security platform / EDR license (annual)",
        amount: 140_000_000 + Math.round(seeded(p.code, 5) * 180) * 1_000_000,
        status: "APPROVED",
      });
    }
    let additionalCost = 0;
    for (const e of expDefs) {
      const spentAt = new Date(wStart.getTime() + (wEnd.getTime() - wStart.getTime()) * (0.2 + seeded(p.code + e.category, 6) * 0.6));
      const evidence = await brandedPdf({
        kind: "receipt",
        title: e.description,
        lines: [
          ["DATE", spentAt.toISOString().slice(0, 10)],
          ["CATEGORY", e.category],
          ["AMOUNT", "Rp " + e.amount.toLocaleString("id-ID")],
        ],
        footer: "Sample receipt generated for demonstration purposes.",
      });
      await prisma.projectExpense.create({
        data: {
          projectId: p.id,
          workstreamId: wsList[0]?.id ?? null,
          category: e.category,
          description: tag(e.description),
          amount: e.amount,
          spentAt,
          evidenceUrl: evidence,
          evidenceFileName: `receipt-${e.category.toLowerCase()}.pdf`,
          status: e.status,
          createdById: creator?.userId ?? approver.id,
          approvedById: e.status === "APPROVED" ? approver.id : e.status === "REJECTED" ? approver.id : null,
          approvedAt: e.status === "APPROVED" ? addDays(spentAt, 2) : null,
          rejectionReason: e.status === "REJECTED" ? "Out of approved budget scope; resubmit with justification." : null,
        },
      });
      if (e.status === "APPROVED") additionalCost += e.amount;
    }

    // ---- RAID ----
    const raidCount = 4 + Math.round(seeded(p.code, 8) * 2);
    for (let i = 0; i < raidCount; i++) {
      const item = RAID_POOL[i % RAID_POOL.length];
      const owner = resources[i % Math.max(1, resources.length)];
      await prisma.projectRaidItem.create({
        data: {
          projectId: p.id,
          type: item.type,
          title: item.title,
          description: tag(item.description),
          impact: item.impact,
          likelihood: item.likelihood,
          status: isComplete ? "CLOSED" : item.status,
          ownerId: owner?.userId ?? null,
          mitigation: item.mitigation,
          dueDate: addDays(wStart, 21 + i * 14),
          closedAt: isComplete || item.status === "CLOSED" ? addDays(wStart, 30 + i * 7) : null,
          createdById: approver.id,
        },
      });
    }

    // ---- documents ----
    const docDefs: { type: "CONTRACT" | "BAST" | "INVOICE" | "OTHER"; fileName: string; only?: "complete" }[] = [
      { type: "CONTRACT", fileName: "engagement-contract.pdf" },
      { type: "OTHER", fileName: isComplete ? "final-report.pdf" : "interim-report.pdf" },
      { type: "INVOICE", fileName: "invoice-01.pdf" },
      { type: "BAST", fileName: "handover-bast.pdf", only: "complete" },
    ];
    let docIdx = 0;
    for (const d of docDefs) {
      if (d.only === "complete" && !isComplete) continue;
      const fileUrl = await brandedPdf({
        kind: d.type,
        title: `${d.type} — ${p.name}`,
        lines: [
          ["PROJECT", p.code],
          ["DATE", addDays(wStart, 7 + docIdx * 14).toISOString().slice(0, 10)],
          ["CONTRACT VALUE", "Rp " + p.contractValue.toLocaleString("id-ID")],
        ],
      });
      const isInvoice = d.type === "INVOICE";
      await prisma.document.create({
        data: {
          projectId: p.id,
          type: d.type,
          fileName: d.fileName,
          fileUrl,
          notes: tag(`${d.type} document`),
          invoiceNumber: isInvoice ? `INV/${p.code}/01` : null,
          invoiceAmount: isInvoice ? Math.round(p.contractValue * 0.3) : null,
          invoiceStatus: isInvoice ? (isComplete ? "PAID" : "SENT") : null,
          uploadedById: approver.id,
          uploadedAt: addDays(wStart, 7 + docIdx * 14),
        },
      });
      docIdx++;
    }

    // ---- status report ----
    await prisma.projectReport.create({
      data: {
        projectId: p.id,
        title: isComplete ? "Final Engagement Report" : "Interim Status Report",
        reportNumber: `RPT/${p.code}/01`,
        version: "1.0",
        reportType: isComplete ? "FINAL" : "INTERIM",
        periodStart: wStart,
        periodEnd: wEnd,
        author: approver.name,
        note: tag("Status report"),
        submittedAt: addDays(wEnd, -3),
        createdById: approver.id,
      },
    });

    // ---- customer survey ----
    if (isComplete || p.status === "ACTIVE") {
      const respCount = isComplete ? 2 : 1;
      for (let i = 0; i < respCount; i++) {
        const person = SURVEY_PEOPLE[i % SURVEY_PEOPLE.length];
        const answers: Record<string, { rating?: number; text?: string }> = {};
        for (const q of questions) {
          if (q.type === "TEXT") {
            answers[q.key] = { text: LESSONS[(Number(seeded(p.code, 9) * 10) + i) % LESSONS.length] };
          } else {
            answers[q.key] = { rating: 4 + (seeded(p.code + q.key, i) > 0.5 ? 1 : 0) };
          }
        }
        await prisma.surveyResponse.create({
          data: {
            projectId: p.id,
            submitterName: tag(person.name),
            submitterEmail: person.email,
            answers,
            questionsSnapshot: questions.map((q) => ({ key: q.key, text: q.text, type: q.type })),
            lessonLearned: LESSONS[(Number(seeded(p.code, 11) * 10) + i) % LESSONS.length],
            createdAt: addDays(wEnd, -2 + i),
          },
        });
      }
    }

    // ---- closing checklist (complete only) ----
    if (isComplete) {
      let order = 0;
      for (const c of CLOSING_ITEMS) {
        await prisma.projectClosingChecklistItem.upsert({
          where: { projectId_key: { projectId: p.id, key: c.key } },
          create: {
            projectId: p.id, key: c.key, label: c.label, status: "DONE",
            note: tag("Completed"), completedAt: addDays(wEnd, -1), completedById: approver.id, sortOrder: order,
          },
          update: { status: "DONE", note: tag("Completed"), completedAt: addDays(wEnd, -1), completedById: approver.id },
        });
        order++;
      }
    }

    // ---- activity trail ----
    const acts = [
      `Project "${p.name}" status reviewed`,
      `${tsCount} timesheet entries approved`,
      `Status report submitted for ${p.code}`,
    ];
    for (const m of acts) {
      await prisma.activity.create({
        data: { type: "demo", message: tag(m), userId: approver.id, projectId: p.id, createdAt: addDays(wEnd, -1) },
      });
    }

    const actualCost = resourceCost + additionalCost;
    const margin = p.contractValue > 0 ? ((p.contractValue - actualCost) / p.contractValue) * 100 : 0;
    console.log(
      `  ${p.code} [${p.status}] ts=${tsCount} cost=${(actualCost / 1e6).toFixed(0)}M / CV=${(p.contractValue / 1e6).toFixed(0)}M -> margin ${margin.toFixed(0)}%`,
    );
  }

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
