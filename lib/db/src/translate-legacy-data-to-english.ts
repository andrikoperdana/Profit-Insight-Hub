import { prisma } from "./index.js";

/**
 * One-off, idempotent data fix: translates legacy Indonesian sample/seed text
 * to English in-place (no wipe). Earlier seed versions wrote Indonesian
 * project names/descriptions, task titles, and expense rows; the source is now
 * fully English, but rows already in a database persist (the seed dedups and
 * never overwrites them). Run this against any database that still holds the
 * old Indonesian text.
 *
 * Safe to re-run: every update matches the exact old string, so once a row is
 * translated it no longer matches and is skipped.
 *
 *   pnpm --filter @workspace/db exec tsx src/translate-legacy-data-to-english.ts
 */

type Pair = [string, string];

const PROJECT_NAMES: Pair[] = [
  ["Audit ISO 27001 Tahap 2", "ISO 27001 Stage 2 Audit"],
  ["Hardening Infrastruktur Cloud", "Cloud Infrastructure Hardening"],
  ["Implementasi SOC Tier-1", "SOC Tier-1 Implementation"],
  ["Migrasi SIEM Splunk", "Splunk SIEM Migration"],
  ["Penetration Test Aplikasi Mobile", "Mobile Application Penetration Test"],
  ["Penilaian Risiko Cyber Awal", "Initial Cyber Risk Assessment"],
  ["Review Kebijakan Keamanan TI", "IT Security Policy Review"],
  ["Workshop Awareness Karyawan", "Employee Awareness Workshop"],
];

const PROJECT_DESCRIPTIONS: Pair[] = [
  ["Audit ISO 27001 Tahap 2 untuk Bank Nusantara.", "ISO 27001 Stage 2 Audit for Bank Nusantara."],
  ["Hardening Infrastruktur Cloud untuk Retail Maju Bersama.", "Cloud Infrastructure Hardening for Retail Maju Bersama."],
  ["Implementasi SOC Tier-1 untuk Retail Maju Bersama.", "SOC Tier-1 Implementation for Retail Maju Bersama."],
  ["Migrasi SIEM Splunk untuk Energi Prima.", "Splunk SIEM Migration for Energi Prima."],
  ["Penetration Test Aplikasi Mobile untuk Tele Selaras.", "Mobile Application Penetration Test for Tele Selaras."],
  ["Penilaian Risiko Cyber Awal untuk Bank Nusantara.", "Initial Cyber Risk Assessment for Bank Nusantara."],
  ["Pre-Sales Penetration Test untuk Tele Selaras.", "Pre-Sales Penetration Test for Tele Selaras."],
  ["Review Kebijakan Keamanan TI untuk Bank Nusantara.", "IT Security Policy Review for Bank Nusantara."],
  ["Workshop Awareness Karyawan untuk Energi Prima.", "Employee Awareness Workshop for Energi Prima."],
  [
    "Paket SPK tahunan: penetration testing, compliance audit ISO 27001, dan threat modeling untuk core banking. [sample-ws]",
    "Annual SPK package: penetration testing, ISO 27001 compliance audit, and threat modeling for core banking. [sample-ws]",
  ],
  [
    "Paket SPK untuk platform e-commerce: pentest checkout, PCI DSS readiness, dan threat modeling payment flow. [sample-ws]",
    "SPK package for the e-commerce platform: checkout pentest, PCI DSS readiness, and payment flow threat modeling. [sample-ws]",
  ],
  [
    "SPK lintas BU: pentest portal nasabah, audit SOC 2 Type II, dan threat modeling fraud engine. [sample-ws]",
    "Cross-BU SPK: customer portal pentest, SOC 2 Type II audit, and fraud engine threat modeling. [sample-ws]",
  ],
  [
    "SPK lintas-domain: pentest jaringan OT, audit GRC NIST CSF, dan threat modeling SCADA. [sample-ws]",
    "Cross-domain SPK: OT network pentest, GRC NIST CSF audit, and SCADA threat modeling. [sample-ws]",
  ],
  [
    "Satu SPK gabungan: pentest aplikasi pelanggan, gap analysis ISO 27001, dan threat modeling sistem billing. [sample-ws]",
    "Single combined SPK: customer application pentest, ISO 27001 gap analysis, and billing system threat modeling. [sample-ws]",
  ],
];

const TASK_TITLES: Pair[] = [
  ["Kickoff meeting dengan klien", "Kickoff meeting with client"],
  ["Pelaporan", "Reporting"],
  ["Persiapan & Kickoff", "Preparation & Kickoff"],
  ["Review & finalisasi", "Review & finalization"],
];

// Base (untagged) Indonesian -> English for sample expense descriptions. The
// seed appends a " [sample]" tag, so we update both the tagged and untagged
// variants.
const EXPENSE_BASE: Pair[] = [
  ["Taksi ke kantor klien Bank Sentosa", "Taxi to client office Bank Sentosa"],
  ["Subscription tools recon (1 bulan)", "Recon tools subscription (1 month)"],
  ["Voucher training CTF tim", "Team CTF training voucher"],
  ["Adapter & kabel USB-C lapangan", "Field USB-C adapter & cable"],
  ["Parkir & tol onsite Jakarta Selatan", "Parking & toll onsite South Jakarta"],
  ["Konsumsi tim saat lembur deploy", "Team meals during deploy overtime"],
  ["Perpanjangan lisensi Burp Suite Pro", "Burp Suite Pro license renewal"],
  ["Akomodasi hotel klien Surabaya 2hr", "Hotel accommodation client Surabaya, 2 nights"],
  ["Tiket KA Jakarta\u2013Bandung onsite", "Train ticket Jakarta\u2013Bandung onsite"],
  ["Print laporan akhir untuk klien", "Print final report for client"],
  ["Lisensi tools pentest personal", "Personal pentest tools license"],
  ["Taksi malam onsite remediasi P1", "Night taxi onsite P1 remediation"],
  ["Yubikey hardware token tim", "Team Yubikey hardware token"],
  ["Buku referensi OSCP exam prep", "OSCP exam prep reference book"],
  ["Travel review proyek di klien", "Project review travel at client"],
  ["Konsumsi workshop internal tim", "Internal team workshop meals"],
  ["Hardware token cadangan untuk tim", "Spare hardware token for team"],
  ["Lisensi Nessus Professional tim", "Team Nessus Professional license"],
  ["Tiket pesawat audit Bali (PP)", "Flight ticket Bali audit (round trip)"],
  ["Sertifikasi CISSP exam fee", "CISSP certification exam fee"],
  ["Lisensi Grammarly Business", "Grammarly Business license"],
  ["Cetak draft laporan untuk klien", "Print draft report for client"],
  ["Subscription Canva Pro 1 tahun", "Canva Pro subscription (1 year)"],
  ["Jilid hardcover laporan final klien", "Hardcover binding of final client report"],
  ["External SSD untuk arsip dokumen", "External SSD for document archive"],
  ["Materai & legalisir dokumen kontrak", "Stamp duty & legalization of contract documents"],
  ["Kurir dokumen ke klien Bank Sentosa", "Document courier to client Bank Sentosa"],
  ["Subscription DocuSign 1 bulan", "DocuSign subscription (1 month)"],
  ["ATK tim project (binder, label, dll)", "Project team stationery (binder, labels, etc.)"],
  ["Lisensi Adobe Acrobat Pro tim TW", "Adobe Acrobat Pro license for TW team"],
  ["Workshop technical writing eksternal", "External technical writing workshop"],
  ["Lisensi MS Project untuk tim AP", "MS Project license for AP team"],
  ["Konsumsi rapat koordinasi PMO", "PMO coordination meeting meals"],
  ["Taksi kantor klien Bank Nusantara", "Taxi to client office Bank Nusantara"],
];

// Fully-qualified expense descriptions (no [sample] tag appended).
const EXPENSE_EXACT: Pair[] = [
  ["Lisensi Burp Suite Pro 1 tahun", "Burp Suite Pro license (1 year)"],
  ["[sample-ws] Tool / lisensi awal untuk workstream GRC", "[sample-ws] Initial tool / license for workstream GRC"],
  ["[sample-ws] Tool / lisensi awal untuk workstream PT", "[sample-ws] Initial tool / license for workstream PT"],
  ["[sample-ws] Tool / lisensi awal untuk workstream TM", "[sample-ws] Initial tool / license for workstream TM"],
];

const REJECTION_REASONS: Pair[] = [
  [
    "Bukti pendukung kurang lengkap \u2014 silakan resubmit dengan kuitansi asli.",
    "Supporting evidence incomplete \u2014 please resubmit with the original receipt.",
  ],
];

async function main() {
  let total = 0;
  const log = (label: string, n: number) => {
    if (n > 0) console.log(`  [${label}] updated ${n}`);
    total += n;
  };

  for (const [from, to] of PROJECT_NAMES) {
    log("Project.name", await prisma.project.updateMany({ where: { name: from }, data: { name: to } }).then((r) => r.count));
  }
  for (const [from, to] of PROJECT_DESCRIPTIONS) {
    log("Project.description", await prisma.project.updateMany({ where: { description: from }, data: { description: to } }).then((r) => r.count));
  }
  for (const [from, to] of TASK_TITLES) {
    log("Task.title", await prisma.task.updateMany({ where: { title: from }, data: { title: to } }).then((r) => r.count));
  }

  for (const [from, to] of EXPENSE_BASE) {
    // untagged + " [sample]" tagged variants
    log("Expense.description", await prisma.projectExpense.updateMany({ where: { description: from }, data: { description: to } }).then((r) => r.count));
    log("Expense.description", await prisma.projectExpense.updateMany({ where: { description: `${from} [sample]` }, data: { description: `${to} [sample]` } }).then((r) => r.count));
  }
  for (const [from, to] of EXPENSE_EXACT) {
    log("Expense.description", await prisma.projectExpense.updateMany({ where: { description: from }, data: { description: to } }).then((r) => r.count));
  }
  for (const [from, to] of REJECTION_REASONS) {
    log("Expense.rejectionReason", await prisma.projectExpense.updateMany({ where: { rejectionReason: from }, data: { rejectionReason: to } }).then((r) => r.count));
  }

  // Receipt evidence filenames: kuitansi- -> receipt-
  const fn = await prisma.$executeRawUnsafe(
    `UPDATE "ProjectExpense" SET "evidenceFileName" = replace("evidenceFileName", 'kuitansi-', 'receipt-') WHERE "evidenceFileName" LIKE 'kuitansi-%'`,
  );
  log("Expense.evidenceFileName", typeof fn === "number" ? fn : 0);

  console.log(`Done. Total rows updated: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
