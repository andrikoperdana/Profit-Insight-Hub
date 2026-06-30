# Penambahan Fitur Commission Tracker ke SecureProfit Hub
### Studi Kelayakan, Pro/Kontra, dan Daftar Perubahan Aplikasi

> Dokumen keputusan untuk manajemen. Disusun agar bisa dipakai menjawab pihak yang meminta fitur ini.
> Status: **belum dikerjakan** — masih tahap kajian.

---

## 1. Ringkasan Eksekutif

Saat ini perhitungan komisi sales dilakukan **manual di file Excel** (`ITSEC Commission Tracker`), per kuartal, dengan sumber data export dari **PSOhub**. Permintaannya: **memindahkan proses ini menjadi fitur otomatis di dalam SecureProfit Hub.**

**Kesimpulan: LAYAK.** Sekitar **80% datanya (invoice + margin) sudah tersedia** di aplikasi dan bisa dihitung otomatis. Pekerjaan utamanya **bukan** di rumus uang, melainkan menambah **lapisan atribusi komisi** (siapa dapat kredit berapa) plus **konfigurasi rate** dan **halaman UI**.

**Arah yang sudah disepakati:** komisi dihitung otomatis dari data SecureProfit Hub (memakai **margin aktual** aplikasi), bukan dari impor file PSOhub.

---

## 2. Apa yang Diminta (ringkas isi spreadsheet)

Spreadsheet adalah **Sales Commission Tracker kuartalan** dengan 7 sheet: Instructions, Config, Raw Data, Commission Data — Sales, Commission Data — Presales, Summary, dan Commission Slip.

Logika intinya:

- **Basis komisi = margin (laba kotor), bukan revenue.** `Basis Komisi = Revenue Net × Applied Margin`.
- **Aturan margin:** untuk proyek berstatus tepat "Closed" → pakai margin paling konservatif (`MIN(estimasi, final)`); status lain → pakai margin estimasi saja.
- **Rate komisi:**
  - Sales PIC: **5%** (flat per kuartal)
  - Umbrella Contract: PIC pool **2,5%** + PM **2,5%**
  - Sales Manager: **0,7%**
  - Sales Director: **0,3%**
  - Presales: **3,5%**
  - Referral pool: **1%** dari margin (dipotong dari net PIC)
- **Share-based:** sampai 3 PIC per deal dengan pembagian persentase (total 100%); Manager/Director hanya dapat override jika bukan PIC di deal tersebut; referral dialokasikan proporsional terhadap share PIC.
- **Output:** Summary total per orang lintas semua peran, dan Commission Slip (slip rincian) per orang.

---

## 3. Keuntungan (PRO) Memindahkan ke Aplikasi

1. **Hilangkan kerja manual & risiko human error.** Tidak ada lagi copy-paste export tiap kuartal, salah tarik rumus, atau file rusak.
2. **Satu sumber kebenaran (single source of truth).** Komisi memakai data invoice & margin yang sama dengan dashboard Finance/Management — tidak ada lagi rekonsiliasi "Excel vs sistem".
3. **Margin lebih kuat & bisa dipertanggungjawabkan.** Aplikasi menghitung margin dari biaya **aktual** (timesheet + expense yang sudah di-approve), bukan sekadar estimasi deal sheet.
4. **Otomatis per kuartal + slip instan.** Periode, summary, dan slip per orang bisa di-generate dan di-export (PDF/XLSX) memakai engine export yang **sudah ada** di aplikasi.
5. **Kerahasiaan jauh lebih terjaga.** Data komisi bersifat CONFIDENTIAL. Di aplikasi bisa dibatasi per peran (mis. hanya Management/Finance + slip pribadi masing-masing), jauh lebih aman daripada file Excel yang beredar.
6. **Jejak audit otomatis.** Setiap perubahan tercatat (siapa, kapan, apa).
7. **Skalabel.** Menambah orang baru / mengubah peran cukup lewat master data, bukan mengedit rumus di banyak sel.

---

## 4. Risiko & Kekurangan (KONTRA)

1. **Angka komisi bisa berbeda dari sheet PSOhub lama.** Aplikasi pakai margin **aktual**, PSOhub pakai margin **estimasi/deal sheet**. Untuk proyek yang **masih berjalan**, selisihnya bisa terasa; untuk proyek yang sudah Closed cenderung mendekati. Perlu sosialisasi sebelum dipakai resmi.
2. **WHT (pajak potongan) belum dilacak aplikasi.** Di spreadsheet, "Revenue Net = Gross − WHT". Aplikasi belum menyimpan WHT per invoice — perlu diabaikan, didekati, atau ditambah field kecil.
3. **"Service Type" belum sedetail spreadsheet.** Aplikasi mengelompokkan lewat Business Unit (Pentest/GRC/Threat Hunting), sedangkan spreadsheet memakai kategori lebih rinci (Pentest/Governance/Solution/MSS/Forensic). Perlu pemetaan atau penambahan kategori.
4. **Ini fitur besar, bukan tweak kecil.** Butuh waktu pengembangan, pengujian, dan pengisian data master (menentukan siapa Manager/Director/Presales, menandai proyek Umbrella, menetapkan share PIC).
5. **Bergantung pada kedisiplinan data.** Jika timesheet/expense tidak rutin diinput, margin aktual (dan otomatis komisinya) menjadi tidak akurat.
6. **Perlu keputusan kebijakan dulu.** Misalnya: komisi dihitung saat invoice **INVOICED** atau saat **PAID** (cash-in)? Ini memengaruhi hasil.

---

## 5. Yang Harus Diubah/Ditambah di Aplikasi

### A. Data (model baru / perubahan)
1. **Atribusi sales multi-PIC + share%** per proyek/invoice. Saat ini satu proyek hanya punya **satu** sales (`salesId`), tanpa pembagian persen. *(perubahan paling penting)*
2. **Peran/penanda baru:** Presales, Sales Manager, Sales Director, plus assignment Presales per deal (sampai 3 + share).
3. **Penanda "Umbrella Contract"** pada proyek + mekanisme komisi PM 2,5%.
4. **Referral** (nama + persentase) per deal.
5. **Tabel konfigurasi rate komisi** yang bisa diedit (berlaku per kuartal / per tanggal efektif).
6. *(Opsional)* field **WHT** per invoice; penghalusan **kategori Service Type**.

### B. Logika perhitungan
7. **Engine komisi deterministik** yang meniru rumus Excel **1:1**: applied margin (aturan konservatif), basis komisi, alokasi share PIC, pemotongan referral, override Manager/Director, komisi Presales.
8. Penentuan **periode kuartal & tanggal payout**.

### C. Tampilan (halaman baru)
9. **Halaman Commission**: konfigurasi rate, assign kredit per invoice/kuartal, **Summary per orang**, **Slip per orang**, dan **export XLSX/PDF**.

### D. Akses & keamanan
10. **Pembatasan akses ketat** (CONFIDENTIAL): siapa boleh melihat komisi siapa — kemungkinan hanya Management/Finance, ditambah setiap orang boleh melihat slip pribadinya sendiri.

### E. Proses & data master
11. **Pengisian data master**: daftar Presales/Manager/Director, penandaan proyek Umbrella, dan penetapan share PIC (termasuk untuk data historis bila ingin di-backfill).

---

## 6. Yang Perlu Disampaikan ke Pihak Peminta

- Hasil komisi akan **memakai margin aktual aplikasi**, sehingga **bisa berbeda** dari file Excel lama (terutama proyek berjalan). Perlu kesepakatan bahwa ini menjadi acuan baru.
- Akurasi komisi **bergantung pada kelengkapan data** (timesheet, expense, penetapan PIC & share). Disiplin input wajib.
- Ada **keputusan kebijakan** yang harus difinalisasi sebelum mulai (lihat bagian 8).

---

## 7. Pendekatan Bertahap (rekomendasi pelaksanaan)

- **Fase 1 — Mesin perhitungan:** model data + engine komisi yang meniru rumus Excel, divalidasi terhadap file contoh agar angkanya cocok.
- **Fase 2 — Tampilan:** halaman konfigurasi rate, assign kredit, Summary, Slip, dan export.
- **Fase 3 — Keamanan & data:** pembatasan akses, audit, dan pengisian/backfill data historis.

---

## 8. Keputusan yang Perlu Diambil Sebelum Mulai

1. **Basis pengakuan komisi:** saat invoice **INVOICED** atau saat **PAID** (cash-in)?
2. **Perlakuan WHT:** abaikan, dekati, atau lacak resmi per invoice?
3. **Sumber margin proyek berjalan:** terima margin aktual aplikasi apa adanya, atau izinkan override manual per deal?
4. **Cakupan akses:** siapa saja yang boleh melihat data komisi (selain slip pribadi)?
5. **Data master:** siapa yang ditetapkan sebagai Sales Manager, Sales Director, dan Presales; proyek mana yang berstatus Umbrella Contract.
6. **Backfill historis:** apakah perlu menghitung ulang kuartal-kuartal sebelumnya, atau mulai dari kuartal berjalan saja?

---

## 9. Rekomendasi

**Lanjutkan, dengan pelaksanaan bertahap.** Fondasi finansial aplikasi sudah matang dan cocok; nilai tambahnya tinggi (otomatisasi, akurasi, kerahasiaan, audit). Yang dibutuhkan sebelum eksekusi hanyalah **finalisasi keputusan kebijakan di bagian 8** dan **kesiapan data master**. Setelah itu, fitur ini dapat dibangun tanpa mengganggu modul yang sudah berjalan.
