// Builds docs/SecureProfit-Hub-AI-Features-Manual.docx — a bilingual (EN + ID)
// user manual for all AI features, with screenshots from docs/ai-manual-assets/.
// Run: node scripts/src/ai-manual-docx.mjs

import { AlignmentType, ImageRun, Paragraph } from "docx";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  b,
  bullets,
  caption,
  cover,
  h1,
  h2,
  h3,
  p,
  pngSize,
  spacer,
  t,
  table,
  writeDocx,
  MAX_W,
  MAX_H,
} from "./bod-docx-lib.mjs";

const ASSETS = path.resolve("docs/ai-manual-assets");

function img(file) {
  const buf = readFileSync(path.join(ASSETS, file));
  const { w, h } = pngSize(buf);
  let outW = MAX_W;
  let outH = Math.round((h / w) * outW);
  if (outH > MAX_H) {
    outH = MAX_H;
    outW = Math.round((w / h) * outH);
  }
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 40 },
    children: [new ImageRun({ type: "png", data: buf, transformation: { width: outW, height: outH } })],
  });
}

const EN = (text) => p([b("EN  "), t(text)]);
const ID = (text) => p([b("ID  "), t(text)]);

const children = [
  ...cover({ subtitle: "AI Features User Manual — Manual Pengguna Fitur AI (English / Bahasa Indonesia)" }),

  // ------------------------------------------------------------------ intro
  h1("Introduction — Pendahuluan"),
  EN("SecureProfit Hub includes four AI features that help you get answers, stay ahead of problems, and write reports faster. Every AI answer is built from live application data that your account is allowed to see — the AI never invents numbers, and it respects your role-based access. This manual explains each feature in English (EN) and Bahasa Indonesia (ID), with screenshots from the live system."),
  ID("SecureProfit Hub memiliki empat fitur AI yang membantu Anda mendapatkan jawaban, mencegah masalah lebih awal, dan menulis laporan lebih cepat. Semua jawaban AI dibangun dari data aplikasi yang boleh dilihat oleh akun Anda — AI tidak pernah mengarang angka dan selalu mengikuti hak akses peran Anda. Manual ini menjelaskan setiap fitur dalam bahasa Inggris (EN) dan Bahasa Indonesia (ID), lengkap dengan tangkapan layar dari sistem."),
  spacer(),
  table(
    ["Feature / Fitur", "Where / Di mana", "Who / Siapa"],
    [
      ["AI Data Assistant", "Sparkles (✨) button, top-right header / Tombol ✨ di kanan atas", "All roles / Semua peran"],
      ["Smart Alerts", "Sidebar menu \"Smart Alerts\" / Menu samping \"Smart Alerts\"", "All roles / Semua peran"],
      ["Weekly AI Digest", "Card on the Smart Alerts page / Kartu di halaman Smart Alerts", "Management only / Khusus Manajemen"],
      ["AI Report Draft", "Project → Report tab → \"Draft with AI\"", "Management, project PM / Admin Project / Technical Writer"],
      ["AI Executive Copilot", "Sidebar menu \"Executive Copilot\"", "Management only / Khusus Manajemen"],
    ],
    [30, 40, 30],
  ),

  // ------------------------------------------------------- 1. data assistant
  h1("1. AI Data Assistant — Asisten Data AI"),
  h2("What it does — Apa fungsinya"),
  EN("A chat assistant that answers questions about your projects, hours, billing, and team using live data. Ask in English or Indonesian — the assistant replies in the language of your question. Answers include links (for example to a project's billing tab) that you can click to jump straight to the page."),
  ID("Asisten chat yang menjawab pertanyaan tentang proyek, jam kerja, tagihan, dan tim menggunakan data terkini. Bertanyalah dalam bahasa Indonesia atau Inggris — asisten menjawab mengikuti bahasa pertanyaan Anda. Jawaban menyertakan tautan (misalnya ke tab tagihan sebuah proyek) yang bisa diklik untuk langsung menuju halamannya."),
  h2("How to use it — Cara memakainya"),
  ...bullets([
    [b("EN  "), t("Click the sparkles (✨) button at the top-right of any page. A chat panel opens on the right.")],
    [b("ID  "), t("Klik tombol ✨ di kanan atas halaman mana pun. Panel chat terbuka di sisi kanan.")],
    [b("EN  "), t("Type your question and press Enter — e.g. \"Which projects have the lowest margin?\" or \"How much billing is overdue?\"")],
    [b("ID  "), t("Ketik pertanyaan lalu tekan Enter — mis. \"Proyek mana yang marginnya paling rendah?\" atau \"Berapa tagihan yang telat dibayar?\"")],
    [b("EN  "), t("Your conversation is kept while you work (it survives closing the panel). Use the trash icon to start over.")],
    [b("ID  "), t("Percakapan tetap tersimpan selama Anda bekerja (tidak hilang saat panel ditutup). Gunakan ikon tempat sampah untuk memulai dari awal.")],
  ]),
  img("ai-assistant-button.png"),
  caption("The sparkles button in the header opens the Data Assistant. / Tombol ✨ di header membuka Asisten Data."),
  img("ai-assistant-chat.png"),
  caption("Ask in Indonesian, get an answer in Indonesian — with real numbers from the system. / Bertanya dalam bahasa Indonesia, dijawab dalam bahasa Indonesia — dengan angka asli dari sistem."),
  h2("Good to know — Perlu diketahui"),
  ...bullets([
    [b("EN  "), t("The assistant only sees data your role is allowed to see. A consultant, for example, cannot ask about company-wide billing.")],
    [b("ID  "), t("Asisten hanya melihat data yang boleh dilihat peran Anda. Konsultan, misalnya, tidak bisa menanyakan tagihan seluruh perusahaan.")],
    [b("EN  "), t("Limit: 20 messages per 10 minutes per user. Always double-check important numbers before making decisions.")],
    [b("ID  "), t("Batas: 20 pesan per 10 menit per pengguna. Selalu periksa ulang angka penting sebelum mengambil keputusan.")],
  ]),

  // ------------------------------------------------------- 2. smart alerts
  h1("2. Smart Alerts & Weekly AI Digest — Peringatan Pintar & Ringkasan Mingguan AI"),
  h2("Smart Alerts page — Halaman Smart Alerts"),
  EN("The Smart Alerts page (sidebar menu) collects every alert in one place: low margins, budget overruns, overdue invoices, late timesheets, and more. Each alert has a severity badge — Critical (red), Warning (yellow), Info (blue) — and an \"Open\" link that takes you straight to the item. Margin and budget alerts also name the biggest cost driver so you know where to look first."),
  ID("Halaman Smart Alerts (menu samping) mengumpulkan semua peringatan di satu tempat: margin rendah, biaya melebihi anggaran, tagihan telat, timesheet terlambat, dan lainnya. Setiap peringatan punya label tingkat bahaya — Critical (merah), Warning (kuning), Info (biru) — dan tautan \"Open\" yang membawa Anda langsung ke sumbernya. Peringatan margin dan anggaran juga menyebutkan penyumbang biaya terbesar supaya Anda tahu harus melihat ke mana dulu."),
  h2("Weekly AI Digest (Management) — Ringkasan Mingguan AI (Manajemen)"),
  EN("Every Monday morning (07:00 WIB) the system automatically writes a one-page weekly digest for management: a headline, the 3–6 most important items ordered by urgency, and a short narrative. The AI only phrases facts that the system has already computed — money amounts are copied verbatim from live data. Management is notified when the new digest is ready; the Refresh button regenerates it on demand (up to 4 times per hour)."),
  ID("Setiap Senin pagi (07.00 WIB) sistem otomatis menulis ringkasan mingguan satu halaman untuk manajemen: satu kalimat utama, 3–6 hal terpenting yang diurutkan dari yang paling mendesak, dan narasi singkat. AI hanya merangkai fakta yang sudah dihitung sistem — nilai uang disalin apa adanya dari data terkini. Manajemen mendapat notifikasi saat ringkasan baru siap; tombol Refresh membuatnya ulang kapan saja (maksimal 4 kali per jam)."),
  img("ai-alerts.png"),
  caption("Smart Alerts with the Weekly AI Digest card (management view). / Smart Alerts dengan kartu Ringkasan Mingguan AI (tampilan manajemen)."),

  // ------------------------------------------------------- 3. report draft
  h1("3. AI Report Draft — Draf Laporan AI"),
  h2("What it does — Apa fungsinya"),
  EN("Writes a first draft of a project's monthly status report from live project data: logged hours, milestone progress, billing status, and open risks. You choose the report month and the language (Bahasa Indonesia or English). The draft has four sections — Executive Summary, Achievements, Issues & Risks, Next Plans — ready to copy, review, and edit. Nothing is saved automatically: the draft is yours to polish before it goes into the formal report."),
  ID("Menulis draf pertama laporan status bulanan proyek dari data proyek terkini: jam kerja tercatat, kemajuan milestone, status tagihan, dan risiko terbuka. Anda memilih bulan laporan dan bahasanya (Bahasa Indonesia atau Inggris). Draf terdiri dari empat bagian — Ringkasan Eksekutif, Pencapaian, Masalah & Risiko, Rencana Berikutnya — siap disalin, diperiksa, dan disunting. Tidak ada yang tersimpan otomatis: draf sepenuhnya milik Anda untuk dirapikan sebelum masuk laporan resmi."),
  h2("How to use it — Cara memakainya"),
  ...bullets([
    [b("EN  "), t("Open a project → Report tab → click \"Draft with AI\".")],
    [b("ID  "), t("Buka proyek → tab Report → klik \"Draft with AI\".")],
    [b("EN  "), t("Pick the report month and language, then click \"Generate draft\". Generation takes a short while.")],
    [b("ID  "), t("Pilih bulan laporan dan bahasa, lalu klik \"Generate draft\". Prosesnya perlu beberapa saat.")],
    [b("EN  "), t("Review the result, use \"Copy\" to take it into your report, and edit as needed. \"Regenerate\" produces a fresh draft.")],
    [b("ID  "), t("Periksa hasilnya, gunakan \"Copy\" untuk memindahkannya ke laporan Anda, lalu sunting seperlunya. \"Regenerate\" membuat draf baru.")],
  ]),
  img("ai-report-draft-dialog.png"),
  caption("Choose the month and language, then generate. / Pilih bulan dan bahasa, lalu buat draf."),
  img("ai-report-draft-result.png"),
  caption("A generated draft in Bahasa Indonesia, grounded in live project data. / Draf hasil AI dalam Bahasa Indonesia, berdasarkan data proyek terkini."),
  h2("Who can use it — Siapa yang bisa memakainya"),
  EN("Management, plus the project's own Project Manager, Admin Project, and Technical Writer. Financial figures appear in the draft only for roles allowed to see that project's financials. Limit: 10 drafts per 10 minutes per user."),
  ID("Manajemen, serta Project Manager, Admin Project, dan Technical Writer dari proyek tersebut. Angka keuangan hanya muncul di draf untuk peran yang memang boleh melihat keuangan proyek itu. Batas: 10 draf per 10 menit per pengguna."),

  // ------------------------------------------------------- 4. exec copilot
  h1("4. AI Executive Copilot — Kopilot Eksekutif AI"),
  EN("A management-only briefing page (sidebar menu \"Executive Copilot\") that turns the whole portfolio into one executive read: portfolio health, key risks, and a Top-5 action list. All numbers are computed by the system; the AI only writes the narrative around them. Click \"Generate\" to refresh the briefing — the latest version stays available to every management user until it is regenerated."),
  ID("Halaman briefing khusus manajemen (menu samping \"Executive Copilot\") yang merangkum seluruh portofolio menjadi satu bacaan eksekutif: kesehatan portofolio, risiko utama, dan daftar 5 aksi terpenting. Semua angka dihitung oleh sistem; AI hanya menulis narasinya. Klik \"Generate\" untuk memperbarui briefing — versi terbaru tetap tersedia bagi semua pengguna manajemen sampai dibuat ulang."),
  img("executive-copilot.png"),
  caption("The Executive Copilot briefing page (management only). / Halaman briefing Executive Copilot (khusus manajemen)."),

  // ------------------------------------------------------- principles
  h1("How the AI stays trustworthy — Bagaimana AI dijaga tetap akurat"),
  ...bullets([
    [b("EN  "), t("Live data only: every answer, digest, and draft is built from what is in the system right now — the AI never invents projects, people, or amounts.")],
    [b("ID  "), t("Hanya data terkini: setiap jawaban, ringkasan, dan draf dibangun dari isi sistem saat ini — AI tidak pernah mengarang proyek, orang, atau nominal.")],
    [b("EN  "), t("Your access, your answers: the AI sees exactly what your role sees — nothing more.")],
    [b("ID  "), t("Akses Anda menentukan jawaban: AI hanya melihat persis apa yang boleh dilihat peran Anda — tidak lebih.")],
    [b("EN  "), t("Consistent numbers: all AI features compute money totals from the same shared source, so the chat and the weekly digest always agree.")],
    [b("ID  "), t("Angka konsisten: semua fitur AI menghitung total uang dari sumber bersama yang sama, sehingga chat dan ringkasan mingguan selalu cocok.")],
    [b("EN  "), t("Human in charge: AI output is a starting point. Review important numbers and edit drafts before formal use.")],
    [b("ID  "), t("Manusia tetap memegang kendali: hasil AI adalah titik awal. Periksa angka penting dan sunting draf sebelum dipakai resmi.")],
  ]),
];

await writeDocx({
  children,
  outPath: path.resolve("docs/SecureProfit-Hub-AI-Features-Manual.docx"),
  title: "SecureProfit Hub — AI Features User Manual",
  description: "Bilingual (EN/ID) manual for the AI features: Data Assistant, Smart Alerts & Weekly Digest, AI Report Draft, Executive Copilot.",
  headerText: "SecureProfit Hub — AI Features Manual",
});
