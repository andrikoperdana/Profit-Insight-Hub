import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
// @ts-expect-error - no types shipped
import HTMLtoDOCX from "html-to-docx";

type Status = "FIT" | "PARTIAL" | "GAP";
interface Row {
  feature: string;
  psohub: string;
  ours: string;
  status: Status;
  note?: string;
}
interface Section {
  title: string;
  rows: Row[];
}

const sections: Section[] = [
  {
    title: "1. Manajemen Kontrak & Proyek",
    rows: [
      { feature: "Pembuatan kontrak dari template / CRM", psohub: "Smart contract generation dari data HubSpot/CRM, template reusable", ours: "Belum ada modul kontrak; nilai kontrak hanya disimpan sebagai field contractValue pada Project", status: "GAP", note: "Perlu modul Contract terpisah" },
      { feature: "Jenis kontrak (Fixed Price, T&M, Retainer, Recurring)", psohub: "Mendukung Fixed-price, Time & Material, Installment, Recurring", ours: "Tidak ada tipe kontrak eksplisit; semua proyek diasumsikan fixed-price", status: "GAP" },
      { feature: "Role-based rate per user", psohub: "Multiple rate per user berdasarkan role", ours: "Hanya satu dailyRate per ProjectResource (per proyek)", status: "PARTIAL", note: "Rate per proyek sudah ada, tapi belum per-role library" },
      { feature: "Project intake / handover Sales → PM", psohub: "Setup project 1-klik setelah deal close di CRM", ours: "Workflow DRAFT → OBSERVATION (Sales isi 4 field → MGMT assign PM → PM lengkapi)", status: "FIT" },
      { feature: "Gantt chart & task dependencies", psohub: "Gantt chart + Kanban + task board", ours: "Gantt chart drag-drop + finish-to-start dependency + WBS (parentTaskId)", status: "FIT" },
      { feature: "Kanban board", psohub: "Kanban tersedia di semua plan", ours: "Belum ada tampilan Kanban (hanya list + Gantt)", status: "GAP" },
      { feature: "Task template / WBS reusable", psohub: "Project template", ours: "TaskTemplate model + Apply Template button pada Project Tasks tab", status: "FIT" },
      { feature: "Project status & alert milestone", psohub: "Alert otomatis untuk over-budget/over-time", ours: "Banner warning di Overview tab + alert pending expense; belum ada alert otomatis budget", status: "PARTIAL" },
      { feature: "Multi-company / Business Unit", psohub: "Multi-Company di Enterprise; Business Unit di Professional", ours: "BusinessUnit model (3 BU: Pentest, GRC, Threat Hunting) — single tenant", status: "PARTIAL", note: "BU sudah ada, tapi belum multi-company/multi-tenant" },
      { feature: "Multi-currency", psohub: "Multi-currency di Enterprise", ours: "Hanya IDR (formatIDR)", status: "GAP" },
    ],
  },
  {
    title: "2. Time Tracking & Expense",
    rows: [
      { feature: "Timesheet entry (harian/mingguan)", psohub: "Timesheet via web, mobile, plugin, kalender", ours: "Form timesheet + Entry Mingguan grid 5 hari kerja (bulk submit)", status: "FIT" },
      { feature: "Approval flow timesheet", psohub: "PM Approval (Pro), Team Lead Approval (Ent)", ours: "DRAFT → SUBMITTED → APPROVED/REJECTED oleh PM/MGMT; PM auto-approved", status: "FIT" },
      { feature: "Time logging per task (billable flag)", psohub: "Billable/non-billable per task", ours: "Task.billable flag; non-billable tidak masuk margin", status: "FIT" },
      { feature: "Calendar / mobile / plugin integration", psohub: "Integrasi Outlook/Google Calendar, mobile app, plugin", ours: "Hanya entry via web form", status: "GAP" },
      { feature: "Expense tracking (dengan attachment & pajak)", psohub: "Expense dengan attachment + tax", ours: "ProjectExpense (category, amount, approval), belum support attachment & pajak", status: "PARTIAL" },
      { feature: "Leave / absence management", psohub: "Manage Absence (Professional+)", ours: "UserLeave model (ANNUAL/SICK/TRAINING/UNPAID/OTHER) + overlay di Resource Planning", status: "FIT" },
    ],
  },
  {
    title: "3. Resource & Capacity Management",
    rows: [
      { feature: "Resource planning per minggu", psohub: "Resource Planning + Capacity Overview (Enterprise)", ours: "/resource-planning BU-grouped weekly mandays + color coding + tooltip", status: "FIT" },
      { feature: "Skill/role-based resource matching", psohub: "Role/Skill based planning", ours: "Skill + UserSkill (proficiency 1–5) + /skill-matrix gap analysis", status: "FIT" },
      { feature: "AI auto-scheduling resource", psohub: "AI Scheduling (Enterprise) — auto-assign resource berdasar skill/availability", ours: "Belum ada AI scheduling", status: "GAP" },
      { feature: "Backlog report (planned belum dibooking)", psohub: "Backlog Report (Enterprise)", ours: "Belum ada backlog report", status: "GAP" },
      { feature: "Hierarchy / Principal supervision", psohub: "Team Lead approval (Enterprise)", ours: "3 Principal roles (Konsultan/TW/AdminProject) + propose-accept workflow", status: "FIT", note: "Lebih domain-specific dari PSOhub" },
      { feature: "Bench / utilization report", psohub: "Resource Capacity Overview", ours: "Bench Report + team utilization di PM dashboard", status: "FIT" },
    ],
  },
  {
    title: "4. Invoicing & Billing",
    rows: [
      { feature: "Milestone / installment invoicing", psohub: "Recurring + installment + retainer", ours: "BillingMilestone (TOP) per proyek dengan %, DPP, VAT, status PLANNED/INVOICED/PAID/CANCELLED", status: "FIT" },
      { feature: "VAT / pajak handling", psohub: "Tax di expense; tidak detil VAT Indonesia", ours: "vatPercent per milestone + splitVat() + /vat-recap MGMT (12-month breakdown, CSV export)", status: "FIT", note: "Lebih lengkap untuk konteks Indonesia (PPN 11%)" },
      { feature: "Auto-generate invoice / PDF", psohub: "Custom invoice layout per BU (Enterprise)", ours: "Belum generate PDF invoice — hanya tracking status", status: "GAP" },
      { feature: "Recurring invoice automation", psohub: "Recurring invoice set-and-forget", ours: "Belum ada", status: "GAP" },
      { feature: "Invoice approval workflow", psohub: "Manual + automated approval", ours: "Status manual oleh MGMT/PM (INVOICED → PAID auto-timestamp)", status: "PARTIAL" },
      { feature: "Integrasi accounting (QuickBooks/Xero/Accurate)", psohub: "QuickBooks, Xero, Moneybird, Exact Online, dll", ours: "Belum ada integrasi accounting", status: "GAP" },
      { feature: "Quote / SOW dengan digital signing", psohub: "Quote & SOW dengan e-signature (Professional)", ours: "Belum ada", status: "GAP" },
    ],
  },
  {
    title: "5. Financials & Profitability",
    rows: [
      { feature: "Project P&L / margin per proyek", psohub: "Profitability per customer/project", ours: "actualCost, actualProfit, marginPct di setiap project + serializer", status: "FIT" },
      { feature: "Forecast & burn rate", psohub: "Dashboard burn rate", ours: "Forecast linear projection berdasar burn rate; /api/projects/:id/financials per bulan", status: "FIT" },
      { feature: "Cash inflow / billing aging", psohub: "Dashboard finansial", ours: "Report billing-aging + cash-inflow-forecast", status: "FIT" },
    ],
  },
  {
    title: "6. Reporting & Analytics",
    rows: [
      { feature: "Standard dashboards per role", psohub: "Dashboard standard semua plan", ours: "Dashboard per role (MGMT, PM, Sales, Konsultan, TW, Admin, Site Admin)", status: "FIT" },
      { feature: "Custom report builder", psohub: "Excel export; AI Charts; Data Warehouse access (Enterprise)", ours: "10 report fixed di /reports (profitability, margin trend, utilization, dll) + CSV/XLSX/PDF export", status: "PARTIAL", note: "Belum ada report builder dinamis" },
      { feature: "Export (Excel/CSV/PDF)", psohub: "Excel export", ours: "CSV, XLSX, PDF export semua report (formula-injection safe)", status: "FIT" },
      { feature: "Data warehouse access", psohub: "Enterprise plan", ours: "Belum ada", status: "GAP" },
    ],
  },
  {
    title: "7. AI / Automation (Copilot)",
    rows: [
      { feature: "AI assistant / Copilot", psohub: "AI Copilot 24/7 (review, notify, data analytics)", ours: "Belum ada", status: "GAP" },
      { feature: "AI natural language data query", psohub: "AI Data Analytics — tanya data dengan natural language", ours: "Belum ada", status: "GAP" },
      { feature: "AI auto-scheduling", psohub: "AI Scheduling (Enterprise)", ours: "Belum ada", status: "GAP" },
      { feature: "AI charts & reporting", psohub: "AI Charts (Professional)", ours: "Belum ada", status: "GAP" },
    ],
  },
  {
    title: "8. Integrations",
    rows: [
      { feature: "CRM integration", psohub: "HubSpot (native), Salesforce, MS Dynamics 365, Pipedrive", ours: "Belum ada integrasi CRM", status: "GAP" },
      { feature: "Accounting integration", psohub: "QuickBooks, Xero, Moneybird, Exact Online, Bexio, Sage, SAP B1, Twinfield", ours: "Belum ada", status: "GAP" },
      { feature: "Collaboration (Teams/Slack)", psohub: "Microsoft Teams, Slack (Professional)", ours: "Belum ada", status: "GAP" },
      { feature: "Public API", psohub: "Comprehensive REST API", ours: "REST API internal (OpenAPI 3) — belum diekspos publik", status: "PARTIAL" },
      { feature: "SSO (Google/Microsoft)", psohub: "Login via Google & Microsoft", ours: "Username/password JWT (HS256); belum SSO", status: "GAP" },
    ],
  },
  {
    title: "9. Multi-tenancy, Security & Audit",
    rows: [
      { feature: "Role-based access control", psohub: "Role-based di semua plan", ours: "8 roles (MGMT, PM, Sales, Konsultan, TW, Admin, 3 Principal, Site Admin) + requireRole middleware", status: "FIT" },
      { feature: "Audit log", psohub: "Tersirat lewat reporting", ours: "Activity model + audit log halaman SITE_ADMIN + recordAudit pada setiap mutasi", status: "FIT" },
      { feature: "Guest portal eksternal", psohub: "Guest Portal dengan financial/task access (Professional)", ours: "Belum ada portal client/guest", status: "GAP" },
      { feature: "Document management (BAST/Invoice/Kontrak)", psohub: "Document attachment", ours: "Document model (BAST/INVOICE/CONTRACT/REPORT/OTHER, base64)", status: "FIT", note: "Lebih spesifik untuk dokumen Indonesia (BAST)" },
    ],
  },
  {
    title: "10. Onboarding & Support",
    rows: [
      { feature: "Knowledge base / akademi", psohub: "PSOhub Academy free courses", ours: "Belum ada", status: "GAP" },
      { feature: "In-app chat support", psohub: "Chat & email support semua plan", ours: "Belum ada", status: "GAP" },
      { feature: "Customer success agent", psohub: "Assigned CS agent (Enterprise)", ours: "N/A (internal tool)", status: "PARTIAL" },
    ],
  },
];

const STATUS_LABEL: Record<Status, string> = {
  FIT: "Fit",
  PARTIAL: "Partial",
  GAP: "Gap",
};
const STATUS_COLOR: Record<Status, string> = {
  FIT: "#16a34a",
  PARTIAL: "#d97706",
  GAP: "#dc2626",
};

function countByStatus() {
  let fit = 0, partial = 0, gap = 0, total = 0;
  for (const s of sections) for (const r of s.rows) {
    total++;
    if (r.status === "FIT") fit++;
    else if (r.status === "PARTIAL") partial++;
    else gap++;
  }
  return { fit, partial, gap, total };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderTable(rows: Row[]): string {
  const header = `
    <tr style="background:#0f172a;color:#ffffff;">
      <th style="border:1px solid #334155;padding:6px;text-align:left;">Fitur</th>
      <th style="border:1px solid #334155;padding:6px;text-align:left;">PSOhub</th>
      <th style="border:1px solid #334155;padding:6px;text-align:left;">SecureProfit Hub</th>
      <th style="border:1px solid #334155;padding:6px;text-align:center;">Status</th>
      <th style="border:1px solid #334155;padding:6px;text-align:left;">Catatan</th>
    </tr>`;
  const body = rows.map(r => `
    <tr>
      <td style="border:1px solid #cbd5e1;padding:6px;vertical-align:top;"><b>${esc(r.feature)}</b></td>
      <td style="border:1px solid #cbd5e1;padding:6px;vertical-align:top;">${esc(r.psohub)}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;vertical-align:top;">${esc(r.ours)}</td>
      <td style="border:1px solid #cbd5e1;padding:6px;vertical-align:top;text-align:center;background:${STATUS_COLOR[r.status]};color:#ffffff;"><b>${STATUS_LABEL[r.status]}</b></td>
      <td style="border:1px solid #cbd5e1;padding:6px;vertical-align:top;font-size:10pt;">${esc(r.note || "-")}</td>
    </tr>`).join("");
  return `<table style="border-collapse:collapse;font-size:10pt;" border="1" cellspacing="0" cellpadding="4">${header}${body}</table>`;
}

function buildHtml(): string {
  const c = countByStatus();
  const fitPct = ((c.fit / c.total) * 100).toFixed(1);
  const partialPct = ((c.partial / c.total) * 100).toFixed(1);
  const gapPct = ((c.gap / c.total) * 100).toFixed(1);

  const sectionsHtml = sections.map(s => `
    <h2 style="color:#0f172a;border-bottom:2px solid #16a34a;padding-bottom:4px;">${esc(s.title)}</h2>
    ${renderTable(s.rows)}
    <p></p>
  `).join("");

  const gaps = sections.flatMap(s => s.rows.filter(r => r.status === "GAP").map(r => ({ section: s.title, ...r })));
  const partials = sections.flatMap(s => s.rows.filter(r => r.status === "PARTIAL").map(r => ({ section: s.title, ...r })));

  const gapList = gaps.map(g => `<li><b>${esc(g.feature)}</b> <i>(${esc(g.section)})</i> — ${esc(g.psohub)}</li>`).join("");
  const partialList = partials.map(g => `<li><b>${esc(g.feature)}</b> <i>(${esc(g.section)})</i> — ${esc(g.note || g.ours)}</li>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fit-Gap Analysis</title></head>
<body style="font-family:Calibri, Arial, sans-serif;color:#1e293b;">

<h1 style="color:#0f172a;">Fit-Gap Analysis: SecureProfit Hub vs PSOhub</h1>
<p><b>Tanggal:</b> ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}<br/>
<b>Sumber pembanding:</b> psohub.com (Essentials / Professional / Enterprise plans)<br/>
<b>Sistem internal:</b> SecureProfit Hub — PSA untuk konsultan keamanan TI (Indonesia)</p>

<h2 style="color:#0f172a;border-bottom:2px solid #16a34a;padding-bottom:4px;">Ringkasan Eksekutif</h2>
<p>SecureProfit Hub adalah Professional Services Automation (PSA) internal yang sudah memenuhi sebagian besar fitur inti PSOhub di tier <i>Essentials</i> dan <i>Professional</i>, terutama pada area <b>manajemen proyek, timesheet, resource planning, milestone billing, dan reporting</b>. Kelebihan utama kami adalah <b>kekayaan domain lokal</b> (VAT/PPN 11% Indonesia, dokumen BAST, struktur Principal supervisor, multi-business-unit konsultan keamanan).</p>
<p>Gap utama berada pada area <b>AI Copilot, integrasi pihak ketiga (CRM/accounting/collaboration), kontrak multi-tipe, generate PDF invoice otomatis, multi-currency, dan guest portal</b> — sebagian besar adalah fitur tier <i>Enterprise</i> PSOhub.</p>

<table style="border-collapse:collapse;font-size:11pt;margin:12px 0;" border="1" cellspacing="0" cellpadding="6">
  <tr style="background:#0f172a;color:#ffffff;">
    <th style="border:1px solid #334155;padding:8px;">Status</th>
    <th style="border:1px solid #334155;padding:8px;">Jumlah</th>
    <th style="border:1px solid #334155;padding:8px;">Persentase</th>
  </tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#16a34a;color:#ffffff;"><b>Fit</b></td><td style="border:1px solid #cbd5e1;padding:8px;text-align:center;">${c.fit}</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:center;">${fitPct}%</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#d97706;color:#ffffff;"><b>Partial</b></td><td style="border:1px solid #cbd5e1;padding:8px;text-align:center;">${c.partial}</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:center;">${partialPct}%</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;background:#dc2626;color:#ffffff;"><b>Gap</b></td><td style="border:1px solid #cbd5e1;padding:8px;text-align:center;">${c.gap}</td><td style="border:1px solid #cbd5e1;padding:8px;text-align:center;">${gapPct}%</td></tr>
  <tr><td style="border:1px solid #cbd5e1;padding:8px;"><b>Total</b></td><td style="border:1px solid #cbd5e1;padding:8px;text-align:center;"><b>${c.total}</b></td><td style="border:1px solid #cbd5e1;padding:8px;text-align:center;">100%</td></tr>
</table>

<h2 style="color:#0f172a;border-bottom:2px solid #16a34a;padding-bottom:4px;">Metodologi</h2>
<p>Analisis dilakukan dengan membandingkan fitur publik PSOhub (homepage, halaman fitur, halaman pricing tiga tier) dengan modul yang sudah terimplementasi di SecureProfit Hub berdasarkan <i>schema Prisma</i>, route Express, dan halaman React. Untuk setiap fitur dilakukan klasifikasi:</p>
<ul>
  <li><b>Fit</b> — fungsionalitas setara atau lebih lengkap dari PSOhub.</li>
  <li><b>Partial</b> — sebagian fitur sudah ada, tetapi terbatas atau perlu pengembangan tambahan.</li>
  <li><b>Gap</b> — fitur belum tersedia di SecureProfit Hub.</li>
</ul>

<h2 style="color:#0f172a;border-bottom:2px solid #16a34a;padding-bottom:4px;">Detail Komparasi per Kategori</h2>
${sectionsHtml}

<h2 style="color:#0f172a;border-bottom:2px solid #dc2626;padding-bottom:4px;">Daftar Gap (Rekomendasi Roadmap)</h2>
<ol>${gapList}</ol>

<h2 style="color:#0f172a;border-bottom:2px solid #d97706;padding-bottom:4px;">Daftar Partial (Perlu Penyempurnaan)</h2>
<ol>${partialList}</ol>

<h2 style="color:#0f172a;border-bottom:2px solid #16a34a;padding-bottom:4px;">Rekomendasi Prioritas</h2>
<h3>Prioritas Tinggi (Quick Win &lt; 1 kuartal)</h3>
<ul>
  <li><b>Generate PDF invoice otomatis</b> dari BillingMilestone — sudah punya data DPP/VAT, tinggal templating.</li>
  <li><b>SSO Microsoft / Google</b> — adopsi tinggi di lingkungan korporasi.</li>
  <li><b>Attachment dokumen pada expense</b> (struk/kwitansi) — perubahan schema kecil.</li>
  <li><b>Kanban view pada Tasks tab</b> — reuse data task yang sudah ada.</li>
  <li><b>Alert otomatis</b> over-budget / mendekati deadline (cron job + Notification).</li>
</ul>
<h3>Prioritas Menengah (1–2 kuartal)</h3>
<ul>
  <li><b>Modul Contract</b> terpisah dengan tipe kontrak (Fixed/T&amp;M/Retainer/Recurring) dan recurring invoice.</li>
  <li><b>Quote/SOW + digital signing</b> — integrasi DocuSign atau Mekari Sign.</li>
  <li><b>Integrasi accounting</b> lokal: Accurate, Jurnal.id, atau Xero.</li>
  <li><b>Client/guest portal read-only</b> untuk status proyek &amp; invoice.</li>
  <li><b>Custom report builder</b> sederhana (drag-drop filter + chart).</li>
</ul>
<h3>Prioritas Strategis (&gt; 2 kuartal)</h3>
<ul>
  <li><b>AI Copilot</b>: natural-language data query (mis. "berapa margin proyek X bulan ini") menggunakan LLM.</li>
  <li><b>AI auto-scheduling</b> resource berbasis skill matrix + workload yang sudah ada.</li>
  <li><b>Multi-currency &amp; multi-company</b> jika ekspansi ke entitas/anak perusahaan lain.</li>
  <li><b>Mobile app</b> untuk timesheet &amp; approval.</li>
  <li><b>Integrasi Microsoft Teams/Slack</b> untuk notifikasi.</li>
</ul>

<h2 style="color:#0f172a;border-bottom:2px solid #16a34a;padding-bottom:4px;">Keunggulan SecureProfit Hub yang Tidak Dimiliki PSOhub</h2>
<ul>
  <li><b>VAT Recap PPN 11% Indonesia</b> — rekapitulasi tahunan DPP, PPN dipungut, PPN dibayar, outstanding per bulan, lengkap dengan CSV export untuk pelaporan SPT.</li>
  <li><b>Dokumen BAST</b> (Berita Acara Serah Terima) sebagai tipe dokumen first-class — sesuai praktik proyek IT di Indonesia.</li>
  <li><b>Struktur Principal supervisor</b> 3-tier (Principal Konsultan / Technical Writer / Admin Project) dengan workflow <i>propose &amp; accept</i> staffing.</li>
  <li><b>Skill matrix &amp; gap analysis</b> otomatis menandai skill yang hanya dipegang 1 orang atau tanpa Senior/Principal.</li>
  <li><b>Domain-specific roles</b> (Konsultan, Technical Writer, Admin Project) yang sesuai struktur tim konsultan keamanan TI lokal.</li>
  <li><b>Bulk weekly timesheet entry</b> (grid 5 hari kerja) — UX khusus pola kerja konsultan.</li>
</ul>

<p style="margin-top:24px;font-size:9pt;color:#64748b;"><i>Dokumen ini di-generate otomatis dari skrip <code>scripts/src/fit-gap-psohub.ts</code>. Untuk memperbarui, edit data <code>sections</code> dan jalankan <code>pnpm --filter @workspace/scripts run fit-gap</code>.</i></p>

</body></html>`;
}

async function main() {
  const html = buildHtml();
  const buf = await HTMLtoDOCX(html, undefined, {
    table: { row: { cantSplit: true } },
    pageNumber: true,
    orientation: "landscape",
    margins: { top: 720, right: 720, bottom: 720, left: 720 },
  });
  const out = resolve(process.cwd(), "exports/fit-gap-psohub.docx");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buf);
  console.log("Wrote", out, "(", (buf as Buffer).length, "bytes )");
}

main().catch(e => { console.error(e); process.exit(1); });
