import { prisma } from "./index.js";
import bcrypt from "bcryptjs";

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

export async function ensureSampleReportData() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ---------------------------------------------------------------------
  // 1. Second PM (for PM workload variety) — idempotent
  // ---------------------------------------------------------------------
  const passwordHash = await bcrypt.hash("password123", 10);
  const pm2Email = "pm2@secureprofit.id";
  let pm2 = await prisma.user.findUnique({ where: { email: pm2Email } });
  if (!pm2) {
    const adi = await prisma.user.findUnique({ where: { email: "management@secureprofit.id" } });
    pm2 = await prisma.user.create({
      data: {
        email: pm2Email,
        passwordHash,
        name: "Yusuf Maulana",
        role: "PROJECT_MANAGER",
        title: "Project Manager",
        dailyRate: 1800000,
        managerId: adi?.id ?? null,
      },
    });
    console.log("Created second PM: pm2@secureprofit.id");
  }

  // Reassign 4 of Sari's projects to Yusuf — ONE-TIME, only when Yusuf has zero projects
  const sari = await prisma.user.findUnique({ where: { email: "pm@secureprofit.id" } });
  if (sari && pm2) {
    const pm2Count = await prisma.project.count({ where: { pmId: pm2.id, deletedAt: null } });
    if (pm2Count === 0) {
      const sariCount = await prisma.project.count({ where: { pmId: sari.id, deletedAt: null } });
      if (sariCount >= 8) {
        const moveTo = await prisma.project.findMany({
          where: { pmId: sari.id, deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 4,
          select: { id: true },
        });
        await prisma.project.updateMany({
          where: { id: { in: moveTo.map((p) => p.id) } },
          data: { pmId: pm2.id },
        });
        console.log(`Moved ${moveTo.length} projects to second PM.`);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 2. Billing milestones — only if none exist
  // ---------------------------------------------------------------------
  const msCount = await prisma.billingMilestone.count();
  if (msCount === 0) {
    const projects = await prisma.project.findMany({
      where: { deletedAt: null, status: { in: ["ACTIVE", "OBSERVATION", "COMPLETE", "PAUSE"] } },
      select: { id: true, code: true, contractValue: true, startDate: true, endDate: true, status: true },
      orderBy: { createdAt: "asc" },
    });

    let invoiceSeq = 1;
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i]!;
      const baseStart = p.startDate ?? addMonths(today, -3);
      const baseEnd = p.endDate ?? addMonths(today, 3);
      const span = baseEnd.getTime() - baseStart.getTime();

      // Spread overdue distribution: ensure each aging bucket gets representation
      // i % 5 controls scenario: 0=all paid, 1=overdue 0-30, 2=overdue 31-60, 3=overdue 61-90, 4=overdue 90+
      const scenario = i % 5;
      const milestones = [
        { name: "Kickoff Payment 30%", percentage: 30, sortOrder: 0, offset: 0 },
        { name: "Midterm Delivery 40%", percentage: 40, sortOrder: 1, offset: 0.5 },
        { name: "Final Acceptance 30%", percentage: 30, sortOrder: 2, offset: 1 },
      ];

      for (let m = 0; m < milestones.length; m++) {
        const ms = milestones[m]!;
        const dueDate = new Date(baseStart.getTime() + span * ms.offset);

        let status: "PLANNED" | "INVOICED" | "PAID" = "PLANNED";
        let invoicedAt: Date | null = null;
        let paidAt: Date | null = null;
        let invoiceNumber: string | null = null;

        if (scenario === 0) {
          // All paid (clean project)
          status = "PAID";
          invoicedAt = addDays(dueDate, -10);
          paidAt = addDays(dueDate, 5);
          invoiceNumber = `INV-2026-${String(invoiceSeq++).padStart(4, "0")}`;
        } else if (scenario === 1 && m < 2) {
          // First two paid, third invoiced overdue 0-30 days
          if (m < 2) {
            status = "PAID";
            invoicedAt = addDays(dueDate, -10);
            paidAt = addDays(dueDate, 3);
            invoiceNumber = `INV-2026-${String(invoiceSeq++).padStart(4, "0")}`;
          }
        } else if (scenario === 1 && m === 2) {
          status = "INVOICED";
          invoicedAt = addDays(today, -15);
          // Make due date 10 days ago so it's overdue 0-30
          invoiceNumber = `INV-2026-${String(invoiceSeq++).padStart(4, "0")}`;
        } else if (scenario === 2) {
          if (m === 0) {
            status = "PAID";
            invoicedAt = addDays(dueDate, -10);
            paidAt = addDays(dueDate, 5);
            invoiceNumber = `INV-2026-${String(invoiceSeq++).padStart(4, "0")}`;
          } else if (m === 1) {
            status = "INVOICED";
            invoicedAt = addDays(today, -50);
            invoiceNumber = `INV-2026-${String(invoiceSeq++).padStart(4, "0")}`;
          }
        } else if (scenario === 3) {
          if (m === 0) {
            status = "INVOICED";
            invoicedAt = addDays(today, -80);
            invoiceNumber = `INV-2026-${String(invoiceSeq++).padStart(4, "0")}`;
          }
        } else if (scenario === 4) {
          if (m === 0) {
            status = "INVOICED";
            invoicedAt = addDays(today, -120);
            invoiceNumber = `INV-2026-${String(invoiceSeq++).padStart(4, "0")}`;
          }
        }

        // Override dueDate per scenario to land in the right aging bucket
        let finalDueDate = dueDate;
        if (scenario === 1 && m === 2) finalDueDate = addDays(today, -15);
        if (scenario === 2 && m === 1) finalDueDate = addDays(today, -45);
        if (scenario === 3 && m === 0) finalDueDate = addDays(today, -75);
        if (scenario === 4 && m === 0) finalDueDate = addDays(today, -110);

        await prisma.billingMilestone.create({
          data: {
            projectId: p.id,
            name: ms.name,
            percentage: ms.percentage,
            dueDate: finalDueDate,
            status,
            invoicedAt,
            paidAt,
            invoiceNumber,
            sortOrder: ms.sortOrder,
          },
        });
      }
    }
    console.log(`Created billing milestones for ${projects.length} projects.`);
  } else {
    console.log(`Skipping billing milestones (already ${msCount} present).`);
  }

  // ---------------------------------------------------------------------
  // 3. Project expenses — per-row dedupe by (projectId + description marker)
  // ---------------------------------------------------------------------
  {
    const projects = await prisma.project.findMany({
      where: { deletedAt: null, status: { in: ["ACTIVE", "OBSERVATION", "COMPLETE"] } },
      select: { id: true, pmId: true },
      take: 10,
    });
    const submitter = sari ?? (await prisma.user.findFirst({ where: { role: "PROJECT_MANAGER" } }));
    if (submitter && projects.length > 0) {
      const SAMPLE_TAG = " [sample]";
      const samples: Array<{ category: any; description: string; amount: number; status: any; daysAgo: number }> = [
        { category: "SOFTWARE", description: "Burp Suite Pro license renewal", amount: 4500000, status: "APPROVED", daysAgo: 12 },
        { category: "TRAVEL",   description: "Onsite assessment travel — Jakarta", amount: 1850000, status: "APPROVED", daysAgo: 8 },
        { category: "HARDWARE", description: "Test laptop for red team engagement", amount: 12500000, status: "APPROVED", daysAgo: 25 },
        { category: "LICENSE",  description: "Nessus scanner subscription", amount: 7500000, status: "APPROVED", daysAgo: 18 },
        { category: "SOFTWARE", description: "Metasploit Pro license", amount: 3200000, status: "PENDING", daysAgo: 3 },
        { category: "TRAVEL",   description: "Flight & hotel — Surabaya site visit", amount: 4200000, status: "APPROVED", daysAgo: 35 },
        { category: "OTHER",    description: "Training course — OSCP voucher", amount: 5000000, status: "PENDING", daysAgo: 1 },
        { category: "HARDWARE", description: "USB security keys for engagement", amount: 850000, status: "REJECTED", daysAgo: 20 },
        { category: "SOFTWARE", description: "Wireshark & Network tools subscription", amount: 1200000, status: "APPROVED", daysAgo: 45 },
        { category: "LICENSE",  description: "ISO 27001 toolkit licence", amount: 9000000, status: "APPROVED", daysAgo: 60 },
      ];
      let created = 0;
      for (let i = 0; i < samples.length && i < projects.length; i++) {
        const s = samples[i]!;
        const project = projects[i % projects.length]!;
        const taggedDescription = s.description + SAMPLE_TAG;
        const exists = await prisma.projectExpense.findFirst({
          where: { projectId: project.id, description: taggedDescription },
          select: { id: true },
        });
        if (exists) continue;
        await prisma.projectExpense.create({
          data: {
            projectId: project.id,
            category: s.category,
            description: taggedDescription,
            amount: s.amount,
            spentAt: addDays(today, -s.daysAgo),
            status: s.status,
            createdById: submitter.id,
            approvedById: s.status !== "PENDING" ? submitter.id : null,
            approvedAt: s.status !== "PENDING" ? addDays(today, -s.daysAgo + 1) : null,
            rejectionReason: s.status === "REJECTED" ? "Out of scope for this engagement." : null,
          },
        });
        created++;
      }
      if (created > 0) console.log(`Created ${created} sample expenses.`);
      else console.log(`Skipping expenses (sample rows already present).`);
    }
  }

  // ---------------------------------------------------------------------
  // 4. Recent timesheets — per-row dedupe by (userId, projectId, workDate, marker)
  // ---------------------------------------------------------------------
  {
    const TS_MARKER = "Recent engagement work [sample]";
    const consultants = await prisma.user.findMany({
      where: { role: { in: ["KONSULTAN", "TECHNICAL_WRITER"] } },
      take: 3,
    });
    const activeProjects = await prisma.project.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      take: 3,
      select: { id: true, pmId: true },
    });
    if (consultants.length > 0 && activeProjects.length > 0 && sari) {
      let added = 0;
      for (let dayBack = 25; dayBack >= 1; dayBack--) {
        const d = addDays(today, -dayBack);
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        for (let ci = 0; ci < consultants.length; ci++) {
          const u = consultants[ci]!;
          const proj = activeProjects[ci % activeProjects.length]!;
          const exists = await prisma.projectResource.findFirst({
            where: { projectId: proj.id, userId: u.id },
          });
          if (!exists) continue;
          const dup = await prisma.timesheet.findFirst({
            where: { projectId: proj.id, userId: u.id, workDate: d, description: TS_MARKER },
            select: { id: true },
          });
          if (dup) continue;
          await prisma.timesheet.create({
            data: {
              projectId: proj.id,
              userId: u.id,
              workDate: d,
              hours: 6 + (dayBack % 3),
              description: TS_MARKER,
              status: "APPROVED",
              approvedById: sari.id,
              approvedAt: d,
            },
          });
          added++;
        }
      }
      if (added > 0) console.log(`Created ${added} recent timesheets for utilization.`);
      else console.log(`Skipping recent timesheets (sample rows already present).`);
    }
  }

  await ensureSampleLeads();
}

const LEAD_MARKER = "[sample]";

export async function ensureSampleLeads() {
  const sales = await prisma.user.findUnique({ where: { email: "sales@secureprofit.id" } });
  if (!sales) return;

  const existing = await prisma.lead.count({ where: { notes: { contains: LEAD_MARKER } } });
  if (existing > 0) {
    console.log(`Skipping sample leads (${existing} already present).`);
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const addDays = (n: number) => { const x = new Date(today); x.setDate(x.getDate() + n); return x; };

  const samples = [
    {
      title: "Web Application Pentest — Bank Mandiri Digital",
      stage: "NEW",
      prospectiveClientName: "Bank Mandiri",
      industry: "Banking",
      source: "Referral",
      estimatedValue: 450_000_000,
      probability: 20,
      expectedCloseDate: addDays(60),
      contactName: "Rahmat Hidayat",
      contactEmail: "rahmat.hidayat@bankmandiri.example",
      contactPhone: "+62 811 2233 4455",
    },
    {
      title: "ISO 27001 Gap Assessment — Tokopedia",
      stage: "QUALIFIED",
      prospectiveClientName: "Tokopedia",
      industry: "E-commerce",
      source: "Inbound web",
      estimatedValue: 320_000_000,
      probability: 40,
      expectedCloseDate: addDays(45),
      contactName: "Sinta Permata",
      contactEmail: "sinta.permata@tokopedia.example",
    },
    {
      title: "Red Team Engagement — Telkomsel Core Network",
      stage: "PROPOSAL",
      prospectiveClientName: "Telkomsel",
      industry: "Telecommunications",
      source: "Existing relationship",
      estimatedValue: 1_200_000_000,
      probability: 55,
      expectedCloseDate: addDays(30),
      contactName: "Andi Pratama",
      contactEmail: "andi.pratama@telkomsel.example",
      contactPhone: "+62 812 3456 7890",
    },
    {
      title: "Threat Hunting Retainer — Pertamina SOC",
      stage: "NEGOTIATION",
      prospectiveClientName: "Pertamina",
      industry: "Energy",
      source: "Tender",
      estimatedValue: 2_400_000_000,
      probability: 70,
      expectedCloseDate: addDays(21),
      contactName: "Wahyu Saputra",
      contactEmail: "wahyu.saputra@pertamina.example",
    },
    {
      title: "Mobile App Pentest — BCA Mobile Banking",
      stage: "NEGOTIATION",
      prospectiveClientName: "Bank Central Asia",
      industry: "Banking",
      source: "Referral",
      estimatedValue: 380_000_000,
      probability: 65,
      expectedCloseDate: addDays(14),
      contactName: "Maya Anggraini",
      contactEmail: "maya.anggraini@bca.example",
    },
    {
      title: "Cloud Security Assessment — Bukalapak AWS",
      stage: "QUALIFIED",
      prospectiveClientName: "Bukalapak",
      industry: "E-commerce",
      source: "Conference",
      estimatedValue: 275_000_000,
      probability: 35,
      expectedCloseDate: addDays(50),
      contactName: "Dani Setiawan",
      contactEmail: "dani.setiawan@bukalapak.example",
    },
    {
      title: "GRC Advisory Project — Asuransi Jiwasraya",
      stage: "PROPOSAL",
      prospectiveClientName: "Jiwasraya",
      industry: "Insurance",
      source: "Cold outreach",
      estimatedValue: 540_000_000,
      probability: 45,
      expectedCloseDate: addDays(40),
      contactName: "Lina Marlina",
      contactEmail: "lina.marlina@jiwasraya.example",
    },
    {
      title: "Annual Pentest — Garuda Indonesia",
      stage: "WON",
      prospectiveClientName: "Garuda Indonesia",
      industry: "Aviation",
      source: "Existing relationship",
      estimatedValue: 620_000_000,
      probability: 100,
      expectedCloseDate: addDays(-10),
      contactName: "Bagus Wirawan",
      contactEmail: "bagus.wirawan@garuda.example",
    },
    {
      title: "Phishing Simulation Program — Gojek HR",
      stage: "LOST",
      prospectiveClientName: "Gojek",
      industry: "Ride-hailing",
      source: "Inbound web",
      estimatedValue: 180_000_000,
      probability: 0,
      expectedCloseDate: addDays(-20),
      contactName: "Putri Larasati",
      contactEmail: "putri.larasati@gojek.example",
    },
    {
      title: "PCI-DSS Readiness — DANA Wallet",
      stage: "NEW",
      prospectiveClientName: "DANA",
      industry: "Fintech",
      source: "Referral",
      estimatedValue: 410_000_000,
      probability: 25,
      expectedCloseDate: addDays(75),
      contactName: "Reza Mahendra",
      contactEmail: "reza.mahendra@dana.example",
    },
  ];

  let created = 0;
  for (const s of samples) {
    await prisma.lead.create({
      data: {
        title: s.title,
        stage: s.stage as any,
        prospectiveClientName: s.prospectiveClientName,
        industry: s.industry,
        source: s.source,
        estimatedValue: s.estimatedValue,
        probability: s.probability,
        expectedCloseDate: s.expectedCloseDate,
        contactName: s.contactName,
        contactEmail: s.contactEmail,
        contactPhone: (s as any).contactPhone ?? null,
        ownerId: sales.id,
        notes: `${LEAD_MARKER} Seeded sample lead for demo purposes.`,
      },
    });
    created++;
  }
  console.log(`Created ${created} sample leads.`);
}

const isDirectRun = (() => {
  try {
    const arg = process.argv[1] ?? "";
    return arg.endsWith("/sample-report-data.ts") || arg.endsWith("/sample-report-data.js");
  } catch { return false; }
})();
if (isDirectRun) {
  ensureSampleReportData()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
}
