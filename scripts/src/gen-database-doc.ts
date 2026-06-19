/**
 * Generate the enterprise RDBMS / Database documentation for SecureProfit Hub.
 *
 * The data dictionary, relationship catalog, enum reference and index catalog
 * are parsed directly from `lib/db/prisma/schema.prisma` (single source of
 * truth) so the document stays accurate as the schema evolves. Hand-written
 * narrative (architecture, design principles, lifecycle, security, operations)
 * is curated below.
 *
 * Run:    pnpm --filter @workspace/scripts run database-doc
 * Output: docs/DATABASE_RDBMS.md
 *         docs/SecureProfit-Hub-Database-Documentation.docx
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
// @ts-expect-error - no types
import HTMLtoDOCX from "html-to-docx";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const SCHEMA_PATH = resolve(ROOT, "lib/db/prisma/schema.prisma");
const DOCS_DIR = resolve(ROOT, "docs");
const MD_OUT = resolve(DOCS_DIR, "DATABASE_RDBMS.md");
const DOCX_OUT = resolve(DOCS_DIR, "SecureProfit-Hub-Database-Documentation.docx");

const TODAY = "19 Juni 2026";
const VERSION = "1.0";

// ---------------------------------------------------------------------------
// Markdown helpers (avoid literal backticks in template literals)
// ---------------------------------------------------------------------------
const BT = "`";
const F = BT + BT + BT;
const c = (s: string): string => BT + s + BT;
const cell = (s: string): string => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

function mdTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(cell).join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

// ---------------------------------------------------------------------------
// Prisma schema parser
// ---------------------------------------------------------------------------
interface Field {
  name: string;
  baseType: string;
  optional: boolean;
  isList: boolean;
  attrs: string;
  isRelation: boolean;
}
interface Relation {
  field: string;
  target: string;
  fkFields: string[];
  onDelete?: string;
  optional: boolean;
  cardinality: string;
}
interface Model {
  name: string;
  columns: Field[];
  relations: Relation[];
  blockAttrs: string[];
}

const enums: Record<string, string[]> = {};
const rawModels: { name: string; lines: string[] }[] = [];

function parseSchema(): void {
  const raw = readFileSync(SCHEMA_PATH, "utf8");
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const enumMatch = line.match(/^enum\s+(\w+)\s*\{/);
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
    if (enumMatch) {
      const name = enumMatch[1];
      const vals: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("}")) {
        const v = lines[i].split("//")[0].trim();
        if (v) vals.push(v.split(/\s+/)[0]);
        i++;
      }
      enums[name] = vals;
    } else if (modelMatch) {
      const name = modelMatch[1];
      const block: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("}")) {
        const fl = lines[i].split("//")[0].trim();
        if (fl) block.push(fl);
        i++;
      }
      rawModels.push({ name, lines: block });
    }
    i++;
  }
}

parseSchema();

const modelNames = new Set(rawModels.map((m) => m.name));

function getDefault(attrs: string): string {
  if (/@default\(now\(\)\)/.test(attrs)) return "now()";
  if (/@default\(cuid\(\)\)/.test(attrs)) return "cuid()";
  if (/@default\(uuid\(\)\)/.test(attrs)) return "uuid()";
  if (/@default\(autoincrement\(\)\)/.test(attrs)) return "autoincrement()";
  const m = attrs.match(/@default\(([^()]*)\)/);
  return m ? m[1].trim() : "";
}

function sqlType(f: Field): string {
  const db = f.attrs.match(/@db\.(\w+)/)?.[1];
  let base: string;
  if (db === "Text") base = "text";
  else
    switch (f.baseType) {
      case "String": base = "text"; break;
      case "Int": base = "integer"; break;
      case "BigInt": base = "bigint"; break;
      case "Float": base = "double precision"; break;
      case "Boolean": base = "boolean"; break;
      case "DateTime": base = "timestamp(3)"; break;
      case "Json": base = "jsonb"; break;
      case "Decimal": base = "decimal"; break;
      case "Bytes": base = "bytea"; break;
      default: base = enums[f.baseType] ? `${f.baseType} (enum)` : f.baseType;
    }
  return f.isList ? `${base}[]` : base;
}

const models: Model[] = rawModels.map((rm) => {
  const columns: Field[] = [];
  const relations: Relation[] = [];
  const blockAttrs: string[] = [];
  for (const fl of rm.lines) {
    if (fl.startsWith("@@")) {
      blockAttrs.push(fl);
      continue;
    }
    const parts = fl.split(/\s+/);
    const name = parts[0];
    const ftype = parts[1] ?? "";
    if (!name || !ftype) continue;
    const attrs = parts.slice(2).join(" ");
    const optional = ftype.endsWith("?");
    const isList = ftype.endsWith("[]");
    const baseType = ftype.replace(/[?[\]]/g, "");
    const isRelation = modelNames.has(baseType);
    const field: Field = { name, baseType, optional, isList, attrs, isRelation };
    if (isRelation) {
      const fkFields =
        attrs
          .match(/fields:\s*\[([^\]]*)\]/)?.[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) ?? [];
      const onDelete = attrs.match(/onDelete:\s*(\w+)/)?.[1];
      const cardinality = isList ? "1 → banyak" : optional ? "0..1" : "1 (wajib)";
      relations.push({ field: name, target: baseType, fkFields, onDelete, optional, cardinality });
    } else {
      columns.push(field);
    }
  }
  return { name: rm.name, columns, relations, blockAttrs };
});

const modelByName = new Map(models.map((m) => [m.name, m]));

// Map of FK scalar column -> target model (per model) for column annotation.
function fkMapFor(model: Model): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of model.relations) {
    for (const fk of r.fkFields) map[fk] = r.target;
  }
  return map;
}

function describeBlockAttr(a: string): string {
  const idx = a.match(/@@index\(\[([^\]]*)\]\)/);
  if (idx) return `INDEX (${idx[1]})`;
  const uq = a.match(/@@unique\(\[([^\]]*)\]\)/);
  if (uq) return `UNIQUE (${uq[1]})`;
  const id = a.match(/@@id\(\[([^\]]*)\]\)/);
  if (id) return `PRIMARY KEY (${id[1]})`;
  const map = a.match(/@@map\("([^"]*)"\)/);
  if (map) return `dipetakan ke "${map[1]}"`;
  return a;
}

// Effective referential action: explicit onDelete if present, else the Prisma
// default for the relational mode — SetNull for optional FK, Restrict for required.
function effectiveOnDelete(r: Relation): string {
  if (!r.fkFields.length) return "-";
  if (r.onDelete) return r.onDelete;
  return r.optional ? "SetNull (default Prisma)" : "Restrict (default Prisma)";
}

// ---------------------------------------------------------------------------
// Curated content
// ---------------------------------------------------------------------------
const domains: { name: string; intro: string; models: string[] }[] = [
  {
    name: "Identitas, Organisasi & Kompetensi",
    intro:
      "Master data orang dan struktur organisasi: akun & peran, unit bisnis, keahlian, target pengembangan, dan cuti.",
    models: ["User", "BusinessUnit", "Skill", "UserSkill", "SkillDevelopmentGoal", "SkillProgressionLog", "UserLeave"],
  },
  {
    name: "Sales & CRM",
    intro: "Pipeline penjualan dan data pelanggan, termasuk pemetaan integrasi Pipedrive.",
    models: ["Lead", "LeadActivity", "Client", "PipedriveStageMapping"],
  },
  {
    name: "Proyek & Delivery",
    intro: "Entitas inti proyek beserta pemecahan kerja (workstream, task, RAID), staffing, dan laporan.",
    models: [
      "Project", "ProjectWorkstream", "ProjectResource", "Task", "TaskAssignee",
      "TaskDependency", "TaskTimeLog", "ProjectRaidItem", "ProjectReport",
      "ProjectClosingChecklistItem", "Activity",
    ],
  },
  {
    name: "Waktu & Biaya",
    intro: "Pencatatan jam kerja dan pengeluaran proyek dengan alur persetujuan; basis perhitungan biaya aktual.",
    models: ["Timesheet", "ProjectExpense"],
  },
  {
    name: "Keuangan & Penagihan",
    intro: "Termin pembayaran, dokumen (BAST/invoice/kontrak), pengaturan invoice, dan koneksi Xero.",
    models: ["BillingMilestone", "Document", "InvoiceSetting", "XeroConnection"],
  },
  {
    name: "Kualitas & Kinerja",
    intro: "Survei kepuasan klien (CSAT) dan penilaian kinerja periodik.",
    models: ["SurveyQuestion", "SurveyResponse", "PerformanceReview", "PerformanceReviewProjectRating"],
  },
  {
    name: "Template & Blueprint",
    intro: "Cetak biru yang dapat dipakai ulang untuk mempercepat pembuatan proyek dan WBS.",
    models: ["TaskTemplate", "ProjectTemplate", "ProjectTemplateResource", "ProjectTemplateMilestone", "ProjectTemplateRaidItem"],
  },
  {
    name: "Sistem, Notifikasi & Audit",
    intro: "Notifikasi in-app, jejak audit, dan pengaturan aplikasi.",
    models: ["Notification", "AuditLog", "AppSetting"],
  },
];

const tableDesc: Record<string, string> = {
  User: "Akun pengguna sekaligus master data SDM: kredensial, peran (RBAC), seniority, tarif harian, serta dua hierarki organisasi (atasan struktural managerId dan principal pembina principalId).",
  Client: "Master data klien/pelanggan beserta tautan kontak ke sistem eksternal (Xero, Pipedrive).",
  Project: "Entitas inti aplikasi: kontrak/penugasan yang dilacak sepanjang siklus hidup, memuat nilai kontrak, estimasi biaya/mandays, konfigurasi pajak, serta token akses publik (portal klien & survei).",
  ProjectReport: "Katalog laporan deliverable proyek (Draft/Interim/Final) beserta tautan dan metadata versi.",
  ProjectWorkstream: "Pemecahan proyek besar menjadi beberapa aliran kerja (workstream) dengan alokasi, mandays, dan biaya tersendiri.",
  SurveyQuestion: "Bank pertanyaan survei kepuasan klien (CSAT) yang dapat dikonfigurasi.",
  SurveyResponse: "Jawaban survei kepuasan yang dikirim klien melalui portal publik, termasuk snapshot pertanyaan saat pengisian.",
  AuditLog: "Jejak audit tak-termutasi untuk setiap aksi penting: siapa, kapan, dan nilai sebelum/sesudah (dataBefore/dataAfter).",
  ProjectResource: "Penempatan (staffing) seseorang pada proyek dengan mandays terencana, tarif harian, dan status persetujuan alur propose-accept.",
  Timesheet: "Catatan jam kerja harian per pengguna/proyek dengan alur DRAFT -> SUBMITTED -> APPROVED/REJECTED; menjadi basis perhitungan biaya resource.",
  Document: "Repositori dokumen proyek (BAST/Invoice/Kontrak/lainnya) dengan versioning dan tautan ke milestone penagihan.",
  ProjectClosingChecklistItem: "Daftar periksa penutupan proyek yang harus dipenuhi sebelum proyek berstatus CLOSED.",
  ProjectExpense: "Biaya non-resource (software, hardware, lisensi, perjalanan, dll) dengan alur persetujuan; hanya yang APPROVED dihitung ke biaya aktual.",
  BusinessUnit: "Unit bisnis/lini layanan (mis. Pentest, GRC, Threat Hunting) sebagai pengelompokan SDM dan pekerjaan.",
  Skill: "Master kompetensi/keahlian yang dapat dimiliki pengguna.",
  UserSkill: "Tabel relasi banyak-ke-banyak antara pengguna dan skill, dengan tingkat kemahiran (proficiency).",
  SkillDevelopmentGoal: "Target pengembangan kompetensi per pengguna (level saat ini menuju level target).",
  SkillProgressionLog: "Riwayat perubahan level kompetensi pengguna.",
  Activity: "Umpan aktivitas ringan (feed) terkait proyek/pengguna untuk linimasa.",
  Task: "Item pekerjaan/WBS proyek; mendukung sub-tugas (hierarki), dependensi, banyak penanggung jawab, dan flag billable.",
  TaskDependency: "Relasi dependensi antar-tugas (finish-to-start).",
  BillingMilestone: "Termin pembayaran (Terms of Payment) per proyek: persentase, DPP/PPN, jatuh tempo, status, nomor invoice unik, serta field sinkronisasi Xero.",
  TaskAssignee: "Tabel relasi banyak-ke-banyak penanggung jawab tugas.",
  TaskTimeLog: "Log jam kerja terhadap tugas tertentu (granular, di luar timesheet resmi).",
  Lead: "Peluang penjualan (sales pipeline) dari tahap NEW hingga WON/LOST; sumber konversi menjadi proyek; tertaut ke Pipedrive.",
  LeadActivity: "Aktivitas tindak lanjut atas lead (call/email/meeting/note) beserta rencana aksi berikutnya.",
  UserLeave: "Catatan cuti/ketidakhadiran pengguna yang mengurangi target jam kerja dan kapasitas perencanaan.",
  TaskTemplate: "Cetak biru WBS (struktur tugas) yang disimpan sebagai JSON untuk diterapkan ke proyek baru.",
  ProjectTemplate: "Cetak biru proyek (durasi, estimasi, pajak) beserta paket resource/milestone/RAID standar.",
  ProjectTemplateResource: "Baris kebutuhan resource pada cetak biru proyek (peran, jumlah, mandays, tarif).",
  ProjectTemplateMilestone: "Baris termin penagihan standar pada cetak biru proyek.",
  ProjectTemplateRaidItem: "Baris RAID standar pada cetak biru proyek.",
  Notification: "Notifikasi in-app per pengguna (lonceng header), dengan status baca (readAt).",
  ProjectRaidItem: "Register RAID (Risk/Assumption/Issue/Dependency) per proyek dengan dampak, kemungkinan, dan status.",
  PerformanceReview: "Penilaian kinerja periodik pengguna (kuartal/tahunan) dengan alur DRAFT -> SUBMITTED -> ACKNOWLEDGED.",
  PerformanceReviewProjectRating: "Rincian penilaian kinerja per proyek dalam satu siklus review.",
  InvoiceSetting: "Pengaturan singleton identitas penerbit invoice (perusahaan, NPWP, rekening bank).",
  AppSetting: "Pengaturan aplikasi singleton: ambang batas bisnis (margin, overrun, jatuh tempo) dan sakelar integrasi (email, Xero, Pipedrive).",
  PipedriveStageMapping: "Pemetaan stage pipeline Pipedrive ke tahap Lead internal.",
  XeroConnection: "Kredensial koneksi OAuth Xero (token & tenant) berbentuk singleton.",
};

const colDesc: Record<string, string> = {
  "User.role": "Peran RBAC penentu hak akses pengguna.",
  "User.seniority": "Tingkat senioritas (JUNIOR/MID/SENIOR/PRINCIPAL).",
  "User.dailyRate": "Tarif harian (IDR), dasar perhitungan biaya resource.",
  "User.managerId": "Atasan struktural (PM -> PMO).",
  "User.principalId": "Principal pembina untuk anggota tim delivery.",
  "User.calendarTokenVersion": "Versi token feed kalender; dinaikkan untuk mencabut tautan iCal lama.",
  "Project.code": "Kode proyek unik (business key).",
  "Project.status": "Status siklus hidup proyek (lihat State Machine).",
  "Project.kind": "Jenis proyek; menentukan gerbang lifecycle dan visibilitas finansial.",
  "Project.contractValue": "Nilai kontrak (IDR).",
  "Project.contractValueIncludesVat": "Apakah nilai kontrak sudah termasuk PPN (memengaruhi pemisahan DPP/PPN).",
  "Project.plannedMandays": "Estimasi total mandays dari tahap intake.",
  "Project.surveyToken": "Token publik survei CSAT (unik, dapat dinonaktifkan).",
  "Project.clientShareToken": "Token publik portal progres klien (unik, dapat dinonaktifkan).",
  "Timesheet.status": "Status persetujuan; hanya APPROVED yang masuk ke biaya resource.",
  "Timesheet.hours": "Jumlah jam kerja; biaya = (hours/8) x dailyRate.",
  "ProjectExpense.status": "Status persetujuan; hanya APPROVED yang masuk ke biaya aktual.",
  "ProjectExpense.amount": "Nominal pengeluaran (IDR).",
  "BillingMilestone.percentage": "Porsi nilai kontrak untuk termin ini (total seluruh termin idealnya 100%).",
  "BillingMilestone.status": "PLANNED -> INVOICED -> PAID / CANCELLED.",
  "BillingMilestone.invoiceNumber": "Nomor invoice unik (format INV/YYYY/MM/NNNN), dialokasikan di dalam transaksi.",
  "BillingMilestone.xeroInvoiceId": "ID invoice di Xero setelah operasi push.",
  "ProjectResource.acceptedAt": "NULL berarti menunggu persetujuan (alur propose-accept).",
  "ProjectResource.dailyRate": "Tarif harian yang dipakai untuk biaya resource pada proyek ini.",
  "Lead.stage": "Tahap pipeline (NEW..WON/LOST).",
  "Lead.convertedProjectId": "Proyek hasil konversi lead (unik).",
  "Lead.pipedriveDealId": "ID deal Pipedrive (unik) untuk impor satu arah.",
  "Task.billable": "Jika false, jam pada task ini tidak masuk ke revenue/margin.",
  "Task.parentTaskId": "Induk untuk hierarki sub-tugas (WBS).",
  "Document.fileUrl": "Konten file (data URL base64) atau tautan.",
  "Document.isLatest": "Penanda versi terbaru pada rantai versioning dokumen.",
  "AppSetting.emailNotificationsEnabled": "Kill-switch global email (default OFF).",
  "AppSetting.xeroAutoSyncEnabled": "Sakelar polling pembayaran Xero (default OFF).",
  "AppSetting.pipedriveAutoSyncEnabled": "Sakelar polling impor Pipedrive (default OFF).",
};

const enumDesc: Record<string, string> = {
  UserRole: "Peran RBAC yang menentukan hak akses di seluruh aplikasi.",
  ProjectKind: "Jenis proyek; non-CLIENT (INTERNAL/PRESALES/TRAINING) dikecualikan dari gerbang penagihan & BAST.",
  ProjectStatus: "Status siklus hidup proyek.",
  TimesheetStatus: "Status alur persetujuan timesheet.",
  ProjectReportType: "Klasifikasi laporan deliverable.",
  DocumentType: "Jenis dokumen proyek.",
  TaskStatus: "Status pengerjaan task.",
  Seniority: "Tingkat senioritas pengguna.",
  BillingMilestoneStatus: "Status termin penagihan.",
  ExpenseStatus: "Status persetujuan pengeluaran.",
  LeadStage: "Tahap pipeline penjualan.",
  LeadActivityType: "Jenis aktivitas tindak lanjut lead.",
  LeaveType: "Jenis cuti/ketidakhadiran.",
  RaidType: "Klasifikasi item RAID.",
  RaidImpact: "Tingkat dampak item RAID.",
  RaidLikelihood: "Tingkat kemungkinan item RAID.",
  RaidStatus: "Status penanganan item RAID.",
  PerformanceReviewPeriod: "Periode siklus penilaian kinerja.",
  PerformanceReviewStatus: "Status alur penilaian kinerja.",
};

function columnDescription(model: Model, f: Field, fkMap: Record<string, string>): string {
  const key = `${model.name}.${f.name}`;
  if (colDesc[key]) return colDesc[key];
  if (f.attrs.includes("@id")) return "Primary key (CUID).";
  if (f.name === "createdAt") return "Timestamp baris dibuat.";
  if (f.name === "updatedAt") return "Timestamp baris terakhir diubah.";
  if (f.name === "deletedAt") return "Soft-delete: terisi jika baris dinonaktifkan (NULL = aktif).";
  if (fkMap[f.name]) return `Foreign key ke ${fkMap[f.name]}.`;
  if (enums[f.baseType]) return `Enum ${f.baseType}: ${enums[f.baseType].join(", ")}.`;
  if (f.baseType === "Boolean") {
    const d = getDefault(f.attrs);
    return d ? `Flag boolean (default ${d}).` : "Flag boolean.";
  }
  return "";
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------
const totalColumns = models.reduce((n, m) => n + m.columns.length, 0);
const totalRelations = models.reduce((n, m) => n + m.relations.filter((r) => r.fkFields.length).length, 0);
const totalIndexes = models.reduce(
  (n, m) => n + m.blockAttrs.filter((a) => a.startsWith("@@index") || a.startsWith("@@unique")).length,
  0,
);
const totalFieldUnique = models.reduce(
  (n, m) => n + m.columns.filter((f) => /@unique/.test(f.attrs)).length,
  0,
);
const enumCount = Object.keys(enums).length;

// ---------------------------------------------------------------------------
// Build Markdown
// ---------------------------------------------------------------------------
const md: string[] = [];

md.push(`# SecureProfit Hub — Dokumentasi Basis Data (RDBMS)`);
md.push(
  mdTable(
    ["Atribut", "Nilai"],
    [
      ["Judul Dokumen", "Dokumentasi Basis Data Relasional (RDBMS)"],
      ["Aplikasi", "SecureProfit Hub — Professional Services Automation (PSA)"],
      ["Versi Dokumen", VERSION],
      ["Tanggal", TODAY],
      ["Status", "Final — Internal"],
      ["RDBMS", "PostgreSQL"],
      ["ORM / Migrasi", "Prisma (Prisma Migrate)"],
      ["Lingkungan", "Dev: Replit (Helium) | Produksi: Neon (Singapura)"],
      ["Jumlah Tabel", String(models.length)],
      ["Jumlah Enum", String(enumCount)],
      ["Klasifikasi", "Rahasia — Penggunaan Internal"],
    ],
  ),
);

md.push(`## Daftar Isi`);
md.push(
  [
    "1. Pendahuluan",
    "2. Ringkasan Eksekutif",
    "3. Arsitektur Data & Lingkungan",
    "4. Prinsip Desain RDBMS",
    "5. Model Data: Domain & Diagram Relasi (ERD)",
    "6. Katalog Relasi (Foreign Key)",
    "7. Kamus Data (Data Dictionary)",
    "8. Referensi Enumerasi",
    "9. Siklus Hidup Data (State Machine)",
    "10. Strategi Index & Performa",
    "11. Integritas, Transaksi & Konkurensi",
    "12. Keamanan & Tata Kelola Data",
    "13. Operasional Basis Data",
    "Lampiran A — Diagram ERD (Mermaid)",
    "Lampiran B — Statistik & Konvensi",
  ]
    .map((s, i) => `${i + 1 <= 15 ? "" : ""}- ${s}`)
    .join("\n"),
);

// 1. Pendahuluan
md.push(`## 1. Pendahuluan`);
md.push(
  `### 1.1 Tujuan\nDokumen ini mendeskripsikan desain basis data relasional (RDBMS) aplikasi **SecureProfit Hub** secara menyeluruh: arsitektur penyimpanan data, prinsip desain, struktur tabel (kamus data), relasi antar-entitas, aturan integritas, siklus hidup data, serta praktik operasional. Dokumen ditujukan sebagai acuan resmi (single source of truth) bagi tim rekayasa, DBA, audit, dan pemangku kepentingan teknis.`,
);
md.push(
  `### 1.2 Ruang Lingkup\nMencakup skema PostgreSQL yang dikelola melalui Prisma ORM pada paket ${c("lib/db")}. Tidak mencakup detail implementasi endpoint API atau antarmuka pengguna, kecuali bila relevan terhadap perilaku data.`,
);
md.push(
  `### 1.3 Pembaca\nArsitek perangkat lunak, backend engineer, Database Administrator (DBA), QA, tim keamanan/audit, dan manajemen teknis.`,
);
md.push(
  `### 1.4 Definisi & Singkatan\n` +
    mdTable(
      ["Istilah", "Penjelasan"],
      [
        ["RDBMS", "Relational Database Management System — sistem basis data relasional."],
        ["ORM", "Object-Relational Mapping; di sini menggunakan Prisma."],
        ["PK", "Primary Key — kunci utama baris."],
        ["FK", "Foreign Key — kunci tamu yang merujuk baris tabel lain."],
        ["ERD", "Entity Relationship Diagram — diagram relasi antar-entitas."],
        ["CUID", "Collision-resistant Unique Identifier; format ID default seluruh tabel."],
        ["DPP", "Dasar Pengenaan Pajak."],
        ["PPN/VAT", "Pajak Pertambahan Nilai (default 11%)."],
        ["Soft delete", "Penonaktifan baris via kolom deletedAt tanpa menghapus fisik."],
      ],
    ),
);

// 2. Ringkasan Eksekutif
md.push(`## 2. Ringkasan Eksekutif`);
md.push(
  `SecureProfit Hub menyimpan seluruh data operasionalnya dalam satu basis data **PostgreSQL** yang ternormalisasi, terdiri atas **${models.length} tabel**, **${enumCount} tipe enumerasi**, **${totalColumns} kolom**, dan **${totalRelations} relasi foreign key**. Skema dirancang dengan integritas referensial yang tegas (aturan ${c("onDelete")} eksplisit maupun default Prisma), batasan keunikan (**${totalFieldUnique} unik kolom tunggal** plus unik komposit), serta **${totalIndexes} index sekunder & unik komposit** (level tabel) untuk menjaga performa kueri — di luar primary key tiap tabel.`,
);
md.push(
  `Akses dan perubahan skema dikelola sepenuhnya melalui **Prisma Migrate** (skema terversi), sehingga setiap perubahan struktur tercatat, dapat ditinjau, dan dapat direproduksi antar-lingkungan. Karakteristik ini menegaskan bahwa aplikasi telah menerapkan RDBMS yang matang — bukan sekadar penyimpanan data datar.`,
);

// 3. Arsitektur Data & Lingkungan
md.push(`## 3. Arsitektur Data & Lingkungan`);
md.push(
  `### 3.1 Tumpukan Teknologi\n` +
    mdTable(
      ["Lapisan", "Teknologi", "Keterangan"],
      [
        ["RDBMS", "PostgreSQL", "Mesin basis data relasional utama."],
        ["ORM", "Prisma Client", "Akses data type-safe; client di-generate ke lib/db/src/generated/client."],
        ["Migrasi", "Prisma Migrate", "Skema terversi; baseline migrasi 0_init."],
        ["Validasi", "Zod (di-generate dari OpenAPI)", "Validasi input/output di lapisan API sebelum menyentuh DB."],
        ["Aplikasi", "Node.js + Express (api-server)", "Satu-satunya komponen yang mengakses DB."],
      ],
    ),
);
md.push(
  `### 3.2 Lingkungan & Koneksi\n- **Pengembangan**: PostgreSQL terkelola Replit (Helium).\n- **Produksi**: Neon (region Singapura), diakses melalui *pooled endpoint*. URL koneksi membawa parameter pool untuk menahan pemutusan koneksi idle.\n- **Keepalive**: api-server mengirim ping ringan (${c("SELECT 1")}) secara periodik (default 4 menit) agar compute Neon tidak masuk mode autosuspend, sehingga permintaan pengguna tetap responsif.\n- **Graceful shutdown**: saat deploy rollover, server berhenti menerima koneksi baru, menuntaskan permintaan berjalan, lalu menutup pool Prisma secara rapi.`,
);

// 4. Prinsip Desain RDBMS
md.push(`## 4. Prinsip Desain RDBMS`);
md.push(
  `### 4.1 Normalisasi\nSkema mengikuti bentuk normal (umumnya 3NF): data tidak diduplikasi; relasi banyak-ke-banyak dimodelkan lewat tabel penghubung eksplisit (${c("UserSkill")}, ${c("TaskAssignee")}, ${c("TaskDependency")}). Hal ini meminimalkan anomali penyisipan/pembaruan/penghapusan.`,
);
md.push(
  `### 4.2 Integritas Referensial\nSetiap relasi memiliki foreign key dengan aturan ${c("onDelete")} eksplisit:\n- **Cascade** — baris anak ikut terhapus bersama induk (mis. menghapus ${c("Project")} menghapus task, timesheet, dokumen, RAID terkait).\n- **SetNull** — referensi opsional dikosongkan saat induk hilang (mis. ${c("workstreamId")} pada banyak tabel).\nDengan demikian tidak ada baris anak yang menggantung (orphan).`,
);
md.push(
  `### 4.3 Batasan & Domain Nilai\n- **Primary key** CUID pada seluruh tabel.\n- **Keunikan tunggal**: mis. ${c("User.email")}, ${c("Project.code")}, ${c("BillingMilestone.invoiceNumber")}.\n- **Keunikan komposit**: mis. ${c("@@unique([projectId, userId])")} pada ${c("ProjectResource")}, ${c("@@unique([userId, period, periodYear])")} pada ${c("PerformanceReview")}.\n- **Enumerasi**: ${enumCount} tipe enum menjaga nilai kolom status/peran tetap konsisten di level basis data.`,
);
md.push(
  `### 4.4 Indexing\nIndex sekunder (${c("@@index")}) dipasang pada kolom yang sering difilter/di-join — foreign key, kolom status, dan kolom tanggal — untuk menjaga performa kueri pada tabel bervolume tinggi seperti ${c("Timesheet")} dan ${c("Project")}.`,
);
md.push(
  `### 4.5 Transaksi (ACID)\nOperasi kritis dijalankan dalam transaksi atomik untuk mencegah kondisi balapan (race condition) — misalnya alokasi nomor invoice yang harus unik dan berurutan. Lihat Bab 11.`,
);
md.push(
  `### 4.6 Soft Delete & Jejak Audit\nEntitas penting (${c("User")}, ${c("Project")}, ${c("Lead")}) menggunakan ${c("deletedAt")} untuk penonaktifan reversibel alih-alih penghapusan fisik. Setiap aksi sensitif dicatat pada ${c("AuditLog")} (termasuk nilai sebelum/sesudah) untuk kebutuhan audit.`,
);

// 5. Domain overview + ERD intro
md.push(`## 5. Model Data: Domain & Diagram Relasi (ERD)`);
md.push(
  `Tabel dikelompokkan ke dalam **${domains.length} domain fungsional**. Diagram ERD lengkap (format Mermaid) tersedia pada **Lampiran A** dan dapat dirender melalui editor apa pun yang mendukung Mermaid.`,
);
md.push(
  mdTable(
    ["Domain", "Fokus", "Jumlah Tabel"],
    domains.map((d) => [d.name, d.intro, String(d.models.length)]),
  ),
);

// 6. Relationship catalog (global)
md.push(`## 6. Katalog Relasi (Foreign Key)`);
md.push(`Seluruh relasi foreign key beserta kardinalitas dan aturan penghapusannya:`);
const relRows: string[][] = [];
for (const m of models) {
  for (const r of m.relations) {
    if (!r.fkFields.length) continue;
    relRows.push([
      m.name,
      r.fkFields.join(" + "),
      r.target,
      r.cardinality,
      effectiveOnDelete(r),
    ]);
  }
}
md.push(mdTable(["Tabel (anak)", "Foreign Key", "Tabel (induk)", "Kardinalitas", "onDelete"], relRows));

// 7. Data dictionary
md.push(`## 7. Kamus Data (Data Dictionary)`);
md.push(
  `Untuk setiap tabel: deskripsi, daftar kolom (tipe SQL, nullability, default, kunci, deskripsi), serta index/batasan dan foreign key tingkat tabel.`,
);
const assigned = new Set<string>();
let domainNo = 0;
for (const domain of domains) {
  domainNo++;
  md.push(`### 7.${domainNo} ${domain.name}`);
  md.push(`*${domain.intro}*`);
  for (const mname of domain.models) {
    const model = modelByName.get(mname);
    if (!model) continue;
    assigned.add(mname);
    md.push(`#### ${mname}`);
    if (tableDesc[mname]) md.push(tableDesc[mname]);
    const fkMap = fkMapFor(model);
    const rows = model.columns.map((f) => {
      const keys: string[] = [];
      if (f.attrs.includes("@id")) keys.push("PK");
      if (/@unique/.test(f.attrs)) keys.push("UNIQUE");
      if (fkMap[f.name]) keys.push("FK");
      return [
        f.name,
        sqlType(f),
        f.optional ? "Ya" : "Tidak",
        getDefault(f.attrs) || "-",
        keys.join(", ") || "-",
        columnDescription(model, f, fkMap) || "-",
      ];
    });
    md.push(mdTable(["Kolom", "Tipe SQL", "Null", "Default", "Kunci", "Deskripsi"], rows));
    const constraints = model.blockAttrs.map(describeBlockAttr);
    if (constraints.length) md.push(`**Index & batasan tabel:** ${constraints.join("; ")}.`);
    const owning = model.relations.filter((r) => r.fkFields.length);
    if (owning.length) {
      md.push(
        `**Foreign key keluar:** ` +
          owning
            .map((r) => `${r.fkFields.join("+")} -> ${r.target} (onDelete: ${effectiveOnDelete(r)})`)
            .join("; ") +
          ".",
      );
    }
  }
}
// Safety net: any model not placed in a domain.
const leftovers = models.filter((m) => !assigned.has(m.name));
if (leftovers.length) {
  domainNo++;
  md.push(`### 7.${domainNo} Lainnya`);
  for (const model of leftovers) {
    md.push(`#### ${model.name}`);
    if (tableDesc[model.name]) md.push(tableDesc[model.name]);
    const fkMap = fkMapFor(model);
    const rows = model.columns.map((f) => {
      const keys: string[] = [];
      if (f.attrs.includes("@id")) keys.push("PK");
      if (/@unique/.test(f.attrs)) keys.push("UNIQUE");
      if (fkMap[f.name]) keys.push("FK");
      return [f.name, sqlType(f), f.optional ? "Ya" : "Tidak", getDefault(f.attrs) || "-", keys.join(", ") || "-", columnDescription(model, f, fkMap) || "-"];
    });
    md.push(mdTable(["Kolom", "Tipe SQL", "Null", "Default", "Kunci", "Deskripsi"], rows));
  }
}

// 8. Enum reference
md.push(`## 8. Referensi Enumerasi`);
md.push(`Daftar lengkap tipe enumerasi dan nilai yang diperbolehkan:`);
md.push(
  mdTable(
    ["Enum", "Nilai", "Keterangan"],
    Object.keys(enums)
      .sort()
      .map((name) => [name, enums[name].join(", "), enumDesc[name] ?? "-"]),
  ),
);

// 9. State machines
md.push(`## 9. Siklus Hidup Data (State Machine)`);
md.push(
  `### 9.1 Proyek (Project.status)\n${c("DRAFT")} -> ${c("OBSERVATION")} -> ${c("ACTIVE")} -> ${c("PAUSE")} / ${c("COMPLETE")} -> ${c("CLOSED")} (dengan ${c("NO_NEED_CONSULTANT")} untuk kasus khusus). Transisi naik dijaga oleh *gate* validasi:\n- **Gate ACTIVE**: field inti Overview lengkap, ada PM, minimal 1 resource, 1 task, 1 item RAID, dan total persentase BillingMilestone = 100%.\n- **Gate COMPLETE**: seluruh task DONE, tidak ada timesheet SUBMITTED, tidak ada expense PENDING, tidak ada milestone PLANNED, tidak ada RAID OPEN, serta minimal 1 dokumen BAST terbaru.`,
);
md.push(
  `### 9.2 Timesheet (Timesheet.status)\n${c("DRAFT")} -> ${c("SUBMITTED")} -> ${c("APPROVED")} / ${c("REJECTED")}. Hanya status ${c("APPROVED")} yang dihitung sebagai biaya resource.`,
);
md.push(
  `### 9.3 Pengeluaran (ProjectExpense.status)\n${c("PENDING")} -> ${c("APPROVED")} / ${c("REJECTED")}. Hanya ${c("APPROVED")} yang masuk ke biaya aktual; pengeluaran oleh Management otomatis APPROVED.`,
);
md.push(
  `### 9.4 Termin Penagihan (BillingMilestone.status)\n${c("PLANNED")} -> ${c("INVOICED")} -> ${c("PAID")} (atau ${c("CANCELLED")}). Perubahan ke INVOICED/PAID otomatis menstempel ${c("invoicedAt")}/${c("paidAt")}.`,
);
md.push(
  `### 9.5 Lead (Lead.stage)\n${c("NEW")} -> ${c("QUALIFIED")} -> ${c("PROPOSAL")} -> ${c("NEGOTIATION")} -> ${c("WON")} / ${c("LOST")}. Lead WON dapat dikonversi menjadi Project (tercatat pada ${c("convertedProjectId")}).`,
);
md.push(
  `### 9.6 Penilaian Kinerja (PerformanceReview.status)\n${c("DRAFT")} -> ${c("SUBMITTED")} -> ${c("ACKNOWLEDGED")}.`,
);

// 10. Index strategy
md.push(`## 10. Strategi Index & Performa`);
md.push(
  `Total **${totalIndexes} index sekunder & batasan unik komposit** terpasang di level tabel (${c("@@index")}/${c("@@unique")}) — di luar **${models.length} primary key** dan **${totalFieldUnique} batasan unik kolom tunggal** (${c("@unique")}). Pola index difokuskan pada: (a) foreign key untuk mempercepat join; (b) kolom ${c("status")} untuk filter daftar; (c) kolom tanggal (${c("workDate")}, ${c("createdAt")}, ${c("dueDate")}) untuk rentang waktu. Daftar index per tabel:`,
);
const idxRows: string[][] = [];
for (const m of models) {
  const idx = m.blockAttrs.filter((a) => a.startsWith("@@index") || a.startsWith("@@unique")).map(describeBlockAttr);
  if (idx.length) idxRows.push([m.name, idx.join("; ")]);
}
md.push(mdTable(["Tabel", "Index & Batasan Unik"], idxRows));
md.push(
  `Selain index, performa dijaga melalui **connection pooling** (Neon pooled endpoint), **DB keepalive** untuk menghindari cold-start, serta **cache TtlCache** berjangka pendek pada endpoint dashboard yang berat (kunci cache selalu mengikutkan cakupan peran pemanggil agar tidak terjadi kebocoran data antar-peran).`,
);

// 11. Integrity, transactions, concurrency
md.push(`## 11. Integritas, Transaksi & Konkurensi`);
md.push(
  `### 11.1 Alokasi Nomor Invoice\nNomor invoice (${c("BillingMilestone.invoiceNumber")}) bersifat unik di level basis data dan dialokasikan dalam **transaksi dengan retry** (format INV/YYYY/MM/NNNN). Pendekatan ini mencegah duplikasi saat dua pengguna menerbitkan invoice bersamaan — tidak menggunakan pola scan-then-max+1 yang rawan balapan.`,
);
md.push(
  `### 11.2 Integrasi Xero\nPush invoice ke Xero menggunakan **advisory lock per-milestone** dan mencadangkan nomor invoice sebelum panggilan ke Xero; milestone hanya ditandai PAID bila status Xero benar-benar "PAID". Refresh token OAuth diserialkan antar-instance melalui ${c("pg_advisory_xact_lock")} agar tidak terjadi refresh ganda.`,
);
md.push(
  `### 11.3 Sinkronisasi Pipedrive\nImpor lead bersifat **satu arah** (Pipedrive -> Leads) dan dijalankan asinkron dengan klaim berbasis DB sehingga poll otomatis dan "Sync now" manual tidak pernah berjalan bersamaan.`,
);
md.push(
  `### 11.4 Aturan Cascade\nPenghapusan ${c("Project")} mengalir (cascade) ke seluruh entitas anak (task, timesheet, dokumen, RAID, milestone, dst.), sementara referensi opsional seperti ${c("workstreamId")} di-set NULL. Hal ini menjamin konsistensi tanpa baris menggantung.`,
);

// 12. Security & governance
md.push(`## 12. Keamanan & Tata Kelola Data`);
md.push(
  `- **Otentikasi**: JWT (HS256) bearer token; kata sandi disimpan sebagai hash bcrypt (kolom ${c("passwordHash")}), tidak pernah plaintext.\n- **Otorisasi (RBAC)**: ${enums["UserRole"]?.length ?? 0} peran dengan hak akses berbeda, ditegakkan di lapisan aplikasi (${c("requireRole")}) sebelum kueri menyentuh DB.\n- **Data scoping**: daftar data difilter per peran (mis. PM melihat proyek miliknya; daftar timesheet global bersifat default-deny — hanya Management yang melihat seluruhnya).\n- **Permukaan publik**: portal klien & survei diakses via token publik unik yang dapat dinonaktifkan/kedaluwarsa; respons 404 identik untuk token tidak dikenal/nonaktif/kedaluwarsa agar tidak ada kebocoran (token oracle); kolom finansial tidak pernah diekspos ke publik.\n- **Rahasia**: kredensial (Xero token, API key) tidak disimpan di kode; token Xero berada pada singleton ${c("XeroConnection")}.\n- **Audit & reversibilitas**: ${c("AuditLog")} mencatat aksi sensitif; soft delete (${c("deletedAt")}) memungkinkan pemulihan.`,
);

// 13. Operations
md.push(`## 13. Operasional Basis Data`);
md.push(
  `### 13.1 Migrasi Skema\nPerubahan skema **wajib** melalui Prisma Migrate (bukan ${c("db push")}): edit ${c("schema.prisma")} -> ${c("pnpm --filter @workspace/db run migrate")} (membuat + menerapkan ke dev) -> commit folder migrasi. Merge ke main otomatis menerapkan migrasi ke DB **dev**; **produksi TIDAK** otomatis ter-migrasi oleh deploy autoscale — terapkan manual sebelum/sesudah republish (${c("bash scripts/release-prod-migrate.sh")} atau ${c("migrate:deploy")} terhadap URL produksi). Baseline produksi adalah migrasi ${c("0_init")}.`,
);
md.push(
  `### 13.2 Seeding\nSeed bersifat **idempoten**. Saat boot, seed lengkap (data demo) dilewati di produksi kecuali ${c("SEED_ON_BOOT=true")}; namun akun inti (Principal, Site Admin, Finance, HR), taksonomi (Business Unit, Skill), dan blueprint (template) selalu dipastikan ada.`,
);
md.push(
  `### 13.3 Cadangan & Pemulihan\nLingkungan Replit membuat checkpoint otomatis (kode + basis data) sehingga perubahan yang keliru dapat dikembalikan (rollback). Untuk produksi, gunakan kapabilitas snapshot/branch dari penyedia (Neon).`,
);
md.push(
  `### 13.4 Variabel Lingkungan Utama\n` +
    mdTable(
      ["Variabel", "Fungsi"],
      [
        ["DATABASE_URL", "URL koneksi PostgreSQL (membawa parameter pool)."],
        ["DB_KEEPALIVE_MS", "Interval ping keepalive (default 4 menit; 0 untuk menonaktifkan)."],
        ["SEED_ON_BOOT", "Opt-in seeding data demo di produksi."],
        ["NODE_ENV", "Menentukan perilaku produksi (mis. lewati seed demo)."],
      ],
    ),
);

// Lampiran A — ERD (mermaid)
md.push(`## Lampiran A — Diagram ERD (Mermaid)`);
md.push(
  `Blok berikut adalah sumber Mermaid ${c("erDiagram")} untuk relasi inti. Tempel ke editor yang mendukung Mermaid (mis. mermaid.live) untuk merender visual.`,
);
const erdLines: string[] = ["erDiagram"];
const erdCore = [
  "Client", "Project", "User", "ProjectResource", "Timesheet", "Task",
  "BillingMilestone", "ProjectExpense", "Document", "ProjectRaidItem",
  "Lead", "ProjectWorkstream",
];
for (const m of models) {
  if (!erdCore.includes(m.name)) continue;
  for (const r of m.relations) {
    if (!r.fkFields.length) continue;
    if (!erdCore.includes(r.target)) continue;
    // Owning side holds the FK (child). Parent (target) has many children.
    const left = r.optional ? "|o" : "||";
    erdLines.push(`  ${r.target} ${left}--o{ ${m.name} : "${r.fkFields.join("+")}"`);
  }
}
md.push(F + "mermaid\n" + erdLines.join("\n") + "\n" + F);

// Lampiran B — statistics
md.push(`## Lampiran B — Statistik & Konvensi`);
md.push(
  mdTable(
    ["Metrik", "Nilai"],
    [
      ["Total tabel", String(models.length)],
      ["Total enum", String(enumCount)],
      ["Total kolom", String(totalColumns)],
      ["Total relasi (FK)", String(totalRelations)],
      ["Index sekunder & unik komposit (block-level)", String(totalIndexes)],
      ["Batasan unik kolom tunggal (@unique)", String(totalFieldUnique)],
    ],
  ),
);
md.push(
  `**Konvensi:**\n- Seluruh primary key bertipe CUID (string).\n- Kolom audit standar: ${c("createdAt")}, ${c("updatedAt")}, dan (untuk entitas tertentu) ${c("deletedAt")}.\n- Nilai moneter disimpan sebagai ${c("Float")} dalam IDR; pajak default PPN 11%.\n- Tipe SQL pada kamus data adalah hasil pemetaan Prisma -> PostgreSQL (mis. String -> text, DateTime -> timestamp(3), Json -> jsonb).\n\n*Dokumen ini dihasilkan otomatis dari ${c("lib/db/prisma/schema.prisma")} oleh ${c("scripts/src/gen-database-doc.ts")} sehingga selalu sinkron dengan skema terkini.*`,
);

const markdown = md.join("\n\n");

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  mkdirSync(DOCS_DIR, { recursive: true });
  writeFileSync(MD_OUT, markdown, "utf8");

  const html = await marked.parse(markdown, { gfm: true });
  const wrapped = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SecureProfit Hub — Dokumentasi Basis Data (RDBMS)</title>
<style>
body { font-family: 'Calibri', 'Helvetica', sans-serif; font-size: 11pt; line-height: 1.45; color: #1f2937; }
h1 { font-size: 22pt; color: #0F172A; border-bottom: 2px solid #16A34A; padding-bottom: 6px; margin-top: 24pt; }
h2 { font-size: 16pt; color: #0F172A; border-bottom: 1px solid #CBD5E1; padding-bottom: 3px; margin-top: 20pt; }
h3 { font-size: 13pt; color: #0F172A; margin-top: 14pt; }
h4 { font-size: 11.5pt; color: #0B7285; margin-top: 12pt; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
th, td { border: 1px solid #CBD5E1; padding: 5px 7px; text-align: left; vertical-align: top; font-size: 9.5pt; }
th { background: #0F172A; color: #F1F5F9; }
code { font-family: 'Consolas', 'Courier New', monospace; background: #F1F5F9; padding: 1px 4px; border-radius: 3px; font-size: 9.5pt; color: #0B7285; }
pre { background: #0F172A; color: #F1F5F9; padding: 10px 14px; border-radius: 4px; font-family: 'Consolas', monospace; font-size: 9.5pt; white-space: pre-wrap; }
pre code { background: transparent; color: inherit; padding: 0; }
hr { border: none; border-top: 1px solid #94A3B8; margin: 20pt 0; }
ul, ol { margin: 6pt 0 6pt 18pt; }
li { margin: 2pt 0; }
blockquote { border-left: 3px solid #16A34A; padding-left: 12px; color: #475569; }
</style></head><body>
${html}
</body></html>`;

  const buffer: Buffer = await HTMLtoDOCX(wrapped, undefined, {
    table: { row: { cantSplit: true } },
    footer: true,
    pageNumber: true,
    title: "SecureProfit Hub — Dokumentasi Basis Data (RDBMS)",
  });
  writeFileSync(DOCX_OUT, buffer);

  // eslint-disable-next-line no-console
  console.log(
    `Generated:\n  ${MD_OUT}\n  ${DOCX_OUT}\n` +
      `Tables: ${models.length} | Enums: ${enumCount} | Columns: ${totalColumns} | FKs: ${totalRelations} | Indexes: ${totalIndexes}`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
