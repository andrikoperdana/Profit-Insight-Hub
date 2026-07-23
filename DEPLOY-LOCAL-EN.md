# SecureProfit Hub — Local Server Deployment Guide

This guide walks you through installing SecureProfit Hub on your own (on-premise) server. It assumes a fresh **Ubuntu Server 22.04 LTS** machine. Other distributions work too — replace `apt` with your package manager.

Estimated time: **1–2 hours**.

---

## Table of Contents

1. [What You Need](#1-what-you-need)
2. [Server Preparation](#2-server-preparation)
3. [Install Required Software](#3-install-required-software)
4. [Set Up PostgreSQL](#4-set-up-postgresql)
5. [Deploy the Source Code](#5-deploy-the-source-code)
6. [Configure the Application](#6-configure-the-application)
7. [Restore the Database](#7-restore-the-database)
8. [Build and Run](#8-build-and-run)
9. [Set Up Nginx (Web Entry Point)](#9-set-up-nginx-web-entry-point)
10. [Enable HTTPS (Recommended)](#10-enable-https-recommended)
11. [Third-Party Integrations](#11-third-party-integrations)
12. [Automatic Database Backups](#12-automatic-database-backups)
13. [Updating the Application Later](#13-updating-the-application-later)
14. [Troubleshooting](#14-troubleshooting)
15. [Environment Variable Reference](#15-environment-variable-reference)

---

## 1. What You Need

### Hardware (minimum for 50–100 active users)

- **CPU**: 2 cores
- **RAM**: 4 GB (8 GB recommended)
- **Storage**: 40 GB SSD
- **Network**: stable connection (required if accessed from outside the office)

### Software (installed in this guide)

- Ubuntu Server 22.04 LTS
- Node.js 20
- pnpm 9+
- PostgreSQL 15 or 16
- Nginx (reverse proxy / static file server)
- PM2 (process manager, auto-restart on crash/reboot)

### Files provided with this handover

- `secureprofit-hub-source-2026-07-23.tar.gz` — full source code (no `node_modules`; those are installed by `pnpm install`)
- `secureprofit-hub-db-2026-07-23.sql.gz` — full production database dump (schema + data, taken July 23, 2026)

---

## 2. Server Preparation

### A. Log in and update the system

```bash
ssh root@YOUR-SERVER-IP
apt update && apt upgrade -y
```

### B. Create a dedicated application user (do not run as root)

```bash
adduser secureprofit
usermod -aG sudo secureprofit
su - secureprofit
```

Run every command from here on as the `secureprofit` user (use `sudo` where shown).

---

## 3. Install Required Software

### A. Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # should print v20.x.x
```

### B. pnpm

```bash
sudo npm install -g pnpm
pnpm --version    # 9.x or newer
```

### C. PostgreSQL 16

> **Version matters.** Ubuntu 22.04's default `postgresql` package is version 14, but the database dump was taken from PostgreSQL 16 and may not restore cleanly into 14. Install PostgreSQL 16 from the official PostgreSQL repository:

```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt install -y postgresql-16
sudo systemctl enable --now postgresql
psql --version    # should print 16.x
```

### D. Nginx and PM2

```bash
sudo apt install -y nginx
sudo systemctl enable --now nginx
sudo npm install -g pm2
```

---

## 4. Set Up PostgreSQL

```bash
sudo -u postgres psql
```

At the `postgres=#` prompt, run these one at a time. **Replace `CHANGE_ME_STRONG_PASSWORD`** with a strong password (16+ characters) and save it — you will need it in step 6.

```sql
CREATE USER secureprofit_user WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE secureprofit_db OWNER secureprofit_user;
GRANT ALL PRIVILEGES ON DATABASE secureprofit_db TO secureprofit_user;
\q
```

Test the connection:

```bash
psql -U secureprofit_user -d secureprofit_db -h localhost
# enter the password, then \q to quit
```

---

## 5. Deploy the Source Code

Upload `secureprofit-hub-source-2026-07-23.tar.gz` to the server (WinSCP on Windows, Cyberduck on Mac, or `scp`):

```bash
scp secureprofit-hub-source-2026-07-23.tar.gz secureprofit@YOUR-SERVER-IP:/home/secureprofit/
```

Extract and install dependencies:

```bash
cd ~
mkdir -p secureprofit
tar -xzf secureprofit-hub-source-2026-07-23.tar.gz -C secureprofit
cd secureprofit
ls               # should show: artifacts, lib, scripts, docs, package.json ...
pnpm install     # takes 3–10 minutes
```

---

## 6. Configure the Application

The API server reads its configuration from environment variables. Create the file:

```bash
nano artifacts/api-server/.env
```

Minimum required configuration:

```env
# --- Required ---
DATABASE_URL=postgresql://secureprofit_user:CHANGE_ME_STRONG_PASSWORD@localhost:5432/secureprofit_db
SESSION_SECRET=CHANGE_ME_RANDOM_64_HEX_CHARS
PORT=8080
NODE_ENV=production

# --- Required for the server to boot (Executive Copilot AI) ---
# With a real OpenAI API key the AI briefing feature works:
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
AI_INTEGRATIONS_OPENAI_API_KEY=sk-your-openai-key
# If you do NOT want the AI feature, still set both variables (any placeholder
# text works, e.g. "disabled"). The server boots normally; only the
# "Generate briefing" button on /executive-copilot will return an error.

# --- Recommended ---
APP_BASE_URL=http://YOUR-SERVER-IP        # used in email links; set to your domain once you have one
```

Generate a strong `SESSION_SECRET` with:

```bash
openssl rand -hex 32
```

> **Important:** `SESSION_SECRET` signs all login tokens (JWT). If it is missing the server refuses to start. If you change it later, all users are logged out.
>
> **Note on the AI model:** the Executive Copilot calls OpenAI model `gpt-5.4`. On your own OpenAI account, make sure that model is available, or change the `MODEL` constant in `artifacts/api-server/src/routes/executive-copilot.ts` to a model you have access to.

All optional variables (email, Xero, Pipedrive, invoice branding, etc.) are listed in [section 15](#15-environment-variable-reference).

### PM2 and .env

PM2 does not read `.env` files automatically. The simplest approach is to export the variables when starting (step 8) using `dotenv`-style loading via a small ecosystem file, which we create below.

---

## 7. Restore the Database

Upload `secureprofit-hub-db-2026-07-23.sql.gz` to the server, then:

```bash
gunzip -c secureprofit-hub-db-2026-07-23.sql.gz | psql -U secureprofit_user -d secureprofit_db -h localhost
```

This restores the **complete production database** — all tables, all data (users, projects, timesheets, leads, settings), and Prisma's migration history. You do **not** need to run migrations or seeds after restoring.

> **Documents are included.** All uploaded documents (BAST, invoices, contracts, reports) are stored inside the database itself, so they come along with this restore — no separate file migration is needed.
>
> The dump may also create a small extra schema named `_system` (an artifact of the cloud database provider). It is harmless and can be ignored or dropped.

> **Fresh install alternative (empty database, demo accounts only):** skip the restore and instead run:
>
> ```bash
> cd ~/secureprofit
> DATABASE_URL=postgresql://... pnpm --filter @workspace/db run migrate:deploy
> DATABASE_URL=postgresql://... pnpm --filter @workspace/db run seed
> ```

> **Passwords carry over.** User passwords are bcrypt hashes stored in the database, so everyone's existing password from the cloud version keeps working locally.

---

## 8. Build and Run

### A. Build

```bash
cd ~/secureprofit

# Generate the Prisma client
pnpm --filter @workspace/db run generate

# Build the API server
pnpm --filter @workspace/api-server run build

# Build the web frontend (served from the site root)
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/web run build
```

> The web build **requires** both `BASE_PATH` and `PORT` to be set or it exits with an error. `BASE_PATH=/` is correct for a standard install at the root of the domain. `PORT` is only used by the dev server config and does not affect the built files — any valid number works.

### B. Run the API server with PM2

Create a PM2 ecosystem file so environment variables load from `.env`:

```bash
nano ~/secureprofit/ecosystem.config.cjs
```

```js
require("dotenv").config({ path: __dirname + "/artifacts/api-server/.env" });

module.exports = {
  apps: [
    {
      name: "secureprofit-api",
      script: "./artifacts/api-server/dist/index.mjs",
      cwd: __dirname,
      env: process.env,
    },
  ],
};
```

Install dotenv at the workspace root (used only by this file), then start:

```bash
pnpm add -w dotenv
pm2 start ecosystem.config.cjs
pm2 status                     # secureprofit-api should be "online"
curl http://localhost:8080/api/healthz    # should answer ok
```

> **Uploads folder.** The API creates an `uploads/` folder in its working directory (with this setup: `/home/secureprofit/secureprofit/uploads`). Documents are currently stored inside the database, so this folder usually stays empty, but keep it in mind if it ever contains files — the backup script in step 12 covers it.

### C. Auto-start on reboot

```bash
pm2 save
pm2 startup
# pm2 prints one command starting with "sudo env ..." — copy and run it
```

---

## 9. Set Up Nginx (Web Entry Point)

Nginx serves the built frontend files and forwards `/api/*` to the API server.

```bash
sudo nano /etc/nginx/sites-available/secureprofit
```

```nginx
server {
    listen 80;
    server_name _;   # replace with your domain when you have one

    # Frontend (static build output)
    root /home/secureprofit/secureprofit/artifacts/web/dist/public;
    index index.html;

    # Upload size limit (BAST/Invoice documents)
    client_max_body_size 25M;

    # Forward /api to the backend
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Single Page App: any route -> index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

> If the build output folder differs, check where `pnpm --filter @workspace/web run build` wrote its files (look for `dist/` under `artifacts/web/`) and adjust `root` accordingly.

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/secureprofit /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Firewall (if enabled):

```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

**Test:** open `http://YOUR-SERVER-IP` in a browser. The SecureProfit Hub login page should appear. Log in with your existing account (restored database) — same email and password as before.

---

## 10. Enable HTTPS (Recommended)

Required if the app is reachable from the internet. You need a domain with an A record pointing to the server IP.

```bash
sudo apt install -y certbot python3-certbot-nginx
# first set server_name in the nginx config to your domain, then:
sudo certbot --nginx -d app.yourcompany.co.id
```

Certificates auto-renew. After enabling HTTPS, update `APP_BASE_URL` in `.env` to `https://app.yourcompany.co.id` and restart: `pm2 restart secureprofit-api`.

---

## 11. Third-Party Integrations

All integrations are **optional**. The app runs fine without them; the corresponding features simply stay inactive.

### Email notifications (Resend)

- Set `RESEND_API_KEY` in `.env` (get one at resend.com; sending domain must be verified there).
- In the app: Settings → Email Notifications → enable the toggle (Management only). Default is **off**.
- Optional levers: `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_LOGO_URL`, `EMAIL_SEND_ALLOWLIST`, `EMAIL_SEND_BLOCKLIST_DOMAINS`.

### Xero accounting

1. In the [Xero developer portal](https://developer.xero.com), open your existing app (or create a new **Web app** / Auth Code type — NOT a Custom Connection).
2. Add your new redirect URI: `https://app.yourcompany.co.id/api/xero/callback` (must be HTTPS; Xero rejects plain HTTP for non-localhost).
3. Set `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` in `.env`, restart the API, then click **Connect to Xero** in Settings.
4. Because the domain changed, you must **reconnect** (the old OAuth grant stays valid, but the redirect back only works on a registered URI).
5. Optional: `XERO_REDIRECT_URI` (override auto-detection), `XERO_SALES_ACCOUNT_CODE`, `XERO_SALES_TAX_TYPE`.

### Pipedrive CRM (lead import)

- Set `PIPEDRIVE_API_TOKEN` and `PIPEDRIVE_API_DOMAIN` (e.g. `https://yourcompany.pipedrive.com`) in `.env`.
- Works exactly as before — one-way import of open deals, manual "Sync now" plus a 15-minute background poll.
- If you use the Pipedrive webhook for instant updates, update its target URL in Pipedrive to `https://app.yourcompany.co.id/api/pipedrive/webhook`.
- Optional: `PIPEDRIVE_REGION_FIELD_KEY` if the Region custom field is ever re-created in Pipedrive.

### Executive Copilot (AI briefing)

- Needs `AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1` and a real `AI_INTEGRATIONS_OPENAI_API_KEY`.
- Any OpenAI-compatible gateway also works (set the base URL accordingly).

---

## 12. Automatic Database Backups

**Do not skip this.** Without backups, a disk failure loses everything.

```bash
mkdir -p /home/secureprofit/backups
nano /home/secureprofit/backup-db.sh
```

```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/home/secureprofit/backups
PGPASSWORD='CHANGE_ME_STRONG_PASSWORD' pg_dump -U secureprofit_user -h localhost secureprofit_db | gzip > $BACKUP_DIR/secureprofit_$TIMESTAMP.sql.gz
# also back up the uploads folder if it has any files
tar -czf $BACKUP_DIR/uploads_$TIMESTAMP.tar.gz -C /home/secureprofit/secureprofit uploads 2>/dev/null
# delete backups older than 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
find $BACKUP_DIR -name "uploads_*.tar.gz" -mtime +30 -delete
```

```bash
chmod +x /home/secureprofit/backup-db.sh
/home/secureprofit/backup-db.sh            # test run
ls -lh /home/secureprofit/backups/         # a .sql.gz file should appear
crontab -e                                 # add the line below (daily 2 AM)
```

```
0 2 * * * /home/secureprofit/backup-db.sh
```

**Also copy backups off the server** (NAS, external disk, cloud storage) regularly — a backup on the same machine does not survive a dead machine.

Restore procedure:

```bash
gunzip -c /home/secureprofit/backups/secureprofit_YYYYMMDD_HHMMSS.sql.gz | psql -U secureprofit_user -d secureprofit_db -h localhost
```

---

## 13. Updating the Application Later

When you receive new source code:

```bash
cd ~/secureprofit
# extract the new tarball over the old code (or use git pull if you set up a repo)
pnpm install                                          # update packages
pnpm --filter @workspace/db run generate              # regenerate Prisma client
pnpm --filter @workspace/db run migrate:deploy        # apply DB schema changes
pnpm --filter @workspace/api-server run build
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/web run build
pm2 restart secureprofit-api
```

The frontend needs no restart — Nginx serves the newly built files immediately.

> **Tip:** put the code in a private Git repository (GitHub/GitLab) so updates become a one-line `git pull` and you have version history.

---

## 14. Troubleshooting

### Page does not load

```bash
sudo systemctl status nginx
pm2 status
sudo tail -50 /var/log/nginx/error.log
pm2 logs secureprofit-api --lines 50
```

### 502 Bad Gateway

Nginx is up but cannot reach the API:

```bash
pm2 status                                # must be "online"
curl http://localhost:8080/api/healthz    # must answer ok
pm2 logs secureprofit-api
```

### API crashes on startup

Check `pm2 logs secureprofit-api`. The most common causes:

- `SESSION_SECRET must be set` → missing in `.env`
- `PORT environment variable is required` → missing in `.env`
- `AI_INTEGRATIONS_OPENAI_BASE_URL must be set` → set both AI variables (see step 6), placeholders are fine
- `Can't reach database server` → wrong `DATABASE_URL` or PostgreSQL not running

### Cannot connect to the database

```bash
psql -U secureprofit_user -d secureprofit_db -h localhost
```

If this fails, re-check the password in `DATABASE_URL` against step 4.

### Slow / out of memory

```bash
free -h; df -h; pm2 monit
```

Add a swap file if RAM is tight:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 15. Environment Variable Reference

### Required (server refuses to start without these)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Signs login tokens (JWT) and OAuth state. 32+ random bytes. |
| `PORT` | API server port (this guide uses `8080`) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | OpenAI-compatible endpoint. `https://api.openai.com/v1`, or a placeholder to disable AI |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | OpenAI API key, or a placeholder to disable AI |

### Recommended

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Set to `production` |
| `APP_BASE_URL` | Public URL of the app; used in email links (default points to the old cloud domain) |

### Optional — integrations

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Enables outbound email notifications (Resend) |
| `EMAIL_FROM` / `EMAIL_REPLY_TO` / `EMAIL_LOGO_URL` | Email sender identity and branding |
| `EMAIL_SEND_ALLOWLIST` | Comma-separated addresses; when set, emails go only to these (useful for staged rollout) |
| `EMAIL_SEND_BLOCKLIST_DOMAINS` | Never email these domains |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | Xero OAuth app credentials |
| `XERO_REDIRECT_URI` | Override the auto-detected OAuth callback URL |
| `XERO_SALES_ACCOUNT_CODE` / `XERO_SALES_TAX_TYPE` | Override discovered Xero revenue account / tax type |
| `PIPEDRIVE_API_TOKEN` / `PIPEDRIVE_API_DOMAIN` | Pipedrive lead import |
| `PIPEDRIVE_REGION_FIELD_KEY` | Override the Region custom-field key |

### Optional — behavior and branding

| Variable | Purpose |
|---|---|
| `SITE_GATE_USER` / `SITE_GATE_PASS` | Extra front-door login gate before the app loads (leave unset on a private network) |
| `OVERHEAD_MULTIPLIER` | Cost overhead multiplier used in financial calculations |
| `INVOICE_COMPANY_NAME` / `INVOICE_BRAND` / `INVOICE_COMPANY_ADDRESS` / `INVOICE_COMPANY_NPWP` / `INVOICE_COMPANY_EMAIL` / `INVOICE_COMPANY_PHONE` / `INVOICE_CITY` / `INVOICE_BANK_NAME` / `INVOICE_BANK_ACCOUNT_NAME` / `INVOICE_BANK_ACCOUNT_NUMBER` | Company details printed on generated invoice PDFs |
| `LOG_LEVEL` | Pino log level (default `info`) |
| `DB_USE_PGBOUNCER` | Only needed for pooled cloud databases (leave unset locally) |
| `SEED_ON_BOOT` | **Never set this on a production-restored database.** When `true`, the server injects demo/sample data on startup |

### Build-time (web frontend)

| Variable | Purpose |
|---|---|
| `BASE_PATH` | URL base path of the frontend build. Use `/` for a standard install |

---

## Final Notes

- **The restored database contains real production data** — treat the server and backups accordingly (disk encryption, restricted access).
- The mobile (Expo) app in `artifacts/mobile` is not covered here; it requires an Expo build pipeline and pointing its API URL at your new domain.
- Seed/demo accounts (if you used the fresh-install path) all share password `password123` — change or delete them immediately after first login.

Good luck with the deployment!
