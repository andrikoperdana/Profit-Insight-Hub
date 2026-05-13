# Gap Analysis: SecureProfit Hub vs PSOHUB

Analisis komparatif fitur SecureProfit Hub (kondisi saat ini) terhadap PSOHUB (referensi platform PSA matang). Disusun untuk membantu memutuskan roadmap prioritas berikutnya.

> Catatan metodologi: PSOHUB adalah platform PSA komersial untuk firma jasa profesional (konsultansi, IT services, agensi). SecureProfit Hub adalah aplikasi internal khusus konsultansi IT security berbahasa Indonesia. Beberapa fitur PSOHUB mungkin **tidak relevan** untuk SecureProfit Hub karena scope dan ukuran organisasi berbeda — kolom "Prioritas" mempertimbangkan ini.

---

## 1. Ringkasan Eksekutif

| Aspek | SecureProfit Hub | PSOHUB | Status |
|---|---|---|---|
| **Manajemen Project** | Kuat (lifecycle 5 status, PMO assignment, tasks multi-assignee, Gantt) | Kuat (WBS, milestone, dependensi, baseline) | Setara untuk skala kerja saat ini |
| **Time Tracking** | Kuat (DRAFT→SUBMITTED→APPROVED, link ke task, mobile-friendly UI) | Kuat (web + mobile native, timer, billable/non-billable) | Setara fungsional, beda di mobile native |
| **Profitabilitas Real-time** | Kuat (resourceCost + additionalCost, margin %, forecast) | Kuat (margin per project + per resource + per phase) | Setara |
| **Resource Planning** | Cukup (kapasitas per role, propose flow Principal→PM, max 2 active untuk konsultan) | Sangat kuat (heatmap utilization multi-bulan, skill-based matching, scenario planning) | **Gap menengah** |
| **Kontrak / SOW / Proposal** | Tidak ada (hanya kolom `contractValue` + SPK) | Sangat kuat (template proposal, e-signature, kontrak otomatis jadi project) | **Gap besar** |
| **Billing & Invoicing** | Hanya upload dokumen invoice manual (Document.INVOICE) | Sangat kuat (auto-invoice dari approved timesheet, T&M / fixed-price / milestone / retainer, multi-currency) | **Gap besar** |
| **CRM / Pipeline Sales** | Minimal (Sales intake → DRAFT project) | Sangat kuat (integrasi native HubSpot/Salesforce; deal closed-won → project) | **Gap besar** (mungkin tidak relevan jika belum pakai CRM) |
| **Approval Workflow** | Cukup (timesheet approval oleh PM; auto-approve untuk PM/MGMT sendiri) | Kuat (multi-level approval untuk timesheet, expense, invoice) | Gap kecil |
| **Expense Management** | Cukup (5 kategori, log per project, tanpa receipt upload) | Kuat (receipt upload + OCR, mileage, approval workflow, auto-billable) | **Gap menengah** |
| **Document Management** | Cukup (BAST/Invoice/Contract/Report/Other, base64 di DB) | Kuat (versi, folder, integrasi Google Drive/SharePoint) | Gap kecil |
| **Reporting & BI** | Cukup (BI page, dashboard per role, CSV export) | Sangat kuat (custom report builder, scheduled email, Power BI/Tableau connector) | **Gap menengah** |
| **Audit Trail** | Kuat (Activity table, audit log page khusus SITE_ADMIN) | Kuat | Setara |
| **Survey / Feedback Klien** | Ada (Survey + token publik + SurveyTab) | Tidak fokus di sini | **SecureProfit unggul** |
| **Hierarki Principal Supervisor** | Ada (3 Principal: Konsultan/TW/AP) | Tidak ada konsep persis ini | **SecureProfit unggul** untuk struktur ITSEC |
| **Mobile Native App** | Tidak ada (web responsive saja) | Ada (iOS + Android) | **Gap besar** |
| **Integrasi Eksternal** | Tidak ada | HubSpot, Salesforce, QuickBooks, Xero, Outlook, Slack, Zapier | **Gap besar** (kontekstual) |
| **Multi-Tenancy / Multi-Currency** | Tidak (single-tenant, IDR only) | Ya (multi-currency, multi-entity) | Tidak relevan untuk firma single-entity ID |
| **Notifikasi (Email/Slack)** | Cukup (in-app notifications) | Kuat (email digest, Slack, mobile push) | Gap kecil-menengah |

---

## 2. Detail Per-Modul

### 2.1 Pre-Sales / CRM / Kontrak

| Fitur | SecureProfit Hub | PSOHUB | Gap | Prioritas |
|---|---|---|---|---|
| Pipeline opportunity / deal | Tidak ada | Ada (atau via HubSpot) | Besar | Rendah (jika pipeline dikelola di luar) |
| Template proposal/SOW | Tidak ada | Ada, drag-drop, branded | Besar | **Menengah** |
| E-signature kontrak | Tidak ada | Native (DocuSign-like) | Besar | **Menengah** |
| Kontrak menjadi project otomatis | Manual (Sales isi 4 field di `/projects/new`) | Otomatis dari kontrak signed | Menengah | Rendah |
| Versi & approval kontrak | Tidak ada | Ada | Menengah | Rendah |

**Insight**: SecureProfit Hub memulai siklus dari "kontrak sudah closed" — Sales langsung masuk di tahap intake DRAFT. Jika ITSEC ingin menyentuh tahap pre-sales (proposal → negosiasi → tanda tangan), ini gap besar tapi bisa diatasi dengan integrasi tool eksternal (DocuSign, Notion, atau HubSpot) tanpa harus dibangun in-house.

### 2.2 Project Delivery

| Fitur | SecureProfit Hub | PSOHUB | Gap |
|---|---|---|---|
| Lifecycle status | DRAFT → OBSERVATION → ACTIVE → PAUSE/COMPLETE → CLOSED | Customizable phases | **Setara** |
| WBS / Task hierarchy | Task flat, single level | Multi-level (task → subtask) | Menengah |
| Dependensi antar task | Tidak ada (Gantt hanya menampilkan timeline) | Ada (FS, SS, FF, SF) | **Menengah** |
| Multi-assignee task | **Sudah ada** (baru) | Ada | **Setara** |
| Baseline & variance | Tidak ada | Ada | Rendah |
| Milestone | Tidak eksplisit | Ada | Menengah |
| Gantt chart | Ada (read-only di project detail) | Ada (interaktif, drag) | Kecil-menengah |

### 2.3 Time Tracking

| Fitur | SecureProfit Hub | PSOHUB | Gap |
|---|---|---|---|
| Submit timesheet web | Ada | Ada | Setara |
| Mobile native | Tidak | Ada (iOS/Android) | **Besar** |
| Timer (start/stop) | Tidak (entry manual hours) | Ada | Menengah |
| Link ke task | **Sudah ada** (baru) | Ada | **Setara** |
| Approval flow | PM approve, MGMT/PM auto-approve sendiri | Multi-level | Kecil |
| Edit window | 5 hari kerja terakhir | Configurable | Kecil |
| Billable vs Non-billable flag | Tidak ada (semua approved = billable) | Ada | **Menengah** |
| Reminder otomatis | Tidak (notif in-app) | Email + push reminder harian/mingguan | Menengah |

### 2.4 Resource Planning & Capacity

| Fitur | SecureProfit Hub | PSOHUB | Gap |
|---|---|---|---|
| Per-resource daily rate | Ada (di ProjectResource) | Ada | Setara |
| Planned vs actual mandays | Ada | Ada | Setara |
| Heatmap utilization multi-bulan | Page Capacity Planning sudah ada | Ada (lebih kaya) | Kecil-menengah |
| Skill matrix & matching | Tidak ada | Ada | Menengah |
| Scenario planning ("what-if") | Tidak | Ada | Rendah |
| Hard/soft booking | Hanya hard (langsung jadi resource) | Ada (soft = tentative, hard = committed) | Menengah |

### 2.5 Financials & Billing

| Fitur | SecureProfit Hub | PSOHUB | Gap |
|---|---|---|---|
| Margin per project real-time | Ada (resourceCost + additionalCost, marginPct, forecast) | Ada | Setara |
| Margin per resource | Tidak eksplisit | Ada | Menengah |
| Generate invoice dari timesheet | **Tidak** (hanya upload dokumen invoice) | Otomatis | **Besar** |
| Tipe billing: T&M / Fixed / Milestone / Retainer | Hanya kolom `contractValue` (mirip fixed) | Semua | **Besar** |
| Multi-currency | IDR only | Multi | Tidak relevan |
| Integrasi accounting (QuickBooks/Xero) | Tidak | Ada | Rendah-menengah |
| Aging report invoice | Tidak (hanya alert komplit > 3 hari) | Ada | Menengah |
| Tax handling (PPN dst.) | Tidak (manual di luar) | Ada | **Menengah** (PPN 11% wajib di ID) |

### 2.6 Expenses

| Fitur | SecureProfit Hub | PSOHUB | Gap |
|---|---|---|---|
| Log per-project | Ada (5 kategori) | Ada | Setara |
| Receipt upload + OCR | Tidak | Ada | **Menengah** |
| Approval workflow | Tidak (PM + MGMT bisa langsung add/delete) | Multi-level | Menengah |
| Mileage/per-diem | Tidak | Ada | Rendah |
| Auto-billable ke client | Tidak | Ada | Menengah |

### 2.7 Reporting & BI

| Fitur | SecureProfit Hub | PSOHUB | Gap |
|---|---|---|---|
| Dashboard per role | Sangat baik (6 dashboard) | Ada | **Setara/unggul** |
| Custom report builder | Tidak (laporan fixed) | Ada (drag-drop columns/filters) | **Menengah** |
| Scheduled email report | Tidak | Ada | Menengah |
| Export CSV | Ada (banyak modul) | Ada | Setara |
| Export PDF / Excel | Hanya PDF user-guide | Ada native | Menengah |
| Connector BI eksternal (Power BI/Tableau) | Tidak | Ada | Rendah |

### 2.8 Klien & Survey

| Fitur | SecureProfit Hub | PSOHUB | Gap |
|---|---|---|---|
| Survey kepuasan klien dengan token publik | **Ada** | Tidak fokus | **SecureProfit unggul** |
| Client portal (klien lihat status project) | Tidak | Ada | Menengah |

### 2.9 Operasional / Platform

| Fitur | SecureProfit Hub | PSOHUB | Gap |
|---|---|---|---|
| Audit log lengkap | Ada (Activity + page khusus SITE_ADMIN) | Ada | Setara |
| Role-based access fine-grained | Sangat baik (8 role + Principal hierarchy) | Ada | Setara |
| Notifikasi in-app | Ada | Ada | Setara |
| Email notif | Tidak ada | Ada | **Menengah** |
| Slack / Teams notif | Tidak | Ada | Rendah |
| API publik | Tidak (hanya internal) | Ada (REST) | Rendah |
| Mobile app native | Tidak | Ada | **Besar** |
| SSO (Google/Microsoft) | Login email/password (JWT) | Ada (Google + Microsoft + SAML) | Menengah (Google/Microsoft mudah ditambahkan) |

---

## 3. Top 10 Gap Berprioritas (rekomendasi)

Diurutkan berdasarkan **dampak bisnis × effort yang masuk akal** untuk firma ITSEC ukuran SecureProfit Hub.

| # | Gap | Dampak | Effort | Catatan |
|---|---|---|---|---|
| 1 | **Tax (PPN 11%) di financials & invoice** | Tinggi | Kecil | Wajib untuk firma Indonesia. Tambah `taxPct` di Project + tampilkan di financials. |
| 2 | **Generate draft invoice otomatis dari approved timesheet** | Tinggi | Menengah | Timesheet approved → tombol "Generate Invoice (period X-Y)" → PDF + simpan di Document.INVOICE. |
| 3 | **Email notifikasi (timesheet pending approval, project at-risk, resource over-utilized)** | Tinggi | Menengah | Saat ini hanya in-app. Tambah Resend/SMTP. |
| 4 | **Billable vs non-billable flag di timesheet** | Tinggi | Kecil | Boolean `isBillable` di Timesheet → membedakan internal/training vs delivery klien. |
| 5 | **Aging invoice tracker (overdue, unpaid)** | Tinggi | Menengah | Field `dueDate` + `paidAt` di Document.INVOICE; dashboard MGMT/Admin. |
| 6 | **SSO Google + Microsoft** | Menengah | Menengah | Banyak user kantor pakai akun korporat; juga lebih aman dari password JWT. |
| 7 | **Multi-level / dependency task** | Menengah | Menengah | Subtask sebagai parentTaskId; dependensi FS minimal di Gantt. |
| 8 | **Receipt upload + approval untuk Expense** | Menengah | Kecil-menengah | Tambah `receiptUrl` di ProjectExpense + status `PENDING/APPROVED`. |
| 9 | **Reminder otomatis timesheet (Senin-Jumat sore)** | Menengah | Kecil | Cron + email; sangat memengaruhi disiplin pelaporan. |
| 10 | **Custom report builder sederhana (pilih kolom + filter + export)** | Menengah | Besar | Bisa fase 2; sementara perbanyak preset di BI page. |

Yang **sengaja TIDAK direkomendasikan** untuk dibangun in-house:
- Pre-sales pipeline / CRM (pakai HubSpot/Pipedrive saja)
- E-signature kontrak (pakai DocuSign / Mekari Sign)
- Multi-currency (firma lokal, tidak relevan)
- Mobile native (web responsive saat ini sudah cukup; bangun mobile = effort besar)
- Connector Power BI/Tableau (export CSV → tarik ke BI tool sudah cukup)

---

## 4. Area di Mana SecureProfit Hub Justru Lebih Baik

Penting dicatat agar tidak salah arah meniru:

1. **Hierarki Principal supervisor (Konsultan/TW/AP)** — model tata kelola khas ITSEC Indonesia, PSOHUB tidak punya.
2. **Survey klien dengan token publik** — sudah jadi, biasanya add-on terpisah di PSOHUB.
3. **Lifecycle DRAFT→OBSERVATION yang opinionated** — alur intake Sales→PMO→PM sudah baked-in; PSOHUB lebih generik dan butuh konfigurasi.
4. **Dashboard per role yang sangat fokus** — 6 dashboard (MGMT/PM/Sales/Konsultan/Admin/SiteAdmin) didesain spesifik per peran, lebih fokus dibanding "satu dashboard configurable" ala PSOHUB.
5. **Konteks Indonesia** — IDR formatting, terminologi (mandays, BAST, SPK), bahasa.

---

## 5. Roadmap Bertahap (Saran)

**Sprint 1-2 (Quick wins, 1-2 minggu kerja)**
- Tax PPN 11% di financials & invoice
- Billable/non-billable flag timesheet
- Email reminder timesheet harian/mingguan

**Sprint 3-4 (Core gap, 2-4 minggu)**
- Generate draft invoice dari approved timesheet
- Aging invoice tracker + dashboard
- Email notifikasi (timesheet pending, project at-risk)

**Sprint 5+ (Strategic)**
- SSO Google/Microsoft
- Receipt upload + Expense approval workflow
- Multi-level task / dependensi sederhana
- Client portal mini (read-only status project)

---

## 6. Kesimpulan

SecureProfit Hub **sudah sangat solid** untuk operasi delivery + profit tracking — modul project, time tracking, dan margin sudah setara PSOHUB. Gap utama yang **memberi ROI bisnis paling jelas** ada di **billing automation (auto-invoice + tax + aging)** dan **disiplin operasional (email notif + reminder)**, bukan di mengejar fitur "PSA lengkap" seperti CRM/proposal/multi-currency yang relevansinya rendah untuk satu firma ITSEC Indonesia.

Pendekatan disarankan: **fokus pada 5 gap top di atas**, pertahankan keunggulan unik (Principal hierarchy, survey, dashboard per-role yang opinionated), dan integrasikan dengan tool eksternal untuk area di luar core (CRM, e-signature) daripada membangun ulang.
