/**
 * Generate the Word guide "SecureProfit Hub — Dashboard & Menu Guide".
 *
 * Explains, for ALL roles:
 *   1. What the Dashboard is for (general + breakdown of the example PM dashboard)
 *   2. What each role's dashboard shows
 *   3. What every left-sidebar menu does + which roles can see it
 *   4. A "Menu vs Role" visibility matrix (landscape section)
 *
 * Produces TWO files (Bahasa Indonesia + English).
 *
 * Run: `pnpm --filter @workspace/scripts run dashboard-menu-doc`
 * Output: ./exports/SecureProfitHub-Dashboard-Menu-Guide-ID.docx
 *         ./exports/SecureProfitHub-Dashboard-Menu-Guide-EN.docx
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, PageOrientation,
} from "docx";

// ---------------------------------------------------------------------------
// Style constants (mirror proses-flow-doc.ts)
// ---------------------------------------------------------------------------

const FONT = "Calibri";
const ACCENT = "0F766E";       // teal-700
const STRIPE = "F1F5F9";       // slate-100
const BORDER = "CBD5E1";       // slate-300

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPORTS_DIR = resolve(HERE, "../../exports");

type Lang = "id" | "en";
let LANG: Lang = "id";
function t(id: string, en: string): string {
  return LANG === "id" ? id : en;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, bold: true, color: ACCENT, size: 36, font: FONT })],
  });
}
function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, color: ACCENT, size: 28, font: FONT })],
  });
}
function h3(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, size: 24, font: FONT })],
  });
}
function p(text: string, opts: { bold?: boolean; italics?: boolean } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text, font: FONT, size: 22, bold: opts.bold, italics: opts.italics })],
  });
}
function bullet(text: string, level = 0): Paragraph {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 60 },
    children: [new TextRun({ text, font: FONT, size: 22 })],
  });
}
function labelled(label: string, desc: string, level = 0): Paragraph {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label} — `, font: FONT, size: 22, bold: true }),
      new TextRun({ text: desc, font: FONT, size: 22 }),
    ],
  });
}
function spacer(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: "" })] });
}

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];
function cell(text: string, opts: { bold?: boolean; shade?: string; widthPct?: number; size?: number; align?: Align } = {}): TableCell {
  return new TableCell({
    shading: opts.shade ? { type: ShadingType.CLEAR, color: "auto", fill: opts.shade } : undefined,
    width: opts.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [new TextRun({ text, font: FONT, size: opts.size ?? 20, bold: opts.bold })],
      }),
    ],
  });
}

function table(headers: string[], rows: string[][], widthsPct?: number[], bodySize = 20): Table {
  const head = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: "auto", fill: ACCENT },
        width: widthsPct?.[i] ? { size: widthsPct[i]!, type: WidthType.PERCENTAGE } : undefined,
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: [
          new Paragraph({
            children: [new TextRun({ text: h, font: FONT, size: bodySize, bold: true, color: "FFFFFF" })],
          }),
        ],
      }),
    ),
  });
  const bodyRows = rows.map((r, idx) => new TableRow({
    children: r.map((c, i) => cell(c, { shade: idx % 2 === 0 ? "FFFFFF" : STRIPE, widthPct: widthsPct?.[i], size: bodySize })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      left:   { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      right:  { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      insideVertical:   { style: BorderStyle.SINGLE, size: 4, color: BORDER },
    },
    rows: [head, ...bodyRows],
  });
}

// ---------------------------------------------------------------------------
// Role + menu data model
// ---------------------------------------------------------------------------

const ROLE_ORDER = ["MGMT", "PM", "SALES", "KONTW", "AP", "FIN", "HR", "PRIN", "SA"] as const;
type RoleCode = typeof ROLE_ORDER[number] | "ALL";

function roleName(code: typeof ROLE_ORDER[number]): string {
  switch (code) {
    case "MGMT": return "Management";
    case "PM": return "Project Manager";
    case "SALES": return "Sales";
    case "KONTW": return t("Konsultan & Technical Writer", "Konsultan & Technical Writer");
    case "AP": return "Admin Project";
    case "FIN": return "Finance";
    case "HR": return "HR";
    case "PRIN": return t("Principal (3 jenis)", "Principal (3 types)");
    case "SA": return "Site Admin";
  }
}

function expand(roles: RoleCode[]): Set<string> {
  if (roles.includes("ALL")) return new Set(ROLE_ORDER);
  return new Set(roles as string[]);
}

function whoSees(roles: RoleCode[]): string {
  if (roles.includes("ALL")) return t("Semua role", "All roles");
  return (roles as typeof ROLE_ORDER[number][]).map(roleName).join(", ");
}

interface MenuItem { label: string; roles: RoleCode[]; fn: string; }
interface MenuGroup { heading: string; items: MenuItem[]; }

function menuGroups(): MenuGroup[] {
  return [
    {
      heading: "MAIN",
      items: [
        { label: "Dashboard", roles: ["ALL"], fn: t("Halaman ringkasan utama setelah login; isinya otomatis menyesuaikan role Anda.", "Main summary page after login; its contents adapt automatically to your role.") },
        { label: "Projects", roles: ["MGMT", "PM", "SALES", "KONTW", "AP", "FIN", "PRIN"], fn: t("Daftar proyek yang boleh Anda lihat; klik untuk membuka detail proyek (Overview, Tasks, Resources, Billing, dll).", "List of projects you may see; click to open project detail (Overview, Tasks, Resources, Billing, etc.).") },
        { label: "Time Tracking", roles: ["PM", "KONTW", "AP", "PRIN"], fn: t("Mencatat dan mengelola jam kerja (timesheet) pada proyek.", "Record and manage working hours (timesheets) on projects.") },
      ],
    },
    {
      heading: "OPERATIONS",
      items: [
        { label: "My Tasks", roles: ["PM", "SALES", "KONTW", "AP", "PRIN"], fn: t("Daftar task yang ditugaskan kepada Anda beserta statusnya. PM yang ikut menjadi resource & ditugaskan task juga melihat menu ini.", "List of tasks assigned to you and their status. PMs who are staffed as a resource and assigned tasks also see this menu.") },
        { label: "My Timesheet", roles: ["PM", "KONTW", "AP", "PRIN"], fn: t("Riwayat timesheet pribadi Anda.", "Your personal timesheet history.") },
        { label: "My Expenses", roles: ["PM", "SALES", "KONTW", "AP", "PRIN"], fn: t("Pengajuan biaya (expense) pribadi Anda dan statusnya.", "Your personal expense submissions and their status.") },
        { label: "Sales Pipeline", roles: ["SALES"], fn: t("Papan kanban lead/prospek penjualan dari kontak awal sampai konversi menjadi proyek.", "Sales lead/prospect kanban board from first contact to conversion into a project.") },
        { label: "Approval Inbox", roles: ["PM"], fn: t("Kotak persetujuan timesheet tim untuk di-approve/reject oleh PM.", "Inbox of team timesheets for the PM to approve/reject.") },
        { label: "Resources", roles: ["MGMT", "PM", "PRIN"], fn: t("Mengatur penempatan orang (staffing) pada proyek.", "Manage staffing (people assignment) on projects.") },
        { label: "Capacity Planning", roles: ["MGMT", "PM", "HR"], fn: t("Melihat kapasitas dan beban kerja tim per periode.", "View team capacity and workload per period.") },
        { label: "Expenses", roles: ["MGMT", "PM", "SALES"], fn: t("Mengelola dan menyetujui biaya non-resource pada proyek.", "Manage and approve non-resource project expenses.") },
        { label: "Resource Planning", roles: ["MGMT", "PM", "HR", "PRIN"], fn: t("Rencana alokasi mandays tim per minggu, dikelompokkan per Business Unit.", "Weekly team mandays allocation plan, grouped by Business Unit.") },
        { label: "Bench Report", roles: ["MGMT", "PM", "HR", "PRIN"], fn: t("Daftar anggota tim yang sedang idle / utilisasinya rendah.", "List of idle / low-utilization team members.") },
        { label: "Work Hours", roles: ["MGMT", "HR", "PRIN"], fn: t("Kepatuhan jam kerja (target 40 jam/minggu) untuk role yang diwajibkan.", "Work-hours compliance (40h/week target) for required roles.") },
        { label: "Skill Matrix", roles: ["MGMT", "PM", "HR"], fn: t("Peta keahlian seluruh orang dibanding skill yang dibutuhkan, menyorot kekurangan (gap).", "Map of everyone's skills against required skills, highlighting gaps.") },
        { label: "Task Templates", roles: ["MGMT", "PM"], fn: t("Template daftar task (WBS) siap pakai untuk mempercepat setup proyek.", "Reusable task (WBS) templates to speed up project setup.") },
        { label: "Project Templates", roles: ["MGMT", "PM", "SALES"], fn: t("Template proyek siap pakai untuk pembuatan proyek baru.", "Reusable project templates for creating new projects.") },
        { label: "Skill Development", roles: ["ALL"], fn: t("Pengembangan keahlian / pembelajaran pribadi.", "Personal skill development / learning.") },
        { label: "Invoice Planning", roles: ["MGMT", "PM", "FIN", "AP", "SALES"], fn: t("Rencana penagihan: billing milestone dikelompokkan per minggu/bulan.", "Billing plan: billing milestones bucketed per week/month.") },
        { label: "Reports", roles: ["MGMT", "PM", "FIN"], fn: t("Kumpulan laporan siap pakai (profitabilitas, utilisasi, aging, billing, PPN) yang bisa diekspor CSV/Excel/PDF.", "Library of ready-to-use reports (profitability, utilization, aging, billing, VAT) exportable to CSV/Excel/PDF.") },
        { label: "Performance Reviews", roles: ["MGMT", "PM", "PRIN"], fn: t("Penilaian kinerja anggota tim.", "Performance appraisals of team members.") },
      ],
    },
    {
      heading: t("PEOPLE OPS (khusus HR)", "PEOPLE OPS (HR only)"),
      items: [
        { label: "Employees", roles: ["HR"], fn: t("Data karyawan (lihat dan kelola).", "Employee records (view and manage).") },
        { label: "Org Chart", roles: ["HR"], fn: t("Bagan struktur organisasi.", "Organization structure chart.") },
        { label: "Leave Management", roles: ["HR"], fn: t("Pengelolaan cuti karyawan.", "Employee leave management.") },
        { label: "Business Units", roles: ["HR"], fn: t("Master data Business Unit.", "Business Unit master data.") },
        { label: "Skills", roles: ["HR"], fn: t("Master data daftar skill.", "Skill list master data.") },
      ],
    },
    {
      heading: t("ADMINISTRATION", "ADMINISTRATION"),
      items: [
        { label: "Clients", roles: ["SALES", "FIN"], fn: t("Data klien.", "Client records.") },
        { label: "Users", roles: ["SA"], fn: t("Manajemen akun pengguna sistem.", "System user account management.") },
        { label: "Business Units", roles: ["SA"], fn: t("Master data Business Unit (sisi Site Admin).", "Business Unit master data (Site Admin side).") },
        { label: "Skills", roles: ["SA"], fn: t("Master data daftar skill (sisi Site Admin).", "Skill list master data (Site Admin side).") },
        { label: "Business Intelligence", roles: ["MGMT"], fn: t("Analitik tingkat lanjut untuk manajemen.", "Advanced analytics for management.") },
        { label: "PM Dashboards", roles: ["MGMT"], fn: t("Memantau portofolio setiap Project Manager secara sekilas — proyek, kesehatan, margin, dan antrian persetujuan (hanya-baca).", "Monitor each Project Manager's portfolio at a glance — projects, health, margin, and approval queue (read-only).") },
        { label: "Portfolio Monitor", roles: ["MGMT"], fn: t("Pantauan PMO atas seluruh proyek komersial — penagihan, jam vs anggaran, margin estimasi vs aktual, penanda anomali, dan prakiraan invoice mingguan (hanya-baca).", "PMO-wide view of every commercial project — billing, hours vs budget, estimated vs actual margin, anomaly flags, and a weekly invoice forecast (read-only).") },
        { label: "AI Executive Copilot", roles: ["MGMT"], fn: t("Ringkasan eksekutif yang dinarasikan AI: skor kesehatan portofolio, sorotan risiko, dan Top 5 aksi. Semua angka dihitung sistem (deterministik); AI hanya menyusun narasinya. Dibuat lewat tombol Generate.", "AI-narrated executive briefing: portfolio health score, risk highlights, and Top 5 actions. All numbers are computed by the system (deterministic); the AI only writes the narrative. Generated on demand via a Generate button.") },
        { label: "Top Performers", roles: ["MGMT", "PRIN"], fn: t("Daftar anggota tim berkinerja terbaik.", "List of top-performing team members.") },
        { label: "VAT Recap", roles: ["MGMT", "FIN"], fn: t("Rekap PPN dari milestone yang sudah INVOICED/PAID per tahun.", "VAT recap from INVOICED/PAID milestones per year.") },
        { label: "Invoice Settings", roles: ["MGMT", "FIN"], fn: t("Pengaturan data perusahaan & bank yang muncul di invoice.", "Company & bank details that appear on invoices.") },
        { label: "Survey Results", roles: ["MGMT", "SALES"], fn: t("Hasil survei kepuasan klien (CSAT).", "Client satisfaction (CSAT) survey results.") },
        { label: "Survey Template", roles: ["MGMT"], fn: t("Template pertanyaan survei kepuasan klien.", "Client satisfaction survey question template.") },
        { label: "Audit Log", roles: ["SA"], fn: t("Catatan aktivitas/audit seluruh sistem.", "System-wide activity/audit log.") },
      ],
    },
    {
      heading: t("BAWAH (selalu tampil)", "FOOTER (always shown)"),
      items: [
        { label: "Settings", roles: ["ALL"], fn: t("Pengaturan akun & preferensi pribadi. Khusus Management ada saklar Email Notifications untuk mengaktifkan/mematikan notifikasi email seluruh sistem.", "Personal account & preferences settings. Management additionally sees an Email Notifications switch that turns system-wide email notifications on/off.") },
        { label: "Logout", roles: ["ALL"], fn: t("Keluar dari aplikasi.", "Sign out of the application.") },
      ],
    },
  ];
}

// Consolidated, de-duplicated list for the matrix.
function matrixRows(): { label: string; roles: Set<string> }[] {
  return [
    { label: "Dashboard", roles: expand(["ALL"]) },
    { label: "Projects", roles: expand(["MGMT", "PM", "SALES", "KONTW", "AP", "FIN", "PRIN"]) },
    { label: "Time Tracking", roles: expand(["PM", "KONTW", "AP", "PRIN"]) },
    { label: "My Tasks", roles: expand(["PM", "SALES", "KONTW", "AP", "PRIN"]) },
    { label: "My Timesheet", roles: expand(["PM", "KONTW", "AP", "PRIN"]) },
    { label: "My Expenses", roles: expand(["PM", "SALES", "KONTW", "AP", "PRIN"]) },
    { label: "Sales Pipeline", roles: expand(["SALES"]) },
    { label: "Approval Inbox", roles: expand(["PM"]) },
    { label: "Resources", roles: expand(["MGMT", "PM", "PRIN"]) },
    { label: "Capacity Planning", roles: expand(["MGMT", "PM", "HR"]) },
    { label: "Expenses", roles: expand(["MGMT", "PM", "SALES"]) },
    { label: "Resource Planning", roles: expand(["MGMT", "PM", "HR", "PRIN"]) },
    { label: "Bench Report", roles: expand(["MGMT", "PM", "HR", "PRIN"]) },
    { label: "Work Hours", roles: expand(["MGMT", "HR", "PRIN"]) },
    { label: "Skill Matrix", roles: expand(["MGMT", "PM", "HR"]) },
    { label: "Task Templates", roles: expand(["MGMT", "PM"]) },
    { label: "Project Templates", roles: expand(["MGMT", "PM", "SALES"]) },
    { label: "Skill Development", roles: expand(["ALL"]) },
    { label: "Invoice Planning", roles: expand(["MGMT", "PM", "FIN", "AP", "SALES"]) },
    { label: "Reports", roles: expand(["MGMT", "PM", "FIN"]) },
    { label: "Performance Reviews", roles: expand(["MGMT", "PM", "PRIN"]) },
    { label: "Clients", roles: expand(["SALES", "FIN"]) },
    { label: t("Employees / Users", "Employees / Users"), roles: expand(["HR", "SA"]) },
    { label: "Org Chart", roles: expand(["HR"]) },
    { label: "Leave Management", roles: expand(["HR"]) },
    { label: "Business Units", roles: expand(["HR", "SA"]) },
    { label: "Skills", roles: expand(["HR", "SA"]) },
    { label: "Business Intelligence", roles: expand(["MGMT"]) },
    { label: "PM Dashboards", roles: expand(["MGMT"]) },
    { label: "Portfolio Monitor", roles: expand(["MGMT"]) },
    { label: "AI Executive Copilot", roles: expand(["MGMT"]) },
    { label: "Top Performers", roles: expand(["MGMT", "PRIN"]) },
    { label: "VAT Recap", roles: expand(["MGMT", "FIN"]) },
    { label: "Invoice Settings", roles: expand(["MGMT", "FIN"]) },
    { label: "Survey Results", roles: expand(["MGMT", "SALES"]) },
    { label: "Survey Template", roles: expand(["MGMT"]) },
    { label: "Audit Log", roles: expand(["SA"]) },
    { label: "Settings", roles: expand(["ALL"]) },
    { label: "Logout", roles: expand(["ALL"]) },
  ];
}

// ---------------------------------------------------------------------------
// Content sections
// ---------------------------------------------------------------------------

function cover(): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 200 },
      children: [new TextRun({ text: "SecureProfit Hub", bold: true, size: 56, color: ACCENT, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: t("Panduan Dashboard & Menu", "Dashboard & Menu Guide"), size: 32, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 1200 },
      children: [new TextRun({ text: t("Penjelasan isi dashboard dan fungsi setiap menu — untuk semua role", "What the dashboard shows and what every menu does — for all roles"), italics: true, size: 24, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: t("Versi 1.4", "Version 1.4"), size: 22, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: new Date().toLocaleDateString(LANG === "id" ? "id-ID" : "en-GB", { day: "2-digit", month: "long", year: "numeric" }), size: 22, font: FONT })],
    }),
    new Paragraph({ children: [new TextRun({ text: "", break: 1 })], pageBreakBefore: true }),
  ];
}

function intro(): (Paragraph | Table)[] {
  return [
    h1(t("1. Pendahuluan", "1. Introduction")),
    p(t(
      "SecureProfit Hub adalah aplikasi internal untuk mengelola siklus proyek konsultansi keamanan informasi — dari intake oleh Sales, eksekusi oleh tim delivery, sampai penutupan dan pelaporan. Dokumen ini menjelaskan dua hal: (1) apa fungsi halaman Dashboard, dan (2) apa fungsi setiap menu di panel kiri (sidebar), termasuk role mana yang dapat melihatnya.",
      "SecureProfit Hub is an internal application for managing the information-security consulting project lifecycle — from Sales intake, through delivery execution, to closing and reporting. This document explains two things: (1) what the Dashboard page is for, and (2) what each left-side (sidebar) menu does, including which roles can see it.",
    )),
    p(t("Catatan penting:", "Important note:"), { bold: true }),
    bullet(t(
      "Tampilan menyesuaikan role. Tidak semua orang melihat menu yang sama — sidebar dan dashboard ditampilkan berbeda sesuai peran (role) pengguna.",
      "The interface adapts to your role. Not everyone sees the same menus — the sidebar and dashboard are shown differently depending on the user's role.",
    )),
    bullet(t(
      "Nama menu dalam aplikasi memakai Bahasa Inggris, jadi nama menu tetap ditulis apa adanya pada dokumen ini.",
      "Menu names inside the app are in English, so menu names are kept verbatim in this document.",
    )),
    bullet(t(
      "Di header (kanan atas) terdapat ikon lonceng Notifications untuk semua role: berisi pemberitahuan dalam aplikasi (mis. timesheet disetujui/ditolak, pengingat approval). Untuk kejadian penting, sistem juga dapat mengirim email bila fitur email dinyalakan oleh Management.",
      "The header (top right) has a Notifications bell for all roles: it holds in-app notices (e.g. timesheet approved/rejected, approval reminders). For important events the system can also send an email when Management has enabled the email feature.",
    )),
  ];
}

function dashboardGeneral(): (Paragraph | Table)[] {
  return [
    h1(t("2. Apa itu Dashboard", "2. What is the Dashboard")),
    p(t(
      "Dashboard adalah halaman pertama yang muncul setelah login (menu paling atas, ikon Dashboard). Fungsinya: memberi ringkasan cepat atas hal-hal yang paling penting bagi Anda — proyek aktif, antrian persetujuan, status tim, dan indikator keuangan — agar Anda tahu apa yang perlu ditindaklanjuti hari itu tanpa harus membuka banyak halaman.",
      "The Dashboard is the first page shown after login (top menu, Dashboard icon). Its purpose: give you a quick summary of what matters most to you — active projects, approval queues, team status, and financial indicators — so you know what needs action today without opening many pages.",
    )),
    p(t(
      "Isi dashboard berbeda untuk setiap role. Contoh di bawah membedah dashboard seorang Project Manager (PM), lalu Bagian 2.2 merangkum dashboard tiap role lainnya.",
      "The dashboard content differs for each role. The example below breaks down a Project Manager (PM) dashboard, then Section 2.2 summarizes each other role's dashboard.",
    )),

    h2(t("2.1 Membedah contoh dashboard Project Manager", "2.1 Breaking down the example Project Manager dashboard")),
    p(t("Pada contoh gambar (akun PM), kotak-kotak yang tampil adalah:", "In the example image (a PM account), the boxes shown are:")),
    labelled(t("Welcome banner", "Welcome banner"), t("Sapaan, role, tanggal, dan ringkasan singkat status hari ini.", "Greeting, role, date, and a short summary of today's status.")),
    labelled("Work Hours Compliance", t("Pencapaian jam kerja Anda minggu/bulan/tahun ini terhadap target.", "Your work-hours achievement this week/month/year against target.")),
    labelled("My Tasks", t("Daftar task yang ditugaskan ke Anda saat PM ikut menjadi resource proyek, beserta status dan tombol \"Log\" untuk mencatat jam kerja pada task.", "List of tasks assigned to you when the PM is staffed as a project resource, with status and a \"Log\" button to record hours on the task.")),
    labelled("Reports", t("Pintasan ke kumpulan laporan siap ekspor.", "Shortcut to the library of export-ready reports.")),
    labelled("Expenses Awaiting Approval", t("Jumlah dan nilai biaya proyek yang menunggu persetujuan Anda.", "Count and value of project expenses awaiting your approval.")),
    labelled("Approval Inbox", t("Ringkasan timesheet yang menunggu di-approve, dengan tombol \"Approve All\".", "Summary of timesheets awaiting approval, with an \"Approve All\" button.")),
    labelled(t("Inbox Detail", "Inbox Detail"), t("Pintasan membuka antrian persetujuan lengkap.", "Shortcut to open the full approval queue.")),
    labelled(t("Personal Time Sheet", "Personal Time Sheet"), t("Pintasan untuk mencatat jam kerja Anda sendiri.", "Shortcut to log your own working hours.")),
    labelled(t("Peringatan timesheet > 48 jam", "Timesheet > 48 hours alert"), t("Penanda jika ada timesheet yang sudah lama menunggu sehingga konsultan terblokir — perlu segera ditindak.", "A flag when timesheets have waited too long and consultants are blocked — needs prompt action.")),
    labelled("My Active Projects", t("Jumlah proyek yang Anda kelola.", "Number of projects you manage.")),
    labelled("My Team Size", t("Jumlah anggota tim pada proyek Anda dan status kelebihan beban.", "Number of team members on your projects and overload status.")),
    labelled("Weighted Margin", t("Margin keuntungan gabungan proyek-proyek Anda.", "Combined profit margin of your projects.")),
    labelled("Total Revenue", t("Total nilai kontrak proyek yang Anda kelola.", "Total contract value of the projects you manage.")),
    labelled(t("Revenue vs Profit (grafik)", "Revenue vs Profit (chart)"), t("Perbandingan nilai kontrak vs profit ter-realisasi per proyek.", "Contract value vs realized profit per project.")),
    labelled("My Team Utilization", t("Tabel anggota tim: proyek saat ini, rata-rata jam 7 hari, dan status.", "Team-member table: current project, 7-day average hours, and status.")),
  ];
}

function dashboardPerRole(): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    h2(t("2.2 Dashboard untuk setiap role", "2.2 Dashboard for each role")),
    p(t(
      "Berikut isi utama dashboard tiap role. Beberapa elemen keuangan disembunyikan untuk role yang tidak berhak melihat angka margin/biaya (mis. Principal, HR).",
      "Below is the main content of each role's dashboard. Some financial elements are hidden for roles that may not see margin/cost figures (e.g. Principal, HR).",
    )),
  ];

  const roleSections: { title: string; intro: string; items: [string, string][] }[] = [
    {
      title: t("Management (PMO Director)", "Management (PMO Director)"),
      intro: t("Pandangan eksekutif atas seluruh portofolio.", "Executive view across the whole portfolio."),
      items: [
        ["Active Projects / Total Revenue / Weighted Margin", t("KPI portofolio: jumlah proyek aktif, total nilai kontrak, dan margin tertimbang.", "Portfolio KPIs: active-project count, total contract value, and weighted margin.")],
        ["Projects at risk (margin < 10%)", t("Daftar proyek aktif dengan margin tipis.", "List of active projects with thin margins.")],
        ["Pending Approvals", t("Jumlah timesheet yang menunggu persetujuan.", "Count of timesheets awaiting approval.")],
        ["Cash Flow Forecast", t("Proyeksi penerimaan tagihan 6 bulan ke depan.", "6-month projected billing inflow.")],
        ["Profit Margin Trend", t("Tren biaya vs pendapatan bulanan.", "Monthly cost vs revenue trend.")],
        ["Project Status / Profitability by Project Type", t("Distribusi status proyek dan profit per jenis layanan.", "Project-status distribution and profit by service line.")],
        ["Top Projects by Margin / Recent Activity", t("Proyek dengan performa terbaik dan log aktivitas terbaru.", "Best-performing projects and the latest activity log.")],
      ],
    },
    {
      title: "Project Manager",
      intro: t("Fokus pada proyek yang dikelola dan antrian persetujuan (lihat rincian Bagian 2.1).", "Focused on managed projects and the approval queue (see Section 2.1 for details)."),
      items: [
        ["My Active Projects / My Team Size / Weighted Margin / Total Revenue", t("KPI portofolio pribadi PM.", "The PM's personal portfolio KPIs.")],
        ["My Tasks", t("Task yang ditugaskan ke Anda saat ikut menjadi resource proyek, lengkap dengan tombol \"Log\" untuk mencatat jam.", "Tasks assigned to you when staffed as a project resource, with a \"Log\" button to record hours.")],
        ["Approval Inbox + Approve All", t("Timesheet tim yang menunggu, bisa disetujui sekaligus.", "Team timesheets awaiting action, approvable in bulk.")],
        ["Expenses Awaiting Approval", t("Biaya proyek yang menunggu persetujuan.", "Project expenses awaiting approval.")],
        ["Revenue vs Profit / My Team Utilization", t("Grafik profit per proyek dan tabel utilisasi tim.", "Per-project profit chart and team-utilization table.")],
      ],
    },
    {
      title: "Sales",
      intro: t("Fokus pada pipeline penjualan dan proyek yang dimiliki.", "Focused on the sales pipeline and owned projects."),
      items: [
        ["My Projects / Total Revenue / Pipeline Value / Weighted Margin", t("KPI penjualan pribadi.", "Personal sales KPIs.")],
        ["Projects awaiting PM assignment", t("Proyek Anda yang masih DRAFT menunggu penugasan PM.", "Your DRAFT projects awaiting PM assignment.")],
        ["Revenue by Client / Status Distribution", t("Klien teratas dan distribusi status proyek.", "Top clients and project-status distribution.")],
        ["Conversion Funnel / Win-Loss Analysis", t("Tahapan konversi lead dan analisis menang/kalah.", "Lead conversion stages and win/loss analysis.")],
        ["Profitability Trend (6 Months) / My Project List", t("Tren profitabilitas dan daftar proyek terbaru.", "Profitability trend and recent project list.")],
      ],
    },
    {
      title: t("Konsultan & Technical Writer", "Konsultan & Technical Writer"),
      intro: t("Fokus pada pencatatan jam dan task pribadi.", "Focused on logging hours and personal tasks."),
      items: [
        ["Quick Log", t("Kartu besar untuk mencatat jam hari ini (pilih proyek/task), dengan progres target 8 jam.", "Large card to log today's hours (pick project/task), with an 8-hour target progress.")],
        ["Approved (30d) / Pending Approval / Rejected / Total Entries", t("Ringkasan status timesheet pribadi.", "Summary of personal timesheet status.")],
        ["Approved Hours — Last 14 Days", t("Grafik jam disetujui harian.", "Daily approved-hours chart.")],
        ["My Tasks / My Report Assignments", t("Task yang ditugaskan dan penugasan laporan (BAST, dll).", "Assigned tasks and report assignments (BAST, etc.).")],
        ["My Expenses / Recent Timesheets", t("Ringkasan biaya pribadi dan 10 timesheet terbaru.", "Personal expense summary and the latest 10 timesheets.")],
      ],
    },
    {
      title: "Admin Project",
      intro: t("Fokus pada penutupan dokumen proyek.", "Focused on project closing documents."),
      items: [
        ["Completed projects > 3 days without closing docs", t("Peringatan unggahan BAST/Invoice yang terlambat.", "Alert for overdue BAST/Invoice uploads.")],
        ["Awaiting Closing Docs / Total Awaiting Value / Closed Projects / Active Projects", t("KPI status dokumentasi proyek.", "Project documentation-status KPIs.")],
        ["Projects Awaiting Closing Documents", t("Tabel dengan aksi \"Upload Docs\" untuk BAST dan Invoice.", "Table with \"Upload Docs\" actions for BAST and Invoice.")],
        ["Recently Closed", t("Daftar proyek terakhir yang berhasil ditutup.", "List of the latest successfully closed projects.")],
      ],
    },
    {
      title: "Finance",
      intro: t("Menggunakan tampilan bergaya Management, fokus penagihan & laporan (akses tulis terbatas).", "Uses a Management-style view, focused on billing & reports (limited write access)."),
      items: [
        ["Reports / Invoice Planning / Invoice Settings", t("Pintasan ke laporan, rencana penagihan, dan pengaturan invoice.", "Shortcuts to reports, billing plan, and invoice settings.")],
        ["KPI portofolio + tren keuangan", t("KPI dan grafik keuangan seperti tampilan Management.", "Financial KPIs and charts as in the Management view.")],
      ],
    },
    {
      title: "HR",
      intro: t("Fokus pada SDM: headcount, cuti, skill, dan utilisasi.", "Focused on people: headcount, leave, skills, and utilization."),
      items: [
        ["Active Headcount / On Leave Today / New Joiners (30d) / Skill Gaps", t("KPI ketenagakerjaan utama.", "Key workforce KPIs.")],
        ["Headcount per Business Unit / Role Distribution / Seniority Pyramid", t("Sebaran karyawan per BU, role, dan senioritas.", "Employee distribution by BU, role, and seniority.")],
        ["Team Utilization Trend / Bench & Low Utilization", t("Tren utilisasi tim dan daftar yang idle.", "Team-utilization trend and idle list.")],
        ["Upcoming Leaves / Skill Gaps / New Joiners / Quick Links", t("Cuti mendatang, kesenjangan skill, karyawan baru, dan pintasan.", "Upcoming leaves, skill gaps, new joiners, and shortcuts.")],
      ],
    },
    {
      title: t("Principal (Konsultan / Technical Writer / Admin Project)", "Principal (Konsultan / Technical Writer / Admin Project)"),
      intro: t("Fokus pada pengawasan tim binaan (tanpa angka keuangan).", "Focused on supervising direct reports (no financial figures)."),
      items: [
        ["Pending approvals", t("Permintaan PM untuk menugaskan binaan ke proyek (Accept/Decline).", "PM requests to assign supervisees to projects (Accept/Decline).")],
        ["Projects needing [Role]", t("Proyek yang butuh staf; Principal bisa \"Propose\" orang.", "Projects needing staff; the Principal can \"Propose\" a person.")],
        ["Your team", t("Grid anggota tim langsung di bawah supervisi.", "Grid of direct reports under supervision.")],
        ["My Expenses / Work Hours", t("Biaya pribadi dan kepatuhan jam kerja pribadi.", "Personal expenses and personal work-hours compliance.")],
      ],
    },
    {
      title: "Site Admin",
      intro: t("Fokus pada administrasi sistem.", "Focused on system administration."),
      items: [
        ["Users", t("Jumlah akun aktif vs total, dengan pintasan \"Manage Users\".", "Active vs total accounts, with a \"Manage Users\" shortcut.")],
        ["Audit Log", t("Total kejadian tercatat, dengan pintasan \"Open Audit Log\".", "Total recorded events, with an \"Open Audit Log\" shortcut.")],
        ["Recent Activity", t("Umpan 8 kejadian terbaru dari log audit sistem.", "Feed of the latest 8 events from the system audit log.")],
      ],
    },
  ];

  for (const r of roleSections) {
    out.push(h3(r.title));
    out.push(p(r.intro, { italics: true }));
    for (const [label, desc] of r.items) out.push(labelled(label, desc));
  }
  return out;
}

function sidebarSection(): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [
    h1(t("3. Menu di Panel Kiri (Sidebar)", "3. Left-Side Menu (Sidebar)")),
    p(t(
      "Menu di sebelah kiri dikelompokkan ke beberapa bagian. Menu hanya muncul untuk role yang berhak. Tabel di tiap bagian menyebutkan fungsi menu dan role yang dapat melihatnya.",
      "The left-side menu is grouped into sections. A menu only appears for roles that are entitled to it. The table in each section lists the menu's function and the roles that can see it.",
    )),
  ];
  const groups = menuGroups();
  let n = 0;
  for (const g of groups) {
    n += 1;
    out.push(h2(`3.${n} ${g.heading}`));
    out.push(table(
      [t("Menu", "Menu"), t("Fungsi", "Function"), t("Role yang bisa melihat", "Roles that can see it")],
      g.items.map((it) => [it.label, it.fn, whoSees(it.roles)]),
      [20, 50, 30],
    ));
    out.push(spacer());
  }
  return out;
}

function projectNotesSection(): (Paragraph | Table)[] {
  return [
    h1(t("4. Catatan: Jenis Project & Status", "4. Notes: Project Kinds & Status")),
    p(t(
      "Bagian ini melengkapi panduan menu dengan dua hal yang memengaruhi tampilan di dalam detail proyek: jenis project non-klien (internal) dan status PAUSE.",
      "This section supplements the menu guide with two things that affect what you see inside a project's detail page: non-client (internal) project kinds and the PAUSE status.",
    )),

    h2(t("4.1 Project non-klien (internal)", "4.1 Non-client (internal) projects")),
    p(t(
      "Selain project untuk klien, ada jenis project non-komersial yang tidak menagih ke klien: INTERNAL, PRESALES, dan TRAINING. Project ini tetap perlu dipantau effort (mandays) dan biayanya walaupun tidak menghasilkan pendapatan. Alur statusnya sama (DRAFT → OBSERVATION → ACTIVE → COMPLETE → CLOSED); yang berbeda hanya syarat penagihan dan BAST yang dilewati.",
      "Besides client projects, there are non-commercial project kinds with no client to invoice: INTERNAL, PRESALES, and TRAINING. These still need their effort (mandays) and cost tracked even though they earn no revenue. The status flow is the same (DRAFT → OBSERVATION → ACTIVE → COMPLETE → CLOSED); only the billing and BAST requirements are waived.",
    )),
    h3(t("Jenis project non-klien", "Non-client project kinds")),
    labelled("INTERNAL", t("pekerjaan internal perusahaan, mis. pengembangan tools/produk internal, riset, atau kegiatan operasional tim.", "internal company work, e.g. building internal tools/products, research, or team operations.")),
    labelled("PRESALES", t("aktivitas sebelum kontrak, mis. penyusunan proposal, Proof of Concept (PoC), atau demo untuk calon klien.", "pre-contract activity, e.g. preparing proposals, a Proof of Concept (PoC), or a demo for a prospective client.")),
    labelled("TRAINING", t("kegiatan pelatihan atau sertifikasi internal tim.", "internal team training or certification activities.")),
    h3(t("Cara membuat", "How to create")),
    bullet(t(
      "Hanya Management (atau Super Admin) yang dapat menetapkan project sebagai non-klien. Pada Projects > New Project, pilih client khusus bernama \"Internal\" — jenis project otomatis menjadi Internal dan kolom nilai berubah menjadi Internal Budget.",
      "Only Management (or Super Admin) can mark a project as non-client. On Projects > New Project, choose the special client named \"Internal\" — the project kind automatically becomes Internal and the value field changes to Internal Budget.",
    )),
    bullet(t(
      "Client tetap dipilih (yaitu client \"Internal\"); dokumen komersial seperti SPK, kontrak, dan PPN tidak digunakan. Biaya internal tetap dihitung dari Estimated Cost serta Timesheet dan Expense yang sudah APPROVED.",
      "A client is still selected (the \"Internal\" client); commercial documents such as the SPK, contract, and VAT are not used. Internal cost is still computed from Estimated Cost plus APPROVED Timesheets and Expenses.",
    )),
    h3(t("Yang berbeda di tampilan", "What looks different")),
    bullet(t(
      "Tab Billing dan Report disembunyikan untuk project non-klien karena tidak ada penagihan ke klien.",
      "The Billing and Report tabs are hidden for non-client projects because there is no client billing.",
    )),
    bullet(t(
      "Tab Financials tetap tampil, tetapi berubah menjadi pemantauan biaya internal: Budget (Estimated Cost), Actual Cost, Accrued Cost, Remaining Budget, Burn Rate, dan Forecasted Final Cost — tanpa angka pendapatan, profit, atau margin.",
      "The Financials tab stays visible but changes into internal cost tracking: Budget (Estimated Cost), Actual Cost, Accrued Cost, Remaining Budget, Burn Rate, and Forecasted Final Cost — with no revenue, profit, or margin figures.",
    )),
    bullet(t(
      "Saat ACTIVE syarat Contract Value > 0 dan total Billing Milestone 100% dilewati; saat COMPLETE tidak perlu menutup Billing Milestone PLANNED dan tidak perlu dokumen BAST.",
      "At ACTIVE the Contract Value > 0 and 100% Billing Milestone requirements are waived; at COMPLETE there is no need to close PLANNED Billing Milestones and no BAST document is required.",
    )),

    h2(t("4.2 Status PAUSE (jeda sementara)", "4.2 PAUSE status (temporary hold)")),
    p(t(
      "PAUSE dipakai bila project dihentikan sementara — misalnya menunggu konfirmasi klien, dokumen, atau pembayaran — tanpa membatalkannya. Setelah hambatan selesai, project dilanjutkan kembali ke ACTIVE.",
      "PAUSE is used when a project is temporarily halted — for example waiting on client confirmation, documents, or payment — without cancelling it. Once the blocker is resolved, the project resumes to ACTIVE.",
    )),
    bullet(t(
      "Selama PAUSE, idealnya tidak ada jam kerja atau biaya baru yang dicatat sampai project dilanjutkan.",
      "While PAUSED, ideally no new work hours or costs are logged until the project resumes.",
    )),
    bullet(t(
      "PAUSE bersifat sementara dan berbeda dari COMPLETE atau CLOSED; seluruh data project tetap utuh.",
      "PAUSE is temporary and is not the same as COMPLETE or CLOSED; all project data stays intact.",
    )),
    bullet(t(
      "Halaman project menampilkan banner penjelasan selama status PAUSE agar tim memahami situasinya.",
      "The project page shows an explanatory banner while the status is PAUSE so the team understands the situation.",
    )),
  ];
}

function matrixSection(): (Paragraph | Table)[] {
  const headerLabels = [
    t("Menu", "Menu"),
    "Mgmt", "PM", "Sales", "Kon/TW", "Adm.Prj", "Finance", "HR", "Princ.", "Site Adm",
  ];
  const rows = matrixRows().map((m) => {
    const checks = ROLE_ORDER.map((rc) => (m.roles.has(rc) ? "✓" : "–"));
    return [m.label, ...checks];
  });
  const widths = [22, ...Array(9).fill((100 - 22) / 9)];
  // Center the check columns
  const head = new TableRow({
    tableHeader: true,
    children: headerLabels.map((h, i) =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: "auto", fill: ACCENT },
        width: { size: widths[i]!, type: WidthType.PERCENTAGE },
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        children: [new Paragraph({
          alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
          children: [new TextRun({ text: h, font: FONT, size: 16, bold: true, color: "FFFFFF" })],
        })],
      }),
    ),
  });
  const bodyRows = rows.map((r, idx) => new TableRow({
    children: r.map((c, i) => cell(c, {
      shade: idx % 2 === 0 ? "FFFFFF" : STRIPE,
      widthPct: widths[i],
      size: 16,
      align: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
    })),
  }));
  const matrix = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      left:   { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      right:  { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
      insideVertical:   { style: BorderStyle.SINGLE, size: 4, color: BORDER },
    },
    rows: [head, ...bodyRows],
  });
  return [
    h1(t("5. Tabel Matriks: Menu vs Role", "5. Matrix: Menu vs Role")),
    p(t(
      "Tanda \u2713 berarti role tersebut melihat menu itu; tanda \u2013 berarti tidak. \"Kon/TW\" = Konsultan & Technical Writer; \"Princ.\" mencakup ketiga jenis Principal.",
      "A \u2713 means that role sees the menu; a \u2013 means it does not. \"Kon/TW\" = Konsultan & Technical Writer; \"Princ.\" covers all three Principal types.",
    )),
    spacer(),
    matrix,
  ];
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function buildDoc(lang: Lang): Promise<void> {
  LANG = lang;
  const doc = new Document({
    creator: "SecureProfit Hub",
    title: t("Panduan Dashboard & Menu SecureProfit Hub", "SecureProfit Hub Dashboard & Menu Guide"),
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } },
        children: [
          ...cover(),
          ...intro(),
          ...dashboardGeneral(),
          ...dashboardPerRole(),
          ...sidebarSection(),
          ...projectNotesSection(),
        ],
      },
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children: [
          ...matrixSection(),
        ],
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  const out = resolve(EXPORTS_DIR, `SecureProfitHub-Dashboard-Menu-Guide-${lang === "id" ? "ID" : "EN"}.docx`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buf);
  console.log(`Wrote ${out} (${buf.length.toLocaleString()} bytes)`);
}

async function main() {
  await buildDoc("id");
  await buildDoc("en");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
