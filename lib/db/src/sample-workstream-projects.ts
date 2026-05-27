/**
 * Seed 5 sample projects, each backed by 1 SPK with 3 workstreams:
 * Pentest, GRC, and Threat Modeling.
 *
 * Idempotent — re-runs are safe: skips any project whose `code` already
 * exists and skips re-creating workstreams that already exist on a project.
 *
 * Run: `pnpm --filter @workspace/db exec tsx src/sample-workstream-projects.ts`
 */
import { prisma } from "./index.js";

interface WsSpec {
  code: string;
  name: string;
  buName: "Pentest" | "GRC" | "Threat Hunting";
  allocationPct: number;
  plannedMandays: number;
  estimatedCost: number;
  resourceRole: string;
  taskTitle: string;
  milestoneName: string;
  milestonePct: number;
}

interface ProjectSpec {
  code: string;
  name: string;
  description: string;
  clientName: string;
  clientIndustry: string;
  contractValue: number;
  estimatedCost: number;
  plannedMandays: number;
  monthsFromNowStart: number;
  monthsFromNowEnd: number;
  workstreams: WsSpec[];
}

const PROJECTS: ProjectSpec[] = [
  {
    code: "SPH-WS-2026-101",
    name: "Bank Nusantara — Annual Security Assurance",
    description:
      "Annual SPK package: penetration testing, ISO 27001 compliance audit, and threat modeling for core banking.",
    clientName: "Bank Nusantara",
    clientIndustry: "Banking",
    contractValue: 1_200_000_000,
    estimatedCost: 720_000_000,
    plannedMandays: 360,
    monthsFromNowStart: -1,
    monthsFromNowEnd: 5,
    workstreams: [
      { code: "PT", name: "Pentest Internet Banking", buName: "Pentest", allocationPct: 40, plannedMandays: 140, estimatedCost: 300_000_000, resourceRole: "Lead Pentester", taskTitle: "External & internal pentest scope", milestoneName: "Pentest Delivery 40%", milestonePct: 40 },
      { code: "GRC", name: "ISO 27001 Surveillance Audit", buName: "GRC", allocationPct: 35, plannedMandays: 130, estimatedCost: 260_000_000, resourceRole: "Lead Auditor", taskTitle: "ISMS surveillance fieldwork", milestoneName: "GRC Delivery 35%", milestonePct: 35 },
      { code: "TM", name: "Threat Modeling Core Banking", buName: "Threat Hunting", allocationPct: 25, plannedMandays: 90, estimatedCost: 160_000_000, resourceRole: "Threat Modeling Lead", taskTitle: "STRIDE workshop core banking", milestoneName: "Threat Modeling Delivery 25%", milestonePct: 25 },
    ],
  },
  {
    code: "SPH-WS-2026-102",
    name: "Tele Selaras — Security Assessment Bundle",
    description:
      "One combined SPK: customer application pentest, ISO 27001 gap analysis, and billing system threat modeling.",
    clientName: "Tele Selaras",
    clientIndustry: "Telecom",
    contractValue: 950_000_000,
    estimatedCost: 580_000_000,
    plannedMandays: 290,
    monthsFromNowStart: 0,
    monthsFromNowEnd: 5,
    workstreams: [
      { code: "PT", name: "Pentest Customer App", buName: "Pentest", allocationPct: 45, plannedMandays: 130, estimatedCost: 260_000_000, resourceRole: "Senior Pentester", taskTitle: "Web & mobile pentest scope", milestoneName: "Pentest Delivery 45%", milestonePct: 45 },
      { code: "GRC", name: "ISO 27001 Gap Analysis", buName: "GRC", allocationPct: 30, plannedMandays: 90, estimatedCost: 180_000_000, resourceRole: "GRC Lead", taskTitle: "Control gap workshop", milestoneName: "GRC Delivery 30%", milestonePct: 30 },
      { code: "TM", name: "Threat Modeling Billing", buName: "Threat Hunting", allocationPct: 25, plannedMandays: 70, estimatedCost: 140_000_000, resourceRole: "Threat Modeling Consultant", taskTitle: "DFD & STRIDE billing", milestoneName: "Threat Modeling Delivery 25%", milestonePct: 25 },
    ],
  },
  {
    code: "SPH-WS-2026-103",
    name: "Energi Prima — OT Security Program",
    description:
      "Cross-domain SPK: OT network pentest, NIST CSF GRC audit, and SCADA threat modeling.",
    clientName: "Energi Prima",
    clientIndustry: "Energy",
    contractValue: 1_500_000_000,
    estimatedCost: 920_000_000,
    plannedMandays: 420,
    monthsFromNowStart: -2,
    monthsFromNowEnd: 6,
    workstreams: [
      { code: "PT", name: "OT/ICS Pentest", buName: "Pentest", allocationPct: 35, plannedMandays: 150, estimatedCost: 320_000_000, resourceRole: "OT Pentester", taskTitle: "ICS protocol pentest", milestoneName: "Pentest Delivery 35%", milestonePct: 35 },
      { code: "GRC", name: "NIST CSF Maturity Audit", buName: "GRC", allocationPct: 40, plannedMandays: 170, estimatedCost: 380_000_000, resourceRole: "Senior Auditor", taskTitle: "CSF function assessment", milestoneName: "GRC Delivery 40%", milestonePct: 40 },
      { code: "TM", name: "Threat Modeling SCADA", buName: "Threat Hunting", allocationPct: 25, plannedMandays: 100, estimatedCost: 220_000_000, resourceRole: "Lead Threat Modeler", taskTitle: "SCADA attack tree", milestoneName: "Threat Modeling Delivery 25%", milestonePct: 25 },
    ],
  },
  {
    code: "SPH-WS-2026-104",
    name: "Retail Maju Bersama — E-commerce Security",
    description:
      "SPK package for e-commerce platform: checkout pentest, PCI DSS readiness, and payment flow threat modeling.",
    clientName: "Retail Maju Bersama",
    clientIndustry: "Retail",
    contractValue: 820_000_000,
    estimatedCost: 500_000_000,
    plannedMandays: 250,
    monthsFromNowStart: -1,
    monthsFromNowEnd: 4,
    workstreams: [
      { code: "PT", name: "Pentest Checkout & API", buName: "Pentest", allocationPct: 40, plannedMandays: 100, estimatedCost: 200_000_000, resourceRole: "Pentester", taskTitle: "Checkout & API pentest", milestoneName: "Pentest Delivery 40%", milestonePct: 40 },
      { code: "GRC", name: "PCI DSS Readiness", buName: "GRC", allocationPct: 35, plannedMandays: 90, estimatedCost: 180_000_000, resourceRole: "PCI QSA Lead", taskTitle: "Scoping & ROC prep", milestoneName: "GRC Delivery 35%", milestonePct: 35 },
      { code: "TM", name: "Threat Modeling Payment Flow", buName: "Threat Hunting", allocationPct: 25, plannedMandays: 60, estimatedCost: 120_000_000, resourceRole: "Threat Modeling Consultant", taskTitle: "Payment flow STRIDE", milestoneName: "Threat Modeling Delivery 25%", milestonePct: 25 },
    ],
  },
  {
    code: "SPH-WS-2026-105",
    name: "Asuransi Sentosa — Digital Trust Program",
    description:
      "Cross-BU SPK: customer portal pentest, SOC 2 Type II audit, and fraud engine threat modeling.",
    clientName: "Asuransi Sentosa",
    clientIndustry: "Insurance",
    contractValue: 1_050_000_000,
    estimatedCost: 640_000_000,
    plannedMandays: 320,
    monthsFromNowStart: 1,
    monthsFromNowEnd: 7,
    workstreams: [
      { code: "PT", name: "Customer Portal Pentest", buName: "Pentest", allocationPct: 35, plannedMandays: 110, estimatedCost: 220_000_000, resourceRole: "Lead Pentester", taskTitle: "Portal pentest scope", milestoneName: "Pentest Delivery 35%", milestonePct: 35 },
      { code: "GRC", name: "SOC 2 Type II Readiness", buName: "GRC", allocationPct: 40, plannedMandays: 130, estimatedCost: 280_000_000, resourceRole: "SOC 2 Lead", taskTitle: "Trust Service Criteria readiness", milestoneName: "GRC Delivery 40%", milestonePct: 40 },
      { code: "TM", name: "Threat Modeling Fraud Engine", buName: "Threat Hunting", allocationPct: 25, plannedMandays: 80, estimatedCost: 140_000_000, resourceRole: "Threat Modeling Lead", taskTitle: "Fraud engine STRIDE/LINDDUN", milestoneName: "Threat Modeling Delivery 25%", milestonePct: 25 },
    ],
  },
];

function monthsFromNow(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() + n);
  return d;
}

export async function ensureSampleWorkstreamProjects() {
  // Look up the few users we depend on. Bail with a clear message if seed
  // hasn't run yet so the user knows what to do.
  const [adi, sari, budi, rian, dewi, ayu] = await Promise.all([
    prisma.user.findUnique({ where: { email: "management@itsecasia.com" } }),
    prisma.user.findUnique({ where: { email: "pm@itsecasia.com" } }),
    prisma.user.findUnique({ where: { email: "sales@itsecasia.com" } }),
    prisma.user.findUnique({ where: { email: "konsultan@itsecasia.com" } }),
    prisma.user.findUnique({ where: { email: "konsultan2@itsecasia.com" } }),
    prisma.user.findUnique({ where: { email: "writer@itsecasia.com" } }),
  ]);
  if (!adi || !sari || !budi || !rian || !dewi || !ayu) {
    throw new Error("Base seed users not found — run `pnpm --filter @workspace/db run seed` first.");
  }
  void adi;

  const consultantPool = [rian, dewi, ayu];

  const busByName = new Map<string, string>();
  for (const buName of ["Pentest", "GRC", "Threat Hunting"] as const) {
    const bu = await prisma.businessUnit.findUnique({ where: { name: buName } });
    if (!bu) throw new Error(`Business Unit "${buName}" not found — run base seed first.`);
    busByName.set(buName, bu.id);
  }

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < PROJECTS.length; i++) {
    const spec = PROJECTS[i]!;

    const existing = await prisma.project.findUnique({ where: { code: spec.code } });
    if (existing) {
      skipped++;
      console.log(`[skip] ${spec.code} already exists.`);
      continue;
    }

    // Find or create the client.
    let client = await prisma.client.findFirst({ where: { name: spec.clientName } });
    if (!client) {
      client = await prisma.client.create({
        data: {
          name: spec.clientName,
          industry: spec.clientIndustry,
          contactPerson: "PIC " + spec.clientName,
          email: `pic@${spec.clientName.toLowerCase().replace(/[^a-z]/g, "")}.id`,
          phone: "+62-21-555-9000",
        },
      });
    }

    const startDate = monthsFromNow(spec.monthsFromNowStart);
    const endDate = monthsFromNow(spec.monthsFromNowEnd);

    const project = await prisma.project.create({
      data: {
        code: spec.code,
        name: spec.name,
        description: spec.description + " [sample-ws]",
        status: "ACTIVE",
        clientId: client.id,
        salesId: budi.id,
        pmId: sari.id,
        startDate,
        endDate,
        contractValue: spec.contractValue,
        estimatedCost: spec.estimatedCost,
        plannedMandays: spec.plannedMandays,
        vatPercent: 11,
        contractValueIncludesVat: false,
        useWorkstreams: true,
      },
    });

    // Workstreams.
    const wsIdByCode = new Map<string, string>();
    for (let j = 0; j < spec.workstreams.length; j++) {
      const w = spec.workstreams[j]!;
      const ws = await prisma.projectWorkstream.create({
        data: {
          projectId: project.id,
          code: w.code,
          name: w.name,
          description: `Workstream ${w.code} — ${w.name}`,
          businessUnitId: busByName.get(w.buName) ?? null,
          allocationPct: w.allocationPct,
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

    // One consultant resource per workstream, rotating through the pool.
    for (let j = 0; j < spec.workstreams.length; j++) {
      const w = spec.workstreams[j]!;
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
    }

    // One representative task per workstream.
    for (const w of spec.workstreams) {
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

    // One billing milestone per workstream (totals 100%).
    for (let j = 0; j < spec.workstreams.length; j++) {
      const w = spec.workstreams[j]!;
      await prisma.billingMilestone.create({
        data: {
          projectId: project.id,
          workstreamId: wsIdByCode.get(w.code) ?? null,
          name: w.milestoneName,
          percentage: w.milestonePct,
          dueDate: monthsFromNow(spec.monthsFromNowStart + 2 + j),
          sortOrder: j,
          status: "PLANNED",
        },
      });
    }

    // One sample expense per workstream (PENDING so the user can see approval flow).
    for (const w of spec.workstreams) {
      await prisma.projectExpense.create({
        data: {
          projectId: project.id,
          workstreamId: wsIdByCode.get(w.code) ?? null,
          category: w.code === "PT" ? "SOFTWARE" : w.code === "GRC" ? "LICENSE" : "OTHER",
          description: `[sample-ws] Initial tool / license for workstream ${w.code}`,
          amount: 5_000_000,
          spentAt: startDate,
          status: "PENDING",
          createdById: sari.id,
        },
      });
    }

    created++;
    console.log(`[created] ${spec.code} — ${spec.name} (3 workstreams, 3 resources, 3 tasks, 3 milestones, 3 expenses)`);
  }

  console.log(`\nSample workstream projects: created=${created} skipped=${skipped} total=${PROJECTS.length}`);
}

const isDirectRun = (() => {
  try {
    const arg = process.argv[1] ?? "";
    return (
      arg.endsWith("/sample-workstream-projects.ts") ||
      arg.endsWith("\\sample-workstream-projects.ts") ||
      arg.endsWith("/sample-workstream-projects.js") ||
      arg.endsWith("\\sample-workstream-projects.js")
    );
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  ensureSampleWorkstreamProjects()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
