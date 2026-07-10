/**
 * Seed ONE sample project that splits its contract evenly across 3 Business
 * Units (Pentest, Governance, Solution) — each backed by its own workstream —
 * and gives EACH workstream/BU its OWN 3 terms of payment (billing
 * milestones). This is the layout needed to test Xero invoicing where every
 * BU is invoiced on its own payment schedule.
 *
 * Example (contract = Rp 300,000,000 NET / VAT excluded):
 *   Pentest          100,000,000  ->  DP 40jt | Progress 30jt | Final 30jt
 *   Governance       100,000,000  ->  DP 40jt | Progress 30jt | Final 30jt
 *   Threat Modeling  100,000,000  ->  DP 40jt | Progress 30jt | Final 30jt
 *   => 9 billing milestones total, 3 per BU.
 *
 * Milestone `amount` is stored explicitly (exact rupiah) and `percentage` is
 * the term's share of the TOTAL contract, so the Billing tab "% allocated"
 * card sums to exactly 100%.
 *
 * Idempotent — re-runs skip the project if its `code` already exists.
 *
 * Run: `pnpm --filter @workspace/db exec tsx src/sample-multibu-terms-project.ts`
 */
import { prisma } from "./index.js";

const PROJECT_CODE = "SPH-WS-2026-201";
const CONTRACT_VALUE = 300_000_000; // NET (VAT excluded)

interface TermSpec {
  name: string;
  amount: number;
  monthsFromNowDue: number;
}

interface WsSpec {
  code: string;
  name: string;
  buName: "Pentest" | "Governance" | "Solution";
  buShare: number; // NET rupiah for this BU/workstream
  plannedMandays: number;
  estimatedCost: number;
  resourceRole: string;
  taskTitle: string;
  terms: TermSpec[];
}

// Each BU = 100jt NET, split DP 40jt / Progress 30jt / Final 30jt.
function standardTerms(prefix: string): TermSpec[] {
  return [
    { name: `${prefix} — Down Payment`, amount: 40_000_000, monthsFromNowDue: 1 },
    { name: `${prefix} — Progress Payment`, amount: 30_000_000, monthsFromNowDue: 3 },
    { name: `${prefix} — Final Payment (after BAST)`, amount: 30_000_000, monthsFromNowDue: 5 },
  ];
}

const WORKSTREAMS: WsSpec[] = [
  {
    code: "PT",
    name: "Penetration Testing",
    buName: "Pentest",
    buShare: 100_000_000,
    plannedMandays: 40,
    estimatedCost: 60_000_000,
    resourceRole: "Lead Pentester",
    taskTitle: "Web & API penetration test",
    terms: standardTerms("Pentest"),
  },
  {
    code: "GRC",
    name: "ISO 27001 Compliance Audit",
    buName: "Governance",
    buShare: 100_000_000,
    plannedMandays: 38,
    estimatedCost: 58_000_000,
    resourceRole: "Lead Auditor",
    taskTitle: "ISMS audit fieldwork",
    terms: standardTerms("Governance"),
  },
  {
    code: "TM",
    name: "Threat Modeling",
    buName: "Solution",
    buShare: 100_000_000,
    plannedMandays: 32,
    estimatedCost: 52_000_000,
    resourceRole: "Threat Modeling Lead",
    taskTitle: "STRIDE workshop & attack trees",
    terms: standardTerms("Threat Modeling"),
  },
];

function monthsFromNow(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() + n);
  return d;
}

export async function ensureSampleMultiBuTermsProject() {
  const [sari, budi, rian, dewi, ayu] = await Promise.all([
    prisma.user.findUnique({ where: { email: "pm@itsecasia.com" } }),
    prisma.user.findUnique({ where: { email: "sales@itsecasia.com" } }),
    prisma.user.findUnique({ where: { email: "konsultan@itsecasia.com" } }),
    prisma.user.findUnique({ where: { email: "konsultan2@itsecasia.com" } }),
    prisma.user.findUnique({ where: { email: "writer@itsecasia.com" } }),
  ]);
  if (!sari || !budi || !rian || !dewi || !ayu) {
    throw new Error("Base seed users not found — run `pnpm --filter @workspace/db run seed` first.");
  }
  const consultantPool = [rian, dewi, ayu];

  const busByName = new Map<string, string>();
  for (const buName of ["Pentest", "Governance", "Solution"] as const) {
    const bu = await prisma.businessUnit.findUnique({ where: { name: buName } });
    if (!bu) throw new Error(`Business Unit "${buName}" not found — run base seed first.`);
    busByName.set(buName, bu.id);
  }

  const existing = await prisma.project.findUnique({ where: { code: PROJECT_CODE } });
  if (existing) {
    console.log(`[skip] ${PROJECT_CODE} already exists.`);
    return;
  }

  let client = await prisma.client.findFirst({ where: { name: "Garuda Finansial" } });
  if (!client) {
    client = await prisma.client.create({
      data: {
        name: "Garuda Finansial",
        industry: "Fintech",
        contactPerson: "PIC Garuda Finansial",
        email: "pic@garudafinansial.id",
        phone: "+62-21-555-9100",
      },
    });
  }

  const startDate = monthsFromNow(-1);
  const endDate = monthsFromNow(6);

  const totalAllocation = WORKSTREAMS.reduce((s, w) => s + w.buShare, 0);

  const project = await prisma.project.create({
    data: {
      code: PROJECT_CODE,
      name: "Garuda Finansial — Multi-Service Security Engagement",
      description:
        "Single SPK split evenly across Pentest, GRC, and Threat Modeling — each BU invoiced on its own 3-term payment schedule. [sample-multibu-terms]",
      status: "ACTIVE",
      clientId: client.id,
      salesId: budi.id,
      pmId: sari.id,
      startDate,
      endDate,
      contractValue: CONTRACT_VALUE,
      estimatedCost: WORKSTREAMS.reduce((s, w) => s + w.estimatedCost, 0),
      plannedMandays: WORKSTREAMS.reduce((s, w) => s + w.plannedMandays, 0),
      vatPercent: 11,
      contractValueIncludesVat: false,
      useWorkstreams: true,
    },
  });

  const wsIdByCode = new Map<string, string>();
  for (let j = 0; j < WORKSTREAMS.length; j++) {
    const w = WORKSTREAMS[j]!;
    const ws = await prisma.projectWorkstream.create({
      data: {
        projectId: project.id,
        code: w.code,
        name: w.name,
        description: `Workstream ${w.code} — ${w.name}`,
        businessUnitId: busByName.get(w.buName) ?? null,
        allocationPct: Math.round((w.buShare / totalAllocation) * 10000) / 100,
        plannedMandays: w.plannedMandays,
        estimatedCost: w.estimatedCost,
        startDate,
        endDate,
        status: "ACTIVE",
        sortOrder: j,
      },
    });
    wsIdByCode.set(w.code, ws.id);
  }

  // One consultant resource + one representative task per workstream.
  for (let j = 0; j < WORKSTREAMS.length; j++) {
    const w = WORKSTREAMS[j]!;
    const consultant = consultantPool[j % consultantPool.length]!;
    await prisma.projectResource.create({
      data: {
        projectId: project.id,
        userId: consultant.id,
        roleInProject: w.resourceRole,
        plannedMandays: Math.round(w.plannedMandays * 0.6),
        dailyRate: consultant.dailyRate ?? 1_700_000,
        workstreamId: wsIdByCode.get(w.code) ?? null,
        acceptedAt: new Date(),
      },
    });
    await prisma.task.create({
      data: {
        projectId: project.id,
        workstreamId: wsIdByCode.get(w.code) ?? null,
        title: w.taskTitle,
        description: `Initial work package for workstream ${w.code}.`,
        status: "IN_PROGRESS",
        progressPercent: 25,
        billable: true,
        startDate,
        endDate,
        createdById: sari.id,
      },
    });
  }

  // Three billing milestones (terms of payment) per workstream/BU.
  let milestoneCount = 0;
  let sortOrder = 0;
  for (const w of WORKSTREAMS) {
    for (const t of w.terms) {
      await prisma.billingMilestone.create({
        data: {
          projectId: project.id,
          workstreamId: wsIdByCode.get(w.code) ?? null,
          name: t.name,
          amount: t.amount,
          percentage: Math.round((t.amount / CONTRACT_VALUE) * 10000) / 100,
          dueDate: monthsFromNow(t.monthsFromNowDue),
          status: "PLANNED",
          sortOrder: sortOrder++,
        },
      });
      milestoneCount++;
    }
  }

  console.log(
    `[created] ${PROJECT_CODE} — ${project.name}\n` +
      `  3 workstreams (Pentest / GRC / Threat Hunting), each Rp 100,000,000 NET\n` +
      `  ${milestoneCount} billing milestones (3 terms of payment per BU), total Rp ${CONTRACT_VALUE.toLocaleString("id-ID")} NET`,
  );
}

const isDirectRun = (() => {
  try {
    const arg = process.argv[1] ?? "";
    return (
      arg.endsWith("/sample-multibu-terms-project.ts") ||
      arg.endsWith("\\sample-multibu-terms-project.ts") ||
      arg.endsWith("/sample-multibu-terms-project.js") ||
      arg.endsWith("\\sample-multibu-terms-project.js")
    );
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  ensureSampleMultiBuTermsProject()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
