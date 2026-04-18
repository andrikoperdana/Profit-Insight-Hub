import { prisma } from "./index.js";
import bcrypt from "bcryptjs";

async function main() {
  const hash = (p: string) => bcrypt.hash(p, 10);

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log(`Seed skipped — database already has ${existingUsers} users.`);
    return;
  }

  console.log("Clearing existing data...");
  await prisma.activity.deleteMany();
  await prisma.timesheet.deleteMany();
  await prisma.document.deleteMany();
  await prisma.projectResource.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();

  console.log("Seeding users...");
  const passwordDefault = await hash("password123");

  const adi = await prisma.user.create({
    data: {
      email: "management@secureprofit.id",
      passwordHash: passwordDefault,
      name: "Adi Wibowo",
      role: "MANAGEMENT",
      title: "Director",
    },
  });
  const sari = await prisma.user.create({
    data: {
      email: "pm@secureprofit.id",
      passwordHash: passwordDefault,
      name: "Sari Pratiwi",
      role: "PROJECT_MANAGER",
      title: "Senior Project Manager",
      dailyRate: 2000000,
    },
  });
  const budi = await prisma.user.create({
    data: {
      email: "sales@secureprofit.id",
      passwordHash: passwordDefault,
      name: "Budi Santoso",
      role: "SALES",
      title: "Account Executive",
    },
  });
  const rian = await prisma.user.create({
    data: {
      email: "konsultan@secureprofit.id",
      passwordHash: passwordDefault,
      name: "Rian Hidayat",
      role: "KONSULTAN",
      title: "Senior Security Consultant",
      dailyRate: 1800000,
    },
  });
  const dewi = await prisma.user.create({
    data: {
      email: "konsultan2@secureprofit.id",
      passwordHash: passwordDefault,
      name: "Dewi Lestari",
      role: "KONSULTAN",
      title: "Penetration Tester",
      dailyRate: 1700000,
    },
  });
  const ayu = await prisma.user.create({
    data: {
      email: "writer@secureprofit.id",
      passwordHash: passwordDefault,
      name: "Ayu Wulandari",
      role: "TECHNICAL_WRITER",
      title: "Technical Writer",
      dailyRate: 1200000,
    },
  });
  const tono = await prisma.user.create({
    data: {
      email: "admin@secureprofit.id",
      passwordHash: passwordDefault,
      name: "Tono Setiawan",
      role: "ADMIN_PROJECT",
      title: "Project Administrator",
    },
  });

  console.log("Seeding clients...");
  const bankNusantara = await prisma.client.create({
    data: {
      name: "Bank Nusantara",
      contactPerson: "Hendra Kurniawan",
      email: "hendra@banknusantara.co.id",
      phone: "+62-21-555-1010",
      industry: "Banking",
    },
  });
  const teleSelaras = await prisma.client.create({
    data: {
      name: "Tele Selaras",
      contactPerson: "Maya Anggraini",
      email: "maya@teleselaras.id",
      phone: "+62-22-555-2020",
      industry: "Telecom",
    },
  });
  const energiPrima = await prisma.client.create({
    data: {
      name: "Energi Prima",
      contactPerson: "Joko Widodo",
      email: "joko@energiprima.co.id",
      phone: "+62-21-555-3030",
      industry: "Energy",
    },
  });
  const retailMaju = await prisma.client.create({
    data: {
      name: "Retail Maju Bersama",
      contactPerson: "Linda Permata",
      email: "linda@retailmaju.id",
      phone: "+62-21-555-4040",
      industry: "Retail",
    },
  });

  console.log("Seeding projects...");
  const today = new Date();
  const monthsAgo = (n: number) => {
    const d = new Date(today);
    d.setMonth(d.getMonth() - n);
    return d;
  };
  const monthsAhead = (n: number) => {
    const d = new Date(today);
    d.setMonth(d.getMonth() + n);
    return d;
  };

  const p1 = await prisma.project.create({
    data: {
      code: "SPH-2026-001",
      name: "ISO 27001 Gap Assessment",
      description:
        "Comprehensive gap assessment against ISO 27001:2022 controls for core banking environment.",
      status: "ACTIVE",
      clientId: bankNusantara.id,
      salesId: budi.id,
      pmId: sari.id,
      startDate: monthsAgo(2),
      endDate: monthsAhead(2),
      contractValue: 450000000,
      estimatedCost: 280000000,
      plannedMandays: 120,
    },
  });
  const p2 = await prisma.project.create({
    data: {
      code: "SPH-2026-002",
      name: "Penetration Testing — Customer Portal",
      description: "Web & API pentest for new customer self-service portal.",
      status: "ACTIVE",
      clientId: teleSelaras.id,
      salesId: budi.id,
      pmId: sari.id,
      startDate: monthsAgo(1),
      endDate: monthsAhead(1),
      contractValue: 180000000,
      estimatedCost: 95000000,
      plannedMandays: 45,
    },
  });
  const p3 = await prisma.project.create({
    data: {
      code: "SPH-2026-003",
      name: "SOC 2 Readiness Program",
      description: "12-week SOC 2 Type II readiness for SaaS platform.",
      status: "OBSERVATION",
      clientId: energiPrima.id,
      salesId: budi.id,
      pmId: sari.id,
      startDate: monthsAhead(1),
      endDate: monthsAhead(4),
      contractValue: 620000000,
      estimatedCost: 380000000,
      plannedMandays: 200,
    },
  });
  const p4 = await prisma.project.create({
    data: {
      code: "SPH-2025-099",
      name: "PCI DSS Compliance Audit",
      description: "Annual PCI DSS audit for retail payment systems.",
      status: "COMPLETE",
      clientId: retailMaju.id,
      salesId: budi.id,
      pmId: sari.id,
      startDate: monthsAgo(6),
      endDate: monthsAgo(1),
      contractValue: 320000000,
      estimatedCost: 180000000,
      plannedMandays: 90,
    },
  });
  const p5 = await prisma.project.create({
    data: {
      code: "SPH-2026-004",
      name: "Red Team Engagement",
      description: "Adversary emulation against on-premise infrastructure.",
      status: "PAUSE",
      clientId: bankNusantara.id,
      salesId: budi.id,
      pmId: sari.id,
      startDate: monthsAgo(1),
      endDate: monthsAhead(2),
      contractValue: 280000000,
      estimatedCost: 165000000,
      plannedMandays: 60,
    },
  });

  console.log("Seeding resources...");
  const resourceData = [
    { projectId: p1.id, userId: rian.id, role: "Lead Consultant", mandays: 60, rate: 1800000 },
    { projectId: p1.id, userId: dewi.id, role: "Consultant", mandays: 40, rate: 1700000 },
    { projectId: p1.id, userId: ayu.id, role: "Documentation", mandays: 20, rate: 1200000 },
    { projectId: p2.id, userId: dewi.id, role: "Pentester", mandays: 30, rate: 1700000 },
    { projectId: p2.id, userId: ayu.id, role: "Report Writer", mandays: 15, rate: 1200000 },
    { projectId: p3.id, userId: rian.id, role: "Lead Auditor", mandays: 100, rate: 1800000 },
    { projectId: p3.id, userId: ayu.id, role: "Documentation", mandays: 100, rate: 1200000 },
    { projectId: p4.id, userId: rian.id, role: "Lead Auditor", mandays: 50, rate: 1800000 },
    { projectId: p4.id, userId: dewi.id, role: "Auditor", mandays: 30, rate: 1700000 },
    { projectId: p4.id, userId: ayu.id, role: "Report Writer", mandays: 10, rate: 1200000 },
    { projectId: p5.id, userId: rian.id, role: "Red Team Lead", mandays: 40, rate: 1800000 },
    { projectId: p5.id, userId: dewi.id, role: "Operator", mandays: 20, rate: 1700000 },
  ];
  for (const r of resourceData) {
    await prisma.projectResource.create({
      data: {
        projectId: r.projectId,
        userId: r.userId,
        roleInProject: r.role,
        plannedMandays: r.mandays,
        dailyRate: r.rate,
      },
    });
  }

  console.log("Seeding timesheets...");
  const dayOf = (d: Date, addDays: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + addDays);
    return x;
  };
  const start = monthsAgo(2);

  const tsData: Array<{
    projectId: string;
    userId: string;
    date: Date;
    hours: number;
    desc: string;
    status: "DRAFT" | "SUBMITTED" | "APPROVED";
  }> = [];

  // Generate 30 days of work for active projects
  for (let i = 0; i < 30; i++) {
    const d = dayOf(start, i * 2);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    tsData.push({
      projectId: p1.id,
      userId: rian.id,
      date: d,
      hours: 8,
      desc: "Control gap assessment session",
      status: "APPROVED",
    });
    tsData.push({
      projectId: p1.id,
      userId: dewi.id,
      date: d,
      hours: 6,
      desc: "Evidence collection",
      status: "APPROVED",
    });
    if (i % 3 === 0) {
      tsData.push({
        projectId: p1.id,
        userId: ayu.id,
        date: d,
        hours: 4,
        desc: "Drafting findings",
        status: "APPROVED",
      });
    }
  }

  // Project 2 timesheets
  for (let i = 0; i < 20; i++) {
    const d = dayOf(monthsAgo(1), i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    tsData.push({
      projectId: p2.id,
      userId: dewi.id,
      date: d,
      hours: 8,
      desc: "API endpoint testing",
      status: "APPROVED",
    });
  }

  // Project 4 (complete) — full burn
  for (let i = 0; i < 80; i++) {
    const d = dayOf(monthsAgo(6), i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    tsData.push({
      projectId: p4.id,
      userId: rian.id,
      date: d,
      hours: 8,
      desc: "PCI audit fieldwork",
      status: "APPROVED",
    });
  }

  // Some pending submissions
  const recent = dayOf(today, -1);
  tsData.push({
    projectId: p2.id,
    userId: dewi.id,
    date: recent,
    hours: 8,
    desc: "Authentication bypass test",
    status: "SUBMITTED",
  });
  tsData.push({
    projectId: p1.id,
    userId: rian.id,
    date: recent,
    hours: 6,
    desc: "Risk assessment workshop",
    status: "SUBMITTED",
  });
  tsData.push({
    projectId: p1.id,
    userId: ayu.id,
    date: recent,
    hours: 4,
    desc: "Documentation review",
    status: "DRAFT",
  });

  for (const ts of tsData) {
    await prisma.timesheet.create({
      data: {
        projectId: ts.projectId,
        userId: ts.userId,
        workDate: ts.date,
        hours: ts.hours,
        description: ts.desc,
        status: ts.status,
        approvedById: ts.status === "APPROVED" ? sari.id : null,
        approvedAt: ts.status === "APPROVED" ? ts.date : null,
      },
    });
  }

  console.log("Seeding documents...");
  const tinyPdfDataUrl =
    "data:application/pdf;base64,JVBERi0xLjQKJcKlwrHDqwoxIDAgb2JqCjw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+CmVuZG9iago=";
  await prisma.document.create({
    data: {
      projectId: p4.id,
      type: "BAST",
      fileName: "BAST-SPH-2025-099.pdf",
      fileUrl: tinyPdfDataUrl,
      uploadedById: tono.id,
      notes: "Final BAST signed by client",
    },
  });
  await prisma.document.create({
    data: {
      projectId: p4.id,
      type: "INVOICE",
      fileName: "INV-2025-099-01.pdf",
      fileUrl: tinyPdfDataUrl,
      invoiceNumber: "INV-2025-099-01",
      invoiceAmount: 320000000,
      invoiceStatus: "PAID",
      uploadedById: tono.id,
    },
  });
  await prisma.document.create({
    data: {
      projectId: p1.id,
      type: "CONTRACT",
      fileName: "Contract-SPH-2026-001.pdf",
      fileUrl: tinyPdfDataUrl,
      uploadedById: tono.id,
    },
  });

  console.log("Seeding activities...");
  await prisma.activity.createMany({
    data: [
      { type: "project.created", message: `Project ${p1.code} created`, userId: budi.id, projectId: p1.id },
      { type: "project.status_changed", message: `Project ${p1.code} moved to ACTIVE`, userId: sari.id, projectId: p1.id },
      { type: "timesheet.approved", message: `Approved 8h on ${p1.name}`, userId: sari.id, projectId: p1.id },
      { type: "document.uploaded", message: `BAST uploaded for ${p4.name}`, userId: tono.id, projectId: p4.id },
      { type: "project.created", message: `Project ${p3.code} created (Observation)`, userId: budi.id, projectId: p3.id },
    ],
  });

  console.log("Seed complete.");
  console.log("\nLogin credentials (password: password123):");
  console.log("  management@secureprofit.id   — Management");
  console.log("  pm@secureprofit.id           — Project Manager");
  console.log("  sales@secureprofit.id        — Sales");
  console.log("  konsultan@secureprofit.id    — Konsultan");
  console.log("  konsultan2@secureprofit.id   — Konsultan");
  console.log("  writer@secureprofit.id       — Technical Writer");
  console.log("  admin@secureprofit.id        — Admin Project");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
