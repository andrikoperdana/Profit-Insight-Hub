import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, AlignmentType, PageOrientation,
} from "docx";

interface FeatureRow { feature: string; detail: string; akses: string; }
interface RoleSection {
  title: string;
  roleLabel: string;
  ringkasan: string;
  dashboard: string[];
  menu: string[];
  fitur: FeatureRow[];
  batasan?: string[];
}

const roles: RoleSection[] = [
  {
    title: "1. Management (PMO Director)",
    roleLabel: "MANAGEMENT",
    ringkasan:
      "Pemegang akses tertinggi pada operasional proyek dan finansial. Bertanggung jawab atas alokasi PM, persetujuan akhir, monitoring margin, dan pelaporan VAT.",
    dashboard: [
      "Executive KPI: total proyek aktif, total kontrak, margin rata-rata.",
      "Grafik tren profit per bulan dan breakdown status proyek.",
      "Aging buckets piutang dan alert proyek at-risk.",
      "PM Allocation Card: jumlah proyek in-flight, active, observation, draft per PM beserta total nilai kontrak.",
    ],
    menu: [
      "Dashboard, Projects (semua), Clients (read-only), Timesheets, Resource Planning, Skill Matrix, Task Templates, Reports, VAT Recap, Settings.",
    ],
    fitur: [
      { feature: "Assign PM ke proyek DRAFT", detail: "Menetapkan Project Manager pada proyek hasil intake Sales (DRAFT). Jika sudah ada PM, server menolak dengan 409.", akses: "Eksklusif MANAGEMENT" },
      { feature: "Edit penuh proyek", detail: "Mengubah seluruh field proyek termasuk salesId, pmId, clientId, contractValue, status, dan tanggal.", akses: "Eksklusif MANAGEMENT" },
      { feature: "Approve / reject timesheet", detail: "Menyetujui atau menolak timesheet semua user pada semua proyek.", akses: "MANAGEMENT (semua), PM (proyek sendiri)" },
      { feature: "Approve / reject expense", detail: "Menyetujui atau menolak pengeluaran proyek. Expense MGMT auto-APPROVED saat submit.", akses: "MANAGEMENT (semua), PM (proyek sendiri)" },
      { feature: "Kelola Billing Milestone", detail: "Membuat TOP, ubah status PLANNED -> INVOICED -> PAID; sistem auto stempel tanggal.", akses: "MANAGEMENT + PM proyek" },
      { feature: "VAT Recap PPN 11%", detail: "Rekap 12 bulan: DPP, PPN dipungut, PPN dibayar, outstanding; export CSV untuk SPT.", akses: "Eksklusif MANAGEMENT" },
      { feature: "Reports lengkap", detail: "10 report (profitability, margin trend, utilization, billing aging, cash inflow, PPN detail, dll) + export CSV/XLSX/PDF.", akses: "MANAGEMENT + PM (di-scope ke proyek sendiri)" },
      { feature: "Resource Planning lintas BU", detail: "Lihat alokasi mandays per user per minggu di semua Business Unit, color-coded.", akses: "MANAGEMENT + PM" },
      { feature: "Skill Matrix & Gap Analysis", detail: "Lihat matriks skill x user, gap warning untuk skill tanpa Senior/Principal atau hanya 1 holder.", akses: "MANAGEMENT + PM" },
      { feature: "Kelola Task Template", detail: "Buat, ubah, hapus WBS template; PM hanya bisa baca dan apply.", akses: "Eksklusif MANAGEMENT (manage); PM (read+apply)" },
      { feature: "Kanban / List / Gantt Tasks", detail: "Tiga mode tampilan tugas dengan drag-drop status (Kanban) dan drag-drop jadwal (Gantt).", akses: "Semua user proyek (sesuai izin)" },
    ],
    batasan: [
      "Tidak mengelola User, Skills, Business Units (itu domain Site Admin).",
    ],
  },
  {
    title: "2. Project Manager",
    roleLabel: "PROJECT_MANAGER",
    ringkasan:
      "Pemilik proyek setelah handover dari Sales. Mengisi detail proyek, staffing, monitoring delivery, approval timesheet & expense pada proyek yang dipegangnya.",
    dashboard: [
      "Daftar proyek aktif yang di-scope ke PM tersebut (pmId = user.id).",
      "Approval inbox timesheet + tombol Approve All.",
      "Utilisasi tim, chart revenue vs profit.",
      "Alert proyek overdue dan pending expense.",
    ],
    menu: [
      "Dashboard, Projects (proyek sendiri), Timesheets, Resource Planning, Skill Matrix, Task Templates (read+apply), Reports, Settings.",
    ],
    fitur: [
      { feature: "Lengkapi proyek DRAFT", detail: "Mengisi description, dates, revenue, mandays, cost via DraftCompletionCard -> transisi ke OBSERVATION.", akses: "PM yang di-assign" },
      { feature: "Edit proyek sendiri", detail: "Mengubah semua field kecuali salesId, pmId, clientId.", akses: "PM proyek sendiri" },
      { feature: "Kelola Resources proyek", detail: "Set Admin Project, tim Konsultan, tim Technical Writer, dan Other Resources (semua user aktif).", akses: "PM proyek + MANAGEMENT" },
      { feature: "Accept proposal Principal", detail: "Menerima/menolak usulan staffing dari Principal.", akses: "PM proyek + MANAGEMENT" },
      { feature: "Kelola Tasks WBS", detail: "Buat, ubah, hapus task; set parent (WBS), dependencies, multi-assignee, billable flag.", akses: "PM proyek + MANAGEMENT" },
      { feature: "Timeline Gantt drag-drop", detail: "Drag bar memindahkan tanggal task; edge handle untuk resize durasi; panah dependency otomatis.", akses: "PM proyek + MANAGEMENT" },
      { feature: "Kanban Board Tasks", detail: "View 4 kolom (To Do, In Progress, Blocked, Done) dengan drag-drop status.", akses: "PM + assignee task" },
      { feature: "Approve timesheet & expense", detail: "Approval pada proyek sendiri; PM expense sendiri masih perlu approval.", akses: "PM proyek + MANAGEMENT" },
      { feature: "Billing Milestone", detail: "Set TOP %, DPP, VAT, status dan invoice number pada proyek sendiri.", akses: "PM proyek + MANAGEMENT" },
      { feature: "Reports PM-scoped", detail: "Semua report otomatis di-filter pmId = user.id; tidak bisa melihat data PM lain.", akses: "PM (data sendiri)" },
      { feature: "Apply Task Template", detail: "Mengaplikasikan WBS template ke proyek (otomatis menghitung tanggal relatif).", akses: "PM proyek + MANAGEMENT" },
      { feature: "Bulk weekly timesheet", detail: "Grid 5 hari kerja untuk submit beberapa proyek sekaligus (max 50 entri); PM auto-approved.", akses: "Semua role" },
    ],
    batasan: [
      "Tidak bisa edit proyek milik PM lain.",
      "Tidak bisa mengelola Clients (domain Sales) atau membuat User/Skills/BU.",
      "Tidak melihat VAT Recap (eksklusif MANAGEMENT).",
    ],
  },
  {
    title: "3. Sales",
    roleLabel: "SALES",
    ringkasan:
      "Pemilik tahap intake. Mengelola data Client dan menciptakan proyek baru (DRAFT) sebelum diserahkan ke MANAGEMENT untuk assign PM.",
    dashboard: [
      "Pipeline proyek (DRAFT s/d ACTIVE).",
      "Revenue per Client.",
      "Status pie chart proyek yang dibuat sendiri.",
      "Tren profitabilitas 6 bulan terakhir.",
    ],
    menu: [
      "Dashboard, Projects (proyek sendiri), Clients (kelola penuh), Timesheets, Settings.",
    ],
    fitur: [
      { feature: "Kelola Client", detail: "CRUD Client (nama, kontak, alamat, NPWP). Khusus role Sales di sistem ini.", akses: "Eksklusif SALES" },
      { feature: "Intake proyek baru", detail: "Form 4 field di /projects/new; sistem set status=DRAFT, salesId=user.id, pmId=null.", akses: "SALES" },
      { feature: "Edit proyek DRAFT", detail: "Pada DRAFT: edit code, name, description, clientId, contractValue.", akses: "SALES (proyek sendiri)" },
      { feature: "Edit proyek non-DRAFT (terbatas)", detail: "Field sama seperti DRAFT, tanpa boleh ubah personil/status.", akses: "SALES (proyek sendiri)" },
      { feature: "Log timesheet sendiri", detail: "Mencatat waktu kerja jika terlibat sebagai resource pada suatu proyek.", akses: "Semua role" },
    ],
    batasan: [
      "Tidak bisa mengubah salesId/pmId/status proyek.",
      "Tidak melihat Reports, VAT Recap, Resource Planning, Skill Matrix.",
      "Tidak bisa approve timesheet/expense.",
    ],
  },
  {
    title: "4. Konsultan",
    roleLabel: "KONSULTAN",
    ringkasan:
      "Eksekutor teknis proyek (pentest, GRC, threat hunting). Fokus pada tugas yang di-assign dan pencatatan timesheet.",
    dashboard: [
      "Welcome banner dengan greeting sesuai waktu.",
      "CTA 'Log Today's Time Sheet'.",
      "Tren timesheet 14 hari terakhir.",
      "Daftar submission terbaru.",
      "MyTasksCard: ringkasan task yang ditugaskan kepada user.",
    ],
    menu: [
      "Dashboard, Projects (yang melibatkannya), Timesheets, Settings.",
    ],
    fitur: [
      { feature: "Lihat proyek yang ditugaskan", detail: "Daftar proyek di mana user terdaftar sebagai ProjectResource atau memiliki timesheet.", akses: "KONSULTAN" },
      { feature: "Lihat detail task & WBS", detail: "Lihat semua task pada proyek yang melibatkannya, beserta dependency dan progress.", akses: "Semua user proyek" },
      { feature: "Ubah status task sendiri", detail: "Pada Kanban: drag kartu task antar kolom. Pada list: dropdown status. Hanya task di mana user adalah assignee.", akses: "Assignee task" },
      { feature: "Log jam kerja per task", detail: "Catat hours pada task assigned; otomatis terikat ke proyek dan validasi assignee.", akses: "Assignee task" },
      { feature: "Submit timesheet", detail: "Buat timesheet DRAFT -> SUBMITTED. Bisa pakai entry harian atau Entry Mingguan (grid 5 hari).", akses: "Semua role" },
      { feature: "Submit expense proyek", detail: "Catat pengeluaran (kategori, jumlah, attachment) menunggu approval PM/MGMT.", akses: "Semua user proyek" },
    ],
    batasan: [
      "Tidak melihat tab Financials/Billing (jika tampak terbatas pada role tertentu); detil contract & margin disembunyikan.",
      "Tidak bisa approve apapun.",
      "Tidak bisa mengubah resources, task milik orang lain, atau jadwal Gantt.",
    ],
  },
  {
    title: "5. Technical Writer",
    roleLabel: "TECHNICAL_WRITER",
    ringkasan:
      "Pendukung delivery yang menyusun report, laporan teknis, dan dokumentasi proyek. Pola akses sama seperti Konsultan dengan fokus pada output dokumen.",
    dashboard: [
      "Sama dengan Konsultan: greeting, CTA timesheet, tren 14 hari, MyTasks.",
    ],
    menu: [
      "Dashboard, Projects (yang melibatkannya), Timesheets, Settings.",
    ],
    fitur: [
      { feature: "Lihat task tipe penulisan", detail: "Task yang di-assign (umumnya output dokumen, report final, laporan eksekusi).", akses: "Assignee" },
      { feature: "Update status task & log jam", detail: "Drag-drop Kanban, dropdown status, dan log hours seperti Konsultan.", akses: "Assignee" },
      { feature: "Submit timesheet (bulk mingguan)", detail: "Pencatatan jam kerja harian atau via Entry Mingguan.", akses: "Semua role" },
      { feature: "Upload dokumen proyek", detail: "Upload Document (REPORT/OTHER) jika punya akses ke proyek - umumnya dikelola Admin Project.", akses: "User proyek dengan izin dokumen" },
    ],
    batasan: [
      "Sama seperti Konsultan: tidak melihat Financials/Billing dan tidak bisa approve.",
    ],
  },
  {
    title: "6. Admin Project",
    roleLabel: "ADMIN_PROJECT",
    ringkasan:
      "Penanggung jawab administrasi closing dokumen proyek (BAST, Invoice, Kontrak, Report). Mengelola arsip dokumen.",
    dashboard: [
      "Closing-doc inbox: proyek yang sudah COMPLETE namun belum lengkap dokumen-nya.",
      "Alert proyek COMPLETE lebih dari 3 hari belum di-close.",
    ],
    menu: [
      "Dashboard, Projects (yang melibatkannya), Timesheets, Settings.",
    ],
    fitur: [
      { feature: "Kelola Document proyek", detail: "Upload, ganti, hapus BAST / INVOICE / CONTRACT / REPORT / OTHER (disimpan base64).", akses: "Eksklusif ADMIN_PROJECT (dan MANAGEMENT)" },
      { feature: "Track kelengkapan closing", detail: "Inbox menampilkan proyek yang butuh BAST atau invoice agar bisa CLOSED.", akses: "ADMIN_PROJECT" },
      { feature: "Submit timesheet jika ditugaskan", detail: "Sebagai Admin Project pada suatu proyek juga bisa log jam admin.", akses: "Assignee" },
    ],
    batasan: [
      "Tidak menyentuh keuangan/contract value.",
      "Tidak approve timesheet/expense user lain.",
    ],
  },
  {
    title: "7. Principal (Konsultan / Technical Writer / Admin Project)",
    roleLabel: "PRINCIPAL_KONSULTAN / PRINCIPAL_TECHNICAL_WRITER / PRINCIPAL_ADMIN_PROJECT",
    ringkasan:
      "Supervisor 3-tier untuk masing-masing keluarga delivery. Mengusulkan anggota tim binaannya ke proyek dan memantau kapasitas - TANPA akses finansial.",
    dashboard: [
      "Daftar proyek yang membutuhkan resource pada keluarga binaannya.",
      "Daftar user di bawah supervisi.",
    ],
    menu: [
      "Dashboard, Projects (visibility terbatas), Timesheets, Settings.",
    ],
    fitur: [
      { feature: "Propose resource ke proyek", detail: "POST /api/projects/:id/resources/propose - mengusulkan supervisee ke proyek OBSERVATION/ACTIVE.", akses: "Principal yang sesuai keluarganya" },
      { feature: "Lihat supervisee", detail: "GET /api/users/under-supervision - daftar user dengan principalId = user.id.", akses: "Principal" },
      { feature: "Hapus proposal sendiri", detail: "DELETE proposed resource yang belum di-accept oleh PM/MGMT.", akses: "Principal pengusul + PM/MGMT" },
      { feature: "Lihat proyek yang butuh resource", detail: "GET /api/principal/projects-needing-resource: proyek yang resourcing-nya belum cukup di keluarga supervisi.", akses: "Principal" },
    ],
    batasan: [
      "Tab Financials dan Billing disembunyikan total.",
      "Semua kolom contractValue / margin / cost / Estimated Cost tidak ditampilkan (canViewProjectFinancials = false).",
      "Tidak bisa edit task atau approve timesheet.",
    ],
  },
  {
    title: "8. Site Admin",
    roleLabel: "SITE_ADMIN",
    ringkasan:
      "Administrator platform: kelola User, Skills, Business Units, dan memantau Audit Log. Tidak mengelola data proyek.",
    dashboard: [
      "Users + Audit Log management.",
      "Feed aktivitas terbaru (eksklusif SITE_ADMIN).",
    ],
    menu: [
      "Dashboard, Users, Skills, Business Units, Settings.",
    ],
    fitur: [
      { feature: "Kelola User", detail: "CRUD user, set role, seniority, businessUnitId, managerId, principalId, status aktif.", akses: "Eksklusif SITE_ADMIN" },
      { feature: "Kelola Skill", detail: "Tambah/ubah/hapus master Skill yang dipakai di Skill Matrix dan UserSkill.", akses: "Eksklusif SITE_ADMIN" },
      { feature: "Kelola Business Unit", detail: "CRUD BU (Pentest, GRC, Threat Hunting, dan baru).", akses: "Eksklusif SITE_ADMIN" },
      { feature: "Audit Log viewer", detail: "Activity feed seluruh mutasi sistem (create/update/delete pada Project, Task, Timesheet, dll).", akses: "Eksklusif SITE_ADMIN" },
    ],
    batasan: [
      "Tidak mengakses Projects, Timesheets, Reports, atau VAT Recap secara operasional.",
    ],
  },
];

const sharedFeatures = [
  "Login JWT (HS256) dengan token disimpan di localStorage; auto-redirect ke /login pada 401.",
  "WelcomeBanner: greeting time-aware (Selamat pagi/siang/sore) + label role.",
  "Header notification: polling tiap 60 detik untuk approval, expense, dan tugas baru.",
  "Tema dark cyber-green; UI tanpa emoji.",
  "Pagination dan limit aman: projects 500, tasks 1000, users 500.",
  "Format mata uang IDR konsisten (formatIDR).",
  "Audit otomatis pada setiap mutasi (Activity model).",
];

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "AAAAAA" };
const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function txt(s: string, opts: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}): TextRun {
  return new TextRun({ text: s, bold: opts.bold, color: opts.color, size: opts.size, italics: opts.italics });
}
function para(s: string, opts: { bold?: boolean; color?: string; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType]; italics?: boolean } = {}): Paragraph {
  return new Paragraph({ children: [txt(s, opts)], alignment: opts.align });
}
function h(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2): Paragraph {
  const sizeMap: Record<string, number> = {
    [HeadingLevel.TITLE]: 44,
    [HeadingLevel.HEADING_1]: 36,
    [HeadingLevel.HEADING_2]: 28,
    [HeadingLevel.HEADING_3]: 24,
  };
  return new Paragraph({
    children: [txt(text, { bold: true, color: "0F172A", size: sizeMap[level] ?? 24 })],
    heading: level,
    spacing: { before: 240, after: 120 },
  });
}
function bullet(text: string): Paragraph {
  return new Paragraph({ children: [txt(text)], bullet: { level: 0 } });
}
function headingCell(text: string, width: number): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { type: ShadingType.SOLID, color: "0F172A", fill: "0F172A" },
    children: [para(text, { bold: true, color: "FFFFFF", size: 20 })],
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

const FEATURE_COL_W = [3000, 5400, 3000];

function buildFeatureTable(rows: FeatureRow[]): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [
      headingCell("Fitur", FEATURE_COL_W[0]),
      headingCell("Detail", FEATURE_COL_W[1]),
      headingCell("Akses", FEATURE_COL_W[2]),
    ],
  });
  const body = rows.map(r => new TableRow({
    children: [
      bodyCell([para(r.feature, { bold: true, size: 20 })], FEATURE_COL_W[0]),
      bodyCell([para(r.detail, { size: 20 })], FEATURE_COL_W[1]),
      bodyCell([para(r.akses, { size: 20, italics: true })], FEATURE_COL_W[2]),
    ],
  }));
  return new Table({
    rows: [header, ...body],
    width: { size: FEATURE_COL_W.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: { ...ALL_BORDERS, insideHorizontal: BORDER, insideVertical: BORDER },
  });
}

function buildRoleMatrix(): Table {
  const COL = [3600, 1100, 1100, 900, 900, 900, 900, 1300, 900];
  const roleHeaders = [
    "Fitur / Modul",
    "MGMT",
    "PM",
    "Sales",
    "Kons.",
    "TW",
    "Admin Prj",
    "Principal",
    "Site Adm",
  ];
  const Y = "16A34A"; // green
  const P = "D97706"; // amber partial
  const N = "DC2626"; // red no
  function cell(v: "Y" | "P" | "N" | "-", w: number): TableCell {
    if (v === "-") return bodyCell([para("-", { align: AlignmentType.CENTER, size: 20 })], w);
    const fill = v === "Y" ? Y : v === "P" ? P : N;
    const label = v === "Y" ? "Y" : v === "P" ? "P" : "N";
    return bodyCell([para(label, { bold: true, color: "FFFFFF", size: 20, align: AlignmentType.CENTER })], w, fill);
  }
  type V = "Y" | "P" | "N" | "-";
  const rows: { f: string; v: V[] }[] = [
    { f: "Login & dashboard role-aware",                v: ["Y","Y","Y","Y","Y","Y","Y","Y"] },
    { f: "Kelola User / Skills / BU",                   v: ["N","N","N","N","N","N","N","Y"] },
    { f: "Audit Log viewer",                            v: ["N","N","N","N","N","N","N","Y"] },
    { f: "Kelola Clients",                              v: ["N","N","Y","N","N","N","N","N"] },
    { f: "Intake proyek baru (DRAFT)",                  v: ["N","N","Y","N","N","N","N","N"] },
    { f: "Assign PM ke proyek",                         v: ["Y","N","N","N","N","N","N","N"] },
    { f: "Edit proyek (penuh)",                         v: ["Y","P","P","N","N","N","N","N"] },
    { f: "Kelola Resources & accept proposal",          v: ["Y","Y","N","N","N","N","N","N"] },
    { f: "Propose resource (supervisee)",               v: ["N","N","N","N","N","N","Y","N"] },
    { f: "Kelola Tasks (CRUD, WBS, dependency)",        v: ["Y","Y","N","N","N","N","N","N"] },
    { f: "Drag-drop Gantt timeline",                    v: ["Y","Y","N","N","N","N","N","N"] },
    { f: "Kanban board (drag status)",                  v: ["Y","Y","P","P","P","P","N","N"] },
    { f: "Log hours per task",                          v: ["P","P","P","Y","Y","Y","N","N"] },
    { f: "Submit timesheet (harian/mingguan)",          v: ["Y","Y","Y","Y","Y","Y","Y","N"] },
    { f: "Approve timesheet",                           v: ["Y","Y","N","N","N","N","N","N"] },
    { f: "Submit expense",                              v: ["Y","Y","Y","Y","Y","Y","P","N"] },
    { f: "Approve expense",                             v: ["Y","Y","N","N","N","N","N","N"] },
    { f: "Kelola Billing Milestone",                    v: ["Y","Y","N","N","N","N","N","N"] },
    { f: "Lihat Financials / Margin / Contract",        v: ["Y","Y","P","N","N","N","N","N"] },
    { f: "Reports (export CSV/XLSX/PDF)",               v: ["Y","Y","N","N","N","N","N","N"] },
    { f: "VAT Recap PPN tahunan",                       v: ["Y","N","N","N","N","N","N","N"] },
    { f: "Resource Planning & Skill Matrix",            v: ["Y","Y","N","N","N","N","N","N"] },
    { f: "Kelola Task Template (CRUD)",                 v: ["Y","N","N","N","N","N","N","N"] },
    { f: "Apply Task Template ke proyek",               v: ["Y","Y","N","N","N","N","N","N"] },
    { f: "Kelola Document (BAST/Invoice/Kontrak)",      v: ["Y","P","P","N","N","Y","N","N"] },
  ];
  const headerRow = new TableRow({
    tableHeader: true,
    children: roleHeaders.map((t, i) => headingCell(t, COL[i])),
  });
  const bodyRows = rows.map(r => new TableRow({
    children: [
      bodyCell([para(r.f, { bold: true, size: 18 })], COL[0]),
      ...r.v.map((v, i) => cell(v, COL[i + 1])),
    ],
  }));
  return new Table({
    rows: [headerRow, ...bodyRows],
    width: { size: COL.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: { ...ALL_BORDERS, insideHorizontal: BORDER, insideVertical: BORDER },
  });
}

function buildDoc(): Document {
  const today = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  const children: (Paragraph | Table)[] = [];

  children.push(new Paragraph({
    children: [txt("Dokumentasi Fitur per Role - SecureProfit Hub", { bold: true, color: "0F172A", size: 44 })],
    heading: HeadingLevel.TITLE,
  }));
  children.push(para(`Tanggal: ${today}`));
  children.push(para("Aplikasi: SecureProfit Hub - PSA internal untuk konsultan keamanan TI"));

  children.push(h("Pendahuluan"));
  children.push(new Paragraph({ children: [
    txt("SecureProfit Hub adalah aplikasi Professional Services Automation (PSA) yang melacak proyek dari intake Sales hingga delivery dan closing, termasuk monitoring margin saat konsultan mencatat mandays billable. "),
    txt("Dokumen ini menjabarkan fitur dan hak akses untuk setiap role yang ada di sistem, sebagai bahan presentasi dan referensi onboarding.", { italics: true }),
  ]}));

  children.push(h("Daftar Role"));
  const allRoles = [
    "Management (PMO Director)",
    "Project Manager",
    "Sales",
    "Konsultan",
    "Technical Writer",
    "Admin Project",
    "Principal Konsultan / Technical Writer / Admin Project",
    "Site Admin",
  ];
  for (const r of allRoles) children.push(bullet(r));

  children.push(h("Matriks Akses Fitur (Ringkas)"));
  children.push(para("Legenda: Y = Tersedia, P = Sebagian (dengan syarat ownership/assignment), N = Tidak tersedia, - = Tidak relevan."));
  children.push(buildRoleMatrix());

  children.push(h("Detail Fitur per Role"));
  for (const r of roles) {
    children.push(h(r.title, HeadingLevel.HEADING_2));
    children.push(new Paragraph({ children: [txt("Role key: "), txt(r.roleLabel, { bold: true })] }));
    children.push(para(r.ringkasan));

    children.push(h("Dashboard", HeadingLevel.HEADING_3));
    for (const d of r.dashboard) children.push(bullet(d));

    children.push(h("Menu yang Diakses", HeadingLevel.HEADING_3));
    for (const m of r.menu) children.push(bullet(m));

    children.push(h("Fitur & Hak Akses", HeadingLevel.HEADING_3));
    children.push(buildFeatureTable(r.fitur));

    if (r.batasan && r.batasan.length > 0) {
      children.push(h("Batasan", HeadingLevel.HEADING_3));
      for (const b of r.batasan) children.push(bullet(b));
    }

    children.push(new Paragraph({ children: [txt("")] }));
  }

  children.push(h("Fitur Bersama (Semua Role)"));
  for (const f of sharedFeatures) children.push(bullet(f));

  children.push(h("Catatan Penutup"));
  children.push(para("Dokumen ini disusun berdasarkan implementasi sistem saat ini (Mei 2026). Pengembangan lebih lanjut akan mengacu pada Roadmap dan dokumen Fit-Gap Analysis terpisah."));

  return new Document({
    creator: "SecureProfit Hub",
    title: "Dokumentasi Fitur per Role - SecureProfit Hub",
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
  const out = resolve(process.cwd(), "exports/role-features.docx");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buf);
  console.log("Wrote", out, "(", buf.length, "bytes )");
}

main().catch(e => { console.error(e); process.exit(1); });
