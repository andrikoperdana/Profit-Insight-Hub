# Rencana Migrasi Database Produksi (Neon Singapore → US)

> Status: RENCANA — belum dieksekusi. Quick wins (pool 24, polling notifikasi,
> payload trimming) sudah diterapkan terpisah dan butuh republish.

## Masalah

- Aplikasi produksi (Replit Autoscale, `psa4pmo.xyz`) berjalan di **Amerika Utara**.
- Database Neon produksi berada di **ap-southeast-1 (Singapore)**.
- Akibat: setiap query membayar ~163 ms round-trip (terukur via `psql \timing`),
  koneksi baru ~1,2 detik. Endpoint yang butuh beberapa query + antrean pool
  membengkak jadi 9–53 detik saat ramai.
- Lokasi deployment Replit tidak bisa dipindah ke Asia, jadi solusi permanennya
  adalah memindahkan DB ke region yang sama dengan aplikasi (US).

## Target

Neon project baru di **aws-us-east-1** (atau us-east-2). Ekspektasi: RTT per
query turun dari ~163 ms menjadi <5 ms — endpoint multi-query turun dari
detik-detik menjadi ratusan milidetik.

## Prasyarat

1. Akses ke akun Neon (pemilik project produksi saat ini).
2. Jendela maintenance ±30–60 menit (malam hari WIB, saat trafik kosong).
3. Backup terbaru sudah diverifikasi (langkah 2 di bawah).

## Langkah Eksekusi

1. **Buat Neon project baru** di region `aws-us-east-1`
   (Neon tidak mendukung pindah region in-place — harus dump & restore).
2. **Dump DB produksi lama** (dari workspace Replit, koneksi langsung):
   ```bash
   pg_dump "$PROD_DATABASE_URL" -Fc -f /tmp/prod-backup.dump
   ```
3. **Restore ke project baru**:
   ```bash
   pg_restore -d "<URL_DB_BARU>" --no-owner --no-privileges /tmp/prod-backup.dump
   ```
4. **Verifikasi** — bandingkan jumlah baris tabel kunci lama vs baru:
   `User`, `Project`, `Timesheet`, `BillingMilestone`, `Document`, `AuditLog`.
5. **Freeze tulis**: umumkan maintenance; jangan ada approve/submit selama cutover.
   Ulangi dump+restore cepat (delta kecil) tepat sebelum cutover bila perlu.
6. **Ganti secret `PROD_DATABASE_URL`** di deployment ke URL project baru
   (pakai host pooler `-pooler` + `pgbouncer=true`, konsisten dengan setup lama).
7. **Republish** aplikasi, lalu smoke test: login, dashboard MGMT, approve 1
   timesheet dummy, buka 1 proyek.
8. **Jalankan ulang cek migrasi Prisma** (harusnya no-op karena schema ikut
   ter-restore): `DATABASE_URL=<baru> pnpm --filter @workspace/db run migrate:deploy`.

## Rollback

- Kembalikan secret `PROD_DATABASE_URL` ke URL lama → republish. DB lama tidak
  disentuh selama migrasi, jadi rollback aman kapan pun sebelum DB lama dihapus.
- Jangan hapus project Neon lama minimal 2 minggu setelah cutover.

## Catatan

- Ukuran DB saat ini kecil (puluhan MB) — dump+restore hanya beberapa menit.
- Integrasi Xero/Pipedrive/Resend tidak terpengaruh (semua keluar dari app, bukan DB).
- Setelah migrasi, `DB_CONNECTION_LIMIT` default 24 tetap berlaku; bisa diturunkan
  kembali via env tanpa redeploy bila perlu.
