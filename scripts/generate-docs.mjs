import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const OUT_DIR = path.resolve("docs");
fs.mkdirSync(OUT_DIR, { recursive: true });

const NAVY = "#0B1220";
const CYBER = "#22D3A6";
const TEXT = "#0F172A";
const MUTED = "#475569";
const SOFT = "#F1F5F9";
const BORDER = "#CBD5E1";

function newDoc(title, subtitle) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    info: { Title: title, Author: "SecureProfit Hub", Subject: subtitle },
    bufferPages: true,
  });

  doc.registerFont("body", "Helvetica");
  doc.registerFont("bold", "Helvetica-Bold");
  doc.registerFont("italic", "Helvetica-Oblique");
  doc.registerFont("mono", "Courier");

  return doc;
}

function cover(doc, title, subtitle, version, date) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(NAVY);
  doc.rect(0, 0, doc.page.width, 8).fill(CYBER);

  doc.fillColor(CYBER).font("bold").fontSize(12)
     .text("SECUREPROFIT HUB", 60, 80, { characterSpacing: 4 });

  doc.fillColor("#FFFFFF").font("bold").fontSize(38)
     .text(title, 60, 220, { width: doc.page.width - 120 });

  doc.fillColor("#94A3B8").font("body").fontSize(14)
     .text(subtitle, 60, 300, { width: doc.page.width - 120 });

  doc.moveTo(60, 360).lineTo(doc.page.width - 60, 360).strokeColor(CYBER).lineWidth(1).stroke();

  doc.fillColor("#E2E8F0").font("body").fontSize(11)
     .text(`Version ${version}`, 60, 380)
     .text(`Last updated: ${date}`, 60, 398)
     .text("Confidential — Internal Use Only", 60, 416);

  doc.fillColor("#64748B").font("italic").fontSize(10)
     .text("IT Security Consulting — Project & Profitability Management Platform",
       60, doc.page.height - 90, { width: doc.page.width - 120 });

  doc.addPage();
  resetPageBg(doc);
}

function resetPageBg(doc) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFFFFF");
}

function header(doc, docTitle) {
  const w = doc.page.width;
  doc.rect(0, 0, w, 36).fill(NAVY);
  doc.rect(0, 36, w, 2).fill(CYBER);
  doc.fillColor(CYBER).font("bold").fontSize(9).text("SECUREPROFIT HUB", 60, 13, { characterSpacing: 2 });
  doc.fillColor("#94A3B8").font("body").fontSize(9).text(docTitle, 0, 13, { align: "right", width: w - 60 });
  doc.fillColor(TEXT);
  doc.y = 60;
}

function footer(doc, pageNum, total) {
  const y = doc.page.height - 36;
  doc.moveTo(60, y).lineTo(doc.page.width - 60, y).strokeColor(BORDER).lineWidth(0.5).stroke();
  doc.fillColor(MUTED).font("body").fontSize(8)
     .text("© 2026 SecureProfit Hub", 60, y + 8)
     .text(`Page ${pageNum} of ${total}`, 0, y + 8, { align: "right", width: doc.page.width - 60 });
}

function ensureSpace(doc, h) {
  if (doc.y + h > doc.page.height - 60) {
    doc.addPage();
  }
}

function h1(doc, text) {
  if (doc.y > 100) doc.moveDown(0.5);
  ensureSpace(doc, 60);
  doc.fillColor(NAVY).font("bold").fontSize(22).text(text);
  doc.moveTo(doc.x, doc.y + 4).lineTo(doc.x + 60, doc.y + 4).strokeColor(CYBER).lineWidth(2).stroke();
  doc.moveDown(1);
  doc.fillColor(TEXT);
}

function h2(doc, text) {
  ensureSpace(doc, 50);
  doc.moveDown(0.6);
  doc.fillColor(NAVY).font("bold").fontSize(15).text(text);
  doc.moveDown(0.4);
  doc.fillColor(TEXT);
}

function h3(doc, text) {
  ensureSpace(doc, 40);
  doc.moveDown(0.4);
  doc.fillColor(NAVY).font("bold").fontSize(12).text(text);
  doc.moveDown(0.2);
  doc.fillColor(TEXT);
}

function p(doc, text) {
  ensureSpace(doc, 20);
  doc.font("body").fontSize(10.5).fillColor(TEXT).text(text, { align: "left", lineGap: 2 });
  doc.moveDown(0.4);
}

function bullets(doc, items) {
  doc.font("body").fontSize(10.5).fillColor(TEXT);
  for (const it of items) {
    ensureSpace(doc, 18);
    const x = doc.x;
    doc.fillColor(CYBER).text("•  ", { continued: true });
    doc.fillColor(TEXT).text(it, { lineGap: 2 });
    doc.x = x;
  }
  doc.moveDown(0.3);
}

function code(doc, text) {
  const lines = text.split("\n");
  const lh = 12;
  const pad = 8;
  const h = lines.length * lh + pad * 2;
  ensureSpace(doc, h + 8);
  const x = doc.x, y = doc.y, w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.rect(x, y, w, h).fill(SOFT).strokeColor(BORDER).lineWidth(0.5).stroke();
  doc.fillColor(NAVY).font("mono").fontSize(9);
  let ty = y + pad;
  for (const ln of lines) {
    doc.text(ln, x + pad, ty, { width: w - pad * 2, lineBreak: false });
    ty += lh;
  }
  doc.x = x;
  doc.y = y + h + 6;
  doc.fillColor(TEXT);
}

function callout(doc, label, text, color = CYBER) {
  const x = doc.x, w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const padX = 12, padY = 8;
  doc.font("bold").fontSize(10);
  const titleH = 14;
  doc.font("body").fontSize(10);
  const bodyH = doc.heightOfString(text, { width: w - padX * 2 });
  const h = titleH + bodyH + padY * 2 + 4;
  ensureSpace(doc, h + 8);
  const y = doc.y;
  doc.rect(x, y, w, h).fill("#F8FAFC").strokeColor(color).lineWidth(0.5).stroke();
  doc.rect(x, y, 4, h).fill(color);
  doc.fillColor(NAVY).font("bold").fontSize(10).text(label, x + padX, y + padY);
  doc.fillColor(TEXT).font("body").fontSize(10).text(text, x + padX, y + padY + titleH + 2, { width: w - padX * 2 });
  doc.x = x;
  doc.y = y + h + 8;
}

function table(doc, headers, rows, widths) {
  const x0 = doc.x;
  const totalW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const w = widths || headers.map(() => totalW / headers.length);
  const sum = w.reduce((a, b) => a + b, 0);
  const scale = totalW / sum;
  const cols = w.map((c) => c * scale);

  const drawRow = (cells, isHeader) => {
    doc.font(isHeader ? "bold" : "body").fontSize(9.5);
    const heights = cells.map((c, i) => doc.heightOfString(String(c), { width: cols[i] - 12 }));
    const rowH = Math.max(...heights) + 12;
    ensureSpace(doc, rowH + 4);
    let cx = x0;
    const ry = doc.y;
    if (isHeader) doc.rect(x0, ry, totalW, rowH).fill(NAVY);
    cells.forEach((c, i) => {
      if (isHeader) {
        doc.fillColor("#FFFFFF");
      } else {
        doc.rect(cx, ry, cols[i], rowH).strokeColor(BORDER).lineWidth(0.4).stroke();
        doc.fillColor(TEXT);
      }
      doc.text(String(c), cx + 6, ry + 6, { width: cols[i] - 12 });
      cx += cols[i];
    });
    doc.y = ry + rowH;
    doc.x = x0;
  };

  drawRow(headers, true);
  rows.forEach((r) => drawRow(r, false));
  doc.moveDown(0.6);
  doc.fillColor(TEXT);
}

function finalize(doc, docTitle) {
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(i);
    if (i === 0) continue; // skip cover
    header(doc, docTitle);
    footer(doc, i, total - 1);
  }
}

// ─────────────────────────────────────────────────────────────────────
// USER GUIDE
// ─────────────────────────────────────────────────────────────────────
function buildUserGuide() {
  const out = path.join(OUT_DIR, "SecureProfit_Hub_User_Guide.pdf");
  const doc = newDoc("SecureProfit Hub — User Guide", "Panduan Pengguna");
  doc.pipe(fs.createWriteStream(out));

  cover(doc, "User Guide", "Panduan Pengguna SecureProfit Hub", "1.0", new Date().toISOString().slice(0, 10));

  h1(doc, "1. Pendahuluan");
  p(doc, "SecureProfit Hub adalah platform manajemen project dan profitability untuk perusahaan konsultan IT Security. Aplikasi ini membantu tim mengelola seluruh siklus hidup project — dari registrasi awal, pencatatan timesheet, persetujuan, monitoring P&L real-time, hingga upload dokumen penutup project (BAST & Invoice).");
  callout(doc, "Audiens", "Dokumen ini ditujukan untuk seluruh pengguna aplikasi: Management, Project Manager, Sales, Admin Project, Konsultan, dan Technical Writer.");

  h2(doc, "1.1 Akses Aplikasi");
  bullets(doc, [
    "Buka URL aplikasi yang diberikan oleh administrator (mis. https://secureprofit-hub.replit.app).",
    "Gunakan email dan password yang diberikan oleh Management.",
    "Aplikasi mendukung browser modern (Chrome, Edge, Firefox, Safari) dan responsif untuk mobile.",
  ]);

  h1(doc, "2. Peran & Hak Akses");
  p(doc, "SecureProfit Hub memiliki 6 peran. Setiap peran memiliki dashboard dan menu yang disesuaikan.");
  table(doc,
    ["Peran", "Tanggung Jawab Utama"],
    [
      ["Management", "Akses penuh, monitoring P&L portofolio, kelola user & klien."],
      ["Project Manager", "Buat & kelola project, approve/reject timesheet, ubah status project."],
      ["Sales", "Daftarkan project baru (Observation), monitor revenue & margin project sendiri."],
      ["Admin Project", "Upload BAST & Invoice untuk project Complete agar otomatis Closed."],
      ["Konsultan", "Catat timesheet harian; lihat status approval."],
      ["Technical Writer", "Catat timesheet harian; lihat status approval."],
    ],
    [120, 360],
  );

  h1(doc, "3. Login & Navigasi");
  h2(doc, "3.1 Login");
  bullets(doc, [
    "Masukkan email dan password pada halaman login.",
    "Setelah berhasil, sistem akan mengarahkan ke dashboard sesuai peran Anda.",
    "Gunakan menu profil di kanan atas untuk logout.",
  ]);
  h2(doc, "3.2 Sidebar");
  bullets(doc, [
    "Dashboard — ringkasan sesuai peran.",
    "Projects — daftar seluruh project dengan filter status (Observation, Active, Pause, Complete, Closed).",
    "Time Tracking — pencatatan jam kerja harian.",
    "Approval Inbox — hanya untuk PM & Management; berisi timesheet yang menunggu approval.",
    "Clients — kelola data klien (PM/Management).",
    "Users — kelola pengguna (Management).",
  ]);
  h2(doc, "3.3 Notifikasi");
  p(doc, "Ikon lonceng di pojok kanan atas menampilkan notifikasi sesuai peran:");
  bullets(doc, [
    "PM/Management: jumlah timesheet menunggu approval.",
    "Admin Project: jumlah project berstatus Complete yang perlu di-upload BAST/Invoice-nya.",
    "Konsultan/Technical Writer: jumlah timesheet yang ditolak (perlu direvisi).",
  ]);

  h1(doc, "4. Mendaftarkan Project Baru (Sales / PM / Management)");
  bullets(doc, [
    "Buka menu Projects → tombol \"New Project\".",
    "Isi SPK/PO Number, Project Name, pilih Client, Sales, dan Project Manager.",
    "Tentukan tanggal mulai & akhir, dan Contract Value (Harga Jual).",
    "Tambahkan baris Resource Requirements: pilih role (Konsultan, PM, Technical Writer), jumlah headcount, dan estimasi mandays.",
    "Sistem otomatis menghitung Estimated Cost dan Estimated Profit berdasarkan tarif harian standar.",
  ]);
  callout(doc, "Tarif Harian Standar",
    "Konsultan: Rp 1.800.000 — Project Manager: Rp 2.500.000 — Technical Writer: Rp 1.200.000 per hari.");
  p(doc, "Project baru selalu berstatus Observation. Status berikutnya hanya bisa diubah oleh PM atau Management dari halaman detail project.");

  h1(doc, "5. Siklus Hidup Project");
  table(doc,
    ["Status", "Arti", "Berikutnya"],
    [
      ["Observation", "Tahap penawaran/qualification, belum eksekusi.", "Active atau dibatalkan."],
      ["Active", "Project sedang berjalan, timesheet dicatat & disetujui.", "Pause atau Complete."],
      ["Pause", "Sementara dihentikan (mis. menunggu klien).", "Active atau Complete."],
      ["Complete", "Pekerjaan selesai, menunggu BAST + Invoice.", "Closed (otomatis)."],
      ["Closed", "BAST + Invoice telah di-upload, project ditutup.", "(akhir siklus)"],
    ],
    [80, 280, 120],
  );
  callout(doc, "Penting",
    "Status Closed di-set otomatis oleh sistem ketika BAST dan Invoice (PDF) sudah di-upload pada project ber-status Complete. Status ini tidak bisa diubah manual.");

  h1(doc, "6. Time Tracking (Konsultan / TW / PM)");
  bullets(doc, [
    "Buka menu Time Tracking → tombol \"Add Entry\".",
    "Pilih project, tanggal kerja, jam kerja, dan deskripsi.",
    "Tanggal kerja maksimal 5 hari kerja (Senin–Jumat) ke belakang dari hari ini.",
    "Konsultan/TW: entry berstatus Submitted, menunggu approval PM.",
    "PM/Management: entry langsung Approved (auto-approve).",
    "Entry yang ditolak (Rejected) bisa Anda hapus dan input ulang.",
  ]);

  h1(doc, "7. Approval Timesheet (PM / Management)");
  bullets(doc, [
    "Buka menu Approval Inbox.",
    "Tabel menampilkan semua entry Submitted dari project yang Anda kelola.",
    "Klik Approve untuk menyetujui, atau Reject (wajib isi alasan) untuk menolak.",
    "Alasan penolakan akan tampil di sisi Konsultan/TW agar bisa direvisi.",
  ]);

  h1(doc, "8. Financial & Dashboard");
  h2(doc, "8.1 Tab Financials di Detail Project");
  bullets(doc, [
    "Revenue (Harga Jual) — nilai kontrak.",
    "Estimated Cost — biaya operasional rencana.",
    "Actual Cost — akumulasi dari timesheet Approved × tarif harian.",
    "Actual Profit / Loss — Revenue dikurangi Actual Cost; hijau jika untung, merah jika rugi.",
    "Forecasted Final Profit — proyeksi profit akhir berdasarkan burn rate sekarang.",
    "Burn Rate — % mandays terpakai vs rencana.",
    "Chart Monthly Cost vs Revenue — grafik bulanan biaya vs pendapatan ter-amortisasi.",
  ]);
  h2(doc, "8.2 Dashboard per Peran");
  bullets(doc, [
    "Management/PM: KPI portofolio, tren profit, distribusi status, top projects, aktivitas terbaru.",
    "Sales: \"My Projects\" — KPI revenue/margin, revenue per klien, distribusi status, daftar project.",
    "Admin Project: project Complete yang menunggu dokumen, recently closed projects.",
    "Konsultan/TW: ringkasan jam approved/pending/rejected, grafik 14 hari terakhir, riwayat timesheet.",
  ]);

  h1(doc, "9. Upload BAST & Invoice (Admin Project)");
  bullets(doc, [
    "Buka Dashboard Admin Project → tabel \"Projects Awaiting Closing Documents\".",
    "Klik \"Upload Docs\" pada project yang dituju.",
    "Pada tab Documents, gunakan kartu BAST untuk upload PDF BAST, dan kartu Invoice untuk PDF Invoice.",
    "Format file: PDF saja, ukuran maksimal 10 MB.",
    "Setelah kedua file ter-upload, status project otomatis berubah menjadi Closed.",
  ]);
  callout(doc, "Tip",
    "Anda bisa menekan \"Replace\" pada kartu BAST atau Invoice untuk meng-upload ulang versi terbaru.");

  h1(doc, "10. Troubleshooting Singkat");
  table(doc,
    ["Masalah", "Solusi"],
    [
      ["Tidak bisa input timesheet > 5 hari kerja lalu", "Hubungi PM/Management; aturan ini bersifat hard-limit."],
      ["File PDF ditolak saat upload", "Pastikan format benar PDF dan ukuran ≤ 10 MB."],
      ["Status tidak berubah ke Closed setelah upload", "Pastikan kedua dokumen (BAST & Invoice) sudah ter-upload dan status sebelumnya adalah Complete."],
      ["Lupa password", "Hubungi Management/Admin sistem untuk reset."],
    ],
    [220, 260],
  );

  finalize(doc, "User Guide");
  doc.end();
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// TECHNICAL DOCUMENTATION
// ─────────────────────────────────────────────────────────────────────
function buildTechDoc() {
  const out = path.join(OUT_DIR, "SecureProfit_Hub_Technical_Documentation.pdf");
  const doc = newDoc("SecureProfit Hub — Technical Documentation", "Engineering Reference");
  doc.pipe(fs.createWriteStream(out));

  cover(doc, "Technical Documentation", "Architecture, API & Deployment Reference", "1.0", new Date().toISOString().slice(0, 10));

  h1(doc, "1. Overview");
  p(doc, "SecureProfit Hub adalah aplikasi full-stack web untuk firma konsultan IT Security. Stack utama: React + Vite + TypeScript di frontend, Node.js + Express + Prisma di backend, PostgreSQL sebagai database, dan JWT untuk autentikasi.");
  h2(doc, "1.1 Stack Teknologi");
  table(doc, ["Layer", "Teknologi"], [
    ["Frontend", "React 18, Vite, TypeScript, TailwindCSS, shadcn/ui, Recharts, Wouter, TanStack Query"],
    ["API Client", "Orval-generated React Query hooks (lib/api-client-react)"],
    ["Backend", "Node.js 20+, Express 5, Prisma ORM, Pino logger, Multer (uploads)"],
    ["Database", "PostgreSQL 14+"],
    ["Auth", "JWT (Bearer token, localStorage), bcrypt password hashing"],
    ["Build", "pnpm workspace monorepo"],
  ], [90, 390]);

  h1(doc, "2. Struktur Repository");
  code(doc,
`/
├─ artifacts/
│   ├─ api-server/        Express + Prisma backend
│   │   ├─ src/
│   │   │   ├─ routes/    (auth, users, clients, projects, resources,
│   │   │   │              timesheets, documents, dashboard, uploads)
│   │   │   ├─ middlewares/auth.ts
│   │   │   ├─ lib/serializers.ts
│   │   │   └─ app.ts
│   │   └─ uploads/       File storage (BAST/Invoice PDFs)
│   ├─ web/               React + Vite frontend
│   │   └─ src/
│   │       ├─ pages/     (dashboard, projects, timesheets, approvals,
│   │       │              clients, users, settings, login)
│   │       ├─ components/(layout, common, ui [shadcn])
│   │       └─ lib/       (auth, format, roles, utils)
│   └─ mockup-sandbox/    Component preview (dev only)
├─ lib/
│   ├─ db/                Prisma schema, client, seed
│   ├─ api-spec/          openapi.yaml + orval codegen config
│   ├─ api-client-react/  Generated TanStack Query hooks
│   └─ api-zod/           Generated Zod validators
└─ scripts/`);

  h1(doc, "3. Data Model (Prisma)");
  p(doc, "Skema utama (Prisma) — file lib/db/prisma/schema.prisma.");
  table(doc, ["Model", "Field Penting"], [
    ["User", "id, email (unique), name, role (UserRole), passwordHash, dailyRate, isActive"],
    ["Client", "id, name, contactPerson, email, phone, industry"],
    ["Project", "id, code (SPK/PO), name, clientId, salesId, pmId, status (ProjectStatus), startDate, endDate, contractValue, estimatedCost, plannedMandays"],
    ["ProjectResource", "id, projectId, userId, roleInProject, plannedMandays, dailyRate"],
    ["Timesheet", "id, userId, projectId, workDate, hours, description, status (TimesheetStatus), approverId, rejectionReason"],
    ["Document", "id, projectId, type (DocumentType: BAST | INVOICE | CONTRACT | OTHER), fileName, fileUrl, uploadedById"],
    ["Activity", "id, type, message, userId, projectId, createdAt"],
  ], [110, 370]);
  h2(doc, "3.1 Enum");
  bullets(doc, [
    "UserRole: MANAGEMENT | PROJECT_MANAGER | SALES | ADMIN_PROJECT | KONSULTAN | TECHNICAL_WRITER",
    "ProjectStatus: OBSERVATION | ACTIVE | PAUSE | COMPLETE | CLOSED",
    "TimesheetStatus: DRAFT | SUBMITTED | APPROVED | REJECTED",
    "DocumentType: BAST | INVOICE | CONTRACT | OTHER",
  ]);

  h1(doc, "4. Authentication & Authorization");
  bullets(doc, [
    "POST /api/auth/login → terima { token, user }; token disimpan di localStorage key 'auth_token'.",
    "Middleware requireAuth memverifikasi Bearer token (HS256, secret = JWT_SECRET).",
    "Middleware requireRole(...roles) menjaga endpoint sensitif berdasarkan UserRole.",
    "Password di-hash dengan bcrypt (10 rounds) di seed dan di endpoint /users.",
  ]);
  code(doc,
`// Contoh: requireRole pada endpoint document upload
router.post(
  "/projects/:id/documents",
  requireRole("ADMIN_PROJECT", "MANAGEMENT", "PROJECT_MANAGER"),
  handler,
);`);

  h1(doc, "5. REST API Reference");
  p(doc, "Base path: /api. Semua endpoint memerlukan Bearer token kecuali /api/auth/login dan /api/healthz.");
  h2(doc, "5.1 Auth & Users");
  table(doc, ["Method", "Path", "Role"], [
    ["POST", "/auth/login", "public"],
    ["GET", "/auth/me", "any"],
    ["POST", "/auth/logout", "any"],
    ["GET", "/users", "MGMT"],
    ["POST", "/users", "MGMT"],
    ["PATCH", "/users/:id", "MGMT"],
    ["DELETE", "/users/:id", "MGMT"],
  ], [60, 240, 100]);
  h2(doc, "5.2 Clients & Projects");
  table(doc, ["Method", "Path", "Role"], [
    ["GET / POST", "/clients", "any / MGMT,PM"],
    ["PATCH / DELETE", "/clients/:id", "MGMT,PM"],
    ["GET", "/projects?status=", "any"],
    ["POST", "/projects", "MGMT,PM,SALES"],
    ["GET", "/projects/:id", "any"],
    ["PATCH", "/projects/:id (incl. status)", "MGMT,PM,SALES"],
    ["DELETE", "/projects/:id", "MGMT"],
    ["GET", "/projects/:id/financials", "any"],
    ["GET / POST", "/projects/:id/resources", "MGMT,PM"],
    ["DELETE", "/resources/:resourceId", "MGMT,PM"],
  ], [80, 280, 120]);
  h2(doc, "5.3 Timesheets");
  table(doc, ["Method", "Path", "Catatan"], [
    ["GET", "/timesheets?status&projectId&scope=mine|approval|all", "scope=approval untuk PM"],
    ["POST", "/timesheets", "auto-APPROVED untuk PM/MGMT, lainnya SUBMITTED"],
    ["POST", "/timesheets/:id/submit", "DRAFT → SUBMITTED"],
    ["POST", "/timesheets/:id/approve", "PM/MGMT only"],
    ["POST", "/timesheets/:id/reject", "PM/MGMT, body { reason }"],
    ["DELETE", "/timesheets/:id", "owner / PM"],
  ], [60, 240, 180]);
  callout(doc, "Validasi Tanggal Timesheet",
    "workDate harus berada dalam 5 hari kerja terakhir (Senin–Jumat). Validasi dilakukan dengan walking-back skipping Sabtu/Minggu di routes/timesheets.ts.");
  h2(doc, "5.4 Documents & Uploads");
  table(doc, ["Method", "Path", "Catatan"], [
    ["GET", "/projects/:id/documents", "list dokumen project"],
    ["POST", "/projects/:id/documents", "{type, fileName, fileUrl}; ADMIN_PROJECT/PM/MGMT"],
    ["DELETE", "/documents/:id", "ADMIN_PROJECT/PM/MGMT"],
    ["POST", "/uploads", "multipart/form-data; field 'file' (PDF, ≤10MB) → {fileName, fileUrl}"],
    ["GET", "/files/:filename", "Static serve dari folder uploads/"],
  ], [60, 220, 200]);
  callout(doc, "Auto-Close Logic",
    "Setelah dokumen baru dibuat, jika project.status === 'COMPLETE' DAN project memiliki minimal satu BAST DAN satu INVOICE, status di-update otomatis ke CLOSED dan dicatat di Activity log.");
  h2(doc, "5.5 Dashboard");
  table(doc, ["Method", "Path"], [
    ["GET", "/dashboard/summary"],
    ["GET", "/dashboard/profit-trend"],
    ["GET", "/dashboard/status-breakdown"],
    ["GET", "/dashboard/top-projects"],
  ], [60, 420]);

  h1(doc, "6. Frontend Architecture");
  bullets(doc, [
    "Routing dengan Wouter; route spesifik (mis. /projects/new) WAJIB didaftarkan sebelum /projects/:id agar match-order benar.",
    "TanStack Query untuk data fetching, hooks dihasilkan oleh Orval dari openapi.yaml.",
    "Custom fetcher (lib/api-client-react/src/custom-fetch.ts) menyisipkan Authorization header dari localStorage.",
    "Dashboard router di pages/dashboard/index.tsx mengarahkan tampilan berdasarkan UserRole: SALES → SalesDashboard, ADMIN_PROJECT → AdminProjectDashboard, KONSULTAN/TW → ConsultantDashboard, lainnya → ManagementDashboard.",
    "Tema dark cyber-security: navy background (#0B1220) + accent cyber green; lihat tailwind.config.ts dan src/index.css untuk variabel HSL.",
  ]);

  h1(doc, "7. Code Generation Workflow (Orval)");
  bullets(doc, [
    "Sumber kebenaran kontrak API: lib/api-spec/openapi.yaml.",
    "Setiap perubahan endpoint baru di backend HARUS diikuti update spec + regen client.",
    "Output: lib/api-client-react/src/generated/api.ts (hooks React Query) dan lib/api-zod/src/generated/* (schema Zod).",
  ]);
  code(doc, "pnpm --filter @workspace/api-spec run codegen");

  h1(doc, "8. Setup & Menjalankan Aplikasi");
  h2(doc, "8.1 Prasyarat");
  bullets(doc, [
    "Node.js 20+ dan pnpm 10.",
    "PostgreSQL 14+ (DATABASE_URL).",
    "Environment: SESSION_SECRET, JWT_SECRET (di-set otomatis di Replit).",
  ]);
  h2(doc, "8.2 Instalasi & Migrasi");
  code(doc,
`pnpm install
pnpm --filter @workspace/db prisma:generate
pnpm --filter @workspace/db prisma:migrate
pnpm --filter @workspace/db seed`);
  h2(doc, "8.3 Menjalankan Dev Server");
  code(doc,
`# Backend (port 8080, path /api)
pnpm --filter @workspace/api-server run dev

# Frontend (port 22333, path /)
pnpm --filter @workspace/web run dev`);
  h2(doc, "8.4 Build Production");
  code(doc,
`pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/web run build
node artifacts/api-server/dist/index.mjs`);

  h1(doc, "9. Deployment");
  bullets(doc, [
    "Di Replit: tekan tombol Publish — konfigurasi sudah ada di .replit dan artifact.toml.",
    "Routing path-based: /api → api-server (port 8080), / → static web build.",
    "Frontend di-build sebagai static, di-serve via fallback rewrite ke /index.html.",
    "Pastikan env DATABASE_URL & JWT_SECRET ter-set di environment production.",
  ]);

  h1(doc, "10. Security Notes");
  bullets(doc, [
    "Password disimpan sebagai bcrypt hash; tidak pernah di-return ke klien.",
    "JWT secret WAJIB diganti per environment via env JWT_SECRET.",
    "File upload dibatasi MIME type 'application/pdf' dan max size 10 MB.",
    "RBAC ditegakkan di middleware backend; UI hanya menyembunyikan opsi.",
    "Rekomendasi: pasang reverse proxy + HTTPS termination (otomatis di Replit).",
  ]);

  h1(doc, "11. Default Seed Accounts");
  table(doc, ["Email", "Role", "Password"], [
    ["management@secureprofit.id", "MANAGEMENT", "password123"],
    ["pm@secureprofit.id", "PROJECT_MANAGER", "password123"],
    ["sales@secureprofit.id", "SALES", "password123"],
    ["admin@secureprofit.id", "ADMIN_PROJECT", "password123"],
    ["konsultan@secureprofit.id", "KONSULTAN", "password123"],
    ["tw@secureprofit.id", "TECHNICAL_WRITER", "password123"],
  ], [220, 160, 100]);
  callout(doc, "Reminder", "Ganti seluruh password default segera setelah deploy ke production.", "#EF4444");

  finalize(doc, "Technical Documentation");
  doc.end();
  return out;
}

const userPdf = buildUserGuide();
const techPdf = buildTechDoc();
console.log("Generated:", userPdf, techPdf);
