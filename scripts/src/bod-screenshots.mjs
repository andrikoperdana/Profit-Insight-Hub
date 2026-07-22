// One-off asset generator for the BOD documentation.
// Logs into the dev app with real seed accounts, then drives headless Chromium
// to capture English-UI screenshots with demo data.
//
// Usage:
//   node scripts/src/bod-screenshots.mjs setup            # logins, pick project, portal link -> /tmp/bod-state.json
//   node scripts/src/bod-screenshots.mjs copilot          # generate executive copilot briefing (AI, slow)
//   node scripts/src/bod-screenshots.mjs shots <from> <to># capture shots[from..to) (indices)
//   node scripts/src/bod-screenshots.mjs list             # list shot names/indices

import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = "http://localhost:80";
const OUT = path.resolve("docs/bod-assets/screens");
const STATE = "/tmp/bod-state.json";
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(emailLocal) {
  for (const d of ["itsecasia.com", "secureprofit.id"]) {
    const email = `${emailLocal}@${d}`;
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    });
    if (res.ok) {
      const j = await res.json();
      console.log(`login ok: ${email} (${j.user?.role})`);
      return { token: j.token, user: j.user };
    }
  }
  throw new Error(`login failed for ${emailLocal}`);
}

async function api(token, method, p, body) {
  const res = await fetch(`${BASE}/api${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const cmd = process.argv[2] || "list";

if (cmd === "setup") {
  const mgmt = await login("management");
  const pm = await login("pm");
  const kon = await login("konsultan");

  const projRes = await api(mgmt.token, "GET", "/projects");
  const projects = Array.isArray(projRes) ? projRes : projRes.projects || projRes.items || [];
  const active = projects.filter((p) => p.status === "ACTIVE");
  if (active.length === 0) throw new Error("no ACTIVE projects in demo data");
  active.sort((a, b) => (b.contractValue || 0) - (a.contractValue || 0));
  const proj = active[0];
  console.log(`project: ${proj.code || proj.id} — ${proj.name} (ACTIVE)`);

  const share = await api(mgmt.token, "PUT", `/projects/${proj.id}/client-share`, { enabled: true });
  console.log(`portal token: ${share.token ? "ok" : "MISSING"}`);

  writeFileSync(
    STATE,
    JSON.stringify({ mgmt, pm, kon, pid: proj.id, pname: proj.name, portal: share.token }, null, 2),
  );
  console.log(`state -> ${STATE}`);
  process.exit(0);
}

const st = JSON.parse(readFileSync(STATE, "utf8"));

if (cmd === "copilot") {
  try {
    await api(st.mgmt.token, "POST", "/executive-copilot/briefing/generate");
    console.log("copilot briefing generated");
  } catch (e) {
    console.log("copilot generate failed:", String(e).slice(0, 300));
  }
  process.exit(0);
}

const SHOTS = [
  ["dashboard", "/", { wait: 4000 }],
  ["leads", "/leads", {}],
  ["projects-list", "/projects", {}],
  ["project-overview", `/projects/${st.pid}`, { wait: 3500, fullPage: true }],
  ["project-timeline", `/projects/${st.pid}?tab=timeline`, { wait: 3500 }],
  ["project-tasks", `/projects/${st.pid}?tab=tasks`, { wait: 3000 }],
  ["project-resources", `/projects/${st.pid}?tab=resources`, {}],
  ["project-raid", `/projects/${st.pid}?tab=raid`, {}],
  ["project-financials", `/projects/${st.pid}?tab=financials`, { wait: 3500, fullPage: true }],
  ["project-billing", `/projects/${st.pid}?tab=billing`, { wait: 3000, fullPage: true }],
  ["project-timesheets", `/projects/${st.pid}?tab=timesheets`, {}],
  ["project-documents", `/projects/${st.pid}?tab=documents`, {}],
  ["project-survey", `/projects/${st.pid}?tab=survey`, {}],
  ["project-closing", `/projects/${st.pid}?tab=closing`, {}],
  ["invoice-planning", "/invoice-planning", { wait: 3000 }],
  ["vat-recap", "/vat-recap", {}],
  ["executive-copilot", "/executive-copilot", { wait: 4000, fullPage: true }],
  ["portfolio-monitor", "/portfolio-monitor", { wait: 3500 }],
  ["reports", "/reports", {}],
  ["work-hours", "/work-hours", { wait: 3000 }],
  ["client-portal", st.portal ? `/portal/${st.portal}` : null, { token: null, wait: 3000, fullPage: true }],
  ["my-timesheets", "/my-timesheets", { token: "kon", wait: 3000 }],
  ["approvals", "/approvals", { token: "pm", wait: 3000 }],
];

if (cmd === "list") {
  SHOTS.forEach(([n], i) => console.log(i, n));
  process.exit(0);
}

if (cmd === "shots") {
  const from = Number(process.argv[3] ?? 0);
  const to = Number(process.argv[4] ?? SHOTS.length);

  const executablePath = execSync("which chromium").toString().trim();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb", "--hide-scrollbars"],
  });

  for (const [name, urlPath, opts] of SHOTS.slice(from, to)) {
    if (!urlPath) {
      console.log(`skip (no url): ${name}`);
      continue;
    }
    const tokenKey = opts.token === undefined ? "mgmt" : opts.token;
    const auth = tokenKey === null ? null : st[tokenKey];
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
      if (auth) {
        await page.evaluateOnNewDocument((t, u) => {
          localStorage.setItem("auth_token", t);
          localStorage.setItem("auth_user", u);
        }, auth.token, JSON.stringify(auth.user));
      }
      await page.goto(`${BASE}${urlPath}`, { waitUntil: "networkidle2", timeout: 45_000 }).catch(() => {});
      await sleep(opts.wait ?? 2500);
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: opts.fullPage ?? false });
      console.log(`shot: ${name}`);
    } catch (e) {
      console.error(`FAILED: ${name}: ${String(e).slice(0, 200)}`);
    } finally {
      await page.close();
    }
  }
  await browser.close();
  console.log("batch done");
}
