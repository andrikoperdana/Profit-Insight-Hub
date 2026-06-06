# SecureProfit Hub — Buku Panduan Pengguna

## Daftar Isi

- Bagian 1: Pendahuluan
- Bagian 2: Memulai (Login & Antarmuka)
- Bagian 3: Peran Pengguna & Hak Akses
- Bagian 4: Manajemen Klien
- Bagian 5: Manajemen Proyek (Siklus Status)
- Bagian 6: Manajemen Sumber Daya (Resource)
- Bagian 7: Time Tracking & Persetujuan
- Bagian 8: Dokumen — BAST & Invoice (Auto-Close)
- Bagian 9: Profit & Loss + Forecasting
- Bagian 10: Kapasitas & Utilisasi Tim
- Bagian 11: Timeline Gantt
- Bagian 12: Notifikasi In-App
- Bagian 13: Ekspor Data ke Excel
- Bagian 14: Audit Log (Jejak Perubahan)
- Bagian 15: Business Intelligence Dashboard
- Bagian 16: Survey Kepuasan Pelanggan (CSAT)
- Bagian 17: Pengaturan Sistem
- Bagian 18: Tanya Jawab & Pemecahan Masalah

---

## Bagian 1 — Pendahuluan

**SecureProfit Hub** adalah aplikasi web manajemen proyek konsultasi keamanan IT yang dirancang khusus untuk menjawab kebutuhan operasional firma konsultan di Indonesia. Aplikasi ini menggabungkan pengelolaan proyek end-to-end, pencatatan jam kerja konsultan, perhitungan profit & loss real-time, peramalan pendapatan, hingga pengukuran kepuasan pelanggan dalam satu platform terpusat.

### Tujuan Aplikasi

- Menyederhanakan registrasi proyek baru dan pelacakan siklus hidup proyek.
- Menyediakan visibilitas keuangan real-time bagi Manajemen.
- Memastikan tagihan dan dokumen formal (BAST, Invoice) terdokumentasi dengan baik.
- Mempermudah Project Manager dalam mengelola tim, jadwal, dan utilisasi.
- Memberikan jejak audit (audit log) untuk memenuhi kebutuhan kepatuhan internal.

### Tema Visual

Aplikasi menggunakan tema gelap bernuansa cyber-security: latar **Deep Blue (#0F172A)** dipadu dengan aksen **Cyber Green (#22C55E)**. Antarmuka dirancang agar nyaman digunakan dalam waktu lama dan memudahkan fokus pada data penting.

---

## Bagian 2 — Memulai

### 2.1 Mengakses Aplikasi

Buka peramban (Chrome, Edge, atau Firefox versi terbaru) lalu kunjungi alamat aplikasi yang diberikan oleh administrator perusahaan. Halaman pertama yang muncul adalah halaman **Login**.

### 2.2 Login

1. Masukkan alamat email perusahaan Anda.
2. Masukkan kata sandi.
3. Klik tombol **Initialize Session**.

Apabila kombinasi email/kata sandi salah lebih dari beberapa kali berturut-turut, sistem akan menerapkan pembatasan sementara (rate limiting) untuk alasan keamanan. Tunggu beberapa saat sebelum mencoba kembali, atau hubungi administrator.

### 2.3 Tata Letak Antarmuka

Setelah berhasil login, tampilan utama terdiri dari tiga area:

- **Sidebar (kiri)** — daftar menu navigasi utama. Item menu yang tampil disesuaikan dengan peran (role) Anda.
- **Header (atas)** — menampilkan nama pengguna, ikon notifikasi, dan tombol logout.
- **Konten utama** — area kerja yang menampilkan halaman aktif.

### 2.4 Logout

Klik nama Anda di sudut kanan atas, kemudian pilih **Logout**. Sesi akan diakhiri dan Anda akan diarahkan kembali ke halaman login.

---

## Bagian 3 — Peran Pengguna & Hak Akses

SecureProfit Hub menggunakan model **Role-Based Access Control (RBAC)**. Label peran yang tampil di antarmuka:

| Enum Peran | Label Tampilan | Tanggung Jawab Utama |
|------------|----------------|----------------------|
| MANAGEMENT | PMO Director | Akses penuh ke seluruh modul, persetujuan strategis, melihat P&L dan BI. |
| PROJECT_MANAGER | Project Manager | Mengelola proyek yang ditugaskan, memimpin tim, menyetujui timesheet. |
| SALES | Sales | Mendaftarkan proyek baru (intake), mengelola data klien dan kontrak. |
| KONSULTAN | Consultant | Mengisi timesheet, melihat tugas yang ditetapkan. |
| TECHNICAL_WRITER | Technical Writer | Menyusun laporan dan dokumentasi proyek. |
| ADMIN_PROJECT | Admin Project | Mengurus dokumen penutupan (BAST/Invoice/Contract). |
| PRINCIPAL_KONSULTAN | Principal Consultant | Supervisi & mengusulkan konsultan ke proyek. |
| PRINCIPAL_TECHNICAL_WRITER | Principal Technical Writer | Supervisi & mengusulkan TW ke proyek. |
| PRINCIPAL_ADMIN_PROJECT | Principal Admin Project | Supervisi & mengusulkan Admin Project ke proyek. |
| FINANCE | Finance | Read-only ke proyek/laporan, mengunggah Invoice & Contract, VAT recap. |
| HR | HR | People-ops: employees, org chart, leave, skill matrix, bench, capacity. |
| SITE_ADMIN | Site Admin | Mengelola users dan melihat audit log. |

Menu dan tombol yang tampak di layar Anda otomatis disaring berdasarkan peran. Jika sebuah aksi tidak terlihat, kemungkinan peran Anda tidak memiliki hak untuk melakukannya.

---

## Bagian 4 — Manajemen Klien

Modul **Clients** menampung database klien (customer) perusahaan.

### 4.1 Menambah Klien Baru

1. Klik menu **Clients** pada sidebar.
2. Tekan tombol **+ New Client**.
3. Isi formulir:
   - **Name** — nama resmi klien.
   - **Industry** — industri klien (Banking, Telco, Government, dll).
   - **Contact person, email, dan telepon**.
4. Klik **Save**.

### 4.2 Melihat & Mengubah Data Klien

Pada daftar klien, klik baris klien yang ingin dilihat untuk membuka detail. Tombol **Edit** akan muncul jika peran Anda memiliki hak ubah. Riwayat seluruh proyek milik klien ditampilkan di tab **Projects**.

### 4.3 Menghapus Klien (Soft Delete)

Klien yang dihapus tidak benar-benar hilang dari database (soft delete) sehingga riwayat proyeknya tetap utuh untuk keperluan audit. Klien yang dihapus tidak akan muncul lagi di daftar pemilihan ketika membuat proyek baru.

---

## Bagian 5 — Manajemen Proyek (Siklus Status)

Setiap proyek di SecureProfit Hub melewati siklus hidup berikut:

1. **DRAFT** — Sales melakukan intake awal (4 field minimum), PM belum ditetapkan.
2. **OBSERVATION** — Manajemen sudah menugaskan PM, PM melengkapi deskripsi/tanggal/nilai kontrak/mandays/biaya.
3. **ACTIVE** — pekerjaan sedang berjalan, timesheet aktif.
4. **PAUSE** / **COMPLETE** — proyek dijeda sementara, atau pekerjaan selesai menunggu dokumen penutup.
5. **CLOSED** — dokumen BAST + Invoice lengkap, link survei kepuasan otomatis aktif.

### 5.1 Membuat Proyek Baru (Intake oleh Sales)

1. Buka menu **Projects** → tombol **New Project**.
2. Isi formulir registrasi (halaman **Register New Project**) dengan data utama: kode, nama, klien, dan nilai kontrak.
3. Klik **Create Project**. Status awal otomatis **DRAFT** dan `salesId` diisi otomatis dari akun yang login. PM dikosongkan dulu, menunggu penugasan Manajemen.

### 5.2 Melengkapi Proyek (PM)

Setelah Manajemen menugaskan PM, halaman detail proyek menampilkan kartu **Draft Completion** untuk PM. PM melengkapi deskripsi, tanggal mulai/akhir, revenue/contract value, planned mandays, dan estimasi biaya. Setelah disimpan, status berpindah otomatis ke **OBSERVATION**.

### 5.3 Mengubah Status Proyek

Pengguna berperan **PMO Director** (MANAGEMENT) atau **Project Manager** pemilik proyek dapat memindahkan status melalui tombol di halaman detail proyek. Aktivitas perubahan status tercatat di audit log dan timeline aktivitas.

### 5.4 Menetapkan Resource pada Proyek

Pada tab **Resources** di detail proyek terdapat 4 bagian:

- **Admin Project** (pilih satu).
- **Konsultan team** — daftar konsultan dengan planned mandays + daily rate.
- **Technical Writer team** — daftar TW.
- **Other Resources** — peran bebas (free-text role).

PM atau Manajemen menambah baris langsung di tabel. Principal dapat **mengusulkan** anggotanya melalui tombol khusus; usulan harus diterima PM/Manajemen sebelum aktif.

### 5.5 Menghapus Proyek

Hanya **PMO Director** (MANAGEMENT) yang dapat menghapus proyek, dan penghapusan bersifat soft delete sehingga seluruh data tetap dapat ditelusuri dari audit log.

---

## Bagian 6 — Manajemen Sumber Daya (Resource)

Modul **Resources** (untuk PM/Manajemen) berisi daftar konsultan & TW beserta tarif harian (daily rate), skill, dan kapasitas. Daftar lengkap karyawan dikelola di menu **Employees** (HR / Site Admin).

### 6.1 Menambah Karyawan

Pengguna **HR** atau **Site Admin** mengelola data karyawan melalui menu **Employees**. Field yang dapat diisi: nama, email, role, title, daily rate, seniority, business unit, manager, principal, dan skills. Aktifkan akun bila karyawan akan login sendiri untuk mengisi timesheet.

### 6.2 Daily Rate

Daily rate karyawan dipakai untuk menghitung **biaya proyek (cost)** secara otomatis berdasarkan jam yang disetujui pada timesheet. Perubahan tarif berlaku ke depan dan tercatat di audit log.

---

## Bagian 7 — Timesheet & Persetujuan

### 7.1 Konsultan Mengisi Timesheet

1. Buka menu **Time Tracking**.
2. Klik **Entry Mingguan** (Weekly Entry) dan pilih minggu yang ingin diisi.
3. Untuk setiap proyek yang ditugaskan, isi jumlah jam per hari (Sen–Jum).
4. Tambahkan catatan singkat bila perlu.
5. Klik **Submit** untuk mengirim ke PM.

Setelah disubmit, entri menjadi **read-only** sampai disetujui atau ditolak oleh PM.

### 7.2 PM Menyetujui Timesheet

Project Manager melihat antrian timesheet pada menu **Approval Inbox** (sidebar khusus PM). Untuk tiap baris tersedia tombol **Approve** / **Reject**, atau **Approve All** untuk batch. Timesheet yang ditolak akan dikembalikan ke konsultan untuk diperbaiki.

### 7.3 Dampak ke P&L

Hanya jam yang berstatus **APPROVED** yang ikut dihitung pada **Actual Mandays** dan biaya proyek. Hal ini memastikan laporan keuangan mencerminkan pekerjaan yang sah.

### 7.4 Kepatuhan Jam Kerja (Work Hours Compliance)

Beberapa peran diwajibkan mencatat jam kerja penuh. Peran wajib lapor adalah **Project Manager, Konsultan, Technical Writer**, dan ketiga **Principal**. Mereka harus mencatat **40 jam per minggu** (8 jam × Senin–Jumat). Peran lain (Admin Project, Sales, Finance, HR, Management, Site Admin) dikecualikan dan tidak melihat fitur ini.

**Tampilan pribadi.** Bila Anda termasuk peran wajib lapor, sebuah kartu **Work Hours** muncul di dashboard Anda. Kartu ini menampilkan jam tercatat vs. target untuk **minggu, bulan, dan tahun** berjalan, ditambah jam yang masih **menunggu persetujuan** (ditampilkan terpisah karena hanya jam APPROVED yang dihitung final). Status menunjukkan posisi Anda:

* **On Target** — target sudah tercapai.
* **On Track** — masih sesuai dengan jumlah hari yang sudah berjalan.
* **Slightly Behind** / **Behind** — kurang dari target, perlu dikejar.

**Cuti menurunkan target.** Cuti yang tercatat (Tahunan, Sakit, dll.) menurunkan target sebesar 8 jam untuk setiap hari kerja cuti — jadi satu minggu dengan satu hari cuti hanya menargetkan 32 jam, bukan 40 jam. Gunakan tombol **Log Leave** pada kartu (dialog cuti yang sama dengan menu lain) untuk mencatat cuti. Cuti yang tumpang tindih tidak akan dihitung ganda.

**Tampilan atasan (halaman `Work Hours`).** Buka menu **Work Hours** di sidebar untuk melihat tabel kepatuhan tim — nama, peran, business unit, serta jam tercatat vs. target untuk minggu/bulan/tahun dengan badge status. Cakupan bergantung peran Anda:

* **HR** melihat seluruh staf wajib lapor.
* **Management** melihat para Project Manager.
* **Principal** hanya melihat anggota yang ia bawahi.

**Unduh data.** Di bagian atas halaman Work Hours tersedia tombol **CSV** dan **Excel** untuk mengunduh seluruh tabel tim (satu baris per orang, lengkap dengan kolom minggu/bulan/tahun). Hasil unduhan selalu mengikuti cakupan Anda — Anda hanya mengekspor baris yang berhak Anda lihat.

---

## Bagian 8 — Dokumen: BAST & Invoice (Auto-Close)

### 8.1 Mengunggah BAST (Berita Acara Serah Terima)

1. Buka detail proyek → tab **Documents**.
2. Klik **Upload BAST**.
3. Pilih berkas PDF, lalu klik **Upload**.

### 8.2 Mengunggah Invoice

Pengguna **FINANCE** mengunggah invoice melalui tombol **Upload Invoice** pada tab yang sama.

### 8.3 Auto-Close Project

Bila kedua dokumen (**BAST** dan **Invoice**) telah terunggah pada proyek yang berstatus **COMPLETE**, sistem otomatis mengubah status menjadi **CLOSED**, mencatat aktivitas, dan mengaktifkan tautan survey kepuasan pelanggan (lihat Bagian 16).

---

## Bagian 9 — Profit & Loss + Forecasting

Modul **P&L** memberikan gambaran keuangan real-time tiap proyek maupun secara portofolio.

### 9.1 Komponen P&L Per Proyek

- **Revenue** — pendapatan proyek (umumnya = nilai kontrak setelah CLOSED).
- **Cost** — total daily rate × jam disetujui dari seluruh resource.
- **Margin** — revenue dikurangi cost, juga ditampilkan sebagai persentase.
- **Variance Mandays** — selisih actual vs planned mandays.

### 9.2 Forecasting

Sistem memproyeksikan **expected revenue** berdasarkan proyek yang sedang berjalan (IN_PROGRESS) dengan asumsi pekerjaan diselesaikan sesuai rencana. Forecast ditampilkan pada dashboard Manajemen dan modul Business Intelligence.

### 9.3 Menyaring Data

Tersedia filter berdasarkan **periode**, **klien**, **PM**, dan **status proyek**. Hasil filter dapat diekspor ke Excel.

---

## Bagian 10 — Kapasitas & Utilisasi Tim

### 10.1 Capacity Planning

Menu **Capacity Planning** (PM/HR) menampilkan kapasitas standar tiap konsultan per minggu (5 hari kerja) dan membandingkannya dengan total alokasi proyek aktif. Kelebihan alokasi (overallocation) ditandai warna merah agar PM dapat menyeimbangkan beban.

### 10.2 Resource Planning & Bench

Menu **Resource Planning** menampilkan grid mingguan per business unit dengan distribusi planned mandays — sel berwarna emerald (ringan), amber (≥4), merah (≥6). Menu **Bench Report** menampilkan karyawan yang sedang idle. Menu **Skill Matrix** menunjukkan peta skill × karyawan dengan deteksi gap (skill tanpa pemegang Senior/Principal).

---

## Bagian 11 — Timeline Gantt

Tab **Gantt** pada detail proyek menggambar batang waktu pekerjaan setiap resource. Anda dapat:

- Melihat tumpang tindih pekerjaan antar konsultan.
- Mengidentifikasi celah (idle) atau bentrok jadwal.
- Memutar zoom mingguan / bulanan.

---

## Bagian 12 — Notifikasi In-App

Ikon lonceng pada header menampilkan notifikasi yang relevan dengan peran Anda, antara lain:

- Timesheet baru menunggu persetujuan (PM).
- Status proyek berubah (PM, Manajemen).
- BAST / Invoice diunggah (Finance, Manajemen).
- Survey kepuasan baru diterima (PM, Manajemen).

Klik notifikasi untuk langsung menuju halaman terkait. Tombol **Mark all as read** menandai seluruh notifikasi sebagai sudah dibaca.

---

## Bagian 13 — Ekspor Data ke Excel & PDF

Pada hampir setiap halaman daftar (Projects, Timesheet, P&L, Utilization, Audit Log, Survey Responses) tersedia tombol **Export Excel**, **Export CSV**, atau **Export PDF**. Berkas Excel/CSV dapat dibuka langsung di Microsoft Excel atau Google Sheets; berkas PDF siap dicetak atau dilampirkan ke email.

Khusus untuk Customer Satisfaction:

- Pada tab **Customer Satisfaction** detail proyek tersedia tiga tombol: **CSV**, **Excel**, dan **PDF**.
- Pada widget **Average Client Satisfaction** di Dashboard Manajemen tersedia dua tombol: **Excel** dan **PDF** untuk ringkasan portofolio bulan berjalan.

Berkas Excel CSAT berisi dua sheet — *Summary* (rata-rata per pertanyaan) dan *Responses* (setiap respons sebagai satu baris). Berkas PDF dirancang dengan tema cyber-security (deep blue + cyber green) berisi highlight rata-rata, tabel per pertanyaan, dan daftar komentar/lessons learned.

---

## Bagian 14 — Audit Log

Audit Log mencatat seluruh perubahan penting di sistem: pembuatan/penghapusan entitas, perubahan status, persetujuan timesheet, unggah dokumen, edit tarif, dan submit survey.

### 14.1 Mengakses

Hanya peran **PMO Director** (MANAGEMENT) dan **Site Admin** yang dapat membuka menu **Audit Log**. Tersedia filter berdasarkan **aktor**, **tipe aksi**, **entitas**, dan **rentang tanggal**.

### 14.2 Detail Entri

Setiap entri menampilkan: timestamp, pengguna, aksi (mis. `project.update`, `timesheet.approve`), entitas terkait, ringkasan perubahan (before/after), dan alamat IP.

---

## Bagian 15 — Business Intelligence Dashboard

Menu **Business Intelligence** (khusus MANAGEMENT) menyajikan ringkasan strategis perusahaan dalam satu halaman:

- **Pipeline Funnel** — jumlah proyek per status.
- **Revenue per Quarter** — grafik batang pendapatan kuartal berjalan.
- **Top Clients** — klien dengan kontribusi terbesar.
- **Margin per Industry** — komparasi profit antar segmen industri.
- **Forecast vs Actual** — kurva perbandingan rencana dan realisasi.
- **Customer Satisfaction Snapshot** — rata-rata kepuasan bulan berjalan.

---

## Bagian 16 — Survey Kepuasan Pelanggan (CSAT)

### 16.1 Bagaimana Survey Diaktifkan

Saat sebuah proyek berpindah status menjadi **CLOSED** (manual atau otomatis dari unggahan BAST + Invoice), sistem secara aman menghasilkan **token survey** unik sepanjang 32 karakter dan membentuk **tautan publik** dengan format:

```
https://[domain-anda]/survey/[token]
```

Tautan ini dapat dibuka tanpa login oleh pihak klien.

### 16.2 Membagikan Tautan ke Klien

1. Buka detail proyek (status CLOSED).
2. Klik tab **Customer Satisfaction**.
3. Salin **Public Survey URL** dan kirim ke klien melalui email.

### 16.3 Klien Mengisi Survey

Klien akan melihat halaman bertema gelap berisi:

- Identitas proyek dan ucapan terima kasih.
- Beberapa pertanyaan rating bintang 1–5 (manajemen proyek, performa konsultan, kualitas laporan, tim secara keseluruhan).
- Kolom komentar bebas (lesson learned).
- Kolom nama dan email opsional (boleh anonim).

Setelah klien menekan **Submit**, halaman menampilkan pesan terima kasih.

### 16.4 Melihat Hasil Survey

Pada tab **Customer Satisfaction** detail proyek, PM dan Manajemen melihat:

- **Diagram radar** rata-rata rating per pertanyaan.
- **Daftar respons individu** lengkap dengan komentar.
- Tombol **CSV**, **Excel**, dan **PDF** untuk mengunduh data per proyek.

Pada **Dashboard Manajemen** terdapat widget **Average Client Satisfaction (this month)** yang menampilkan rata-rata kepuasan bulan berjalan dan rincian per pertanyaan untuk seluruh proyek, beserta tombol **Excel** dan **PDF** untuk mengunduh ringkasan portofolio.

### 16.5 Mengisi Data Contoh (Sekali-Pakai)

Apabila widget masih menampilkan "No survey responses received yet this month" — biasanya pada lingkungan baru — pengguna **MANAGEMENT** akan melihat tombol kecil **Load demo data** di kanan widget. Klik sekali, konfirmasi, dan sistem akan otomatis menutup beberapa proyek serta membuat sekitar 11 respons survei contoh dengan tanggal di bulan berjalan. Tombol akan hilang setelah ada respons. Fungsi ini bersifat idempoten — panggilan kedua akan ditolak secara otomatis.

### 16.6 Mengubah Template Pertanyaan

Pengguna **MANAGEMENT** dapat membuka **Settings → Survey Template** untuk menambah, menonaktifkan, atau mengubah teks pertanyaan. Respons lama tetap dapat dibaca utuh karena sistem menyimpan **snapshot pertanyaan** pada saat respons dikirim.

---

## Bagian 17 — Pengaturan Sistem

Konfigurasi sistem tersebar di beberapa menu sesuai peran:

- **Users** (Site Admin) — mengelola seluruh akun pengguna: undang baru, ubah peran, aktif/nonaktif, reset password.
- **Employees** (HR) — mengelola data karyawan (title, daily rate, seniority, business unit, manager, principal, skills) tanpa hak mengubah role/email/status aktif orang lain.
- **Business Units** & **Skills** (Site Admin / HR) — kelola taksonomi BU dan skill.
- **Survey Template** (PMO Director) — kelola pertanyaan CSAT, snapshot pertanyaan disimpan per respons.
- **Settings → Profile** (semua peran) — ubah foto profil dan kata sandi sendiri.

---

## Bagian 18 — Tanya Jawab & Pemecahan Masalah

**Q: Saya tidak melihat menu tertentu yang ada di panduan ini.**
A: Menu disaring berdasarkan peran. Hubungi administrator jika Anda merasa hak akses tidak sesuai.

**Q: Mengapa proyek tidak otomatis CLOSED meskipun saya sudah upload BAST dan Invoice?**
A: Pastikan status proyek sebelumnya adalah **COMPLETE**. Auto-close hanya berjalan dari status COMPLETE.

**Q: Bisakah saya mengubah timesheet yang sudah disetujui?**
A: Tidak. Timesheet yang sudah APPROVED bersifat final demi integritas P&L. Hubungi PM Anda untuk koreksi resmi.

**Q: Apakah klien butuh akun untuk mengisi survey?**
A: Tidak. Tautan survey publik bersifat token-based dan dapat dibuka langsung tanpa login.

**Q: Bagaimana jika tautan survey saya hilang?**
A: Buka kembali tab Customer Satisfaction pada proyek terkait — tautan akan tetap sama selama proyek masih berstatus CLOSED.

**Q: Mengapa angka pada Dashboard sedikit berbeda dengan laporan ekspor saya?**
A: Dashboard menampilkan data real-time. Bila Anda mengekspor lalu menyetujui timesheet baru, ekspor lama tidak akan ikut diperbarui. Lakukan ekspor ulang untuk angka terbaru.

**Q: Saya terkunci karena salah memasukkan kata sandi terlalu sering.**
A: Tunggu beberapa menit lalu coba lagi. Jika masih terkendala, hubungi administrator untuk reset.

---

*— Akhir Panduan Pengguna —*
