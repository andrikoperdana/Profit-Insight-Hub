// Builds docs/Ringkasan-Pekerjaan-2026-07-30.docx — dokumentasi (Bahasa Indonesia)
// atas semua pekerjaan yang dilakukan pada 30 Juli 2026.
// Run: node scripts/src/daily-report-2026-07-30.mjs

import {
  b,
  bullets,
  cover,
  h1,
  h2,
  p,
  spacer,
  t,
  table,
  writeDocx,
} from "./bod-docx-lib.mjs";

const children = [
  ...cover({ subtitle: "Ringkasan Pekerjaan — 30 Juli 2026", date: "30 Juli 2026" }),

  h1("Ringkasan", { pageBreak: false }),
  p("Dokumen ini merangkum seluruh pekerjaan pada SecureProfit Hub tanggal 30 Juli 2026: dua perbaikan bug, lima fitur baru yang selesai digabung, persiapan lengkap untuk publish ke psa4pmo.xyz, satu dokumen manual, serta beberapa analisis dan tanya-jawab."),
  spacer(),
  table(
    ["Kategori", "Item"],
    [
      ["Perbaikan bug", "Scroll dropdown; halaman kosong saat Sales mengonversi lead Won"],
      ["Fitur baru (digabung)", "Tombol Convert semua stage; convert ulang setelah proyek dihapus; Project ID otomatis (web, mobile, laporan, pencarian); tab Projects mobile lebih rapi; navigasi cepat mobile; fitur Archive proyek"],
      ["Persiapan publish", "Migrasi & backfill database produksi, perbaikan build, verifikasi tes"],
      ["Dokumen", "Manual Fitur AI dwibahasa (EN+ID) dengan tangkapan layar"],
      ["Analisis / tanya-jawab", "Daftar laporan aplikasi; definisi Archive/Closed; timesheet per task; Billing Plan & sinkronisasi Xero"],
    ],
    [30, 70],
  ),

  h1("1. Perbaikan Bug"),
  h2("1.1 Scroll di dalam dropdown tidak berfungsi"),
  p("Dari catatan feedback: dropdown dengan daftar panjang (pilih klien, pilih orang, pilih lead) bisa memanjang melebihi layar sehingga terasa tidak bisa di-scroll."),
  bullets([
    "Semua dropdown kini dibatasi tinggi maksimalnya (±380 px) sehingga daftar panjang otomatis bisa di-scroll di dalamnya.",
    "Panel popup lain diberi pengaman serupa agar tidak pernah melebihi tinggi layar.",
    "Berlaku otomatis di seluruh aplikasi karena perbaikan dilakukan di komponen bersama.",
  ]),
  h2("1.2 Halaman kosong saat Sales mengonversi lead Won"),
  p("Dilaporkan lewat tangkapan layar dari situs live: user Sales membuka halaman konversi lead Won dan hanya melihat halaman putih kosong."),
  bullets([
    "Penyebab: satu label form (kolom Description) dipakai dengan cara yang salah sehingga halaman crash — hanya terjadi untuk role Sales; Manajemen tidak terdampak sehingga tidak ketahuan sebelumnya.",
    "Sudah diperbaiki dan diverifikasi dengan pengujian browser otomatis: baik lewat URL langsung maupun tombol \u201CRegister Project\u201D di Sales Pipeline, form kini tampil normal dengan lead langsung terpilih.",
  ]),

  h1("2. Fitur Baru yang Selesai Digabung"),
  p("Sembilan tugas selesai dikerjakan dan digabung ke aplikasi utama hari ini:"),
  bullets([
    "Tombol Convert di semua stage — lead bisa dikonversi menjadi proyek sejak stage New, supaya biaya bisa dicatat lebih awal; lead yang sudah dikonversi kini menampilkan kode proyeknya.",
    "Convert ulang setelah proyek dihapus — jika proyek hasil konversi dihapus, lead-nya terbuka kembali untuk dikonversi (status kembali ke Negotiation).",
    "Project ID otomatis — setiap proyek kini punya identitas permanen format PRJ/TAHUN/NNN (misal PRJ/2026/030) yang dibuat otomatis dan tidak bisa diedit; nomor SPK/PO menjadi kolom terpisah yang boleh diisi belakangan.",
    "Project ID di aplikasi mobile — tab Projects mendukung pencarian dengan Project ID; halaman detail menampilkan Project ID (baca-saja) dan SPK/PO (bisa diedit).",
    "Project ID di laporan & dokumen — invoice PDF, kalender, jawaban AI, dan laporan memakai Project ID sehingga tidak ada identitas kosong untuk proyek lama.",
    "Pencarian dengan Project ID — kotak pencarian di Sales Pipeline (termasuk lead yang sudah dikonversi), pemilih proyek di Timesheet, dan tampilan ketersediaan resource kini mendukung Project ID.",
    "Urutan & filter tab Projects di mobile — proyek aktif dan terbaru tampil paling atas, plus chip filter status.",
    "Navigasi cepat di mobile — nama proyek pada baris timesheet, approval, dan expense bisa diketuk untuk langsung membuka detail proyeknya.",
    "Fitur Archive proyek — lapisan baru di antara Closed dan Delete: Manajemen bisa mengarsipkan proyek sehingga keluar dari dashboard, laporan, dan perhitungan keuangan serta terkunci dari perubahan (bisa dibuka kembali); Delete kini hanya boleh untuk proyek yang sudah diarsipkan; ada tab Archived di daftar proyek.",
  ]),

  h1("3. Persiapan Publish"),
  bullets([
    "Struktur database produksi diperbarui dua kali hari ini (kolom Project ID, lalu kolom Archive) dan seluruh proyek lama di produksi sudah diberi nomor PRJ/2026/NNN — tidak ada yang tampil kosong setelah publish.",
    "Satu error build ditemukan dan diperbaiki (script data demo belum menyesuaikan kolom SPK/PO yang kini boleh kosong).",
    "Verifikasi menyeluruh: pemeriksaan tipe lolos, build produksi web & server sukses, seluruh 156 tes otomatis lulus, server di-restart dan menampilkan Project ID dengan benar.",
    "Aplikasi siap dipublish; tombol Publish tinggal diklik agar semua perbaikan tersedia di psa4pmo.xyz.",
  ]),

  h1("4. Dokumen yang Dihasilkan"),
  bullets([
    "Manual Fitur AI (SecureProfit-Hub-AI-Features-Manual.docx) — manual dwibahasa (Inggris + Indonesia) untuk empat fitur AI: Asisten Data, Smart Alerts & Ringkasan Mingguan, Draf Laporan AI, dan Executive Copilot, lengkap dengan enam tangkapan layar asli dari sistem.",
    "Dokumen ringkasan ini (Ringkasan-Pekerjaan-2026-07-30.docx).",
  ]),

  h1("5. Analisis & Tanya-Jawab"),
  h2("5.1 Daftar laporan aplikasi"),
  p("Dipetakan seluruh laporan yang tersedia: 9 laporan utama di menu Reports (bisa diekspor CSV/Excel/PDF), 9 halaman analisis khusus (Executive Copilot, Revenue Recognition, Portfolio Monitor, Invoice Planning, Capacity, Bench, Rekap PPN, Survei, Skill Matrix), plus ekspor dari halaman Timesheet, Expenses, Leads, dan Audit Log."),
  h2("5.2 Definisi Archive / Delete / Closed (feedback poin 2)"),
  p("Kesimpulan analisis: Delete (soft delete, khusus Manajemen) dan status Closed (dengan syarat checklist, survei, feedback 360) sudah ada; lapisan \u201CArchive\u201D terpisah belum ada. Tindak lanjutnya langsung dikerjakan dan selesai hari ini juga (lihat bagian 2) — kini alurnya menjadi Closed → Archive → Delete."),
  h2("5.3 Timesheet per task untuk Konsultan (feedback poin 4)"),
  p("Sudah tersedia dan justru wajib: Konsultan, Technical Writer, dan Admin Project harus memilih task saat mengisi jam kerja, di web maupun mobile, dengan validasi penugasan dan budget jam per task."),
  h2("5.4 Billing Plan & sinkronisasi Xero"),
  p("Dijelaskan cara kerja tab Billing: rencana termin pembayaran (DPP, PPN 11%, total, jatuh tempo, status Planned/Invoiced/Paid), tombol Send to Xero untuk membuat invoice per termin, dan Sync from Xero yang menarik status pembayaran — termin hanya ditandai Paid bila Xero menyatakan invoice lunas."),

  h1("6. Tugas Lanjutan yang Terdaftar"),
  p("Dua tugas sedang dikerjakan: arsip otomatis untuk proyek Closed yang sudah lama, dan pengecualian proyek terarsip dari daftar & perhitungan di aplikasi mobile. Usulan berikutnya yang sudah terdaftar antara lain: Project ID pada PDF klaim expense, referensi invoice Xero, notifikasi dan label laporan; filter status cepat untuk timesheet & expense mobile; pemulihan proyek yang terhapus; serta pencocokan otomatis lead impor dengan klien."),
];

await writeDocx({
  children,
  outPath: "docs/Ringkasan-Pekerjaan-2026-07-30.docx",
  title: "Ringkasan Pekerjaan — 30 Juli 2026",
  description: "Dokumentasi pekerjaan SecureProfit Hub tanggal 30 Juli 2026",
  headerText: "SecureProfit Hub — Ringkasan Pekerjaan 30 Juli 2026",
});
console.log("done");
