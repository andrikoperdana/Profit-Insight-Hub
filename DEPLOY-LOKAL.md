# Panduan Deploy SecureProfit Hub di Server Lokal

Panduan ini ditulis untuk pemula. Diasumsikan Anda baru pertama kali deploy aplikasi web ke server sendiri. Kita akan pakai server **Ubuntu 22.04 LTS** (sistem operasi server paling umum dan gratis). Kalau pakai distribusi lain (CentOS, Debian, dll), perintahnya mirip — hanya beda di `apt` (Ubuntu/Debian) vs `yum`/`dnf` (CentOS/RedHat).

Total waktu pengerjaan: sekitar **1–2 jam** untuk yang awam.

---

## Daftar Isi

1. [Apa Saja yang Anda Butuhkan](#1-apa-saja-yang-anda-butuhkan)
2. [Persiapan Server](#2-persiapan-server)
3. [Instal Software yang Dibutuhkan](#3-instal-software-yang-dibutuhkan)
4. [Setup Database PostgreSQL](#4-setup-database-postgresql)
5. [Download Kode Aplikasi](#5-download-kode-aplikasi)
6. [Konfigurasi Aplikasi](#6-konfigurasi-aplikasi)
7. [Build dan Jalankan Aplikasi](#7-build-dan-jalankan-aplikasi)
8. [Setup Nginx (Pintu Masuk Web)](#8-setup-nginx-pintu-masuk-web)
9. [Pasang HTTPS (Opsional tapi Disarankan)](#9-pasang-https-opsional-tapi-disarankan)
10. [Backup Database Otomatis](#10-backup-database-otomatis)
11. [Cara Update Aplikasi di Kemudian Hari](#11-cara-update-aplikasi-di-kemudian-hari)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Apa Saja yang Anda Butuhkan

### Hardware (komputer yang akan jadi server)

Spesifikasi minimum (cukup untuk 50–100 user aktif):

- **CPU**: 2 core
- **RAM**: 4 GB
- **Storage**: 40 GB SSD
- **Koneksi internet**: stabil (kalau mau diakses dari luar kantor)

Bisa pakai:
- Mini PC (Intel NUC, dll)
- Server bekas
- VPS (DigitalOcean, Vultr, Niagahoster, IDCloudHost, dll) seharga ~Rp 100.000–200.000/bulan
- Komputer kantor yang dijadikan server

### Software (yang akan kita instal nanti)

- Sistem operasi **Ubuntu Server 22.04 LTS** (gratis, download dari ubuntu.com)
- Node.js 20 (untuk menjalankan aplikasi)
- pnpm (alat untuk mengelola paket Node)
- PostgreSQL 15 (database)
- Nginx (pintu masuk web)
- PM2 (penjaga supaya aplikasi auto-restart kalau crash)
- Git (untuk download kode)

### Akses

- Username dan password root (admin) ke server
- Akses SSH ke server (untuk yang remote/VPS)

---

## 2. Persiapan Server

### A. Login ke server

Kalau server lokal di kantor, langsung login di layarnya.

Kalau VPS, dari komputer Anda buka Terminal (Mac/Linux) atau PowerShell (Windows), lalu ketik:

```bash
ssh root@IP-SERVER-ANDA
```

Ganti `IP-SERVER-ANDA` dengan alamat IP server Anda (misalnya `103.123.45.67`).

### B. Update sistem

Setelah masuk, jalankan ini untuk memastikan sistem terbaru:

```bash
apt update && apt upgrade -y
```

Tunggu sampai selesai (1–5 menit).

### C. Buat user khusus aplikasi (penting untuk keamanan)

Jangan jalankan aplikasi sebagai `root`. Kita buat user khusus bernama `secureprofit`:

```bash
adduser secureprofit
usermod -aG sudo secureprofit
```

Saat ditanya password, isi dan catat. Pertanyaan lain (nama lengkap, dll) boleh dikosongkan dengan tekan Enter.

Lalu pindah ke user baru:

```bash
su - secureprofit
```

Mulai sekarang, semua perintah dijalankan sebagai user `secureprofit`. Kalau perlu hak admin, pakai `sudo` di depan perintah.

---

## 3. Instal Software yang Dibutuhkan

### A. Instal Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Cek hasilnya:

```bash
node --version    # harus muncul v20.x.x
npm --version
```

### B. Instal pnpm

```bash
sudo npm install -g pnpm
pnpm --version    # harus muncul 9.x atau lebih baru
```

### C. Instal PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Cek statusnya:

```bash
sudo systemctl status postgresql
```

Tekan `q` untuk keluar dari tampilan status.

### D. Instal Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### E. Instal PM2 (process manager)

```bash
sudo npm install -g pm2
```

### F. Instal Git

```bash
sudo apt install -y git
```

Sampai sini, semua software sudah terpasang.

---

## 4. Setup Database PostgreSQL

### A. Masuk ke PostgreSQL

```bash
sudo -u postgres psql
```

Anda akan masuk ke prompt `postgres=#`.

### B. Buat database dan user khusus aplikasi

Salin-tempel perintah berikut **satu per satu**. **Ganti `GANTI_PASSWORD_KUAT_DI_SINI`** dengan password yang kuat (minimal 16 karakter, campur huruf-angka-simbol). **Catat password ini** — nanti kita butuh.

```sql
CREATE USER secureprofit_user WITH PASSWORD 'GANTI_PASSWORD_KUAT_DI_SINI';
CREATE DATABASE secureprofit_db OWNER secureprofit_user;
GRANT ALL PRIVILEGES ON DATABASE secureprofit_db TO secureprofit_user;
\q
```

`\q` keluar dari PostgreSQL.

### C. Tes koneksi

```bash
psql -U secureprofit_user -d secureprofit_db -h localhost
```

Masukkan password yang Anda buat. Kalau berhasil masuk, ketik `\q` untuk keluar. Kalau gagal, lihat bagian Troubleshooting.

---

## 5. Download Kode Aplikasi (Metode ZIP)

Bagian ini cocok untuk yang **tidak terbiasa dengan Git**. Kita akan: download ZIP dari Replit → upload ke server → ekstrak.

### A. Download ZIP dari Replit

1. Buka project Anda di Replit lewat browser (di komputer Anda, bukan di server).
2. Di pojok kiri atas, klik nama project Anda untuk membuka menu.
3. Pilih **"Download as zip"** (atau ikon tiga titik `⋮` → **Download as zip**).
4. File berformat `<nama-project>.zip` akan tersimpan di folder Downloads komputer Anda. Ukurannya biasanya 5–50 MB.

> **Catatan:** ZIP ini sudah berisi semua kode tapi **tidak berisi folder `node_modules`** (paket-paket yang nanti diinstal otomatis oleh `pnpm install`). Itu wajar dan benar — jangan kaget kalau ZIP-nya kecil.

### B. Pasang software upload (di komputer Anda)

Anda butuh aplikasi untuk transfer file ke server. Pilih sesuai sistem operasi komputer Anda:

- **Windows**: Download **WinSCP** dari https://winscp.net (gratis).
- **Mac**: Download **Cyberduck** dari https://cyberduck.io (gratis), atau **FileZilla**.
- **Linux**: **FileZilla** dari Software Center, atau pakai perintah `scp` di terminal.

### C. Upload ZIP ke server

#### Pakai WinSCP (Windows):

1. Buka WinSCP.
2. Klik **New Site**, isi:
   - **File protocol**: SFTP
   - **Host name**: IP server Anda (misal `103.123.45.67`)
   - **Port number**: 22
   - **User name**: `secureprofit`
   - **Password**: password user `secureprofit` (yang Anda buat di langkah 2.C)
3. Klik **Login**. Kalau muncul peringatan host key, klik **Yes**.
4. Panel kiri = komputer Anda, panel kanan = server. Di panel kanan, navigasi ke `/home/secureprofit/`.
5. Drag file ZIP dari panel kiri ke kanan. Tunggu sampai upload selesai (1–10 menit tergantung kecepatan internet).

#### Pakai Cyberduck (Mac):

1. Klik **Open Connection**.
2. Pilih **SFTP (SSH File Transfer Protocol)**.
3. Isi: Server = IP server, Username = `secureprofit`, Password = password user.
4. Klik **Connect**.
5. Navigasi ke `/home/secureprofit/`, lalu drag file ZIP ke jendela Cyberduck.

#### Pakai perintah `scp` (Mac/Linux, paling cepat):

Buka Terminal di komputer Anda, lalu:

```bash
scp ~/Downloads/nama-project.zip secureprofit@IP-SERVER-ANDA:/home/secureprofit/
```

Ganti `nama-project.zip` dengan nama file ZIP yang sebenarnya, dan `IP-SERVER-ANDA` dengan IP server. Masukkan password ketika diminta.

### D. Ekstrak ZIP di server

Kembali ke terminal SSH ke server (sebagai user `secureprofit`):

```bash
cd ~
ls -lh                        # cek file ZIP sudah ada
sudo apt install -y unzip     # pasang tool unzip kalau belum ada
unzip nama-project.zip -d secureprofit
cd secureprofit
ls                            # harus muncul folder artifacts, lib, dll
```

> **Kalau hasil ekstrak masuk ke folder bertingkat** (misal `secureprofit/nama-project/artifacts/...`), pindahkan isinya ke atas:
> ```bash
> cd ~/secureprofit
> mv nama-project/* nama-project/.* . 2>/dev/null
> rmdir nama-project
> ```

Lalu hapus file ZIP supaya tidak makan tempat:

```bash
rm ~/nama-project.zip
```

### E. Instal semua paket yang dibutuhkan

Dari folder `~/secureprofit`:

```bash
pnpm install
```

Tunggu 3–10 menit (tergantung koneksi internet). Akan muncul progress bar dan banyak pesan — itu normal. Kalau selesai tanpa error merah, lanjut ke langkah berikutnya.

> **Kalau ada error saat `pnpm install`**: cek apakah Node.js dan pnpm sudah terpasang dengan benar (langkah 3.A dan 3.B). Jalankan `node --version` dan `pnpm --version` untuk memastikan.

---

## 6. Konfigurasi Aplikasi

Aplikasi butuh beberapa "rahasia" (password database, kunci enkripsi, dll). Kita simpan di file `.env`.

### A. Buat file .env untuk API server

```bash
nano artifacts/api-server/.env
```

(`nano` adalah text editor sederhana). Isi dengan:

```env
DATABASE_URL=postgresql://secureprofit_user:GANTI_PASSWORD_KUAT_DI_SINI@localhost:5432/secureprofit_db
SESSION_SECRET=GANTI_DENGAN_TEKS_RANDOM_PANJANG_MINIMAL_32_KARAKTER
PORT=8080
NODE_ENV=production
```

**Penting:**
- Ganti `GANTI_PASSWORD_KUAT_DI_SINI` dengan password database dari langkah 4.B.
- Ganti `SESSION_SECRET` dengan teks random. Cara cepat membuatnya: jalankan di terminal `openssl rand -hex 32` lalu salin hasilnya.

Simpan: tekan `Ctrl+O`, lalu Enter, lalu `Ctrl+X` untuk keluar.

### B. Setup database (buat tabel-tabel)

Dari folder root proyek (`~/secureprofit`):

```bash
pnpm --filter @workspace/db run migrate:deploy
```

Ini akan membuat semua tabel di database (menjalankan migrasi `0_init`). Tunggu sampai muncul "All migrations have been successfully applied".

### C. Isi data awal (akun demo)

```bash
pnpm --filter @workspace/db run seed
```

Ini akan membuat akun demo (management, PM, sales, dll) dengan password `password123`. **Setelah login pertama, segera ganti password mereka di menu Settings, atau hapus akun demo dan buat akun asli.**

---

## 7. Build dan Jalankan Aplikasi

### A. Build (kompilasi kode untuk produksi)

```bash
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/web run build
```

Tiap perintah memakan waktu 1–3 menit.

### B. Jalankan API server pakai PM2

```bash
cd ~/secureprofit
pm2 start artifacts/api-server/dist/index.mjs --name secureprofit-api
```

Cek statusnya:

```bash
pm2 status
```

Harus muncul `secureprofit-api` dengan status `online`.

### C. Auto-start saat server reboot

```bash
pm2 save
pm2 startup
```

Perintah `pm2 startup` akan menampilkan satu baris perintah yang harus Anda salin dan jalankan (diawali `sudo env ...`). Salin dan jalankan baris itu.

Aplikasi backend sekarang sudah hidup di port 8080. Sekarang kita perlu Nginx untuk:
1. Menyajikan file frontend (HTML/JS/CSS).
2. Meneruskan request `/api/*` ke backend di port 8080.

---

## 8. Setup Nginx (Pintu Masuk Web)

### A. Buat konfigurasi Nginx

```bash
sudo nano /etc/nginx/sites-available/secureprofit
```

Isi dengan:

```nginx
server {
    listen 80;
    server_name _;   # ganti dengan domain Anda kalau punya, misal: app.perusahaan.co.id

    # Frontend (file statis hasil build)
    root /home/secureprofit/secureprofit/artifacts/web/dist/public;
    index index.html;

    # Batas ukuran upload (untuk dokumen BAST/Invoice)
    client_max_body_size 25M;

    # Teruskan /api ke backend
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Single Page App: route apapun → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Simpan (`Ctrl+O`, Enter, `Ctrl+X`).

### B. Aktifkan konfigurasi

```bash
sudo ln -s /etc/nginx/sites-available/secureprofit /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t        # tes konfigurasi
sudo systemctl reload nginx
```

Kalau `nginx -t` bilang `syntax is ok` dan `test is successful`, berarti aman.

### C. Buka firewall (kalau aktif)

```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

### D. Tes!

Buka browser, akses `http://IP-SERVER-ANDA`. Harusnya muncul halaman login SecureProfit Hub. Login pakai akun demo:

- Email: `management@secureprofit.id`
- Password: `password123`

Kalau berhasil, **selamat — aplikasi sudah jalan di server Anda!**

---

## 9. Pasang HTTPS (Opsional tapi Disarankan)

HTTPS bikin koneksi terenkripsi (gembok hijau di browser). **Wajib kalau aplikasi diakses dari internet.** Kita pakai **Let's Encrypt** (sertifikat SSL gratis).

**Syarat:** Anda harus punya domain (misal `app.perusahaan.co.id`) yang sudah di-pointing (A record) ke IP server.

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.perusahaan.co.id
```

Ikuti pertanyaannya (masukkan email, setuju TOS, pilih redirect ke HTTPS). Selesai. Sertifikat akan auto-renew tiap 60 hari.

Sebelum jalankan ini, pastikan di `/etc/nginx/sites-available/secureprofit` baris `server_name _;` sudah diganti jadi `server_name app.perusahaan.co.id;`, lalu `sudo systemctl reload nginx`.

---

## 10. Backup Database Otomatis

**Ini sangat penting** — kalau server rusak tanpa backup, semua data hilang.

### A. Buat folder backup

```bash
mkdir -p /home/secureprofit/backups
```

### B. Buat script backup

```bash
nano /home/secureprofit/backup-db.sh
```

Isi dengan:

```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/home/secureprofit/backups
PGPASSWORD='GANTI_PASSWORD_KUAT_DI_SINI' pg_dump -U secureprofit_user -h localhost secureprofit_db | gzip > $BACKUP_DIR/secureprofit_$TIMESTAMP.sql.gz

# Hapus backup yang lebih dari 30 hari
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
```

Ganti password sesuai database. Simpan, lalu beri izin eksekusi:

```bash
chmod +x /home/secureprofit/backup-db.sh
```

Tes:

```bash
/home/secureprofit/backup-db.sh
ls -lh /home/secureprofit/backups/
```

Harus muncul file `.sql.gz`.

### C. Jadwalkan otomatis tiap hari jam 2 pagi

```bash
crontab -e
```

(Pilih `nano` kalau ditanya editor.) Tambahkan baris di bawah:

```
0 2 * * * /home/secureprofit/backup-db.sh
```

Simpan dan keluar. Selesai — backup akan jalan otomatis tiap dini hari.

**Saran tambahan:** Salin file backup ke storage lain (Google Drive, hard disk eksternal, NAS) secara berkala. Backup di server yang sama dengan database tidak menyelamatkan kalau servernya hancur.

---

## 11. Cara Update Aplikasi di Kemudian Hari

Kalau ada perubahan kode (fitur baru, bug fix), prosesnya:

```bash
cd ~/secureprofit
git pull                                              # ambil kode terbaru
pnpm install                                          # update paket kalau ada
pnpm --filter @workspace/db run migrate:deploy        # update skema DB kalau ada
pnpm --filter @workspace/api-server run build         # build ulang API
pnpm --filter @workspace/web run build                # build ulang web
pm2 restart secureprofit-api                          # restart backend
```

Frontend tidak perlu restart Nginx — file langsung tergantikan.

---

## 12. Troubleshooting

### Halaman tidak terbuka di browser

```bash
sudo systemctl status nginx          # apakah Nginx hidup?
pm2 status                           # apakah API hidup?
sudo tail -50 /var/log/nginx/error.log
pm2 logs secureprofit-api --lines 50 # log API
```

### "502 Bad Gateway" di browser

Berarti Nginx hidup tapi tidak bisa konek ke API. Cek:

```bash
pm2 status                           # API harus "online"
curl http://localhost:8080/api/healthz   # harus jawab "ok"
```

Kalau API mati, hidupkan: `pm2 restart secureprofit-api`. Lihat error: `pm2 logs secureprofit-api`.

### "Cannot connect to database"

Cek `DATABASE_URL` di `artifacts/api-server/.env` — pastikan password sama dengan yang Anda set di langkah 4.B. Tes manual:

```bash
psql -U secureprofit_user -d secureprofit_db -h localhost
```

### Aplikasi lambat / RAM penuh

```bash
free -h         # cek RAM
df -h           # cek disk space
pm2 monit       # monitor real-time
```

Kalau RAM sering penuh, upgrade server jadi 8 GB atau pasang swap file:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Restore database dari backup

```bash
gunzip -c /home/secureprofit/backups/secureprofit_20260101_020000.sql.gz | psql -U secureprofit_user -d secureprofit_db -h localhost
```

(Ganti nama file dengan backup yang Anda mau restore.)

---

## Ringkasan Akhir

Setelah semua langkah di atas, Anda punya:

- Aplikasi SecureProfit Hub jalan di server lokal Anda
- Database PostgreSQL dengan backup harian otomatis
- Nginx sebagai pintu masuk web (port 80/443)
- PM2 menjaga API agar auto-restart kalau crash atau server reboot
- (Opsional) HTTPS via Let's Encrypt

**Akun demo** (langsung ganti / hapus setelah login pertama):

| Email | Role | Password |
|---|---|---|
| management@secureprofit.id | Management | password123 |
| pm@secureprofit.id | Project Manager | password123 |
| sales@secureprofit.id | Sales | password123 |
| konsultan@secureprofit.id | Konsultan | password123 |
| writer@secureprofit.id | Technical Writer | password123 |
| admin@secureprofit.id | Admin Project | password123 |
| siteadmin@secureprofit.id | Site Admin | password123 |

Kalau buntu di langkah tertentu, catat **pesan error persis** dan cari bantuan — biasanya error message-nya sudah cukup jelas untuk diselesaikan.

Selamat deploy!
