import { prisma } from "./index.js";
import bcrypt from "bcryptjs";

// Idempotent additive Principal hierarchy patch — runs even when database is
// already seeded, so we can introduce the supervisor model on top of an
// existing dev DB without wiping data.
async function ensurePrincipals(passwordDefault: string) {
  const newPrincipals: { email: string; name: string; role: any; title: string }[] = [
    { email: "principal.kon.h7q4@itsecasia.com", name: "Bayu Prasetyo",      role: "PRINCIPAL_KONSULTAN",         title: "Principal Consultant" },
    { email: "principal.tw.m9k2@itsecasia.com",  name: "Indah Kusumawardani", role: "PRINCIPAL_TECHNICAL_WRITER",  title: "Principal Technical Writer" },
    { email: "principal.ap.r3n8@itsecasia.com",  name: "Fajar Nugroho",       role: "PRINCIPAL_ADMIN_PROJECT",     title: "Principal Admin Project" },
  ];
  for (const p of newPrincipals) {
    await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: { email: p.email, passwordHash: passwordDefault, name: p.name, role: p.role, title: p.title },
    });
  }
  // Wire principalId on existing delivery users → matching Principal
  const principals = await prisma.user.findMany({
    where: { role: { in: ["PRINCIPAL_KONSULTAN", "PRINCIPAL_TECHNICAL_WRITER", "PRINCIPAL_ADMIN_PROJECT"] } },
  });
  const byRole = new Map<string, typeof principals[number]>(principals.map((p) => [p.role as string, p]));
  const reports = [
    { email: "konsultan@secureprofit.id",  principalRole: "PRINCIPAL_KONSULTAN" },
    { email: "konsultan2@secureprofit.id", principalRole: "PRINCIPAL_KONSULTAN" },
    { email: "writer@secureprofit.id",     principalRole: "PRINCIPAL_TECHNICAL_WRITER" },
    { email: "admin@secureprofit.id",      principalRole: "PRINCIPAL_ADMIN_PROJECT" },
  ];
  for (const r of reports) {
    const principal = byRole.get(r.principalRole);
    if (!principal) continue;
    await prisma.user.updateMany({
      where: { email: r.email, principalId: null },
      data: { principalId: principal.id },
    });
  }
  // PM → MGMT manager link
  const adi = await prisma.user.findUnique({ where: { email: "management@secureprofit.id" } });
  if (adi) {
    await prisma.user.updateMany({
      where: { email: "pm@secureprofit.id", managerId: null },
      data: { managerId: adi.id },
    });
  }
}

async function main() {
  const hash = (p: string) => bcrypt.hash(p, 10);
  const passwordDefault = await hash("password123");

  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    console.log(`Existing data — running idempotent Principal hierarchy patch only.`);
    await ensurePrincipals(passwordDefault);
    console.log("Principals + hierarchy ensured.");
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

  const adi = await prisma.user.create({
    data: { email: "management@secureprofit.id", passwordHash: passwordDefault, name: "Adi Wibowo", role: "MANAGEMENT", title: "Director" },
  });
  const sari = await prisma.user.create({
    data: { email: "pm@secureprofit.id", passwordHash: passwordDefault, name: "Sari Pratiwi", role: "PROJECT_MANAGER", title: "Senior Project Manager", dailyRate: 2000000, managerId: adi.id },
  });
  const budi = await prisma.user.create({
    data: { email: "sales@secureprofit.id", passwordHash: passwordDefault, name: "Budi Santoso", role: "SALES", title: "Account Executive" },
  });
  const principalKon = await prisma.user.create({
    data: { email: "principal.kon.h7q4@itsecasia.com", passwordHash: passwordDefault, name: "Bayu Prasetyo", role: "PRINCIPAL_KONSULTAN", title: "Principal Consultant" },
  });
  const principalTw = await prisma.user.create({
    data: { email: "principal.tw.m9k2@itsecasia.com", passwordHash: passwordDefault, name: "Indah Kusumawardani", role: "PRINCIPAL_TECHNICAL_WRITER", title: "Principal Technical Writer" },
  });
  const principalAp = await prisma.user.create({
    data: { email: "principal.ap.r3n8@itsecasia.com", passwordHash: passwordDefault, name: "Fajar Nugroho", role: "PRINCIPAL_ADMIN_PROJECT", title: "Principal Admin Project" },
  });
  const rian = await prisma.user.create({
    data: { email: "konsultan@secureprofit.id", passwordHash: passwordDefault, name: "Rian Hidayat", role: "KONSULTAN", title: "Senior Security Consultant", dailyRate: 1800000, principalId: principalKon.id },
  });
  const dewi = await prisma.user.create({
    data: { email: "konsultan2@secureprofit.id", passwordHash: passwordDefault, name: "Dewi Lestari", role: "KONSULTAN", title: "Penetration Tester", dailyRate: 1700000, principalId: principalKon.id },
  });
  const ayu = await prisma.user.create({
    data: { email: "writer@secureprofit.id", passwordHash: passwordDefault, name: "Ayu Wulandari", role: "TECHNICAL_WRITER", title: "Technical Writer", dailyRate: 1200000, principalId: principalTw.id },
  });
  const tono = await prisma.user.create({
    data: { email: "admin@secureprofit.id", passwordHash: passwordDefault, name: "Tono Setiawan", role: "ADMIN_PROJECT", title: "Project Administrator", principalId: principalAp.id },
  });

  console.log("Seeding clients...");
  const bankNusantara = await prisma.client.create({ data: { name: "Bank Nusantara", contactPerson: "Hendra Kurniawan", email: "hendra@banknusantara.co.id", phone: "+62-21-555-1010", industry: "Banking" } });
  const teleSelaras  = await prisma.client.create({ data: { name: "Tele Selaras",  contactPerson: "Maya Anggraini",   email: "maya@teleselaras.id",      phone: "+62-22-555-2020", industry: "Telecom" } });
  const energiPrima  = await prisma.client.create({ data: { name: "Energi Prima",  contactPerson: "Joko Widodo",      email: "joko@energiprima.co.id",   phone: "+62-21-555-3030", industry: "Energy" } });
  const retailMaju   = await prisma.client.create({ data: { name: "Retail Maju Bersama", contactPerson: "Linda Permata", email: "linda@retailmaju.id", phone: "+62-21-555-4040", industry: "Retail" } });

  console.log("Seeding projects...");
  const today = new Date();
  const monthsAgo = (n: number) => { const d = new Date(today); d.setMonth(d.getMonth() - n); return d; };
  const monthsAhead = (n: number) => { const d = new Date(today); d.setMonth(d.getMonth() + n); return d; };

  const p1 = await prisma.project.create({ data: { code: "SPH-2026-001", name: "ISO 27001 Gap Assessment", description: "Comprehensive gap assessment against ISO 27001:2022 controls for core banking environment.", status: "ACTIVE", clientId: bankNusantara.id, salesId: budi.id, pmId: sari.id, startDate: monthsAgo(2), endDate: monthsAhead(2), contractValue: 450000000, estimatedCost: 280000000, plannedMandays: 120 } });
  const p2 = await prisma.project.create({ data: { code: "SPH-2026-002", name: "Penetration Testing — Customer Portal", description: "Web & API pentest for new customer self-service portal.", status: "ACTIVE", clientId: teleSelaras.id, salesId: budi.id, pmId: sari.id, startDate: monthsAgo(1), endDate: monthsAhead(1), contractValue: 180000000, estimatedCost: 95000000, plannedMandays: 45 } });
  const p3 = await prisma.project.create({ data: { code: "SPH-2026-003", name: "SOC 2 Readiness Program", description: "12-week SOC 2 Type II readiness for SaaS platform.", status: "OBSERVATION", clientId: energiPrima.id, salesId: budi.id, pmId: sari.id, startDate: monthsAhead(1), endDate: monthsAhead(4), contractValue: 620000000, estimatedCost: 380000000, plannedMandays: 200 } });
  const p4 = await prisma.project.create({ data: { code: "SPH-2025-099", name: "PCI DSS Compliance Audit", description: "Annual PCI DSS audit for retail payment systems.", status: "COMPLETE", clientId: retailMaju.id, salesId: budi.id, pmId: sari.id, startDate: monthsAgo(6), endDate: monthsAgo(1), contractValue: 320000000, estimatedCost: 180000000, plannedMandays: 90 } });
  const p5 = await prisma.project.create({ data: { code: "SPH-2026-004", name: "Red Team Engagement", description: "Adversary emulation against on-premise infrastructure.", status: "PAUSE", clientId: bankNusantara.id, salesId: budi.id, pmId: sari.id, startDate: monthsAgo(1), endDate: monthsAhead(2), contractValue: 280000000, estimatedCost: 165000000, plannedMandays: 60 } });

  console.log("Seeding resources...");
  const resourceData = [
    { projectId: p1.id, userId: rian.id, role: "Lead Consultant", mandays: 60, rate: 1800000 },
    { projectId: p1.id, userId: dewi.id, role: "Consultant",      mandays: 40, rate: 1700000 },
    { projectId: p1.id, userId: ayu.id,  role: "Documentation",   mandays: 20, rate: 1200000 },
    { projectId: p2.id, userId: dewi.id, role: "Pentester",       mandays: 30, rate: 1700000 },
    { projectId: p2.id, userId: ayu.id,  role: "Report Writer",   mandays: 15, rate: 1200000 },
    { projectId: p3.id, userId: rian.id, role: "Lead Auditor",    mandays: 100, rate: 1800000 },
    { projectId: p3.id, userId: ayu.id,  role: "Documentation",   mandays: 100, rate: 1200000 },
    { projectId: p4.id, userId: rian.id, role: "Lead Auditor",    mandays: 50, rate: 1800000 },
    { projectId: p4.id, userId: dewi.id, role: "Auditor",         mandays: 30, rate: 1700000 },
    { projectId: p4.id, userId: ayu.id,  role: "Report Writer",   mandays: 10, rate: 1200000 },
    { projectId: p5.id, userId: rian.id, role: "Red Team Lead",   mandays: 40, rate: 1800000 },
    { projectId: p5.id, userId: dewi.id, role: "Operator",        mandays: 20, rate: 1700000 },
  ];
  for (const r of resourceData) {
    await prisma.projectResource.create({ data: { projectId: r.projectId, userId: r.userId, roleInProject: r.role, plannedMandays: r.mandays, dailyRate: r.rate } });
  }

  console.log("Seeding timesheets...");
  const dayOf = (d: Date, addDays: number) => { const x = new Date(d); x.setDate(x.getDate() + addDays); return x; };
  const start = monthsAgo(2);
  const tsData: Array<{ projectId: string; userId: string; date: Date; hours: number; desc: string; status: "DRAFT" | "SUBMITTED" | "APPROVED"; }> = [];
  for (let i = 0; i < 30; i++) {
    const d = dayOf(start, i * 2);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    tsData.push({ projectId: p1.id, userId: rian.id, date: d, hours: 8, desc: "Control gap assessment session", status: "APPROVED" });
    tsData.push({ projectId: p1.id, userId: dewi.id, date: d, hours: 6, desc: "Evidence collection", status: "APPROVED" });
    if (i % 3 === 0) tsData.push({ projectId: p1.id, userId: ayu.id, date: d, hours: 4, desc: "Drafting findings", status: "APPROVED" });
  }
  for (let i = 0; i < 20; i++) {
    const d = dayOf(monthsAgo(1), i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    tsData.push({ projectId: p2.id, userId: dewi.id, date: d, hours: 8, desc: "API endpoint testing", status: "APPROVED" });
  }
  for (let i = 0; i < 80; i++) {
    const d = dayOf(monthsAgo(6), i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    tsData.push({ projectId: p4.id, userId: rian.id, date: d, hours: 8, desc: "PCI audit fieldwork", status: "APPROVED" });
  }
  const recent = dayOf(today, -1);
  tsData.push({ projectId: p2.id, userId: dewi.id, date: recent, hours: 8, desc: "Authentication bypass test", status: "SUBMITTED" });
  tsData.push({ projectId: p1.id, userId: rian.id, date: recent, hours: 6, desc: "Risk assessment workshop", status: "SUBMITTED" });
  tsData.push({ projectId: p1.id, userId: ayu.id,  date: recent, hours: 4, desc: "Documentation review", status: "DRAFT" });

  for (const ts of tsData) {
    await prisma.timesheet.create({ data: { projectId: ts.projectId, userId: ts.userId, workDate: ts.date, hours: ts.hours, description: ts.desc, status: ts.status, approvedById: ts.status === "APPROVED" ? sari.id : null, approvedAt: ts.status === "APPROVED" ? ts.date : null } });
  }

  const tinyPdfDataUrl = "data:application/pdf;base64,JVBERi0xLjQKJcKlwrHDqwoxIDAgb2JqCjw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+CmVuZG9iago=";
  await prisma.document.create({ data: { projectId: p4.id, type: "BAST", fileName: "BAST-SPH-2025-099.pdf", fileUrl: tinyPdfDataUrl, uploadedById: tono.id, notes: "Final BAST signed by client" } });
  await prisma.document.create({ data: { projectId: p4.id, type: "INVOICE", fileName: "INV-2025-099-01.pdf", fileUrl: tinyPdfDataUrl, invoiceNumber: "INV-2025-099-01", invoiceAmount: 320000000, invoiceStatus: "PAID", uploadedById: tono.id } });
  await prisma.document.create({ data: { projectId: p1.id, type: "CONTRACT", fileName: "Contract-SPH-2026-001.pdf", fileUrl: tinyPdfDataUrl, uploadedById: tono.id } });

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
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
