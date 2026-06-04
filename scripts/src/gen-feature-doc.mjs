import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  PageBreak,
} from "docx";
import { writeFileSync } from "node:fs";

const ACCENT = "1F7A4D"; // cyber green
const DARK = "0F1B14";
const GREY = "555555";

// ---------- helpers ----------
const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 140 },
    children: [new TextRun({ text, bold: true, color: ACCENT, size: 30 })],
  });

const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 220, after: 90 },
    children: [new TextRun({ text, bold: true, color: DARK, size: 26 })],
  });

const h3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 160, after: 70 },
    children: [new TextRun({ text, bold: true, color: DARK, size: 23 })],
  });

const p = (runs, opts = {}) =>
  new Paragraph({
    spacing: { after: 120, line: 276 },
    alignment: opts.align,
    children: Array.isArray(runs)
      ? runs
      : [new TextRun({ text: runs, size: 22 })],
  });

const bullet = (text, level = 0) =>
  new Paragraph({
    bullet: { level },
    spacing: { after: 60, line: 268 },
    children: Array.isArray(text) ? text : [new TextRun({ text, size: 22 })],
  });

const num = (text, ref, level = 0) =>
  new Paragraph({
    numbering: { reference: ref, level },
    spacing: { after: 60, line: 268 },
    children: Array.isArray(text) ? text : [new TextRun({ text, size: 22 })],
  });

const t = (text, bold = false, size = 22, color) =>
  new TextRun({ text, bold, size, color });

const formula = (text) =>
  new Paragraph({
    spacing: { before: 60, after: 120 },
    shading: { fill: "F1F6F2" },
    border: {
      left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 8 },
    },
    children: [new TextRun({ text, font: "Consolas", size: 21, color: DARK })],
  });

const cell = (text, opts = {}) =>
  new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.header ? { fill: ACCENT } : opts.alt ? { fill: "F1F6F2" } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: opts.header || opts.bold,
            color: opts.header ? "FFFFFF" : DARK,
            size: 20,
          }),
        ],
      }),
    ],
  });

function table(headers, rows, widths) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((hd, i) =>
      cell(hd, { header: true, width: widths?.[i] }),
    ),
  });
  const bodyRows = rows.map(
    (r, ri) =>
      new TableRow({
        children: r.map((c, i) =>
          cell(String(c), { width: widths?.[i], alt: ri % 2 === 1 }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" },
    },
    rows: [headerRow, ...bodyRows],
  });
}

const spacer = () => new Paragraph({ spacing: { after: 60 }, children: [] });

// ---------- content ----------
const children = [];

// COVER
children.push(
  new Paragraph({ spacing: { before: 1800 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: "SecureProfit Hub", bold: true, color: ACCENT, size: 64 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [
      new TextRun({
        text: "Dokumen Fitur & Perhitungan Aplikasi",
        bold: true,
        color: DARK,
        size: 34,
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 40 },
    children: [
      new TextRun({
        text: "Sistem Manajemen Project & Profitabilitas untuk Konsultan Keamanan TI",
        italics: true,
        color: GREY,
        size: 24,
      }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 600 },
    children: [new TextRun({ text: "Bahan Presentasi Internal", color: GREY, size: 22 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: "Disusun: Juni 2026",
        color: GREY,
        size: 22,
      }),
    ],
  }),
  new Paragraph({ children: [new PageBreak()] }),
);

// DAFTAR ISI (manual)
children.push(h1("Daftar Isi"));
[
  "1.  Ringkasan Eksekutif",
  "2.  Teknologi & Arsitektur",
  "3.  Peran Pengguna & Hak Akses",
  "4.  Siklus Hidup Project",
  "5.  Fitur Utama per Modul",
  "6.  Perhitungan dalam Aplikasi",
  "7.  Contoh Perhitungan Menyeluruh",
  "8.  Integrasi Akuntansi (Xero)",
  "9.  Keamanan & Kontrol Akses",
  "10. Saran Persiapan & Alur Demo Presentasi",
].forEach((line) => children.push(bullet(line)));
children.push(new Paragraph({ children: [new PageBreak()] }));

// 1. RINGKASAN
children.push(h1("1. Ringkasan Eksekutif"));
children.push(
  p(
    "SecureProfit Hub adalah aplikasi web full-stack untuk perusahaan konsultan keamanan TI. Aplikasi ini mengelola seluruh perjalanan sebuah project — mulai dari intake oleh tim Sales, perencanaan oleh Project Manager, eksekusi oleh tim konsultan, hingga penutupan dan penagihan — sambil memantau margin keuntungan secara real-time seiring konsultan mencatat hari kerja (manday) yang dapat ditagih.",
  ),
);
children.push(h3("Masalah yang dipecahkan"));
children.push(bullet("Visibilitas profitabilitas project yang lambat dan manual (biasanya baru ketahuan saat project selesai)."));
children.push(bullet("Pencatatan timesheet, biaya, dan penagihan yang tersebar di banyak spreadsheet."));
children.push(bullet("Sulitnya perencanaan kapasitas sumber daya dan pemantauan utilisasi konsultan."));
children.push(bullet("Proses penagihan (invoice) dan rekap PPN yang rawan kesalahan hitung."));
children.push(h3("Nilai utama"));
children.push(bullet("Margin & biaya project terhitung otomatis dari timesheet dan biaya yang disetujui."));
children.push(bullet("Satu sumber data untuk project, sumber daya, penagihan, dan laporan manajemen."));
children.push(bullet("Kontrol akses berbasis peran sehingga setiap fungsi hanya melihat yang relevan."));
children.push(bullet("Integrasi langsung ke Xero untuk penerbitan invoice dan sinkronisasi pembayaran."));

// 2. TEKNOLOGI
children.push(h1("2. Teknologi & Arsitektur"));
children.push(
  p("Aplikasi dibangun sebagai monorepo dengan pemisahan jelas antara antarmuka, server, dan basis data."),
);
children.push(
  table(
    ["Lapisan", "Teknologi", "Fungsi"],
    [
      ["Antarmuka (Frontend)", "React + Vite + TypeScript + Tailwind, grafik Recharts", "Tampilan pengguna, dashboard, formulir, dan visualisasi"],
      ["Server (Backend)", "Node.js + Express, autentikasi JWT", "Logika bisnis, validasi, dan API"],
      ["Basis Data", "PostgreSQL (via Prisma)", "Penyimpanan data project, pengguna, timesheet, penagihan"],
      ["Kontrak API", "OpenAPI 3 + validasi skema", "Menjaga konsistensi data antara server dan antarmuka"],
      ["Integrasi", "Xero Accounting API (OAuth2)", "Penerbitan invoice & sinkronisasi pembayaran"],
    ],
    [22, 40, 38],
  ),
);

// 3. PERAN
children.push(h1("3. Peran Pengguna & Hak Akses"));
children.push(
  p("Setiap pengguna memiliki peran yang menentukan modul dan data yang dapat diakses. Ringkasan peran utama:"),
);
children.push(
  table(
    ["Peran", "Tanggung jawab utama"],
    [
      ["Management (PMO Director)", "Akses penuh: seluruh project, persetujuan, dan semua angka finansial."],
      ["Project Manager (PM)", "Mengelola project sendiri, sumber daya, dan menyetujui timesheet timnya."],
      ["Sales", "Membuat klien & project (intake), mengelola data komersial project sendiri."],
      ["Konsultan", "Mencatat timesheet sendiri dan memperbarui status tugas."],
      ["Technical Writer", "Sama seperti konsultan untuk pekerjaan penulisan/laporan."],
      ["Admin Project", "Mengelola dokumen penutupan (BAST/Invoice/Kontrak)."],
      ["Principal (3 jenis)", "Mengawasi tim delivery (Konsultan/TW/Admin) — TANPA akses angka finansial."],
      ["Finance", "Akses baca seluruh project/laporan + rekap PPN; unggah dokumen invoice/kontrak."],
      ["HR", "Operasi SDM: karyawan, cuti, matriks keahlian, bench — tanpa akses finansial."],
      ["Site Admin", "Administrasi pengguna dan log audit sistem."],
    ],
    [32, 68],
  ),
);
children.push(
  p([
    t("Catatan penting: ", true),
    t(
      "peran Principal dan peran delivery (Konsultan/TW) serta HR tidak pernah melihat nilai kontrak, biaya, maupun margin. Tab Financials dan Billing otomatis disembunyikan untuk mereka.",
    ),
  ]),
);

// 4. SIKLUS HIDUP
children.push(h1("4. Siklus Hidup Project"));
children.push(p("Sebuah project bergerak melalui status berikut:"));
children.push(
  formula("DRAFT  →  OBSERVATION  →  ACTIVE  →  PAUSE / COMPLETE  →  CLOSED"),
);
children.push(
  table(
    ["Status", "Arti", "Siapa yang bertindak"],
    [
      ["DRAFT", "Intake awal oleh Sales (4 kolom dasar).", "Sales"],
      ["OBSERVATION", "PM melengkapi deskripsi, tanggal, revenue, manday & biaya.", "Project Manager"],
      ["ACTIVE", "Project berjalan; timesheet & biaya mulai berjalan.", "Tim delivery"],
      ["PAUSE / COMPLETE", "Project dijeda atau selesai dikerjakan.", "PM / Management"],
      ["CLOSED", "Project ditutup sepenuhnya.", "Management"],
    ],
    [20, 52, 28],
  ),
);
children.push(
  p([
    t("Aturan penagihan baru: ", true),
    t(
      "project hanya dapat di-invoice setelah berstatus ACTIVE atau lebih (ACTIVE, PAUSE, COMPLETE, CLOSED). Project yang masih DRAFT atau OBSERVATION — yaitu belum berjalan — tidak dapat menerbitkan invoice, mendorong ke Xero, maupun ditandai INVOICED/PAID.",
    ),
  ]),
);

// 5. FITUR PER MODUL
children.push(h1("5. Fitur Utama per Modul"));

children.push(h2("5.1 Dashboard per Peran"));
children.push(p("Setiap peran memperoleh dashboard yang disesuaikan dengan kebutuhannya:"));
children.push(bullet("Management: KPI eksekutif, tren profit, aging penagihan, project berisiko, alokasi PM."));
children.push(bullet("Project Manager: project aktif, kotak persetujuan, utilisasi, revenue vs profit, peringatan."));
children.push(bullet("Sales: pipeline, revenue per klien, tren profitabilitas."));
children.push(bullet("Konsultan/TW: ajakan mencatat waktu, tren, dan daftar tugas saya."));
children.push(bullet("Admin Project: kotak dokumen penutupan."));
children.push(bullet("HR: headcount, distribusi unit bisnis/peran, cuti, bench, kesenjangan keahlian."));

children.push(h2("5.2 Manajemen Project & Tab-tabnya"));
children.push(p("Setiap project memiliki halaman detail dengan tab fungsional berikut:"));
children.push(bullet([t("Overview — ", true), t("ringkasan & edit data inti melalui dialog 'Review & Save'.")]));
children.push(bullet([t("Timeline (Gantt) — ", true), t("penjadwalan tugas dengan drag-and-drop, resize, dan panah dependensi.")]));
children.push(bullet([t("Tasks (WBS) — ", true), t("struktur rincian kerja berjenjang, multi-assignee, dependensi finish-to-start, penanda billable.")]));
children.push(bullet([t("Resources — ", true), t("staffing tim Konsultan & Technical Writer, Admin Project, dan sumber daya lain.")]));
children.push(bullet([t("RAID — ", true), t("registrasi Risk, Assumption, Issue, Dependency (khusus tim delivery).")]));
children.push(bullet([t("Expenses — ", true), t("biaya non-sumber daya dengan alur persetujuan; hanya yang APPROVED menambah biaya aktual.")]));
children.push(bullet([t("Timesheets — ", true), t("seluruh entri waktu pada project, dengan KPI dan persetujuan massal.")]));
children.push(bullet([t("Billing — ", true), t("Termin pembayaran (milestone) dengan %, DPP, PPN, total, jatuh tempo, dan status invoice.")]));
children.push(bullet([t("Financials — ", true), t("biaya, profit, margin, burn rate, dan proyeksi (forecast).")]));
children.push(bullet([t("Documents, Closing, Report, Survey, Workstreams, Activity — ", true), t("dokumen, penutupan, laporan project, survei pelanggan, alur kerja, dan jejak audit.")]));

children.push(h2("5.3 Modul & Halaman Lain"));
children.push(
  table(
    ["Modul", "Fungsi"],
    [
      ["Clients", "Manajemen data klien."],
      ["Timesheets (global) + entri massal", "Pencatatan & persetujuan waktu lintas project; entri mingguan massal."],
      ["Reports", "10 laporan siap pakai dengan ekspor CSV/XLSX/PDF."],
      ["Resource Planning", "Beban manday mingguan per unit bisnis (dengan overlay cuti)."],
      ["Bench & Capacity", "Konsultan yang belum teralokasi dan kapasitas tim."],
      ["Skill Matrix", "Pemetaan keahlian tim dan identifikasi kesenjangan."],
      ["Invoice Planning", "Proyeksi penagihan per periode (minggu/bulan) per unit bisnis."],
      ["VAT Recap", "Rekap PPN 12 bulan + tahunan dari invoice INVOICED/PAID."],
      ["Performance Reviews", "Penilaian kinerja dengan alur DRAFT → SUBMITTED → ACKNOWLEDGED."],
      ["Leaves & Org Chart", "Manajemen cuti dan bagan organisasi."],
      ["Task Templates", "Template WBS yang dapat diterapkan ke project baru."],
    ],
    [34, 66],
  ),
);

// 6. PERHITUNGAN
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1("6. Perhitungan dalam Aplikasi"));
children.push(
  p("Bagian ini menjelaskan semua rumus inti yang dipakai aplikasi untuk menghitung biaya, profit, margin, pajak, dan penagihan. Semua nilai mata uang dalam Rupiah (Rp)."),
);

children.push(h2("6.1 Biaya Sumber Daya (Resource Cost)"));
children.push(p("Biaya tenaga kerja dihitung dari timesheet yang sudah DISETUJUI (APPROVED). Jam kerja dikonversi ke hari (manday) dengan basis 8 jam per hari, lalu dikalikan tarif harian sumber daya."));
children.push(formula("hari (manday) = jam timesheet ÷ 8"));
children.push(formula("resourceCost = Σ (hari × tarif_harian) untuk semua timesheet APPROVED"));
children.push(p([t("Catatan: ", true), t("tarif yang dipakai adalah tarif pada penugasan project (ProjectResource); jika tidak ada, jatuh ke tarif harian default pengguna.")]));

children.push(h2("6.2 Biaya Tambahan (Additional Cost)"));
children.push(p("Biaya non-tenaga kerja (software, hardware, lisensi, perjalanan, lainnya). Hanya biaya berstatus APPROVED yang dihitung; biaya PENDING/REJECTED tetap terlihat untuk transparansi tetapi tidak menambah biaya."));
children.push(formula("additionalCost = Σ amount untuk semua ProjectExpense APPROVED"));

children.push(h2("6.3 Biaya Aktual, Profit, dan Margin"));
children.push(formula("actualCost   = resourceCost + additionalCost"));
children.push(formula("actualProfit = contractValue − actualCost"));
children.push(formula("marginPct    = (actualProfit ÷ contractValue) × 100"));
children.push(p("contractValue adalah nilai kontrak project. Margin dinyatakan dalam persen."));

children.push(h2("6.4 Biaya Akrual (Accrued Cost)"));
children.push(p("Untuk memantau biaya yang sedang berjalan, aplikasi juga menghitung biaya akrual yang memasukkan tenaga kerja yang sudah DIAJUKAN (SUBMITTED) namun belum disetujui."));
children.push(formula("accruedResourceCost = Σ (hari × tarif) untuk timesheet APPROVED + SUBMITTED"));
children.push(formula("accruedCost = accruedResourceCost + additionalCost"));

children.push(h2("6.5 Biaya Penuh / Overhead (Fully-Loaded Cost)"));
children.push(p("Untuk mencerminkan biaya tidak langsung (overhead) perusahaan, biaya sumber daya dapat dikalikan faktor pengali overhead (dapat dikonfigurasi). Ini menghasilkan biaya dan margin 'bersih' yang lebih konservatif."));
children.push(formula("loadedResourceCost = resourceCost × overheadMultiplier"));
children.push(formula("netActualCost   = loadedResourceCost + additionalCost"));
children.push(formula("netActualProfit = revenueNet − netActualCost"));
children.push(formula("netMarginPct    = (netActualProfit ÷ revenueNet) × 100"));

children.push(h2("6.6 Burn Rate & Pengakuan Pendapatan"));
children.push(p("Tingkat penyelesaian (burn rate) diukur dari manday aktual dibanding manday yang direncanakan, dibatasi maksimal 100%. Pendapatan diakui secara proporsional (mengacu prinsip persentase penyelesaian / PSAK 72)."));
children.push(formula("burnRatePct = min( (actualMandays ÷ plannedMandays) × 100 , 100 )"));
children.push(formula("recognizedRevenue = (burnRatePct ÷ 100) × revenueNet"));

children.push(h2("6.7 DPP & PPN (Pemisahan Pajak)"));
children.push(p("Nilai kontrak dapat sudah termasuk PPN (inclusive) atau belum (exclusive). DPP adalah Dasar Pengenaan Pajak (nilai bersih), dan PPN dihitung dari sini. Tarif default 11%."));
children.push(h3("Jika nilai SUDAH termasuk PPN (inclusive):"));
children.push(formula("DPP = nilai ÷ (1 + tarifPPN/100)\nPPN = nilai − DPP\nTotal = nilai"));
children.push(h3("Jika nilai BELUM termasuk PPN (exclusive):"));
children.push(formula("DPP = nilai\nPPN = nilai × (tarifPPN/100)\nTotal = nilai + PPN"));

children.push(h2("6.8 Termin Pembayaran (Billing Milestone)"));
children.push(p("Setiap project dapat dibagi menjadi beberapa termin (Terms of Payment). Tiap termin memiliki persentase dari nilai kontrak (atau nominal tetap), lalu dipecah menjadi DPP, PPN, dan Total memakai rumus pada 6.7."));
children.push(formula("nilai_termin = (persentase ÷ 100) × contractValue   (atau nominal tetap bila diisi)"));
children.push(p([t("Validasi: ", true), t("aplikasi memberi peringatan bila total persentase seluruh termin tidak sama dengan 100%.")]));

children.push(h2("6.9 Penomoran Invoice"));
children.push(p("Nomor invoice dialokasikan secara berurutan dan unik dengan format tahun/bulan, lalu nomor urut 4 digit, contoh:"));
children.push(formula("INV/2026/06/0001 , INV/2026/06/0002 , ..."));
children.push(p("Nomor dialokasikan di dalam transaksi yang aman dari tabrakan (race-safe), sehingga tidak ada nomor ganda meski beberapa invoice dibuat bersamaan."));

children.push(h2("6.10 Proyeksi Biaya (Forecast)"));
children.push(p("Forecast memproyeksikan biaya akhir secara linear berdasarkan laju pembakaran (burn rate) saat ini. Endpoint finansial mengagregasi timesheet yang disetujui per bulan dan membandingkannya dengan nilai kontrak yang disebar di sepanjang bulan-bulan aktif project."));

children.push(h2("6.11 Rekap PPN (VAT Recap)"));
children.push(p("Rekap PPN menjumlahkan seluruh invoice berstatus INVOICED dan PAID ke dalam rincian 12 bulan + total tahunan, untuk kebutuhan pelaporan pajak."));

children.push(h2("6.12 Utilisasi Sumber Daya"));
children.push(p("Perencanaan sumber daya menampilkan beban manday per minggu per orang/unit bisnis, dengan memperhitungkan cuti (UserLeave). Ini dipakai untuk memantau utilisasi konsultan dan mengidentifikasi bench (kapasitas menganggur)."));

// 7. CONTOH MENYELURUH
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1("7. Contoh Perhitungan Menyeluruh"));
children.push(p("Berikut contoh angka (ilustrasi) untuk menggambarkan bagaimana semua rumus saling terhubung pada satu project."));
children.push(h3("Asumsi project"));
children.push(
  table(
    ["Parameter", "Nilai"],
    [
      ["Nilai kontrak (termasuk PPN 11%)", "Rp 1.000.000.000"],
      ["Manday direncanakan", "100 hari"],
      ["Konsultan A — tarif harian", "Rp 2.000.000"],
      ["Konsultan A — timesheet disetujui", "320 jam (= 40 hari)"],
      ["Konsultan B — tarif harian", "Rp 1.500.000"],
      ["Konsultan B — timesheet disetujui", "160 jam (= 20 hari)"],
      ["Biaya tambahan disetujui (lisensi)", "Rp 20.000.000"],
      ["Faktor overhead (ilustrasi)", "1,30"],
    ],
    [60, 40],
  ),
);
children.push(h3("Hasil perhitungan"));
children.push(
  table(
    ["Komponen", "Perhitungan", "Hasil"],
    [
      ["resourceCost", "(40 × 2.000.000) + (20 × 1.500.000)", "Rp 110.000.000"],
      ["additionalCost", "lisensi disetujui", "Rp 20.000.000"],
      ["actualCost", "110.000.000 + 20.000.000", "Rp 130.000.000"],
      ["actualProfit", "1.000.000.000 − 130.000.000", "Rp 870.000.000"],
      ["marginPct", "870.000.000 ÷ 1.000.000.000 × 100", "87,0%"],
      ["DPP (revenueNet)", "1.000.000.000 ÷ 1,11", "Rp 900.900.900,90"],
      ["PPN", "1.000.000.000 − 900.900.900,90", "Rp 99.099.099,10"],
      ["burnRatePct", "(60 ÷ 100) × 100", "60%"],
      ["recognizedRevenue", "60% × 900.900.900,90", "Rp 540.540.540,54"],
      ["loadedResourceCost", "110.000.000 × 1,30", "Rp 143.000.000"],
      ["netActualCost", "143.000.000 + 20.000.000", "Rp 163.000.000"],
      ["netActualProfit", "900.900.900,90 − 163.000.000", "Rp 737.900.900,90"],
      ["netMarginPct", "737.900.900,90 ÷ 900.900.900,90 × 100", "81,9%"],
    ],
    [24, 46, 30],
  ),
);
children.push(h3("Contoh termin penagihan"));
children.push(p("Termin 1 = 30% dari nilai kontrak (termasuk PPN):"));
children.push(
  table(
    ["Komponen", "Perhitungan", "Hasil"],
    [
      ["Nilai termin (Total)", "30% × 1.000.000.000", "Rp 300.000.000"],
      ["DPP", "300.000.000 ÷ 1,11", "Rp 270.270.270,27"],
      ["PPN", "300.000.000 − 270.270.270,27", "Rp 29.729.729,73"],
    ],
    [30, 40, 30],
  ),
);

// 8. XERO
children.push(h1("8. Integrasi Akuntansi (Xero)"));
children.push(p("Aplikasi terhubung satu arah ke Xero (perangkat lunak akuntansi) untuk mengotomatiskan penagihan:"));
children.push(bullet([t("Penerbitan invoice — ", true), t("termin penagihan didorong menjadi invoice penjualan (ACCREC) di Xero, lengkap dengan nomor, jatuh tempo, dan nilai.")]));
children.push(bullet([t("Sinkronisasi kontak — ", true), t("data klien otomatis dibuat sebagai Contact di Xero bila belum ada.")]));
children.push(bullet([t("Sinkronisasi pembayaran — ", true), t("status pembayaran ditarik dari Xero; termin ditandai PAID hanya bila Xero menyatakan status 'PAID'.")]));
children.push(
  p([
    t("Akurasi nilai: ", true),
    t(
      "invoice didorong secara tax-inclusive sehingga total invoice sama persis dengan nilai termin hingga satuan sen (menghindari selisih pembulatan 1 sen yang sebelumnya muncul).",
    ),
  ]),
);

// 9. KEAMANAN
children.push(h1("9. Keamanan & Kontrol Akses"));
children.push(bullet("Autentikasi berbasis token (JWT) dengan kata sandi ter-hash (bcrypt)."));
children.push(bullet("Kontrol akses berbasis peran (RBAC) di sisi server — tidak hanya disembunyikan di antarmuka."));
children.push(bullet("Data difilter sesuai peran (mis. PM hanya melihat project miliknya; peran delivery tidak melihat angka finansial)."));
children.push(bullet("Jejak audit (Activity) mencatat perubahan penting pada project dan penagihan."));
children.push(bullet("Integrasi Xero memakai OAuth2 dengan state ber-tanda tangan; penomoran invoice aman dari duplikasi."));

// 10. PRESENTASI
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1("10. Saran Persiapan & Alur Demo Presentasi"));
children.push(h3("Yang perlu disiapkan"));
children.push(num("Akun login untuk tiap peran yang akan didemokan (Management, PM, Sales, Konsultan).", "prep"));
children.push(num("Satu project contoh yang sudah ACTIVE dengan timesheet, biaya, dan termin penagihan terisi.", "prep"));
children.push(num("Skenario cerita: dari intake Sales → perencanaan PM → eksekusi konsultan → penagihan & Xero.", "prep"));
children.push(num("Dokumen ini sebagai lampiran/handout, dan koneksi internet untuk demo Xero (opsional).", "prep"));
children.push(h3("Alur demo yang disarankan (±15 menit)"));
children.push(num("Login sebagai Management — tunjukkan dashboard eksekutif (KPI, tren profit, project berisiko).", "demo"));
children.push(num("Buka satu project — telusuri tab Overview, Tasks (WBS/Gantt), dan Resources.", "demo"));
children.push(num("Tab Timesheets & Expenses — perlihatkan alur persetujuan dan dampaknya ke biaya.", "demo"));
children.push(num("Tab Financials — tunjukkan biaya, margin, burn rate, dan forecast bergerak otomatis.", "demo"));
children.push(num("Tab Billing — buat/lihat termin, lalu 'Send to Xero' untuk menerbitkan invoice.", "demo"));
children.push(num("Tutup dengan modul lintas-project: Resource Planning, Reports, dan VAT Recap.", "demo"));
children.push(h3("Poin pembicaraan utama (talking points)"));
children.push(bullet("'Margin terlihat sejak hari pertama, bukan setelah project selesai.'"));
children.push(bullet("'Setiap angka biaya berasal dari timesheet & biaya yang disetujui — bukan estimasi manual.'"));
children.push(bullet("'Penagihan dan PPN otomatis, terhubung langsung ke akuntansi (Xero).'"));
children.push(bullet("'Setiap peran hanya melihat yang relevan — finansial terlindungi dari tim delivery.'"));
children.push(
  p([t("Catatan: ", true), t("antarmuka aplikasi berbahasa Inggris; dokumen ini berbahasa Indonesia khusus untuk bahan presentasi.")]),
);

// LAMPIRAN A — GLOSARIUM PERHITUNGAN
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(h1("Lampiran A — Glosarium Perhitungan"));
children.push(
  p("Penjelasan ringkas setiap metrik finansial beserta rumus dan contoh angka (mengacu contoh project pada Bagian 7: nilai kontrak Rp 1.000.000.000 termasuk PPN 11%)."),
);
children.push(
  table(
    ["Istilah", "Arti", "Rumus", "Contoh"],
    [
      ["resourceCost", "Biaya jam kerja konsultan yang sudah disetujui (APPROVED)", "Σ (jam ÷ 8 × tarif harian)", "Rp 110.000.000"],
      ["additionalCost", "Biaya non-tenaga kerja yang disetujui (lisensi, software, dll)", "Σ amount (APPROVED)", "Rp 20.000.000"],
      ["actualCost", "Total biaya nyata project", "resourceCost + additionalCost", "Rp 130.000.000"],
      ["actualProfit", "Profit setelah dikurangi biaya aktual", "contractValue − actualCost", "Rp 870.000.000"],
      ["marginPct", "Margin terhadap nilai kontrak (%)", "actualProfit ÷ contractValue × 100", "87,0%"],
      ["DPP (revenueNet)", "Pendapatan bersih tanpa PPN", "nilai ÷ 1,11 (inclusive)", "Rp 900.900.900,90"],
      ["PPN", "Bagian pajak di dalam nilai kontrak", "nilai − DPP", "Rp 99.099.099,10"],
      ["burnRatePct", "Tingkat penyelesaian (manday aktual vs rencana, maks 100%)", "min(actualMandays ÷ plannedMandays × 100, 100)", "60%"],
      ["recognizedRevenue", "Pendapatan diakui sesuai progres (PSAK 72)", "burnRatePct × DPP", "Rp 540.540.540,54"],
      ["loadedResourceCost", "Biaya tenaga kerja setelah dibebani overhead", "resourceCost × overheadMultiplier", "Rp 143.000.000"],
      ["netActualCost", "Total biaya penuh (sudah termasuk overhead)", "loadedResourceCost + additionalCost", "Rp 163.000.000"],
      ["netActualProfit", "Profit bersih penuh (dihitung vs DPP)", "revenueNet − netActualCost", "Rp 737.900.900,90"],
      ["netMarginPct", "Margin bersih penuh (%)", "netActualProfit ÷ revenueNet × 100", "81,9%"],
    ],
    [17, 33, 30, 20],
  ),
);
children.push(
  p([
    t("Dua jenis margin: ", true),
    t("marginPct (87,0%) adalah pandangan cepat — nilai kontrak kotor dikurangi biaya langsung saja. netMarginPct (81,9%) adalah pandangan realistis — pendapatan bersih (tanpa PPN) dikurangi biaya yang sudah dibebani overhead, sehingga selalu lebih kecil dan lebih jujur untuk pengambilan keputusan."),
  ]),
);

// ---------- build ----------
const doc = new Document({
  creator: "SecureProfit Hub",
  title: "SecureProfit Hub — Dokumen Fitur & Perhitungan",
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22, color: "1A1A1A" } },
    },
  },
  numbering: {
    config: [
      { reference: "prep", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }] },
      { reference: "demo", levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }] },
    ],
  },
  sections: [
    {
      properties: { page: { margin: { top: 1133, bottom: 1133, left: 1133, right: 1133 } } },
      children,
    },
  ],
});

const buf = await Packer.toBuffer(doc);
writeFileSync("exports/SecureProfit-Hub-Fitur-dan-Perhitungan.docx", buf);
console.log("WROTE exports/SecureProfit-Hub-Fitur-dan-Perhitungan.docx", buf.length, "bytes");
