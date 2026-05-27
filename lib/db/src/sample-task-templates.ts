import { PrismaClient } from "./generated/client/index.js";

const prisma = new PrismaClient();

type TplTask = {
  title: string;
  durationDays: number;
  offsetDays: number;
  parentIndex: number | null;
  billable: boolean;
};

type TplDef = {
  name: string;
  description: string;
  buName: string;
  tasks: TplTask[];
};

const TEMPLATES: TplDef[] = [
  {
    name: "Standard Web Application Pentest",
    description: "Standard web application pentest WBS — kickoff, recon, exploit, reporting.",
    buName: "Pentest",
    tasks: [
      { title: "Preparation & Kickoff", durationDays: 2, offsetDays: 0, parentIndex: null, billable: true },
      { title: "Scope confirmation & ROE", durationDays: 1, offsetDays: 0, parentIndex: 0, billable: true },
      { title: "Kickoff meeting with client", durationDays: 1, offsetDays: 1, parentIndex: 0, billable: true },
      { title: "Reconnaissance & Enumeration", durationDays: 3, offsetDays: 2, parentIndex: null, billable: true },
      { title: "Vulnerability Assessment", durationDays: 4, offsetDays: 5, parentIndex: null, billable: true },
      { title: "Exploitation & Post-Exploitation", durationDays: 4, offsetDays: 9, parentIndex: null, billable: true },
      { title: "Reporting", durationDays: 3, offsetDays: 13, parentIndex: null, billable: true },
      { title: "Draft report (TW)", durationDays: 2, offsetDays: 13, parentIndex: 6, billable: true },
      { title: "Review & finalization", durationDays: 1, offsetDays: 15, parentIndex: 6, billable: true },
      { title: "Closing meeting & BAST", durationDays: 1, offsetDays: 16, parentIndex: null, billable: false },
    ],
  },
  {
    name: "ISO 27001 Implementation (GRC)",
    description: "High-level stages of ISMS ISO 27001 implementation for enterprise clients.",
    buName: "GRC",
    tasks: [
      { title: "Gap Assessment", durationDays: 10, offsetDays: 0, parentIndex: null, billable: true },
      { title: "Risk Assessment & Treatment Plan", durationDays: 10, offsetDays: 10, parentIndex: null, billable: true },
      { title: "ISMS Document Drafting", durationDays: 20, offsetDays: 20, parentIndex: null, billable: true },
      { title: "Statement of Applicability", durationDays: 5, offsetDays: 20, parentIndex: 2, billable: true },
      { title: "Core Policies & Procedures", durationDays: 15, offsetDays: 25, parentIndex: 2, billable: true },
      { title: "Socialization & Training", durationDays: 5, offsetDays: 40, parentIndex: null, billable: true },
      { title: "Internal Audit", durationDays: 5, offsetDays: 45, parentIndex: null, billable: true },
      { title: "Management Review", durationDays: 2, offsetDays: 50, parentIndex: null, billable: true },
      { title: "Certification Audit Support", durationDays: 5, offsetDays: 52, parentIndex: null, billable: true },
    ],
  },
  {
    name: "Threat Hunting Engagement (4 weeks)",
    description: "Proactive threat hunting: hypothesis-driven hunt, IOC sweep, hardening recommendations.",
    buName: "Threat Hunting",
    tasks: [
      { title: "Preparation & Data Onboarding", durationDays: 5, offsetDays: 0, parentIndex: null, billable: true },
      { title: "Access to SIEM/EDR", durationDays: 2, offsetDays: 0, parentIndex: 0, billable: true },
      { title: "Baseline & dataset review", durationDays: 3, offsetDays: 2, parentIndex: 0, billable: true },
      { title: "Hypothesis-Driven Hunt", durationDays: 10, offsetDays: 5, parentIndex: null, billable: true },
      { title: "IOC & TTP Sweep", durationDays: 5, offsetDays: 15, parentIndex: null, billable: true },
      { title: "Detection Engineering Recommendations", durationDays: 3, offsetDays: 20, parentIndex: null, billable: true },
      { title: "Reporting & Closing", durationDays: 2, offsetDays: 23, parentIndex: null, billable: true },
    ],
  },
];

export async function ensureSampleTaskTemplates(): Promise<void> {
  const creator = await prisma.user.findFirst({
    where: { role: "MANAGEMENT", isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!creator) {
    console.log("[task-templates] No MANAGEMENT user found — skipping.");
    return;
  }

  const bus = await prisma.businessUnit.findMany({ select: { id: true, name: true } });
  const buByName = new Map(bus.map((b) => [b.name, b.id]));

  let created = 0;
  let skipped = 0;
  for (const tpl of TEMPLATES) {
    const existing = await prisma.taskTemplate.findFirst({
      where: { name: tpl.name },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.taskTemplate.create({
      data: {
        name: tpl.name,
        description: tpl.description,
        businessUnitId: buByName.get(tpl.buName) ?? null,
        tasks: tpl.tasks as unknown as object,
        createdById: creator.id,
        isActive: true,
      },
    });
    created++;
  }
  console.log(`[task-templates] created=${created} skipped=${skipped}`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  ensureSampleTaskTemplates()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      return prisma.$disconnect().then(() => process.exit(1));
    });
}
