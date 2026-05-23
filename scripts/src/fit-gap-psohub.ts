import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, AlignmentType, PageOrientation,
} from "docx";

type Status = "FIT" | "PARTIAL" | "GAP";
interface Row { feature: string; psohub: string; ours: string; status: Status; note?: string; }
interface Section { title: string; rows: Row[]; }

const sections: Section[] = [
  { title: "1. Manajemen Kontrak & Proyek", rows: [
    { feature: "Pembuatan kontrak dari template / CRM", psohub: "Smart contract generation dari data HubSpot/CRM, template reusable", ours: "Belum ada modul kontrak; nilai kontrak hanya disimpan sebagai field contractValue pada Project", status: "GAP", note: "Perlu modul Contract terpisah" },
    { feature: "Jenis kontrak (Fixed Price, T&M, Retainer, Recurring)", psohub: "Mendukung Fixed-price, Time & Material, Installment, Recurring", ours: "Tidak ada tipe kontrak eksplisit; semua proyek diasumsikan fixed-price", status: "GAP" },
    { feature: "Role-based rate per user", psohub: "Multiple rate per user berdasarkan role", ours: "Hanya satu dailyRate per ProjectResource (per proyek)", status: "PARTIAL", note: "Rate per proyek sudah ada, tapi belum per-role library" },
    { feature: "Project intake / handover Sales -> PM", psohub: "Setup project 1-klik setelah deal close di CRM", ours: "Workflow DRAFT -> OBSERVATION (Sales isi 4 field -> MGMT assign PM -> PM lengkapi)", status: "FIT" },
    { feature: "Gantt chart & task dependencies", psohub: "Gantt chart + Kanban + task board", ours: "Gantt chart drag-drop + finish-to-start dependency + WBS (parentTaskId)", status: "FIT" },
    { feature: "Kanban board", psohub: "Kanban tersedia di semua plan", ours: "Belum ada tampilan Kanban (hanya list + Gantt)", status: "GAP" },
    { feature: "Task template / WBS reusable", psohub: "Project template", ours: "TaskTemplate model + Apply Template button pada Project Tasks tab", status: "FIT" },
    { feature: "Project status & alert milestone", psohub: "Alert otomatis untuk over-budget/over-time", ours: "Banner warning di Overview tab + alert pending expense; belum ada alert otomatis budget", status: "PARTIAL" },
    { feature: "Multi-company / Business Unit", psohub: "Multi-Company di Enterprise; Business Unit di Professional", ours: "BusinessUnit model (3 BU: Pentest, GRC, Threat Hunting) - single tenant", status: "PARTIAL", note: "BU sudah ada, belum multi-company" },
    { feature: "Multi-currency", psohub: "Multi-currency di Enterprise", ours: "Hanya IDR (formatIDR)", status: "GAP" },
  ]},
  { title: "2. Time Tracking & Expense", rows: [
    { feature: "Timesheet entry (harian/mingguan)", psohub: "Timesheet via web, mobile, plugin, kalender", ours: "Form timesheet + Entry Mingguan grid 5 hari kerja (bulk submit)", status: "FIT" },
    { feature: "Approval flow timesheet", psohub: "PM Approval (Pro), Team Lead Approval (Ent)", ours: "DRAFT -> SUBMITTED -> APPROVED/REJECTED oleh PM/MGMT; PM auto-approved", status: "FIT" },
    { feature: "Time logging per task (billable flag)", psohub: "Billable/non-billable per task", ours: "Task.billable flag; non-billable tidak masuk margin", status: "FIT" },
    { feature: "Calendar / mobile / plugin integration", psohub: "Integrasi Outlook/Google Calendar, mobile app, plugin", ours: "Hanya entry via web form", status: "GAP" },
    { feature: "Expense tracking (attachment & pajak)", psohub: "Expense dengan attachment + tax", ours: "ProjectExpense (category, amount, approval); belum support attachment & pajak", status: "PARTIAL" },
    { feature: "Leave / absence management", psohub: "Manage Absence (Professional+)", ours: "UserLeave model (ANNUAL/SICK/TRAINING/UNPAID/OTHER) + overlay di Resource Planning", status: "FIT" },
  ]},
  { title: "3. Resource & Capacity Management", rows: [
    { feature: "Resource planning per minggu", psohub: "Resource Planning + Capacity Overview (Enterprise)", ours: "/resource-planning BU-grouped weekly mandays + color coding + tooltip", status: "FIT" },
    { feature: "Skill/role-based resource matching", psohub: "Role/Skill based planning", ours: "Skill + UserSkill (proficiency 1-5) + /skill-matrix gap analysis", status: "FIT" },
    { feature: "AI auto-scheduling resource", psohub: "AI Scheduling (Enterprise) - auto-assign resource", ours: "Belum ada", status: "GAP" },
    { feature: "Backlog report (planned belum dibooking)", psohub: "Backlog Report (Enterprise)", ours: "Belum ada", status: "GAP" },
    { feature: "Hierarchy / Principal supervision", psohub: "Team Lead approval (Enterprise)", ours: "3 Principal roles + propose-accept workflow staffing", status: "FIT", note: "Lebih domain-specific" },
    { feature: "Bench / utilization report", psohub: "Resource Capacity Overview", ours: "Bench Report + team utilization di PM dashboard", status: "FIT" },
  ]},
  { title: "4. Invoicing & Billing", rows: [
    { feature: "Milestone / installment invoicing", psohub: "Recurring + installment + retainer", ours: "BillingMilestone (TOP) per proyek dengan %, DPP, VAT, status PLANNED/INVOICED/PAID/CANCELLED", status: "FIT" },
    { feature: "VAT / pajak handling", psohub: "Tax di expense; tidak detil VAT Indonesia", ours: "vatPercent per milestone + splitVat() + /vat-recap MGMT (12-bulan breakdown, CSV export)", status: "FIT", note: "Lebih lengkap untuk PPN 11% Indonesia" },
    { feature: "Auto-generate PDF invoice", psohub: "Custom invoice layout per BU (Enterprise)", ours: "Belum generate PDF invoice - hanya tracking status", status: "GAP" },
    { feature: "Recurring invoice automation", psohub: "Recurring invoice set-and-forget", ours: "Belum ada", status: "GAP" },
    { feature: "Invoice approval workflow", psohub: "Manual + automated approval", ours: "Status manual oleh MGMT/PM (INVOICED -> PAID auto-timestamp)", status: "PARTIAL" },
    { feature: "Integrasi accounting (QuickBooks/Xero/Accurate)", psohub: "QuickBooks, Xero, Moneybird, Exact Online, dll", ours: "Belum ada", status: "GAP" },
    { feature: "Quote / SOW dengan digital signing", psohub: "Quote & SOW dengan e-signature (Professional)", ours: "Belum ada", status: "GAP" },
  ]},
  { title: "5. Financials & Profitability", rows: [
    { feature: "Project P&L / margin per proyek", psohub: "Profitability per customer/project", ours: "actualCost, actualProfit, marginPct di setiap project + serializer", status: "FIT" },
    { feature: "Forecast & burn rate", psohub: "Dashboard burn rate", ours: "Forecast linear projection; /api/projects/:id/financials per bulan", status: "FIT" },
    { feature: "Cash inflow / billing aging", psohub: "Dashboard finansial", ours: "Report billing-aging + cash-inflow-forecast", status: "FIT" },
  ]},
  { title: "6. Reporting & Analytics", rows: [
    { feature: "Standard dashboards per role", psohub: "Dashboard standard semua plan", ours: "Dashboard per role (MGMT, PM, Sales, Konsultan, TW, Admin, Site Admin)", status: "FIT" },
    { feature: "Custom report builder", psohub: "Excel export; AI Charts; Data Warehouse (Enterprise)", ours: "10 report fixed di /reports + CSV/XLSX/PDF export", status: "PARTIAL", note: "Belum ada report builder dinamis" },
    { feature: "Export (Excel/CSV/PDF)", psohub: "Excel export", ours: "CSV, XLSX, PDF (formula-injection safe)", status: "FIT" },
    { feature: "Data warehouse access", psohub: "Enterprise plan", ours: "Belum ada", status: "GAP" },
  ]},
  { title: "7. AI / Automation (Copilot)", rows: [
    { feature: "AI assistant / Copilot", psohub: "AI Copilot 24/7 (review, notify, data analytics)", ours: "Belum ada", status: "GAP" },
    { feature: "AI natural language data query", psohub: "AI Data Analytics - tanya data dengan natural language", ours: "Belum ada", status: "GAP" },
    { feature: "AI auto-scheduling", psohub: "AI Scheduling (Enterprise)", ours: "Belum ada", status: "GAP" },
    { feature: "AI charts & reporting", psohub: "AI Charts (Professional)", ours: "Belum ada", status: "GAP" },
  ]},
  { title: "8. Integrations", rows: [
    { feature: "CRM integration", psohub: "HubSpot (native), Salesforce, MS Dynamics 365, Pipedrive", ours: "Belum ada", status: "GAP" },
    { feature: "Accounting integration", psohub: "QuickBooks, Xero, Moneybird, Exact Online, Bexio, Sage, SAP B1, Twinfield", ours: "Belum ada", status: "GAP" },
    { feature: "Collaboration (Teams/Slack)", psohub: "Microsoft Teams, Slack (Professional)", ours: "Belum ada", status: "GAP" },
    { feature: "Public API", psohub: "Comprehensive REST API", ours: "REST API internal (OpenAPI 3) - belum diekspos publik", status: "PARTIAL" },
    { feature: "SSO (Google/Microsoft)", psohub: "Login via Google & Microsoft", ours: "Username/password JWT (HS256); belum SSO", status: "GAP" },
  ]},
  { title: "9. Multi-tenancy, Security & Audit", rows: [
    { feature: "Role-based access control", psohub: "Role-based di semua plan", ours: "8 roles + requireRole middleware", status: "FIT" },
    { feature: "Audit log", psohub: "Tersirat lewat reporting", ours: "Activity model + halaman audit log SITE_ADMIN + recordAudit di setiap mutasi", status: "FIT" },
    { feature: "Guest portal eksternal", psohub: "Guest Portal dengan financial/task access (Professional)", ours: "Belum ada", status: "GAP" },
    { feature: "Document management (BAST/Invoice/Kontrak)", psohub: "Document attachment", ours: "Document model (BAST/INVOICE/CONTRACT/REPORT/OTHER, base64)", status: "FIT", note: "Spesifik untuk dokumen Indonesia (BAST)" },
  ]},
  { title: "10. Onboarding & Support", rows: [
    { feature: "Knowledge base / akademi", psohub: "PSOhub Academy free courses", ours: "Belum ada", status: "GAP" },
    { feature: "In-app chat support", psohub: "Chat & email support semua plan", ours: "Belum ada", status: "GAP" },
    { feature: "Customer success agent", psohub: "Assigned CS agent (Enterprise)", ours: "N/A (internal tool)", status: "PARTIAL" },
  ]},
];

const STATUS_LABEL: Record<Status, string> = { FIT: "Fit", PARTIAL: "Partial", GAP: "Gap" };
const STATUS_FILL: Record<Status, string> = { FIT: "16A34A", PARTIAL: "D97706", GAP: "DC2626" };

const COL_W = [2200, 3200, 3200, 1100, 1800];

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "AAAAAA" };
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function txt(s: string, opts: { bold?: boolean; color?: string; size?: number } = {}): TextRun {
  return new TextRun({ text: s, bold: opts.bold, color: opts.color, size: opts.size });
}
function para(s: string, opts: { bold?: boolean; color?: string; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType] } = {}): Paragraph {
  return new Paragraph({ children: [txt(s, opts)], alignment: opts.align });
}
function headingCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.SOLID, color: "0F172A", fill: "0F172A" },
    children: [para(text, { bold: true, color: "FFFFFF" })],
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
  });
}
function bodyCell(children: Paragraph[], width: number, fill?: string): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { type: ShadingType.SOLID, color: fill, fill } : undefined,
    children,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
  });
}

function buildFeatureTable(rows: Row[]): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      headingCell("Fitur", COL_W[0]),
      headingCell("PSOhub", COL_W[1]),
      headingCell("SecureProfit Hub", COL_W[2]),
      headingCell("Status", COL_W[3]),
      headingCell("Catatan", COL_W[4]),
    ],
  });
  const bodyRows = rows.map(r => new TableRow({
    children: [
      bodyCell([para(r.feature, { bold: true, size: 20 })], COL_W[0]),
      bodyCell([para(r.psohub, { size: 20 })], COL_W[1]),
      bodyCell([para(r.ours, { size: 20 })], COL_W[2]),
      bodyCell([para(STATUS_LABEL[r.status], { bold: true, color: "FFFFFF", size: 20, align: AlignmentType.CENTER })], COL_W[3], STATUS_FILL[r.status]),
      bodyCell([para(r.note ?? "-", { size: 18 })], COL_W[4]),
    ],
  }));
  return new Table({
    rows: [header, ...bodyRows],
    width: { size: COL_W.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: { ...ALL_BORDERS, insideHorizontal: BORDER, insideVertical: BORDER },
  });
}

function buildSummaryTable(c: { fit: number; partial: number; gap: number; total: number }): Table {
  const pct = (n: number) => `${((n / c.total) * 100).toFixed(1)}%`;
  const headerRow = new TableRow({
    tableHeader: true,
    children: [headingCell("Status", 2400), headingCell("Jumlah", 1600), headingCell("Persentase", 1600)],
  });
  function row(label: Status | "TOTAL", count: number, fill?: string): TableRow {
    return new TableRow({
      children: [
        bodyCell([para(label === "TOTAL" ? "Total" : STATUS_LABEL[label], { bold: true, color: fill ? "FFFFFF" : "000000" })], 2400, fill),
        bodyCell([para(String(count), { align: AlignmentType.CENTER })], 1600),
        bodyCell([para(label === "TOTAL" ? "100%" : pct(count), { align: AlignmentType.CENTER })], 1600),
      ],
    });
  }
  return new Table({
    rows: [
      headerRow,
      row("FIT", c.fit, STATUS_FILL.FIT),
      row("PARTIAL", c.partial, STATUS_FILL.PARTIAL),
      row("GAP", c.gap, STATUS_FILL.GAP),
      row("TOTAL", c.total),
    ],
    width: { size: 5600, type: WidthType.DXA },
    borders: { ...ALL_BORDERS, insideHorizontal: BORDER, insideVertical: BORDER },
  });
}

function h(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2): Paragraph {
  return new Paragraph({
    children: [txt(text, { bold: true, color: "0F172A", size: level === HeadingLevel.HEADING_1 ? 36 : 26 })],
    heading: level,
    spacing: { before: 240, after: 120 },
  });
}
function bullet(text: string): Paragraph {
  return new Paragraph({ children: [txt(text)], bullet: { level: 0 } });
}
function numbered(text: string): Paragraph {
  return new Paragraph({ children: [txt(text)], numbering: { reference: "ol", level: 0 } });
}

function countByStatus() {
  let fit = 0, partial = 0, gap = 0, total = 0;
  for (const s of sections) for (const r of s.rows) { total++; if (r.status === "FIT") fit++; else if (r.status === "PARTIAL") partial++; else gap++; }
  return { fit, partial, gap, total };
}

function buildDoc(): Document {
  const c = countByStatus();
  const today = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({
    children: [txt("Fit-Gap Analysis: SecureProfit Hub vs PSOhub", { bold: true, color: "0F172A", size: 40 })],
    heading: HeadingLevel.TITLE,
  }));
  children.push(para(`Tanggal: ${today}`));
  children.push(para("Sumber pembanding: psohub.com (Essentials / Professional / Enterprise)"));
  children.push(para("Sistem internal: SecureProfit Hub - PSA untuk konsultan keamanan TI (Indonesia)"));

  children.push(h("Ringkasan Eksekutif"));
  children.push(new Paragraph({ children: [
    txt("SecureProfit Hub adalah Professional Services Automation (PSA) internal yang sudah memenuhi sebagian besar fitur inti PSOhub di tier "),
    txt("Essentials", { bold: true }), txt(" dan "), txt("Professional", { bold: true }),
    txt(", terutama pada area manajemen proyek, timesheet, resource planning, milestone billing, dan reporting. Kelebihan utama kami adalah kekayaan domain lokal (VAT/PPN 11% Indonesia, dokumen BAST, struktur Principal supervisor, multi-business-unit konsultan keamanan)."),
  ]}));
  children.push(new Paragraph({ children: [
    txt("Gap utama berada pada area "),
    txt("AI Copilot, integrasi pihak ketiga (CRM/accounting/collaboration), kontrak multi-tipe, generate PDF invoice otomatis, multi-currency, dan guest portal", { bold: true }),
    txt(" - sebagian besar adalah fitur tier Enterprise PSOhub."),
  ]}));

  children.push(buildSummaryTable(c));

  children.push(h("Metodologi"));
  children.push(para("Analisis dilakukan dengan membandingkan fitur publik PSOhub (homepage, halaman fitur, halaman pricing tiga tier) dengan modul yang sudah terimplementasi di SecureProfit Hub berdasarkan schema Prisma, route Express, dan halaman React. Klasifikasi:"));
  children.push(bullet("Fit - fungsionalitas setara atau lebih lengkap dari PSOhub."));
  children.push(bullet("Partial - sebagian fitur sudah ada, tetapi terbatas atau perlu pengembangan tambahan."));
  children.push(bullet("Gap - fitur belum tersedia di SecureProfit Hub."));

  children.push(h("Detail Komparasi per Kategori"));
  for (const s of sections) {
    children.push(h(s.title, HeadingLevel.HEADING_3));
    children.push(buildFeatureTable(s.rows));
    children.push(new Paragraph({ children: [txt("")] }));
  }

  const gaps = sections.flatMap(s => s.rows.filter(r => r.status === "GAP").map(r => ({ section: s.title, ...r })));
  const partials = sections.flatMap(s => s.rows.filter(r => r.status === "PARTIAL").map(r => ({ section: s.title, ...r })));

  children.push(h("Daftar Gap (Kandidat Roadmap)"));
  for (const g of gaps) children.push(numbered(`${g.feature} (${g.section}) - ${g.psohub}`));

  children.push(h("Daftar Partial (Perlu Penyempurnaan)"));
  for (const g of partials) children.push(numbered(`${g.feature} (${g.section}) - ${g.note || g.ours}`));

  children.push(h("Rekomendasi Prioritas"));

  children.push(h("Prioritas Tinggi (Quick Win < 1 kuartal)", HeadingLevel.HEADING_3));
  for (const b of [
    "Generate PDF invoice otomatis dari BillingMilestone - sudah punya data DPP/VAT, tinggal templating.",
    "SSO Microsoft / Google - adopsi tinggi di lingkungan korporasi.",
    "Attachment dokumen pada expense (struk/kwitansi) - perubahan schema kecil.",
    "Kanban view pada Tasks tab - reuse data task yang sudah ada.",
    "Alert otomatis over-budget / mendekati deadline (cron job + Notification).",
  ]) children.push(bullet(b));

  children.push(h("Prioritas Menengah (1-2 kuartal)", HeadingLevel.HEADING_3));
  for (const b of [
    "Modul Contract terpisah dengan tipe kontrak (Fixed/T&M/Retainer/Recurring) dan recurring invoice.",
    "Quote/SOW + digital signing - integrasi DocuSign atau Mekari Sign.",
    "Integrasi accounting lokal: Accurate, Jurnal.id, atau Xero.",
    "Client/guest portal read-only untuk status proyek & invoice.",
    "Custom report builder sederhana (drag-drop filter + chart).",
  ]) children.push(bullet(b));

  children.push(h("Prioritas Strategis (> 2 kuartal)", HeadingLevel.HEADING_3));
  for (const b of [
    "AI Copilot: natural-language data query (mis. 'berapa margin proyek X bulan ini') menggunakan LLM.",
    "AI auto-scheduling resource berbasis skill matrix + workload yang sudah ada.",
    "Multi-currency & multi-company jika ekspansi ke entitas/anak perusahaan lain.",
    "Mobile app untuk timesheet & approval.",
    "Integrasi Microsoft Teams/Slack untuk notifikasi.",
  ]) children.push(bullet(b));

  children.push(h("Keunggulan SecureProfit Hub yang Tidak Dimiliki PSOhub"));
  for (const b of [
    "VAT Recap PPN 11% Indonesia - rekap tahunan DPP, PPN dipungut, PPN dibayar, outstanding per bulan + CSV export untuk pelaporan SPT.",
    "Dokumen BAST (Berita Acara Serah Terima) sebagai tipe dokumen first-class - sesuai praktik proyek IT di Indonesia.",
    "Struktur Principal supervisor 3-tier (Principal Konsultan / Technical Writer / Admin Project) dengan workflow propose & accept staffing.",
    "Skill matrix & gap analysis otomatis menandai skill yang hanya dipegang 1 orang atau tanpa Senior/Principal.",
    "Domain-specific roles (Konsultan, Technical Writer, Admin Project) sesuai struktur tim konsultan keamanan TI lokal.",
    "Bulk weekly timesheet entry (grid 5 hari kerja) - UX khusus pola kerja konsultan.",
  ]) children.push(bullet(b));

  return new Document({
    creator: "SecureProfit Hub",
    title: "Fit-Gap Analysis: SecureProfit Hub vs PSOhub",
    numbering: {
      config: [{
        reference: "ol",
        levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }],
      }],
    },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children,
    }],
  });
}

async function main() {
  const doc = buildDoc();
  const buf = await Packer.toBuffer(doc);
  const out = resolve(process.cwd(), "exports/fit-gap-psohub.docx");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buf);
  console.log("Wrote", out, "(", buf.length, "bytes )");
}

main().catch(e => { console.error(e); process.exit(1); });
