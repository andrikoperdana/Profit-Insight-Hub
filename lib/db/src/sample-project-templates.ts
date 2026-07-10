import { prisma } from "./index.js";

type TplResource = { role: string; count: number; plannedMandays: number; dailyRate: number; note?: string };
type TplMilestone = { name: string; percentage: number; offsetDays: number };
type TplRaid = {
  type: "RISK" | "ASSUMPTION" | "ISSUE" | "DEPENDENCY";
  title: string;
  description?: string;
  impact?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  likelihood?: "LOW" | "MEDIUM" | "HIGH";
  mitigation?: string;
};

type TplDef = {
  name: string;
  description: string;
  buName: string;
  taskTemplateName?: string;
  kind?: "CLIENT" | "INTERNAL";
  defaultDurationDays: number;
  estimatedContractValue: number;
  vatPercent?: number;
  contractValueIncludesVat?: boolean;
  resources: TplResource[];
  milestones: TplMilestone[];
  raidItems: TplRaid[];
};

const TEMPLATES: TplDef[] = [
  {
    name: "Standard Web Application Pentest",
    description:
      "Standard web app pentest blueprint: 1 PM, 2 Pentest Consultants, 1 TW. Duration ±3 weeks, TOP 30/40/30.",
    buName: "Pentest",
    taskTemplateName: "Standard Web Application Pentest",
    defaultDurationDays: 21,
    estimatedContractValue: 180_000_000,
    resources: [
      { role: "PROJECT_MANAGER", count: 1, plannedMandays: 5, dailyRate: 2_500_000, note: "Weekly coordination & status report" },
      { role: "KONSULTAN", count: 2, plannedMandays: 12, dailyRate: 2_000_000, note: "Recon, VA, exploitation" },
      { role: "TECHNICAL_WRITER", count: 1, plannedMandays: 4, dailyRate: 1_500_000, note: "Report draft & finalization" },
    ],
    milestones: [
      { name: "Down Payment 30% (Kickoff)", percentage: 30, offsetDays: 0 },
      { name: "Progress 40% (Draft Report)", percentage: 40, offsetDays: 14 },
      { name: "Final payment 30% (BAST)", percentage: 30, offsetDays: 21 },
    ],
    raidItems: [
      { type: "ASSUMPTION", title: "Staging access available on kickoff day", impact: "HIGH", likelihood: "MEDIUM", mitigation: "Confirm via email 3 days before start" },
      { type: "RISK", title: "Client WAF / IPS blocks test traffic", impact: "MEDIUM", likelihood: "HIGH", mitigation: "Whitelist consultant IPs at start of scope confirmation" },
      { type: "DEPENDENCY", title: "Client approval of Rules of Engagement (RoE)", impact: "CRITICAL", likelihood: "MEDIUM", mitigation: "RoE template sent together with SPK" },
    ],
  },
  {
    name: "ISO 27001 Implementation (GRC)",
    description:
      "ISMS ISO 27001 implementation project ±3 months for enterprise clients. Includes gap assessment, documentation, and audit support.",
    buName: "Governance",
    taskTemplateName: "ISO 27001 Implementation (GRC)",
    defaultDurationDays: 90,
    estimatedContractValue: 450_000_000,
    resources: [
      { role: "PROJECT_MANAGER", count: 1, plannedMandays: 15, dailyRate: 2_500_000 },
      { role: "KONSULTAN", count: 2, plannedMandays: 30, dailyRate: 2_250_000, note: "Senior GRC consultant" },
      { role: "TECHNICAL_WRITER", count: 1, plannedMandays: 15, dailyRate: 1_500_000, note: "Policy & SOP drafting" },
    ],
    milestones: [
      { name: "Down Payment 20%", percentage: 20, offsetDays: 0 },
      { name: "Gap Assessment complete 25%", percentage: 25, offsetDays: 14 },
      { name: "ISMS Document final 30%", percentage: 30, offsetDays: 60 },
      { name: "Final payment 25% (Audit ready)", percentage: 25, offsetDays: 90 },
    ],
    raidItems: [
      { type: "RISK", title: "Client stakeholders hard to schedule for workshops", impact: "HIGH", likelihood: "HIGH", mitigation: "Lock workshop schedule at project start, involve client PIC" },
      { type: "ASSUMPTION", title: "Client already has ISMS/CISO team structure", impact: "MEDIUM", likelihood: "MEDIUM" },
      { type: "DEPENDENCY", title: "Certification audit date from LSI is fixed", impact: "CRITICAL", likelihood: "MEDIUM", mitigation: "Book LSI at project start" },
    ],
  },
  {
    name: "Threat Hunting Engagement (4 weeks)",
    description:
      "Proactive hypothesis-based threat hunting for 1 client SIEM/EDR environment. 4 weeks, output: hunt report + hardening recommendation.",
    buName: "Solution",
    taskTemplateName: "Threat Hunting Engagement (4 weeks)",
    defaultDurationDays: 28,
    estimatedContractValue: 250_000_000,
    resources: [
      { role: "PROJECT_MANAGER", count: 1, plannedMandays: 6, dailyRate: 2_500_000 },
      { role: "KONSULTAN", count: 2, plannedMandays: 18, dailyRate: 2_500_000, note: "Senior threat hunter" },
      { role: "TECHNICAL_WRITER", count: 1, plannedMandays: 5, dailyRate: 1_500_000 },
    ],
    milestones: [
      { name: "Down Payment 40% (Onboarding)", percentage: 40, offsetDays: 0 },
      { name: "Progress 30% (Mid-hunt review)", percentage: 30, offsetDays: 14 },
      { name: "Final payment 30% (Final report)", percentage: 30, offsetDays: 28 },
    ],
    raidItems: [
      { type: "DEPENDENCY", title: "Read-only access to client SIEM/EDR", impact: "CRITICAL", likelihood: "HIGH", mitigation: "Access prepared 7 days before kickoff" },
      { type: "RISK", title: "Client log retention <30 days limits hunt window", impact: "HIGH", likelihood: "MEDIUM", mitigation: "Disclose early, adjust hypothesis" },
      { type: "ASSUMPTION", title: "No active incident response during engagement", impact: "MEDIUM", likelihood: "LOW" },
    ],
  },
  {
    name: "Internal Infrastructure VAPT (Compact)",
    description:
      "Vulnerability Assessment & Pentest for internal infrastructure (≤50 hosts). 2 weeks, fast turnaround.",
    buName: "Pentest",
    defaultDurationDays: 14,
    estimatedContractValue: 95_000_000,
    resources: [
      { role: "PROJECT_MANAGER", count: 1, plannedMandays: 3, dailyRate: 2_500_000 },
      { role: "KONSULTAN", count: 2, plannedMandays: 8, dailyRate: 2_000_000 },
      { role: "TECHNICAL_WRITER", count: 1, plannedMandays: 3, dailyRate: 1_500_000 },
    ],
    milestones: [
      { name: "Down Payment 50% (Kickoff)", percentage: 50, offsetDays: 0 },
      { name: "Final payment 50% (BAST)", percentage: 50, offsetDays: 14 },
    ],
    raidItems: [
      { type: "ASSUMPTION", title: "Target host count <= 50", impact: "MEDIUM", likelihood: "MEDIUM", mitigation: "Validate inventory at kickoff" },
      { type: "RISK", title: "Production services sensitive to port scanning", impact: "HIGH", likelihood: "MEDIUM", mitigation: "Use low-impact scan profile, coordinate with IT ops" },
    ],
  },
  {
    name: "ISO 27001 Surveillance Audit Support",
    description:
      "Annual ISO 27001 surveillance audit support. 4 weeks prep + on-site audit support.",
    buName: "Governance",
    defaultDurationDays: 28,
    estimatedContractValue: 120_000_000,
    resources: [
      { role: "PROJECT_MANAGER", count: 1, plannedMandays: 4, dailyRate: 2_500_000 },
      { role: "KONSULTAN", count: 1, plannedMandays: 10, dailyRate: 2_250_000 },
      { role: "TECHNICAL_WRITER", count: 1, plannedMandays: 4, dailyRate: 1_500_000 },
    ],
    milestones: [
      { name: "Down Payment 30%", percentage: 30, offsetDays: 0 },
      { name: "Pre-audit checklist done 40%", percentage: 40, offsetDays: 14 },
      { name: "Final payment 30% (Audit closed)", percentage: 30, offsetDays: 28 },
    ],
    raidItems: [
      { type: "DEPENDENCY", title: "LSI auditor date confirmed", impact: "CRITICAL", likelihood: "LOW" },
      { type: "RISK", title: "Major nonconformity found by auditor", impact: "HIGH", likelihood: "MEDIUM", mitigation: "Run internal audit & mock audit 7 days before" },
    ],
  },
];

export async function ensureSampleProjectTemplates() {
  const creator =
    (await prisma.user.findFirst({ where: { role: "MANAGEMENT" }, orderBy: { createdAt: "asc" } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!creator) {
    console.log("[sample-project-templates] no users yet, skipping");
    return;
  }

  const bus = await prisma.businessUnit.findMany({ select: { id: true, name: true } });
  const buByName = new Map(bus.map((b) => [b.name.toLowerCase(), b.id]));

  const taskTpls = await prisma.taskTemplate.findMany({ select: { id: true, name: true } });
  const taskTplByName = new Map(taskTpls.map((t) => [t.name, t.id]));

  let created = 0;
  for (const t of TEMPLATES) {
    const existing = await prisma.projectTemplate.findFirst({ where: { name: t.name } });
    if (existing) continue;
    const buId = buByName.get(t.buName.toLowerCase()) ?? null;
    const taskTplId = t.taskTemplateName ? (taskTplByName.get(t.taskTemplateName) ?? null) : null;
    const totals = t.resources.reduce(
      (acc, r) => {
        const md = r.count * r.plannedMandays;
        acc.mandays += md;
        acc.cost += md * r.dailyRate;
        return acc;
      },
      { mandays: 0, cost: 0 },
    );
    await prisma.projectTemplate.create({
      data: {
        name: t.name,
        description: t.description,
        businessUnitId: buId,
        kind: t.kind ?? "CLIENT",
        defaultDurationDays: t.defaultDurationDays,
        estimatedContractValue: t.estimatedContractValue,
        estimatedCost: totals.cost,
        plannedMandays: totals.mandays,
        vatPercent: t.vatPercent ?? 11,
        contractValueIncludesVat: t.contractValueIncludesVat ?? true,
        taskTemplateId: taskTplId,
        isActive: true,
        createdById: creator.id,
        resources: {
          create: t.resources.map((r) => ({
            role: r.role,
            count: r.count,
            plannedMandays: r.plannedMandays,
            dailyRate: r.dailyRate,
            note: r.note ?? null,
          })),
        },
        milestones: {
          create: t.milestones.map((m, i) => ({
            name: m.name,
            percentage: m.percentage,
            offsetDays: m.offsetDays,
            order: i,
          })),
        },
        raidItems: {
          create: t.raidItems.map((r) => ({
            type: r.type,
            title: r.title,
            description: r.description ?? null,
            impact: r.impact ?? "MEDIUM",
            likelihood: r.likelihood ?? "MEDIUM",
            mitigation: r.mitigation ?? null,
          })),
        },
      },
    });
    created += 1;
  }
  console.log(`[sample-project-templates] created ${created} (of ${TEMPLATES.length}) project templates.`);
}

const __argv1 = process.argv[1] ?? "";
if (
  import.meta.url === `file://${__argv1}` &&
  (__argv1.endsWith("sample-project-templates.ts") || __argv1.endsWith("sample-project-templates.js"))
) {
  ensureSampleProjectTemplates()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      return prisma.$disconnect().then(() => process.exit(1));
    });
}
