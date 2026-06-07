import { prisma } from "./index.js";
import { capUserDailyHours } from "./cap-daily-hours.js";
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

  // Pool of delivery staff used to gap-fill staffing on under-resourced demo projects.
  const konPool = await prisma.user.findMany({
    where: { role: "KONSULTAN", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, seniority: true },
  });
  const twPool = await prisma.user.findMany({
    where: { role: "TECHNICAL_WRITER", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, seniority: true },
  });
  const rateForSeniority = (s: string | null | undefined) =>
    s === "PRINCIPAL" ? 6_000_000 : s === "SENIOR" ? 4_500_000 : s === "MID" ? 3_000_000 : 2_000_000;

  const onlyCodes = (process.env.ONLY_CODES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const projects = await prisma.project.findMany({
    where: {
      deletedAt: null,
      ...(onlyCodes.length ? { code: { in: onlyCodes } } : {}),
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

  // Timesheets are NOT created inside the per-project loop. Doing so stamped a
  // whole week of hours on a single date and let a consultant accrue a full
  // week on every one of their concurrent projects (e.g. 8 projects -> 300+h
  // logged in one week, breaking Work Hours Compliance). Instead we collect a
  // plan here and, after all projects are built, generate timesheets per user:
  // capped to a realistic weekly total and spread across business days.
  type TsPlan = {
    userId: string;
    projectId: string;
    projectCode: string;
    workstreamId: string | null;
    taskId: string | null;
    dailyRate: number;
    roleInProject: string | null;
    weeks: Date[];
    perWeek: number;
  };
  const tsPlan: TsPlan[] = [];
  const projMeta: { id: string; code: string; status: string; contractValue: number }[] = [];
  const expCostByProject = new Map<string, number>();

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

    const wsList = p.workstreams;
    const wsFor = (rid: string | null) => rid ?? (wsList[0]?.id ?? null);
    const isDemoRes = (r: { roleInProject: string | null }) => !!r.roleInProject && r.roleInProject.includes(ZWSP);

    // ---- wipe prior demo rows (marker only) ----
    await prisma.timesheet.deleteMany({ where: { projectId: p.id, description: { contains: ZWSP } } });
    await prisma.task.deleteMany({ where: { projectId: p.id, description: { contains: ZWSP } } });
    await prisma.projectExpense.deleteMany({ where: { projectId: p.id, description: { contains: ZWSP } } });
    await prisma.projectRaidItem.deleteMany({ where: { projectId: p.id, description: { contains: ZWSP } } });
    await prisma.document.deleteMany({ where: { projectId: p.id, notes: { contains: ZWSP } } });
    await prisma.projectReport.deleteMany({ where: { projectId: p.id, note: { contains: ZWSP } } });
    await prisma.surveyResponse.deleteMany({ where: { projectId: p.id, submitterName: { contains: ZWSP } } });
    await prisma.activity.deleteMany({ where: { projectId: p.id, message: { contains: ZWSP } } });
    await prisma.projectResource.deleteMany({ where: { projectId: p.id, roleInProject: { contains: ZWSP } } });

    // ---- staffing gap-fill ----
    // Keep real (non-demo) resources; re-create demo staffing so under-resourced
    // projects produce realistic labour cost (and thus realistic margins) and a
    // populated Resources tab. Well-staffed projects are left untouched.
    type WorkRes = { userId: string; dailyRate: number; plannedMandays: number; roleInProject: string | null; workstreamId: string | null; user: { role: string } };
    const realResources: WorkRes[] = p.resources
      .filter((r) => !isDemoRes(r))
      .map((r) => ({ userId: r.userId, dailyRate: r.dailyRate, plannedMandays: r.plannedMandays, roleInProject: r.roleInProject, workstreamId: r.workstreamId, user: { role: r.user.role } }));
    const usedUserIds = new Set(realResources.map((r) => r.userId));
    const existingRealCost = realResources.reduce((a, r) => a + (r.dailyRate > 0 && r.plannedMandays > 0 ? r.plannedMandays * completion * r.dailyRate : 0), 0);

    const targetMargin = isImpl ? 0.5 + seeded(p.code, 11) * 0.12 : 0.66 + seeded(p.code, 12) * 0.16;
    // Mirror the APPROVED-expense amounts created below so labour only fills the
    // remaining cost budget (impl projects carry a large LICENSE expense).
    const estApprovedExpenses =
      (8 + Math.round(seeded(p.code, 1) * 17)) * 1_000_000 +
      (12 + Math.round(seeded(p.code, 2) * 18)) * 1_000_000 +
      (isImpl ? (140 + Math.round(seeded(p.code, 5) * 180)) * 1_000_000 : 0);
    const desiredResourceCost = Math.max(p.contractValue * (1 - targetMargin) - estApprovedExpenses, p.contractValue * 0.05);
    const gap = desiredResourceCost - existingRealCost;

    const resources: WorkRes[] = [...realResources];
    if (gap > p.contractValue * 0.03) {
      const kon = konPool.filter((u) => !usedUserIds.has(u.id)).slice(0, 2);
      const tw = twPool.filter((u) => !usedUserIds.has(u.id)).slice(0, 1);
      const picks = [
        ...kon.map((u) => ({ u, label: "Konsultan", weight: 0 })),
        ...tw.map((u) => ({ u, label: "Technical Writer", weight: 0 })),
      ];
      if (picks.length) {
        const weights = picks.length === 3 ? [0.45, 0.35, 0.2] : picks.length === 2 ? [0.6, 0.4] : [1];
        for (let i = 0; i < picks.length; i++) {
          const u = picks[i].u;
          const rate = rateForSeniority(u.seniority);
          const mandays = Math.max(1, Math.round((gap * weights[i]) / (Math.max(0.1, completion) * rate)));
          const role = `${picks[i].label}${ZWSP}`;
          await prisma.projectResource.create({
            data: {
              projectId: p.id,
              workstreamId: wsList[0]?.id ?? null,
              userId: u.id,
              roleInProject: role,
              plannedMandays: mandays,
              dailyRate: rate,
              acceptedAt: NOW,
            },
          });
          resources.push({ userId: u.id, dailyRate: rate, plannedMandays: mandays, roleInProject: role, workstreamId: wsList[0]?.id ?? null, user: { role: u.role } });
          usedUserIds.add(u.id);
        }
      }
    }

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

    // ---- timesheets (collected; generated per-user in a capped post-pass) ----
    for (const r of resources) {
      if (!r.dailyRate || r.dailyRate <= 0 || !r.plannedMandays) continue;
      const totalHours = r.plannedMandays * completion * 8;
      const perWeek = round(clamp(totalHours / weeks.length, 0, 45));
      if (perWeek < 1) continue;
      tsPlan.push({
        userId: r.userId,
        projectId: p.id,
        projectCode: p.code,
        workstreamId: wsFor(r.workstreamId),
        taskId: execSubByResource.get(r.userId) ?? null,
        dailyRate: r.dailyRate,
        roleInProject: r.roleInProject ?? null,
        weeks: weeks.slice(),
        perWeek,
      });
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
    expCostByProject.set(p.id, additionalCost);
    projMeta.push({ id: p.id, code: p.code, status: p.status, contractValue: p.contractValue });

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
      `Weekly timesheets approved`,
      `Status report submitted for ${p.code}`,
    ];
    for (const m of acts) {
      await prisma.activity.create({
        data: { type: "demo", message: tag(m), userId: approver.id, projectId: p.id, createdAt: addDays(wEnd, -1) },
      });
    }

  }

  // ---- timesheets: realistic per-user daily distribution ----
  // Each user gets at most WEEKLY_CAP hours per week (summed across every
  // project they touch), packed into business days at no more than DAILY_CAP
  // per day. This keeps Work Hours Compliance sane while preserving roughly the
  // same total logged effort the cost/margin demo relies on.
  const DAILY_CAP = 8;
  const WEEKLY_CAP = 40;
  const round1 = (n: number) => Math.round(n * 2) / 2;

  type WeekEntry = {
    projectId: string;
    workstreamId: string | null;
    taskId: string | null;
    dailyRate: number;
    roleInProject: string | null;
    hours: number;
  };
  const byUserWeek = new Map<string, Map<number, WeekEntry[]>>();
  for (const pl of tsPlan) {
    for (const wk of pl.weeks) {
      const hours = round1(pl.perWeek * (0.85 + seeded(pl.projectCode + pl.userId + wk.toISOString(), 7) * 0.3));
      if (hours < 1) continue;
      let wm = byUserWeek.get(pl.userId);
      if (!wm) { wm = new Map(); byUserWeek.set(pl.userId, wm); }
      // Normalize to the UTC calendar Monday so the same week from different
      // projects (whose start dates carry different times of day) collapses
      // into ONE bucket — otherwise the weekly cap never applies.
      const key = Date.UTC(wk.getUTCFullYear(), wk.getUTCMonth(), wk.getUTCDate());
      const arr = wm.get(key) ?? [];
      arr.push({ projectId: pl.projectId, workstreamId: pl.workstreamId, taskId: pl.taskId, dailyRate: pl.dailyRate, roleInProject: pl.roleInProject, hours });
      wm.set(key, arr);
    }
  }

  const resourceCostByProject = new Map<string, number>();
  const tsCountByProject = new Map<string, number>();
  let totalTs = 0;

  // Headroom awareness: other generators (base seed, sample-report-data) also
  // create approved timesheets for these users. The demo's per-project rows
  // were already deleted above, so everything still in the table is from those
  // other layers. We only fill the REMAINING capacity up to DAILY_CAP/day and
  // WEEKLY_CAP/week so the combined total never blows past a realistic week.
  const existingRows = await prisma.timesheet.findMany({
    where: { status: { not: "REJECTED" } },
    select: { userId: true, workDate: true, hours: true },
  });
  const dayKey = (uid: string, d: Date) =>
    `${uid}|${Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())}`;
  const existingByUserDay = new Map<string, number>();
  for (const r of existingRows) {
    const k = dayKey(r.userId, r.workDate);
    existingByUserDay.set(k, (existingByUserDay.get(k) ?? 0) + r.hours);
  }

  for (const [userId, wm] of byUserWeek) {
    for (const [weekMs, entries] of wm) {
      // Business days (Mon-Fri) of this week that are not in the future.
      const monday = new Date(weekMs);
      const days: Date[] = [];
      for (let i = 0; i < 5; i++) {
        const d = addDays(monday, i);
        if (d <= NOW) days.push(d);
      }
      if (days.length === 0) continue;
      // Pre-existing hours already logged by other generators this week.
      const dayLoad = days.map((d) => existingByUserDay.get(dayKey(userId, d)) ?? 0);
      const existingWeek = dayLoad.reduce((s, h) => s + h, 0);
      // Cap demo hours to whatever headroom is left under the weekly cap.
      const headroomWeek = Math.max(0, WEEKLY_CAP - existingWeek);
      const total = entries.reduce((s, e) => s + e.hours, 0);
      if (total > headroomWeek) {
        const scale = headroomWeek / total;
        for (const e of entries) e.hours = round1(e.hours * scale);
      }
      if (headroomWeek < 0.5) continue;
      // Greedy pack larger projects first; each day holds at most DAILY_CAP h.
      entries.sort((a, b) => b.hours - a.hours);
      for (const e of entries) {
        let remaining = e.hours;
        for (let di = 0; di < days.length && remaining > 0.001; di++) {
          const free = DAILY_CAP - dayLoad[di];
          if (free <= 0) continue;
          const put = round1(Math.min(remaining, free));
          if (put < 0.5) continue;
          await prisma.timesheet.create({
            data: {
              projectId: e.projectId,
              workstreamId: e.workstreamId,
              userId,
              taskId: e.taskId,
              workDate: days[di],
              hours: put,
              description: tag(`${e.roleInProject ?? "Consulting"} work — ${days[di].toISOString().slice(0, 10)}`),
              status: "APPROVED",
              approvedById: approver.id,
              approvedAt: addDays(days[di], 3),
            },
          });
          dayLoad[di] += put;
          remaining -= put;
          resourceCostByProject.set(e.projectId, (resourceCostByProject.get(e.projectId) ?? 0) + (put / 8) * e.dailyRate);
          tsCountByProject.set(e.projectId, (tsCountByProject.get(e.projectId) ?? 0) + 1);
          totalTs++;
        }
      }
    }
  }
  console.log(`\nCreated ${totalTs} timesheet entries (<= ${WEEKLY_CAP}h/user/week, <= ${DAILY_CAP}h/day).`);

  for (const pm of projMeta) {
    const actualCost = (resourceCostByProject.get(pm.id) ?? 0) + (expCostByProject.get(pm.id) ?? 0);
    const margin = pm.contractValue > 0 ? ((pm.contractValue - actualCost) / pm.contractValue) * 100 : 0;
    console.log(
      `  ${pm.code} [${pm.status}] ts=${tsCountByProject.get(pm.id) ?? 0} cost=${(actualCost / 1e6).toFixed(0)}M / CV=${(pm.contractValue / 1e6).toFixed(0)}M -> margin ${margin.toFixed(0)}%`,
    );
  }

  const capped = await capUserDailyHours();
  console.log(`Normalized ${capped} timesheet row(s) to <= 8h/user/day (across all generators).`);

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
