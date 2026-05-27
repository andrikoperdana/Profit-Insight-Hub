/**
 * Generate dokumen Word "Flow Proses SecureProfit Hub" yang berisi:
 *   1. Pendahuluan
 *   2. Lifecycle proyek end-to-end (Sales intake -> Draft -> Observation -> Active -> Complete -> Closed)
 *   3. Fitur Workstreams (setup, dampak ke Resources/Tasks/Expenses/Billing/Timesheet)
 *   4. Manual penggunaan per role (Management, PM, Sales, Konsultan, Technical Writer,
 *      Admin Project, Principal, Finance, HR, Site Admin)
 *
 * Run: `pnpm --filter @workspace/scripts run flow-doc`
 * Output: ./scripts/exports/SecureProfitHub-Flow-Proses.docx
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, PageOrientation,
} from "docx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FONT = "Calibri";
const ACCENT = "0F766E";       // teal-700
const LIGHT  = "E6FFFA";       // teal-50
const STRIPE = "F1F5F9";       // slate-100
const BORDER = "CBD5E1";       // slate-300

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
function spacer(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: "" })] });
}

function cell(text: string, opts: { bold?: boolean; shade?: string; widthPct?: number } = {}): TableCell {
  return new TableCell({
    shading: opts.shade ? { type: ShadingType.CLEAR, color: "auto", fill: opts.shade } : undefined,
    width: opts.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, font: FONT, size: 20, bold: opts.bold })],
      }),
    ],
  });
}

function table(headers: string[], rows: string[][], widthsPct?: number[]): Table {
  const headWhite = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: "auto", fill: ACCENT },
        width: widthsPct?.[i] ? { size: widthsPct[i]!, type: WidthType.PERCENTAGE } : undefined,
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [
          new Paragraph({
            children: [new TextRun({ text: h, font: FONT, size: 20, bold: true, color: "FFFFFF" })],
          }),
        ],
      }),
    ),
  });
  const bodyRows = rows.map((r, idx) => new TableRow({
    children: r.map((c, i) => cell(c, { shade: idx % 2 === 0 ? "FFFFFF" : STRIPE, widthPct: widthsPct?.[i] })),
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
    rows: [headWhite, ...bodyRows],
  });
}

// ---------------------------------------------------------------------------
// Konten dokumen
// ---------------------------------------------------------------------------

function coverSection(): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 200 },
      children: [new TextRun({ text: "SecureProfit Hub", bold: true, size: 56, color: ACCENT, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "Dokumen Flow Proses End-to-End", size: 32, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 1200 },
      children: [new TextRun({ text: "Lifecycle Proyek • Fitur Workstreams • Manual per Role", italics: true, size: 24, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Versi 1.0", size: 22, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }), size: 22, font: FONT })],
    }),
    new Paragraph({ children: [new TextRun({ text: "", break: 1 })], pageBreakBefore: true }),
  ];
}

function bagian1Pendahuluan(): (Paragraph | Table)[] {
  return [
    h1("1. Pendahuluan"),
    p("SecureProfit Hub adalah aplikasi internal IT Security Asia (ITSec Asia) untuk mengelola siklus proyek konsultansi keamanan informasi — mulai dari intake oleh tim Sales, hand-over ke Project Manager, eksekusi delivery oleh konsultan dan technical writer, sampai penutupan proyek dan pelaporan PPN."),
    p("Dokumen ini berisi tiga bagian utama:"),
    bullet("Bagian 2 — Lifecycle proyek end-to-end: tahapan status proyek dan siapa berperan di mana."),
    bullet("Bagian 3 — Fitur Workstreams: cara mengaktifkan, mengelola, dan dampaknya ke Resources / Tasks / Expenses / Billing / Timesheet."),
    bullet("Bagian 4 — Manual penggunaan per role: ringkasan akses, menu, fitur utama, dan batasan untuk setiap role."),
    spacer(),
    p("Asumsi pembaca: pengguna telah memiliki akun aktif dan dapat login melalui halaman /login menggunakan kredensial yang diberikan Site Administrator."),
  ];
}

function bagian2Lifecycle(): (Paragraph | Table)[] {
  return [
    h1("2. Lifecycle Proyek End-to-End"),
    p("Proyek mengalir melalui 6 status. Transisi status dilakukan oleh role tertentu pada momen tertentu. Server menolak transisi yang tidak sah (HTTP 409)."),
    h2("2.1 Diagram alur status"),
    p("DRAFT  →  OBSERVATION  →  ACTIVE  →  COMPLETE  →  CLOSED", { bold: true }),
    p("Status tambahan: PAUSE (dari ACTIVE, dapat kembali ke ACTIVE).", { italics: true }),

    h2("2.2 Ringkasan tahapan dan PIC"),
    table(
      ["Tahap", "PIC utama", "Aksi inti"],
      [
        ["DRAFT (Intake)", "Sales", "Mengisi 4 field di /projects/new (kode, nama, klien, nilai kontrak). Server memaksa status=DRAFT, salesId=user, pmId=null."],
        ["Assign PM", "Management", "Pada DRAFT yang belum punya PM, MGMT memilih Project Manager. Jika sudah ada PM, server tolak 409."],
        ["OBSERVATION", "Project Manager", "PM membuka DraftCompletionCard, mengisi deskripsi, tanggal mulai/akhir, contract value, mandays, estimated cost. Setelah lengkap, proyek otomatis pindah ke OBSERVATION."],
        ["ACTIVE", "Project Manager", "PM/MGMT mengubah status ke ACTIVE saat eksekusi dimulai. Timesheet dan expense mulai berkontribusi ke actualCost & margin."],
        ["PAUSE (opsional)", "PM / MGMT", "Dari ACTIVE jika proyek tertahan (pending dokumen klien, force majeure, dsb). Bisa kembali ke ACTIVE."],
        ["COMPLETE", "Project Manager", "Pekerjaan teknis selesai, menunggu closing administratif (BAST, invoice final). Admin Project mendapat alert >3 hari."],
        ["CLOSED", "Management / Admin Project", "Semua closing checklist terverifikasi. Proyek terkunci untuk editing."],
      ],
      [18, 22, 60],
    ),

    h2("2.3 Detail per tahap"),
    h3("2.3.1 Intake oleh Sales (DRAFT)"),
    bullet("Buka menu Projects → tombol \"Project Baru\"."),
    bullet("Isi: kode proyek (unik), nama, klien (pilih dari dropdown atau buat baru via menu Clients), nilai kontrak."),
    bullet("Submit. Server otomatis menyetel status=DRAFT, salesId=user login, pmId=kosong."),
    bullet("Sales BISA mengedit field {code, name, description, clientId, contractValue} selama proyek masih DRAFT."),

    h3("2.3.2 Assignment PM oleh Management"),
    bullet("MGMT membuka detail proyek DRAFT, memilih PM dari daftar user role PROJECT_MANAGER."),
    bullet("Sistem mencegah PM ganda: jika pmId sudah terisi, request berikutnya ditolak 409."),
    bullet("Setelah PM ter-assign, proyek menunggu PM melengkapi data."),

    h3("2.3.3 Project Manager melengkapi proyek"),
    bullet("Pada tab Overview, PM melihat banner kuning \"Data esensial belum lengkap\" + DraftCompletionCard."),
    bullet("PM mengisi: deskripsi, startDate, endDate, contractValue (kalau belum), estimatedCost, plannedMandays."),
    bullet("Klik \"Selesaikan Draft\" → server validasi → status otomatis OBSERVATION."),
    bullet("Setelah OBSERVATION, semua tab proyek (Timeline, Tasks, Resources, RAID, Expenses, Billing, Financials) aktif."),

    h3("2.3.4 Eksekusi (OBSERVATION → ACTIVE)"),
    bullet("PM menambahkan tim di tab Resources (Admin Project, Konsultan, Technical Writer, Other)."),
    bullet("PM membuat WBS di tab Tasks (manual atau dari Task Template) lalu menjadwalkan di tab Timeline (Gantt drag & drop)."),
    bullet("PM mengisi Billing tab (Termin pembayaran / SPK). Total persentase harus 100% (banner peringatan jika tidak)."),
    bullet("Konsultan / Technical Writer mulai log timesheet harian atau lewat \"Entry Mingguan\" (grid Sen–Jum)."),
    bullet("Status diubah ke ACTIVE oleh PM / MGMT saat kickoff resmi."),

    h3("2.3.5 Monitoring selama ACTIVE"),
    bullet("Timesheet: konsultan submit (DRAFT → SUBMITTED), PM approve/reject. Auto-APPROVED untuk PM/MGMT."),
    bullet("Expense: siapa pun dengan akses proyek dapat submit; APPROVED oleh PM/MGMT. Hanya APPROVED yang menambah actualCost."),
    bullet("RAID: PM mencatat Risk / Assumption / Issue / Dependency dengan owner, mitigation, due date."),
    bullet("Financials: dashboard menampilkan actualCost = resourceCost + additionalCost, margin = (contractValue − actualCost) / contractValue × 100%."),
    bullet("Billing: PM mengubah status milestone PLANNED → INVOICED → PAID; sistem auto-stempel tanggal."),

    h3("2.3.6 PAUSE (opsional)"),
    bullet("PM/MGMT mengubah status ACTIVE → PAUSE jika ada blocker eksternal (pending dokumen klien, perubahan scope, force majeure)."),
    bullet("Resource Planning tetap menampilkan komitmen mandays, tetapi cell di-flag agar PM tahu kapasitas tertahan."),
    bullet("Kembali ke ACTIVE dilakukan PM/MGMT setelah blocker hilang."),

    h3("2.3.7 COMPLETE"),
    bullet("Setelah delivery teknis selesai, PM ubah status ke COMPLETE."),
    bullet("Admin Project mendapat alert pada dashboard untuk proyek COMPLETE > 3 hari yang belum di-closing."),
    bullet("Closing checklist (BAST, invoice final, BA serah-terima dokumen, dll) harus terverifikasi."),

    h3("2.3.8 CLOSED"),
    bullet("Semua item checklist closing terverifikasi → MGMT/Admin Project ubah status ke CLOSED."),
    bullet("Proyek terkunci untuk perubahan; tetap dapat dibaca untuk audit dan reporting."),
    bullet("Data tetap masuk Reports historis dan VAT Recap."),

    h2("2.4 Matriks aturan PATCH /api/projects/:id"),
    table(
      ["Role", "Field yang bisa diubah", "Catatan"],
      [
        ["SALES (proyek sendiri)", "DRAFT: code, name, description, clientId, contractValue", "Status lain: field sama, tanpa ubah orang/klien/status."],
        ["PROJECT_MANAGER (proyek sendiri)", "Semua field kecuali salesId, pmId, clientId", "Hanya proyek dengan pmId = user.id."],
        ["MANAGEMENT", "Semua field", "Setelan pmId pada DRAFT yang sudah punya PM ditolak 409."],
        ["FINANCE", "Read-only", "Tidak dapat PATCH; hanya akses upload INVOICE/CONTRACT."],
        ["HR", "Tidak ada akses", "GET /api/projects mengembalikan [] untuk HR."],
        ["PRINCIPAL_*", "Tidak ada akses tulis", "Visibilitas terbatas dan finansial disembunyikan."],
      ],
      [22, 38, 40],
    ),
  ];
}

function bagian3Workstreams(): (Paragraph | Table)[] {
  return [
    new Paragraph({ children: [new TextRun({ text: "", break: 1 })], pageBreakBefore: true }),
    h1("3. Fitur Workstreams"),
    p("Workstreams adalah pembagian satu proyek menjadi beberapa jalur kerja paralel di bawah satu SPK. Contoh umum: dalam 1 SPK keamanan tahunan, terdapat 3 workstream — Pentest, GRC, dan Threat Modeling — yang dikerjakan tim berbeda, dengan budget, target, dan invoice tersendiri, namun tetap dilaporkan sebagai satu proyek."),
    p("Manfaat utama:"),
    bullet("Satu kontrak = satu proyek, beberapa jalur eksekusi paralel."),
    bullet("Alokasi budget & mandays per workstream, dengan total tetap = nilai kontrak."),
    bullet("Setiap workstream dapat diisi BU (Business Unit) berbeda — Pentest, GRC, Threat Hunting."),
    bullet("Billing milestone dapat dipisah per workstream untuk SPK termin per pekerjaan."),
    bullet("Timesheet, expense, dan task dapat ditandai per workstream untuk pelaporan margin per jalur."),

    h2("3.1 Cara mengaktifkan Workstreams"),
    bullet("Buka detail proyek (status OBSERVATION / ACTIVE) sebagai PM atau MGMT."),
    bullet("Pada tab Overview, aktifkan toggle \"Gunakan Workstreams\" (field useWorkstreams). Default: nonaktif."),
    bullet("Setelah aktif, muncul section \"Workstreams\" di tab Overview dan dropdown Workstream pada form Resources, Tasks, Expenses, Billing, dan Timesheet."),
    bullet("Toggle dapat dimatikan kembali (workstream tersimpan, tetapi field workstreamId di entity terkait menjadi opsional di UI)."),

    h2("3.2 Membuat dan mengelola Workstream"),
    bullet("Tambah baris workstream baru: isi Kode (unik dalam proyek, contoh PT/GRC/TM), Nama, Business Unit (opsional), Allocation %, Planned Mandays, Estimated Cost, Start/End date, Status."),
    bullet("Total Allocation % idealnya 100 (banner peringatan jika tidak)."),
    bullet("Edit / hapus workstream: tombol aksi per baris. Hapus akan menghapus relasi workstreamId di entity terkait (set ke null, bukan menghapus entity)."),
    bullet("Status workstream: ACTIVE / PAUSE / DONE."),

    h2("3.3 Dampak ke modul lain"),
    table(
      ["Modul", "Field workstreamId", "Perilaku UI", "Dampak laporan"],
      [
        ["Resources", "ProjectResource.workstreamId (opsional)", "Pilih workstream saat assign konsultan. Capacity planning bisa di-group per workstream.", "Resource cost dapat dipecah per workstream."],
        ["Tasks", "Task.workstreamId (opsional)", "Pilih workstream saat buat task. Gantt dapat di-filter per workstream.", "Progress per workstream terpisah."],
        ["Timesheets", "Timesheet.workstreamId (opsional)", "Pilih workstream saat log harian / bulk weekly. Bulk endpoint /api/timesheets/bulk menerima workstreamId per entry.", "Approved hours dialokasikan ke workstream → margin per workstream."],
        ["Expenses", "ProjectExpense.workstreamId (opsional)", "Pilih workstream saat submit expense.", "Approved expense menambah additionalCost per workstream."],
        ["Billing Milestones", "BillingMilestone.workstreamId (opsional)", "Pilih workstream saat buat milestone (mis. SPK termin tiap workstream). Banner total % berlaku per proyek (bukan per workstream).", "Cash inflow forecast dapat di-group per workstream."],
      ],
      [16, 22, 34, 28],
    ),

    h2("3.4 Validasi server"),
    bullet("Endpoint terkait memvalidasi workstreamId melalui helper validateWorkstreamId — workstream harus milik proyek yang sama. Jika tidak, server tolak 400."),
    bullet("workstreamId yang tidak diisi (undefined) di payload tidak mengubah nilai yang sudah ada — preserve."),
    bullet("workstreamId = null secara eksplisit akan menghapus assignment workstream pada entity tersebut."),

    h2("3.5 Contoh skenario nyata"),
    p("Bank Nusantara — \"Annual Security Assurance\" (1 SPK, 3 workstream):", { bold: true }),
    bullet("Workstream PT — Pentest Internet Banking (BU: Pentest, 40%)."),
    bullet("Workstream GRC — ISO 27001 Surveillance Audit (BU: GRC, 35%)."),
    bullet("Workstream TM — Threat Modeling Core Banking (BU: Threat Hunting, 25%)."),
    p("Setiap workstream punya billing milestone tersendiri (mis. Pentest 40%, GRC 35%, TM 25% — total 100%), resource tim berbeda, dan task list independen. Margin proyek tetap dihitung agregat, tetapi MGMT dapat melihat kontribusi tiap workstream."),
  ];
}

interface RoleDef {
  title: string;
  ringkasan: string;
  menu: string[];
  fitur: { fitur: string; detail: string }[];
  batasan?: string[];
}

const ROLES: RoleDef[] = [
  {
    title: "4.1 Management (PMO Director)",
    ringkasan: "Akses tertinggi atas operasional & finansial. Bertanggung jawab atas assignment PM, persetujuan akhir, monitoring margin lintas BU, dan pelaporan PPN.",
    menu: ["Dashboard eksekutif", "Projects (semua)", "Clients", "Timesheets (approve)", "Resource Planning", "Skill Matrix", "Task Templates", "Reports", "VAT Recap", "Settings"],
    fitur: [
      { fitur: "Assign PM ke proyek DRAFT", detail: "Memilih Project Manager untuk proyek hasil intake Sales. Server tolak 409 jika sudah ada PM." },
      { fitur: "Edit penuh proyek", detail: "Mengubah seluruh field termasuk salesId/pmId/clientId/contractValue/status." },
      { fitur: "Approve / reject timesheet & expense", detail: "Pada semua proyek; expense MGMT auto-APPROVED saat submit." },
      { fitur: "Kelola Billing Milestone (termasuk per workstream)", detail: "Membuat termin, ubah status PLANNED→INVOICED→PAID; auto-stamp tanggal." },
      { fitur: "Aktifkan Workstreams pada proyek", detail: "Toggle useWorkstreams + kelola daftar workstream lintas BU." },
      { fitur: "VAT Recap PPN 11%", detail: "Rekap 12 bulan: DPP, PPN dipungut, PPN dibayar, outstanding; export CSV." },
      { fitur: "Reports lengkap", detail: "10 report siap pakai + export CSV/XLSX/PDF." },
      { fitur: "Resource Planning lintas BU", detail: "Alokasi mandays per user per minggu, color-coded." },
    ],
    batasan: ["Tidak mengelola User, Skills, Business Units (domain Site Admin)."],
  },
  {
    title: "4.2 Project Manager",
    ringkasan: "Pemilik proyek setelah handover dari Sales. Bertanggung jawab atas detail proyek, staffing, monitoring delivery, dan approval timesheet/expense pada proyek yang dipegangnya.",
    menu: ["Dashboard PM", "Projects (yang dipegang)", "Timesheets (approve)", "Resource Planning", "Skill Matrix", "Task Templates", "Reports", "Settings"],
    fitur: [
      { fitur: "Lengkapi proyek DRAFT", detail: "Mengisi DraftCompletionCard sampai proyek pindah ke OBSERVATION." },
      { fitur: "Kelola Workstreams", detail: "Aktifkan toggle useWorkstreams, tambah/edit/hapus workstream pada proyek sendiri." },
      { fitur: "Kelola Resources", detail: "Tambah/ubah Admin Project, Konsultan, Technical Writer, Other Resources, termasuk workstream assignment." },
      { fitur: "Kelola Tasks & Gantt", detail: "Buat WBS, drag-drop jadwal di Gantt, set dependency, apply Task Template." },
      { fitur: "Approve timesheet & expense", detail: "Pada proyek sendiri; menerima alert pending expense di dashboard." },
      { fitur: "Kelola Billing Milestone", detail: "Termasuk milestone per workstream untuk SPK termin per pekerjaan." },
      { fitur: "RAID Log", detail: "Catat Risk/Assumption/Issue/Dependency dengan owner, mitigation, due date." },
      { fitur: "Reports (scoped)", detail: "Akses Reports yang otomatis di-filter pmId = user.sub." },
    ],
    batasan: ["Tidak dapat ubah salesId / pmId / clientId proyek.", "Tidak dapat assign PM ke proyek lain."],
  },
  {
    title: "4.3 Sales",
    ringkasan: "Pintu masuk proyek: intake klien, pengisian proposal awal, monitoring pipeline.",
    menu: ["Dashboard Sales", "Projects (yang diinput)", "Clients", "Settings"],
    fitur: [
      { fitur: "Buat proyek baru (DRAFT)", detail: "Form 4 field: kode, nama, klien, nilai kontrak. Status & salesId di-set server." },
      { fitur: "Edit proyek DRAFT sendiri", detail: "Mengubah code/name/description/clientId/contractValue selama masih DRAFT." },
      { fitur: "Edit terbatas pasca-DRAFT", detail: "Field sama, tanpa ubah orang/klien/status." },
      { fitur: "Kelola Klien", detail: "CRUD klien (nama, contact person, email, phone, industry)." },
      { fitur: "Pipeline & revenue dashboard", detail: "Pipeline, revenue-by-client, status pie, 6-month profitability trend." },
    ],
    batasan: ["Tidak dapat assign PM, kelola resource, atau approve timesheet."],
  },
  {
    title: "4.4 Konsultan / Technical Writer",
    ringkasan: "Eksekutor delivery. Tugas utama: kerjakan task dan log timesheet harian / mingguan.",
    menu: ["Dashboard pribadi", "Projects (yang di-assign atau pernah log)", "Timesheets", "Skill Matrix (read)", "Settings"],
    fitur: [
      { fitur: "Log timesheet harian", detail: "Pilih proyek, tanggal, jam, deskripsi, (opsional) task, (opsional) workstream. Status DRAFT atau SUBMITTED." },
      { fitur: "Entry Mingguan (bulk)", detail: "Grid project × Sen–Jum di /timesheets. Submit hingga 50 entry sekaligus, mendukung workstreamId per entry." },
      { fitur: "Log Leave", detail: "Catat cuti/sakit/training/unpaid/other untuk overlay di Resource Planning." },
      { fitur: "Lihat & ubah status task", detail: "Mengubah status task (TODO/IN_PROGRESS/DONE) dan log waktu task (TaskTimeLog)." },
      { fitur: "Dashboard pribadi", detail: "Welcome banner, CTA \"Log Today's Timesheet\", grafik 14 hari, recent submissions, MyTasksCard." },
    ],
    batasan: ["Tidak dapat approve timesheet siapa pun.", "Tidak dapat ubah field proyek atau billing."],
  },
  {
    title: "4.5 Admin Project",
    ringkasan: "Operator dokumen proyek: BAST, invoice, kontrak, dokumen serah-terima.",
    menu: ["Dashboard Admin", "Projects (di-assign sebagai Admin Project)", "Documents", "Settings"],
    fitur: [
      { fitur: "Upload / hapus dokumen", detail: "BAST, INVOICE, CONTRACT, REPORT, OTHER (base64 attachment)." },
      { fitur: "Catat invoice", detail: "Nomor invoice, jumlah, status, link ke milestone." },
      { fitur: "Closing checklist", detail: "Centang item checklist closing pada proyek COMPLETE menuju CLOSED." },
      { fitur: "Alert closing > 3 hari", detail: "Dashboard menampilkan proyek COMPLETE > 3 hari yang belum di-closing." },
    ],
    batasan: ["Tidak dapat ubah field finansial proyek atau approve timesheet/expense."],
  },
  {
    title: "4.6 Principal (Konsultan / Technical Writer / Admin Project)",
    ringkasan: "Supervisor tim delivery. Mengusulkan supervisee ke proyek (propose flow) dan memantau performa.",
    menu: ["Dashboard Principal", "Projects (yang relevan, tanpa finansial)", "Settings"],
    fitur: [
      { fitur: "Propose resource", detail: "POST /api/projects/:id/resources/propose — usulkan supervisee ke proyek OBSERVATION/ACTIVE." },
      { fitur: "Lihat proyek butuh resource", detail: "/api/principal/projects-needing-resource." },
      { fitur: "Lihat supervisee", detail: "/api/users/under-supervision (PRINCIPAL_KONSULTAN → KONSULTAN, dst)." },
      { fitur: "Performance Review (sebagai reviewer)", detail: "Buat & isi review untuk direct report." },
    ],
    batasan: ["Tidak melihat contractValue, margin, cost, billing.", "Tab Financials & Billing disembunyikan."],
  },
  {
    title: "4.7 Finance",
    ringkasan: "Read-only atas proyek, klien, reports, VAT Recap; upload INVOICE & CONTRACT.",
    menu: ["Dashboard finansial", "Projects (read)", "Clients (read)", "Reports (read + export)", "VAT Recap", "Settings"],
    fitur: [
      { fitur: "Akses Reports & VAT Recap", detail: "10 reports + 12-bulan VAT Recap, export CSV/XLSX/PDF." },
      { fitur: "Upload INVOICE / CONTRACT", detail: "Hanya 2 jenis dokumen ini." },
      { fitur: "Lihat semua data proyek", detail: "Termasuk finansial, billing milestone, expense." },
    ],
    batasan: ["Tidak dapat tulis di Projects, Timesheet, Billing Milestone, atau Expense.", "Tidak dapat hapus user atau client."],
  },
  {
    title: "4.8 HR",
    ringkasan: "People ops: headcount, struktur organisasi, leave, skill matrix, capacity planning. Tidak melihat finansial proyek.",
    menu: ["HR Dashboard", "Employees (/users — edit non-sensitive)", "Org Chart", "Leave Management", "Skill Matrix", "Skills CRUD", "Business Units CRUD", "Bench Report", "Capacity Planning", "Resource Planning (read)", "Settings"],
    fitur: [
      { fitur: "Edit data karyawan non-sensitif", detail: "title, dailyRate, seniority, businessUnitId, managerId, principalId, skillIds. TIDAK boleh ubah name/role/isActive/password orang lain." },
      { fitur: "Leave Management", detail: "Lihat cuti / training / sakit; export CSV." },
      { fitur: "Bench Report & Capacity Planning", detail: "Identifikasi user bench dan estimasi kapasitas mendatang." },
      { fitur: "Skill Matrix & Gap Analysis", detail: "Lihat matriks skill × user; identifikasi skill tanpa Senior/Principal." },
      { fitur: "HR Dashboard", detail: "KPI headcount, headcount per BU, role distribution, utilization trend, leaves today/upcoming, bench summary, new joiners." },
    ],
    batasan: ["GET /api/projects mengembalikan [] untuk HR.", "Seluruh router /timesheets ditolak 403.", "Dashboard summary / profit-trend / status-breakdown / top-projects tertolak."],
  },
  {
    title: "4.9 Site Administrator",
    ringkasan: "Administrator sistem: user, audit log, konfigurasi platform.",
    menu: ["Dashboard SITE_ADMIN (recent activity)", "Users", "Audit Log", "Skills", "Business Units", "Org Chart", "Settings"],
    fitur: [
      { fitur: "CRUD user", detail: "Create, update, deactivate user; set role; reset password." },
      { fitur: "Audit Log", detail: "Recent activity feed lintas modul." },
      { fitur: "CRUD Skills & Business Units", detail: "Bersama HR — manage master data." },
    ],
    batasan: ["Tidak terlibat pada proses bisnis proyek (tidak assign PM, tidak approve timesheet)."],
  },
];

function bagian4Roles(): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = [
    new Paragraph({ children: [new TextRun({ text: "", break: 1 })], pageBreakBefore: true }),
    h1("4. Manual Penggunaan per Role"),
    p("Setiap role melihat menu, fitur, dan data yang berbeda. Berikut ringkasan akses dan fitur utama setiap role yang ada di SecureProfit Hub."),
  ];
  for (const r of ROLES) {
    blocks.push(h2(r.title));
    blocks.push(p(r.ringkasan));
    blocks.push(h3("Menu yang terlihat"));
    for (const m of r.menu) blocks.push(bullet(m));
    blocks.push(h3("Fitur utama"));
    blocks.push(table(
      ["Fitur", "Detail"],
      r.fitur.map((f) => [f.fitur, f.detail]),
      [30, 70],
    ));
    if (r.batasan && r.batasan.length > 0) {
      blocks.push(h3("Batasan"));
      for (const b of r.batasan) blocks.push(bullet(b));
    }
    blocks.push(spacer());
  }
  return blocks;
}

function appendix(): (Paragraph | Table)[] {
  return [
    new Paragraph({ children: [new TextRun({ text: "", break: 1 })], pageBreakBefore: true }),
    h1("Lampiran A — Kredensial Demo"),
    p("Password default untuk semua akun: password123", { bold: true }),
    table(
      ["Email", "Nama", "Role"],
      [
        ["management@itsecasia.com", "Adi Wibowo", "MANAGEMENT"],
        ["pm@itsecasia.com", "Sari Pratiwi", "PROJECT_MANAGER"],
        ["pm2@itsecasia.com", "Yusuf Maulana", "PROJECT_MANAGER"],
        ["sales@itsecasia.com", "Budi Santoso", "SALES"],
        ["konsultan@itsecasia.com", "Rian Hidayat", "KONSULTAN"],
        ["konsultan2@itsecasia.com", "Dewi Lestari", "KONSULTAN"],
        ["writer@itsecasia.com", "Ayu Wulandari", "TECHNICAL_WRITER"],
        ["admin@itsecasia.com", "Tono Setiawan", "ADMIN_PROJECT"],
        ["finance@itsecasia.com", "Maya Anggraini", "FINANCE"],
        ["hr@itsecasia.com", "Sinta Permata", "HR"],
        ["siteadmin@itsecasia.com", "Rina Kartika", "SITE_ADMIN"],
        ["principal.kon.h7q4@itsecasia.com", "Bayu Prasetyo", "PRINCIPAL_KONSULTAN"],
        ["principal.tw.m9k2@itsecasia.com", "Indah Kusumawardani", "PRINCIPAL_TECHNICAL_WRITER"],
        ["principal.ap.r3n8@itsecasia.com", "Fajar Nugroho", "PRINCIPAL_ADMIN_PROJECT"],
      ],
      [42, 30, 28],
    ),
    h1("Lampiran B — Sample Proyek dengan Workstreams"),
    p("Lima proyek sample dibuat lewat skrip lib/db/src/sample-workstream-projects.ts. Setiap proyek memiliki useWorkstreams=true dan 3 workstreams: Pentest (PT), GRC (GRC), Threat Modeling (TM)."),
    table(
      ["Kode", "Nama", "Klien", "Nilai Kontrak (IDR)"],
      [
        ["SPH-WS-2026-101", "Bank Nusantara — Annual Security Assurance", "Bank Nusantara", "1.200.000.000"],
        ["SPH-WS-2026-102", "Tele Selaras — Security Assessment Bundle", "Tele Selaras", "950.000.000"],
        ["SPH-WS-2026-103", "Energi Prima — OT Security Program", "Energi Prima", "1.500.000.000"],
        ["SPH-WS-2026-104", "Retail Maju Bersama — E-commerce Security", "Retail Maju Bersama", "820.000.000"],
        ["SPH-WS-2026-105", "Asuransi Sentosa — Digital Trust Program", "Asuransi Sentosa", "1.050.000.000"],
      ],
      [20, 38, 22, 20],
    ),
    p("Setiap proyek juga memiliki 3 resource (satu per workstream), 3 task awal, 3 billing milestone (Pentest 35–45%, GRC 30–40%, TM 25%) yang menjumlah 100%, dan 3 expense PENDING untuk uji coba alur approval.", { italics: true }),
  ];
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function main() {
  const doc = new Document({
    creator: "SecureProfit Hub",
    title: "Flow Proses SecureProfit Hub",
    styles: {
      default: {
        document: { run: { font: FONT, size: 22 } },
      },
    },
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.PORTRAIT } } },
        children: [
          ...coverSection(),
          ...bagian1Pendahuluan(),
          ...bagian2Lifecycle(),
          ...bagian3Workstreams(),
          ...bagian4Roles(),
          ...appendix(),
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  const out = resolve(process.cwd(), "exports/SecureProfitHub-Flow-Proses.docx");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buf);
  console.log(`Wrote ${out} (${buf.length.toLocaleString()} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
