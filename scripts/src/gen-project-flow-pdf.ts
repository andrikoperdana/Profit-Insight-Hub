/**
 * Generate dua PDF "Panduan Alur Project SecureProfit Hub" (Bahasa Indonesia & English).
 * Menjelaskan urutan lengkap: Sales intake (DRAFT) -> MGT pilih PM -> PM lengkapi
 * (OBSERVATION) -> syarat ACTIVE -> project berjalan -> syarat COMPLETE -> CLOSED.
 *
 * Run: `pnpm --filter @workspace/scripts run project-flow-pdf`
 * Output: ./exports/Panduan-Alur-Project-SecureProfit-Hub-ID.pdf
 *         ./exports/SecureProfit-Hub-Project-Flow-Guide-EN.pdf
 */
import { mkdirSync, createWriteStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../../exports");

// ---------------------------------------------------------------------------
// Content model
// ---------------------------------------------------------------------------

type Block =
  | { t: "phase"; num: number; title: string; color: string }
  | { t: "tag"; text: string; color: string }
  | { t: "role"; label: string; value: string }
  | { t: "h"; text: string }
  | { t: "p"; text: string }
  | { t: "b"; text: string; lvl?: number }
  | { t: "note"; text: string }
  | { t: "gate"; title: string; items: string[] }
  | { t: "space"; h: number };

interface Doc {
  title: string;
  subtitle: string;
  meta: string;
  intro: string;
  chainLabel: string;
  chain: string;
  footer: string;
  blocks: Block[];
}

const C = {
  draft: "#64748b",
  pm: "#6366f1",
  obs: "#0ea5e9",
  active: "#0f766e",
  running: "#0d9488",
  complete: "#059669",
  closed: "#475569",
};

// ---------------------------------------------------------------------------
// Bahasa Indonesia
// ---------------------------------------------------------------------------

const ID: Doc = {
  title: "Panduan Alur Project",
  subtitle: "SecureProfit Hub — urutan pengisian data dari intake hingga penutupan",
  meta: "Dokumen internal tim  •  Edisi 8 Juni 2026",
  chainLabel: "Siklus status project:",
  chain: "DRAFT  >  OBSERVATION  >  ACTIVE  >  COMPLETE  >  CLOSED      (opsional: PAUSE)",
  footer: "Panduan Alur Project — SecureProfit Hub",
  intro:
    "Dokumen ini menjelaskan urutan (alur) sebuah project di SecureProfit Hub, mulai dari Sales " +
    "memenangkan tender sampai project ditutup (CLOSED). Ikuti urutan pengisian data per fase agar " +
    "status project dapat berpindah dengan lancar. Istilah menu dan tombol ditulis sesuai tampilan " +
    "aplikasi yang berbahasa Inggris (mis. Activate, Resources, Billing).",
  blocks: [
    // ---- Fase 1 ----
    { t: "phase", num: 1, title: "Intake oleh Sales", color: C.draft },
    { t: "tag", text: "Status: DRAFT", color: C.draft },
    { t: "role", label: "Peran", value: "Sales (pemilik project)" },
    { t: "h", text: "Langkah" },
    { t: "b", text: "Buka menu Projects > New Project. (Atau dari Leads > Convert bila project berasal dari sebuah lead.)" },
    { t: "b", text: "Isi data dasar: Project Code, Project Name, Client, Description, Contract Value, Start Date, dan End Date." },
    { t: "b", text: "Isi bagian Resource Requirements (wajib). Setiap baris berisi: Role, Headcount (jumlah orang), Mandays/person, dan Daily Rate. Belum memilih orang asli di tahap ini." },
    { t: "b", text: "Sistem otomatis menghitung Planned Mandays dan Estimated Cost dari baris-baris tersebut.", lvl: 1 },
    { t: "b", text: "Klik Create / Submit." },
    { t: "note", text: "Saat submit, sistem otomatis menetapkan Status = DRAFT, mencatat Anda sebagai Sales owner, dan mengosongkan PM. Planned Mandays harus > 0 agar estimasi biaya awal tidak bisa dilewati." },
    { t: "gate", title: "Yang harus terisi di tahap ini", items: [
      "Data dasar project: code, name, client, description, contract value, start & end date",
      "Minimal 1 baris Resource Requirements sehingga Planned Mandays > 0",
    ] },

    // ---- Fase 2 ----
    { t: "phase", num: 2, title: "Penunjukan PM oleh Management", color: C.pm },
    { t: "tag", text: "Status: tetap DRAFT", color: C.pm },
    { t: "role", label: "Peran", value: "Management (PMO Director)" },
    { t: "h", text: "Langkah" },
    { t: "b", text: "Buka project DRAFT tersebut dari daftar Projects." },
    { t: "b", text: "Tetapkan Project Manager (PM) untuk menjalankan project." },
    { t: "note", text: "Jika PM sudah pernah diisi, sistem menolak penggantian (error 409). Selama PM belum ditunjuk, PM tidak dapat melanjutkan pengisian detail project." },

    // ---- Fase 3 ----
    { t: "phase", num: 3, title: "PM Menyelesaikan Draft", color: C.obs },
    { t: "tag", text: "DRAFT  ->  OBSERVATION", color: C.obs },
    { t: "role", label: "Peran", value: "Project Manager" },
    { t: "h", text: "Langkah" },
    { t: "b", text: "Buka project dan periksa data yang diisi Sales." },
    { t: "b", text: "Pada kartu Draft Completion, klik tombol penyelesaian draft. Status berpindah ke OBSERVATION." },
    { t: "note", text: "Di OBSERVATION, tab Overview dan tab lainnya terbuka penuh sehingga PM bisa melengkapi seluruh detail project." },

    // ---- Fase 4 ----
    { t: "phase", num: 4, title: "PM Melengkapi Detail hingga ACTIVE", color: C.active },
    { t: "tag", text: "OBSERVATION  ->  ACTIVE", color: C.active },
    { t: "role", label: "Peran", value: "Project Manager (dibantu Principal untuk usulan resource)" },
    { t: "h", text: "Urutan pengisian yang disarankan" },
    { t: "b", text: "1) Overview — lengkapi semua field inti: Client, Description, Start/End Date, Contract Value (> 0), Planned Mandays (> 0), Estimated Cost (> 0)." },
    { t: "b", text: "2) Resources — tetapkan Admin Project; isi tim Konsultan dan Technical Writer (orang asli) lengkap dengan Planned Mandays & Daily Rate; tambahkan Other Resources bila perlu. Minimal 1 resource." },
    { t: "b", text: "Principal dapat mengusulkan anggota timnya (Propose); PM atau Management menerima (Accept).", lvl: 1 },
    { t: "b", text: "3) Tasks — buat WBS minimal 1 task; atur parent/sub-task, dependency antar task, dan flag billable." },
    { t: "b", text: "4) Timeline — atur jadwal pada Gantt (geser bar) dan hubungan dependency antar task." },
    { t: "b", text: "5) RAID — catat minimal 1 item (Risk / Assumption / Issue / Dependency)." },
    { t: "b", text: "6) Billing — buat Billing Milestone (Terms of Payment). Pastikan total persentase tepat 100%." },
    { t: "b", text: "7) Activate — ubah Status project menjadi ACTIVE." },
    { t: "note", text: "Saat Activate, sistem memeriksa semua syarat. Bila ada yang kurang, muncul daftar item yang belum lengkap (error 400) dan status tidak berubah." },
    { t: "gate", title: "Syarat ACTIVE (semua wajib)", items: [
      "Overview inti lengkap: client, description, start & end date, contract value > 0, planned mandays > 0, estimated cost > 0",
      "PM sudah ditetapkan",
      "Minimal 1 Resource (ProjectResource)",
      "Minimal 1 Task",
      "Minimal 1 RAID item",
      "Total persentase Billing Milestone = 100%",
    ] },

    // ---- Fase 5 ----
    { t: "phase", num: 5, title: "Project Berjalan", color: C.running },
    { t: "tag", text: "Status: ACTIVE", color: C.running },
    { t: "h", text: "Konsultan & Technical Writer" },
    { t: "b", text: "Catat jam kerja pada Timesheet (status DRAFT lalu Submit). Tersedia bulk entry untuk input mingguan." },
    { t: "b", text: "Update status Task yang dikerjakan dan catat jam kerja pada task (Task Time Log)." },
    { t: "b", text: "Ajukan Expense bila ada biaya; status awal PENDING menunggu persetujuan." },
    { t: "b", text: "Untuk role yang diwajibkan, penuhi Work Hours 40 jam/minggu." },
    { t: "h", text: "Technical Writer (khusus)" },
    { t: "b", text: "Susun dan unggah dokumen laporan (Report) sesuai kebutuhan project." },
    { t: "h", text: "Admin Project" },
    { t: "b", text: "Unggah dokumen project di tab Documents: BAST, Invoice, Contract, Report." },
    { t: "h", text: "Project Manager" },
    { t: "b", text: "Approve / Reject Timesheet (atau Approve All Submitted) dan Expense." },
    { t: "b", text: "Kelola RAID, Tasks, dan Timeline selama project berjalan." },
    { t: "b", text: "Kelola Billing: tandai milestone INVOICED lalu PAID; pantau profit & margin di tab Financials." },
    { t: "note", text: "Hanya Timesheet dan Expense yang sudah APPROVED yang dihitung ke actual cost & margin." },

    // ---- Fase 6 ----
    { t: "phase", num: 6, title: "Penyelesaian Project", color: C.complete },
    { t: "tag", text: "ACTIVE  ->  COMPLETE", color: C.complete },
    { t: "role", label: "Peran", value: "Project Manager (bersama Management)" },
    { t: "h", text: "Langkah" },
    { t: "b", text: "Pastikan seluruh pekerjaan dan administrasi selesai (lihat syarat di bawah)." },
    { t: "b", text: "Isi alasan perubahan status (Status Change Reason)." },
    { t: "b", text: "Ubah Status menjadi COMPLETE." },
    { t: "gate", title: "Syarat COMPLETE (semua wajib)", items: [
      "Semua Task berstatus DONE",
      "Tidak ada Timesheet berstatus SUBMITTED (semua sudah di-approve / reject)",
      "Tidak ada Expense berstatus PENDING",
      "Tidak ada Billing Milestone berstatus PLANNED (semua INVOICED / PAID / CANCELLED)",
      "Tidak ada RAID item berstatus OPEN",
      "Minimal 1 dokumen BAST (versi terbaru) sudah diunggah",
      "Status Change Reason terisi",
    ] },

    // ---- Fase 7 ----
    { t: "phase", num: 7, title: "Penutupan Project", color: C.closed },
    { t: "tag", text: "COMPLETE  ->  CLOSED", color: C.closed },
    { t: "role", label: "Peran", value: "Project Manager / Management" },
    { t: "h", text: "Langkah" },
    { t: "b", text: "Setelah COMPLETE dan seluruh dokumen penutupan lengkap, ubah Status menjadi CLOSED." },
    { t: "note", text: "Status PAUSE dapat digunakan bila project dihentikan sementara, lalu dilanjutkan kembali ke ACTIVE. Sebagian tab (mis. Financials/Billing) tidak terlihat oleh role tertentu sesuai hak akses." },
  ],
};

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------

const EN: Doc = {
  title: "Project Flow Guide",
  subtitle: "SecureProfit Hub — the correct order of data entry from intake to closure",
  meta: "Internal team document  •  Edition 8 June 2026",
  chainLabel: "Project status lifecycle:",
  chain: "DRAFT  >  OBSERVATION  >  ACTIVE  >  COMPLETE  >  CLOSED      (optional: PAUSE)",
  footer: "Project Flow Guide — SecureProfit Hub",
  intro:
    "This document explains the flow of a project in SecureProfit Hub, from Sales winning a tender " +
    "to the project being closed (CLOSED). Follow the order of data entry in each phase so the project " +
    "status can advance smoothly. Menu and button names are written exactly as they appear in the " +
    "English application (e.g. Activate, Resources, Billing).",
  blocks: [
    // ---- Phase 1 ----
    { t: "phase", num: 1, title: "Sales Intake", color: C.draft },
    { t: "tag", text: "Status: DRAFT", color: C.draft },
    { t: "role", label: "Role", value: "Sales (project owner)" },
    { t: "h", text: "Steps" },
    { t: "b", text: "Open Projects > New Project. (Or use Leads > Convert if the project comes from a lead.)" },
    { t: "b", text: "Fill in the basics: Project Code, Project Name, Client, Description, Contract Value, Start Date, and End Date." },
    { t: "b", text: "Complete the Resource Requirements section (required). Each row holds: Role, Headcount, Mandays/person, and Daily Rate. You do not pick real people yet at this stage." },
    { t: "b", text: "The system automatically computes Planned Mandays and Estimated Cost from these rows.", lvl: 1 },
    { t: "b", text: "Click Create / Submit." },
    { t: "note", text: "On submit, the system forces Status = DRAFT, records you as the Sales owner, and leaves PM empty. Planned Mandays must be > 0 so the initial cost estimate cannot be bypassed." },
    { t: "gate", title: "What must be filled at this stage", items: [
      "Project basics: code, name, client, description, contract value, start & end date",
      "At least 1 Resource Requirements row so Planned Mandays > 0",
    ] },

    // ---- Phase 2 ----
    { t: "phase", num: 2, title: "Management Assigns a PM", color: C.pm },
    { t: "tag", text: "Status: stays DRAFT", color: C.pm },
    { t: "role", label: "Role", value: "Management (PMO Director)" },
    { t: "h", text: "Steps" },
    { t: "b", text: "Open the DRAFT project from the Projects list." },
    { t: "b", text: "Assign a Project Manager (PM) to run the project." },
    { t: "note", text: "If a PM has already been set, the system rejects the change (error 409). Until a PM is assigned, the PM cannot continue filling in project details." },

    // ---- Phase 3 ----
    { t: "phase", num: 3, title: "PM Completes the Draft", color: C.obs },
    { t: "tag", text: "DRAFT  ->  OBSERVATION", color: C.obs },
    { t: "role", label: "Role", value: "Project Manager" },
    { t: "h", text: "Steps" },
    { t: "b", text: "Open the project and review the data entered by Sales." },
    { t: "b", text: "On the Draft Completion card, click the complete-draft button. The status moves to OBSERVATION." },
    { t: "note", text: "In OBSERVATION, the Overview tab and the other tabs are fully open so the PM can complete all project details." },

    // ---- Phase 4 ----
    { t: "phase", num: 4, title: "PM Completes Details to Reach ACTIVE", color: C.active },
    { t: "tag", text: "OBSERVATION  ->  ACTIVE", color: C.active },
    { t: "role", label: "Role", value: "Project Manager (with Principals proposing resources)" },
    { t: "h", text: "Recommended order of entry" },
    { t: "b", text: "1) Overview — complete all core fields: Client, Description, Start/End Date, Contract Value (> 0), Planned Mandays (> 0), Estimated Cost (> 0)." },
    { t: "b", text: "2) Resources — set the Admin Project; staff the Konsultan and Technical Writer teams (real people) with Planned Mandays & Daily Rate; add Other Resources if needed. At least 1 resource." },
    { t: "b", text: "Principals can Propose their team members; the PM or Management Accepts them.", lvl: 1 },
    { t: "b", text: "3) Tasks — create the WBS with at least 1 task; set parent/sub-tasks, task dependencies, and the billable flag." },
    { t: "b", text: "4) Timeline — arrange the schedule on the Gantt (drag the bars) and the dependencies between tasks." },
    { t: "b", text: "5) RAID — record at least 1 item (Risk / Assumption / Issue / Dependency)." },
    { t: "b", text: "6) Billing — create Billing Milestones (Terms of Payment). Make sure the percentages total exactly 100%." },
    { t: "b", text: "7) Activate — change the project Status to ACTIVE." },
    { t: "note", text: "On Activate, the system checks every requirement. If anything is missing, it shows the list of incomplete items (error 400) and the status does not change." },
    { t: "gate", title: "ACTIVE requirements (all mandatory)", items: [
      "Core Overview complete: client, description, start & end date, contract value > 0, planned mandays > 0, estimated cost > 0",
      "PM assigned",
      "At least 1 Resource (ProjectResource)",
      "At least 1 Task",
      "At least 1 RAID item",
      "Billing Milestone percentages total 100%",
    ] },

    // ---- Phase 5 ----
    { t: "phase", num: 5, title: "Project In Progress", color: C.running },
    { t: "tag", text: "Status: ACTIVE", color: C.running },
    { t: "h", text: "Konsultan & Technical Writer" },
    { t: "b", text: "Log work hours on the Timesheet (status DRAFT, then Submit). A weekly bulk entry is available." },
    { t: "b", text: "Update the status of the Tasks you work on and log hours per task (Task Time Log)." },
    { t: "b", text: "Submit an Expense when there is a cost; it starts as PENDING awaiting approval." },
    { t: "b", text: "For required roles, meet the Work Hours target of 40 hours/week." },
    { t: "h", text: "Technical Writer (specific)" },
    { t: "b", text: "Prepare and upload report documents (Report) as the project requires." },
    { t: "h", text: "Admin Project" },
    { t: "b", text: "Upload project documents in the Documents tab: BAST, Invoice, Contract, Report." },
    { t: "h", text: "Project Manager" },
    { t: "b", text: "Approve / Reject Timesheets (or Approve All Submitted) and Expenses." },
    { t: "b", text: "Manage RAID, Tasks, and the Timeline as the project runs." },
    { t: "b", text: "Manage Billing: mark milestones INVOICED then PAID; monitor profit & margin in the Financials tab." },
    { t: "note", text: "Only APPROVED Timesheets and Expenses count toward actual cost & margin." },

    // ---- Phase 6 ----
    { t: "phase", num: 6, title: "Project Completion", color: C.complete },
    { t: "tag", text: "ACTIVE  ->  COMPLETE", color: C.complete },
    { t: "role", label: "Role", value: "Project Manager (with Management)" },
    { t: "h", text: "Steps" },
    { t: "b", text: "Ensure all work and administration are done (see requirements below)." },
    { t: "b", text: "Fill in the Status Change Reason." },
    { t: "b", text: "Change the Status to COMPLETE." },
    { t: "gate", title: "COMPLETE requirements (all mandatory)", items: [
      "All Tasks are DONE",
      "No Timesheet in SUBMITTED status (all approved / rejected)",
      "No Expense in PENDING status",
      "No Billing Milestone in PLANNED status (all INVOICED / PAID / CANCELLED)",
      "No RAID item in OPEN status",
      "At least 1 BAST document (latest version) uploaded",
      "Status Change Reason filled in",
    ] },

    // ---- Phase 7 ----
    { t: "phase", num: 7, title: "Project Closure", color: C.closed },
    { t: "tag", text: "COMPLETE  ->  CLOSED", color: C.closed },
    { t: "role", label: "Role", value: "Project Manager / Management" },
    { t: "h", text: "Steps" },
    { t: "b", text: "After COMPLETE and once all closing documents are in place, change the Status to CLOSED." },
    { t: "note", text: "The PAUSE status can be used when a project is temporarily halted, then resumed back to ACTIVE. Some tabs (e.g. Financials/Billing) are hidden from certain roles based on access rights." },
  ],
};

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

const M = 50;
const INK = "#1f2937";
const MUTED = "#64748b";

function render(d: Doc, outPath: string): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: M, bottom: M, left: M, right: M }, bufferPages: true });
    const stream = createWriteStream(outPath);
    doc.pipe(stream);
    stream.on("finish", () => resolveP());
    stream.on("error", rejectP);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const CW = pageW - M * 2;
    const bottom = pageH - M - 18;

    const ensure = (h: number) => {
      if (doc.y + h > bottom) doc.addPage();
    };

    // ---- Cover header block ----
    const headH = 78;
    doc.roundedRect(M, M, CW, headH, 8).fill(C.active);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(22).text(d.title, M + 20, M + 16, { width: CW - 40 });
    doc.font("Helvetica").fontSize(10.5).fillColor("#d1fae5").text(d.subtitle, M + 20, M + 46, { width: CW - 40 });
    doc.y = M + headH + 10;

    // meta
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(d.meta, M, doc.y, { width: CW });
    doc.moveDown(0.6);

    // chain band
    const chainH = 34;
    const cy = doc.y;
    doc.roundedRect(M, cy, CW, chainH, 6).fillAndStroke("#f0fdfa", "#99f6e4");
    doc.fillColor(C.active).font("Helvetica-Bold").fontSize(7.5).text(d.chainLabel.toUpperCase(), M + 12, cy + 6, { width: CW - 24 });
    doc.fillColor("#134e4a").font("Helvetica-Bold").fontSize(9.5).text(d.chain, M + 12, cy + 17, { width: CW - 24 });
    doc.y = cy + chainH + 12;

    // intro
    doc.font("Helvetica").fontSize(10.5).fillColor(INK).text(d.intro, M, doc.y, { width: CW, align: "justify" });
    doc.moveDown(0.8);

    // ---- Blocks ----
    const drawCheck = (x: number, y: number) => {
      doc.save().lineWidth(1.4).strokeColor(C.active);
      doc.moveTo(x, y + 3.5).lineTo(x + 3, y + 6.5).lineTo(x + 8, y).stroke();
      doc.restore();
    };

    for (const b of d.blocks) {
      switch (b.t) {
        case "phase": {
          const h = 30;
          ensure(h + 16);
          doc.moveDown(0.4);
          const yy = doc.y;
          doc.roundedRect(M, yy, CW, h, 6).fill(b.color);
          doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(13).text(`${b.num}.  ${b.title}`, M + 14, yy + 8, { width: CW - 28 });
          doc.y = yy + h + 8;
          break;
        }
        case "tag": {
          doc.font("Helvetica-Bold").fontSize(8.5);
          const tw = doc.widthOfString(b.text) + 18;
          const h = 16;
          ensure(h + 4);
          const yy = doc.y;
          doc.roundedRect(M, yy, tw, h, 8).lineWidth(0.9).fillAndStroke("#ffffff", b.color);
          doc.fillColor(b.color).font("Helvetica-Bold").fontSize(8.5).text(b.text, M + 9, yy + 4.5);
          doc.y = yy + h + 8;
          break;
        }
        case "role": {
          doc.font("Helvetica-Bold").fontSize(10).fillColor(MUTED);
          const lbl = `${b.label}:  `;
          const lblW = doc.widthOfString(lbl);
          ensure(16);
          const yy = doc.y;
          doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(10).text(lbl, M, yy, { continued: true });
          doc.fillColor(INK).font("Helvetica").fontSize(10).text(b.value);
          doc.moveDown(0.5);
          void lblW;
          break;
        }
        case "h": {
          doc.font("Helvetica-Bold").fontSize(11).fillColor(b.text ? C.active : C.active);
          ensure(20);
          const yy = doc.y;
          doc.text(b.text, M, yy, { width: CW });
          doc.moveTo(M, doc.y + 1).lineTo(M + CW, doc.y + 1).lineWidth(0.5).strokeColor("#e2e8f0").stroke();
          doc.moveDown(0.45);
          break;
        }
        case "p": {
          doc.font("Helvetica").fontSize(10.5).fillColor(INK);
          const h = doc.heightOfString(b.text, { width: CW, align: "justify" });
          ensure(h);
          doc.text(b.text, M, doc.y, { width: CW, align: "justify" });
          doc.moveDown(0.4);
          break;
        }
        case "b": {
          const lvl = b.lvl ?? 0;
          const indent = 16 + lvl * 18;
          const bx = M + indent;
          const tw = CW - indent;
          doc.font("Helvetica").fontSize(10.5).fillColor(INK);
          const h = doc.heightOfString(b.text, { width: tw });
          ensure(h + 2);
          const yy = doc.y;
          doc.circle(M + indent - 7, yy + 5.5, lvl === 0 ? 2 : 1.6).fill(lvl === 0 ? C.active : "#94a3b8");
          doc.fillColor(INK).font("Helvetica").fontSize(10.5).text(b.text, bx, yy, { width: tw });
          doc.moveDown(0.3);
          break;
        }
        case "note": {
          doc.font("Helvetica-Oblique").fontSize(9.5).fillColor(MUTED);
          const tw = CW - 22;
          const textH = doc.heightOfString(b.text, { width: tw });
          const boxH = textH + 14;
          ensure(boxH + 4);
          const yy = doc.y;
          doc.roundedRect(M, yy, CW, boxH, 5).fillAndStroke("#f8fafc", "#e2e8f0");
          doc.roundedRect(M, yy, 3.5, boxH, 2).fill("#94a3b8");
          doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(9.5).text(b.text, M + 14, yy + 7, { width: tw });
          doc.y = yy + boxH + 8;
          break;
        }
        case "gate": {
          // measure
          doc.font("Helvetica-Bold").fontSize(10.5);
          let innerH = doc.heightOfString(b.title, { width: CW - 28 }) + 8;
          doc.font("Helvetica").fontSize(10);
          for (const it of b.items) innerH += doc.heightOfString(it, { width: CW - 46 }) + 5;
          const boxH = innerH + 16;
          ensure(boxH + 6);
          doc.moveDown(0.2);
          const yy = doc.y;
          doc.roundedRect(M, yy, CW, boxH, 7).fillAndStroke("#f0fdfa", "#5eead4");
          doc.roundedRect(M, yy, 4, boxH, 2).fill(C.active);
          let ly = yy + 9;
          doc.fillColor(C.active).font("Helvetica-Bold").fontSize(10.5).text(b.title, M + 16, ly, { width: CW - 28 });
          ly = doc.y + 6;
          for (const it of b.items) {
            drawCheck(M + 16, ly + 1);
            doc.fillColor("#134e4a").font("Helvetica").fontSize(10).text(it, M + 32, ly, { width: CW - 46 });
            ly = doc.y + 5;
          }
          doc.y = yy + boxH + 10;
          break;
        }
        case "space": {
          ensure(b.h);
          doc.y += b.h;
          break;
        }
      }
    }

    // ---- Footer page numbers ----
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      // Drawing below the bottom margin makes pdfkit auto-append a blank page;
      // temporarily clear the bottom margin so the footer stays on this page.
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(8).fillColor("#94a3b8");
      doc.text(`${d.footer}      •      ${i + 1} / ${range.count}`, M, pageH - 30, { width: CW, align: "center", lineBreak: false });
    }

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const idPath = resolve(OUT_DIR, "Panduan-Alur-Project-SecureProfit-Hub-ID.pdf");
  const enPath = resolve(OUT_DIR, "SecureProfit-Hub-Project-Flow-Guide-EN.pdf");
  await render(ID, idPath);
  await render(EN, enPath);
  console.log("Wrote:\n  " + idPath + "\n  " + enPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
