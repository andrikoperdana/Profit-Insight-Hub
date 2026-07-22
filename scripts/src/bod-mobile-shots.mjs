// Captures phone-viewport screenshots of the Expo mobile app (web build)
// for the BOD supplement document.
//
// Usage: node scripts/src/bod-mobile-shots.mjs [from] [to]

import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const EXPO = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`;
const API = "http://localhost:80";
const OUT = path.resolve("docs/bod-assets/screens");
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(emailLocal) {
  for (const d of ["itsecasia.com", "secureprofit.id"]) {
    const email = `${emailLocal}@${d}`;
    const res = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123" }),
    });
    if (res.ok) {
      const j = await res.json();
      console.log(`login ok: ${email} (${j.user?.role})`);
      return j;
    }
  }
  throw new Error(`login failed for ${emailLocal}`);
}

const kon = await login("konsultan");

const SHOTS = [
  ["mobile-track", "/", kon, 6000],
  ["mobile-timesheets", "/timesheets", kon, 5000],
  ["mobile-expenses", "/expenses", kon, 5000],
];

const from = Number(process.argv[2] ?? 0);
const to = Number(process.argv[3] ?? SHOTS.length);

const executablePath = execSync("which chromium").toString().trim();
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb", "--hide-scrollbars"],
});

for (const [name, urlPath, auth, wait] of SHOTS.slice(from, to)) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument(
      (t, u) => {
        localStorage.setItem("auth_token", t);
        localStorage.setItem("auth_user", u);
      },
      auth.token,
      JSON.stringify(auth.user),
    );
    await page.goto(`${EXPO}${urlPath}`, { waitUntil: "networkidle2", timeout: 90_000 }).catch(() => {});
    await sleep(wait);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log(`shot: ${name}`);
  } catch (e) {
    console.error(`FAILED: ${name}: ${String(e).slice(0, 200)}`);
  } finally {
    await page.close();
  }
}
await browser.close();
console.log("done");
