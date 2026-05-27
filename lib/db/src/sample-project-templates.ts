import { PrismaClient } from "./generated/client/index.js";

const prisma = new PrismaClient();

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
    name: "Pentest Aplikasi Web (Standar)",
    description:
      "Blueprint pentest web app standar: 1 PM, 2 Konsultan Pentest, 1 TW. Durasi ±3 minggu, TOP 30/40/30.",
    buName: "Pentest",
    taskTemplateName: "Pentest Aplikasi Web (Standar)",
    defaultDurationDays: 21,
    estimatedContractValue: 180_000_000,
    resources: [
      { role: "PROJECT_MANAGER", count: 1, plannedMandays: 5, dailyRate: 2_500_000, note: "Koordinasi & status report mingguan" },
      { role: "KONSULTAN", count: 2, plannedMandays: 12, dailyRate: 2_000_000, note: "Recon, VA, exploitation" },
      { role: "TECHNICAL_WRITER", count: 1, plannedMandays: 4, dailyRate: 1_500_000, note: "Draft & finalisasi laporan" },
    ],
    milestones: [
      { name: "DP 30% (Kickoff)", percentage: 30, offsetDays: 0 },
      { name: "Progress 40% (Draft Report)", percentage: 40, offsetDays: 14 },
      { name: "Pelunasan 30% (BAST)", percentage: 30, offsetDays: 21 },
    ],
    raidItems: [
      { type: "ASSUMPTION", title: "Akses staging tersedia di hari kickoff", impact: "HIGH", likelihood: "MEDIUM", mitigation: "Konfirmasi via email H-3 sebelum mulai" },
      { type: "RISK", title: "WAF / IPS klien memblokir traffic test", impact: "MEDIUM", likelihood: "HIGH", mitigation: "Whitelist IP konsultan di awal scope confirmation" },
      { type: "DEPENDENCY", title: "Approval Rules of Engagement (RoE) dari klien", impact: "CRITICAL", likelihood: "MEDIUM", mitigation: "Template RoE dikirim bersama SPK" },
    ],
  },
  {
    name: "Implementasi ISO 27001 (GRC)",
    description:
      "Project implementasi ISMS ISO 27001 ±3 bulan untuk klien enterprise. Termasuk gap assessment, dokumentasi, dan pendampingan audit.",
    buName: "GRC",
    taskTemplateName: "Implementasi ISO 27001 (GRC)",
    defaultDurationDays: 90,
    estimatedContractValue: 450_000_000,
    resources: [
      { role: "PROJECT_MANAGER", count: 1, plannedMandays: 15, dailyRate: 2_500_000 },
      { role: "KONSULTAN", count: 2, plannedMandays: 30, dailyRate: 2_250_000, note: "GRC consultant senior" },
      { role: "TECHNICAL_WRITER", count: 1, plannedMandays: 15, dailyRate: 1_500_000, note: "Penyusunan policy & SOP" },
    ],
    milestones: [
      { name: "DP 20%", percentage: 20, offsetDays: 0 },
      { name: "Gap Assessment selesai 25%", percentage: 25, offsetDays: 14 },
      { name: "Dokumen ISMS final 30%", percentage: 30, offsetDays: 60 },
      { name: "Pelunasan 25% (Audit ready)", percentage: 25, offsetDays: 90 },
    ],
    raidItems: [
      { type: "RISK", title: "Stakeholder klien sulit dijadwalkan untuk workshop", impact: "HIGH", likelihood: "HIGH", mitigation: "Lock jadwal workshop di awal project, libatkan PIC klien" },
      { type: "ASSUMPTION", title: "Klien sudah punya struktur tim ISMS/CISO", impact: "MEDIUM", likelihood: "MEDIUM" },
      { type: "DEPENDENCY", title: "Tanggal audit sertifikasi dari LSI sudah fix", impact: "CRITICAL", likelihood: "MEDIUM", mitigation: "Booking LSI di awal project" },
    ],
  },
  {
    name: "Threat Hunting Engagement (4 minggu)",
    description:
      "Threat hunting proaktif berbasis hypothesis untuk 1 environment SIEM/EDR klien. 4 minggu, output: hunt report + hardening recommendation.",
    buName: "Threat Hunting",
    taskTemplateName: "Threat Hunting Engagement (4 minggu)",
    defaultDurationDays: 28,
    estimatedContractValue: 250_000_000,
    resources: [
      { role: "PROJECT_MANAGER", count: 1, plannedMandays: 6, dailyRate: 2_500_000 },
      { role: "KONSULTAN", count: 2, plannedMandays: 18, dailyRate: 2_500_000, note: "Threat hunter senior" },
      { role: "TECHNICAL_WRITER", count: 1, plannedMandays: 5, dailyRate: 1_500_000 },
    ],
    milestones: [
      { name: "DP 40% (Onboarding)", percentage: 40, offsetDays: 0 },
      { name: "Progress 30% (Mid-hunt review)", percentage: 30, offsetDays: 14 },
      { name: "Pelunasan 30% (Final report)", percentage: 30, offsetDays: 28 },
    ],
    raidItems: [
      { type: "DEPENDENCY", title: "Akses read-only SIEM/EDR klien", impact: "CRITICAL", likelihood: "HIGH", mitigation: "Akses disiapkan H-7 sebelum kickoff" },
      { type: "RISK", title: "Log retention klien <30 hari membatasi hunt window", impact: "HIGH", likelihood: "MEDIUM", mitigation: "Disclose di awal, sesuaikan hipotesis" },
      { type: "ASSUMPTION", title: "Tidak ada incident response aktif selama engagement", impact: "MEDIUM", likelihood: "LOW" },
    ],
  },
  {
    name: "VAPT Infrastruktur Internal (Compact)",
    description:
      "Vulnerability Assessment & Pentest infrastruktur internal (≤50 host). 2 minggu, fast turnaround.",
    buName: "Pentest",
    defaultDurationDays: 14,
    estimatedContractValue: 95_000_000,
    resources: [
      { role: "PROJECT_MANAGER", count: 1, plannedMandays: 3, dailyRate: 2_500_000 },
      { role: "KONSULTAN", count: 2, plannedMandays: 8, dailyRate: 2_000_000 },
      { role: "TECHNICAL_WRITER", count: 1, plannedMandays: 3, dailyRate: 1_500_000 },
    ],
    milestones: [
      { name: "DP 50% (Kickoff)", percentage: 50, offsetDays: 0 },
      { name: "Pelunasan 50% (BAST)", percentage: 50, offsetDays: 14 },
    ],
    raidItems: [
      { type: "ASSUMPTION", title: "Jumlah host target <= 50", impact: "MEDIUM", likelihood: "MEDIUM", mitigation: "Validasi inventory di kickoff" },
      { type: "RISK", title: "Service production sensitif terhadap port scan", impact: "HIGH", likelihood: "MEDIUM", mitigation: "Pakai scan profile low-impact, koordinasi dengan IT ops" },
    ],
  },
  {
    name: "Sertifikasi ISO 27001 Surveillance Audit Support",
    description:
      "Pendampingan surveillance audit ISO 27001 tahunan. 4 minggu prep + on-site audit support.",
    buName: "GRC",
    defaultDurationDays: 28,
    estimatedContractValue: 120_000_000,
    resources: [
      { role: "PROJECT_MANAGER", count: 1, plannedMandays: 4, dailyRate: 2_500_000 },
      { role: "KONSULTAN", count: 1, plannedMandays: 10, dailyRate: 2_250_000 },
      { role: "TECHNICAL_WRITER", count: 1, plannedMandays: 4, dailyRate: 1_500_000 },
    ],
    milestones: [
      { name: "DP 30%", percentage: 30, offsetDays: 0 },
      { name: "Pre-audit checklist done 40%", percentage: 40, offsetDays: 14 },
      { name: "Pelunasan 30% (Audit closed)", percentage: 30, offsetDays: 28 },
    ],
    raidItems: [
      { type: "DEPENDENCY", title: "Tanggal LSI auditor fix", impact: "CRITICAL", likelihood: "LOW" },
      { type: "RISK", title: "Major nonconformity ditemukan auditor", impact: "HIGH", likelihood: "MEDIUM", mitigation: "Run internal audit & mock audit H-7" },
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
