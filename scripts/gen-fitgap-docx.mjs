import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle } from "docx";
import { writeFileSync, mkdirSync } from "node:fs";

const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, bold: true })], spacing: { before: 240, after: 120 } });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, bold: true })], spacing: { before: 200, after: 100 } });
const P = (t, opts = {}) => new Paragraph({ children: [new TextRun({ text: t, ...opts })], spacing: { after: 80 } });
const Bullet = (t) => new Paragraph({ text: t, bullet: { level: 0 }, spacing: { after: 60 } });

const cell = (text, opts = {}) => new TableCell({
  width: { size: opts.w || 25, type: WidthType.PERCENTAGE },
  shading: opts.header ? { fill: "1F2937" } : undefined,
  children: [new Paragraph({
    children: [new TextRun({ text: String(text), bold: !!opts.header, color: opts.header ? "FFFFFF" : "000000", size: 18 })],
    alignment: opts.align || AlignmentType.LEFT,
  })],
});

const makeTable = (headers, rows, widths) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { header: true, w: widths?.[i] })) }),
    ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, { w: widths?.[i] })) })),
  ],
});

const matrix = [
  ["CRM / Pipeline", "Lead pipeline kanban, weighted forecasting, lost reason analytics", "Lead pipeline + analytics + activities", "Sudah ada"],
  ["CRM Integration", "HubSpot, Salesforce, Dynamics, Pipedrive", "—", "Belum (tidak relevan, standalone)"],
  ["Project setup", "One-click dari CRM deal", "Lead→Project converter sudah ada", "Sudah ada"],
  ["Project planning", "Gantt chart + Kanban board", "Gantt drag-drop + WBS + dependencies + Tasks tab", "Sudah ada"],
  ["Calculation sheet (estimasi budget pre-sales)", "Worksheet sebelum kontrak", "Hanya contractValue saat intake — tidak ada worksheet line-item", "Sebagian"],
  ["Contract types (Fixed Fee, T&M, Retainer, Expenses)", "4 jenis kontrak", "Hanya Fixed Fee implisit", "Belum"],
  ["Task management", "Multi-assignee, dependencies, kanban view", "Multi-assignee, dependencies, WBS — belum ada kanban view", "Sebagian"],
  ["Time tracking", "Calendar plugin, mobile, timesheet", "Timesheet web + task time log", "Sebagian (belum mobile/calendar)"],
  ["Timesheet approval", "PM approve/reject/modify", "Sudah ada (DRAFT→SUBMITTED→APPROVED/REJECTED)", "Sudah ada"],
  ["Expense tracking", "Dengan attachment + tax", "Ada, dengan approval — attachment belum", "Sebagian"],
  ["Invoicing", "Auto invoice generator dari milestone", "Billing Milestone (manual nomor invoice) — belum auto-generate PDF", "Sebagian"],
  ["Quotes/SOW with digital signing", "Quote → SOW → signature", "—", "Belum"],
  ["Project status alerts", "Budget overrun, milestone alerts", "Pending expense alert, overdue alert", "Sebagian"],
  ["Resource planning", "Weekly capacity heatmap, utilization", "Resource Planning page (BU-grouped, 6/4/0 thresholds)", "Sudah ada"],
  ["Resource capacity (planned vs actual)", "Workload chart", "Sudah ada di Resource Planning + Financials", "Sudah ada"],
  ["Dashboard & reports", "Standard dashboards + export Excel", "6 dashboard role-specific + 10 reports + CSV/XLSX/PDF", "Sudah ada (lebih banyak)"],
  ["VAT/Tax report", "Tax di expense + invoice", "VAT Recap 12-bulan, SPT-ready", "Sudah ada (lebih spesifik ID)"],
  ["Multi-currency", "USD/EUR", "IDR only", "Tidak perlu"],
  ["Guest portal (klien lihat progress)", "Named guest accounts", "—", "Belum"],
  ["AI Copilot", "Notifikasi otomatis + Q&A natural language", "—", "Belum"],
  ["Email notifications", "Built-in", "—", "Belum"],
  ["Mobile app", "iOS/Android", "Web responsive only", "Sebagian"],
  ["Audit log", "Activity tracking", "Activity table + Site Admin viewer", "Sudah ada"],
  ["Role-based access", "Per-user permission", "9 role + Principal hierarchy", "Sudah ada (lebih granular)"],
  ["Free trial / SaaS pricing", "$25-40/user/bulan", "Self-hosted, internal", "Tidak relevan"],
];

const tinggiPrio = [
  ["1", "Contract types (T&M, Retainer, Expense-only)", "Sedang", "Tinggi — banyak project security pakai retainer"],
  ["2", "Calculation sheet / Budget worksheet pre-sales", "Sedang", "Tinggi — line item cost estimate sebelum kontrak"],
  ["3", "Auto-generate Invoice PDF dari milestone", "Kecil", "Tinggi — Admin Project tinggal kirim ke klien"],
  ["4", "Expense attachment (upload nota/struk)", "Kecil", "Tinggi — wajib untuk audit pajak"],
  ["5", "Email notifications", "Sedang", "Tinggi"],
  ["6", "Budget overrun alert otomatis", "Kecil", "Sedang — sebelum project rugi"],
  ["7", "Quotes/SOW digital signing", "Besar", "Sedang — butuh integrasi e-sign"],
];

const sedangPrio = [
  ["8", "Kanban board view di Tasks tab", "Kecil", "Sedang"],
  ["9", "Client/Guest portal (klien lihat progress read-only)", "Sedang-Besar", "Sedang"],
  ["10", "Mobile-friendly time logging", "Sedang", "Sedang — konsultan log via HP di lapangan"],
  ["11", "AI assistant / chat dengan data", "Besar", "Rendah — optional"],
];

const doc = new Document({
  creator: "SecureProfit Hub",
  title: "Fit-Gap Analysis: SecureProfit Hub vs PSOhub",
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22 } },
    },
  },
  sections: [{
    properties: {},
    children: [
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Fit-Gap Analysis", bold: true, size: 40 })],
        spacing: { after: 120 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "SecureProfit Hub vs PSOhub", size: 28, color: "555555" })],
        spacing: { after: 240 },
      }),
      P("PSOhub adalah platform PSA (Professional Services Automation) global yang sudah 5+ tahun di pasar, fokus integrasi dengan HubSpot/Salesforce. Dokumen ini membandingkan kapabilitas inti mereka dengan SecureProfit Hub.", { italics: true }),

      H1("1. Fit-Gap Matrix"),
      P("Legenda status: Sudah ada · Sebagian · Belum · Tidak perlu."),
      makeTable(
        ["Area", "Fitur PSOhub", "SecureProfit Hub", "Status"],
        matrix,
        [22, 28, 32, 18]
      ),

      H1("2. Keunggulan SecureProfit Hub"),
      Bullet("VAT Recap khas Indonesia — PPN 11%, SPT Masa-ready, breakdown 12 bulan. PSOhub tidak punya."),
      Bullet("Hierarki Principal/Supervisor — 3 Principal role yang mengusulkan resource, scoping visibilitas finansial. Lebih cocok untuk konsultan IT security Indonesia."),
      Bullet("Reports lebih banyak & lebih granular — 10 report siap pakai (margin trend, BU, billing aging, cash inflow forecast, dll)."),
      Bullet("Role-based access lebih granular — 9 role + Sales-only Pipeline + Principal supervision."),
      Bullet("Lead analytics built-in — funnel, weighted pipeline, lost reason — sudah seperti CRM mini."),

      H1("3. Gap Prioritas Tinggi"),
      P("Worth building, ROI jelas."),
      makeTable(["#", "Gap", "Effort", "Value"], tinggiPrio, [6, 54, 16, 24]),

      H1("4. Gap Prioritas Sedang"),
      makeTable(["#", "Gap", "Effort", "Value"], sedangPrio, [6, 54, 16, 24]),

      H1("5. Gap Tidak Relevan"),
      Bullet("HubSpot/Salesforce integration — SecureProfit Hub standalone, pipeline sudah built-in."),
      Bullet("Multi-currency — klien Indonesia pakai IDR."),
      Bullet("SaaS pricing/trial — aplikasi internal, tidak dijual per-seat."),

      H1("6. Rekomendasi 3 Langkah Cepat"),
      P("Urutan ideal untuk menyamai PSOhub di hal-hal yang paling sering dipakai konsultan:"),
      Bullet("Langkah 1 — Expense attachment + auto-invoice PDF (~1 sesi). Impact langsung ke Admin Project & auditor pajak."),
      Bullet("Langkah 2 — Contract type Retainer/T&M (1-2 sesi). Buka peluang model bisnis baru."),
      Bullet("Langkah 3 — Email notifications via Resend (1-2 sesi). Sudah dibahas sebelumnya."),

      new Paragraph({ spacing: { before: 400 }, children: [new TextRun({ text: "— Akhir dokumen —", italics: true, color: "888888" })], alignment: AlignmentType.CENTER }),
    ],
  }],
});

const buf = await Packer.toBuffer(doc);
mkdirSync("exports", { recursive: true });
const out = "exports/FitGap_SecureProfitHub_vs_PSOhub.docx";
writeFileSync(out, buf);
console.log("Wrote", out, buf.length, "bytes");
