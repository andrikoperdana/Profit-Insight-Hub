// Render the BOD diagram SVGs to high-resolution PNGs via headless Chromium.
// Usage: node scripts/src/bod-render-svg.mjs

import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve("docs/bod-assets/diagrams");
const executablePath = execSync("which chromium").toString().trim();

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-color-profile=srgb", "--hide-scrollbars"],
});

for (const f of readdirSync(DIR).filter((f) => f.endsWith(".svg"))) {
  const svgPath = path.join(DIR, f);
  const m = /width="(\d+)" height="(\d+)"/.exec(
    (await import("node:fs")).readFileSync(svgPath, "utf8"),
  );
  const [w, h] = m ? [Number(m[1]), Number(m[2])] : [1600, 900];
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  await page.goto(`file://${svgPath}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: svgPath.replace(/\.svg$/, ".png") });
  console.log(`rendered: ${f} (${w}x${h})`);
  await page.close();
}
await browser.close();
console.log("done");
