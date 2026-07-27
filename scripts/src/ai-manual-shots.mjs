// Screenshot generator for the AI Features manual (docs/ai-manual-assets/).
// Reuses the bod-screenshots pattern: real seed logins, headless Chromium.
//
// Usage: node scripts/src/ai-manual-shots.mjs <basic|chat|draft>
//   basic -> ai-assistant-button.png, ai-alerts.png, ai-report-draft-dialog.png
//   chat  -> ai-assistant-chat.png       (calls the AI, slow)
//   draft -> ai-report-draft-result.png  (calls the AI, slow)

import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = "http://localhost:80";
const OUT = path.resolve("docs/ai-manual-assets");
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "management@itsecasia.com", password: "password123" }),
  });
  if (!res.ok) throw new Error(`login failed ${res.status}`);
  const j = await res.json();
  return { token: j.token, user: j.user };
}

async function pickProject(token) {
  const res = await fetch(`${BASE}/api/projects`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  const projects = Array.isArray(body) ? body : body.projects || body.items || [];
  const active = projects.filter((p) => p.status === "ACTIVE" && p.kind !== "INTERNAL");
  active.sort((a, b) => (b.contractValue || 0) - (a.contractValue || 0));
  if (!active[0]) throw new Error("no ACTIVE project");
  return active[0];
}

const auth = await login();
const proj = await pickProject(auth.token);
console.log(`project: ${proj.code || proj.id} — ${proj.name}`);

const executablePath = execSync("which chromium").toString().trim();
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb", "--hide-scrollbars"],
});

async function newPage() {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument((t, u) => {
    localStorage.setItem("auth_token", t);
    localStorage.setItem("auth_user", u);
  }, auth.token, JSON.stringify(auth.user));
  return page;
}

async function shot(page, name, opts = {}) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: opts.fullPage ?? false });
  console.log(`shot: ${name}`);
}

const mode = process.argv[2] || "basic";

if (mode === "basic") {
  // 1) Dashboard with the sparkles button visible in the header.
  let page = await newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 45_000 }).catch(() => {});
  await sleep(4000);
  await shot(page, "ai-assistant-button");
  await page.close();

  // 2) Smart Alerts page with the weekly digest card (MGMT).
  page = await newPage();
  await page.goto(`${BASE}/alerts`, { waitUntil: "networkidle2", timeout: 45_000 }).catch(() => {});
  await sleep(3500);
  await shot(page, "ai-alerts", { fullPage: true });
  await page.close();

  // 3) Report tab with the "Draft with AI" dialog opened (form state).
  page = await newPage();
  await page.goto(`${BASE}/projects/${proj.id}?tab=report`, { waitUntil: "networkidle2", timeout: 45_000 }).catch(() => {});
  await sleep(3500);
  await page.click('[data-testid="button-ai-draft"]');
  await sleep(1500);
  await shot(page, "ai-report-draft-dialog");
  await page.close();
}

if (mode === "chat") {
  const page = await newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 45_000 }).catch(() => {});
  await sleep(3500);
  await page.click('[data-testid="button-ai-assistant"]');
  await sleep(1200);
  await page.type('[data-testid="input-ai-chat"]', "Berapa total tagihan yang sudah lewat jatuh tempo?");
  await page.click('[data-testid="button-ai-send"]');
  await page.waitForSelector('[data-testid^="chat-msg-assistant"]', { timeout: 150_000 });
  await sleep(1500);
  await shot(page, "ai-assistant-chat");
  await page.close();
}

if (mode === "draft") {
  const page = await newPage();
  await page.goto(`${BASE}/projects/${proj.id}?tab=report`, { waitUntil: "networkidle2", timeout: 45_000 }).catch(() => {});
  await sleep(3500);
  await page.click('[data-testid="button-ai-draft"]');
  await sleep(1200);
  await page.click('[data-testid="button-draft-generate"]');
  await page.waitForSelector('[data-testid="draft-result"]', { timeout: 180_000 });
  await sleep(1000);
  await shot(page, "ai-report-draft-result");
  await page.close();
}

await browser.close();
console.log("done");
