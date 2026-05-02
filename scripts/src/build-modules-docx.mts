import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";
// @ts-expect-error - no types
import HTMLtoDOCX from "html-to-docx";

const docsDir = join(process.cwd(), "docs", "modules");
const outPath = join(process.cwd(), "docs", "SecureProfitHub-Modules.docx");

const order = [
  "README.md",
  "01-dashboard.md",
  "02-projects-clients.md",
  "03-resources-capacity.md",
  "04-profitability-finance.md",
  "05-timesheets-approvals.md",
  "06-business-intelligence-csat.md",
  "07-governance-rbac.md",
];

const files = readdirSync(docsDir);
for (const f of order) {
  if (!files.includes(f)) throw new Error(`Missing ${f}`);
}

const parts: string[] = [];
for (let i = 0; i < order.length; i++) {
  const md = readFileSync(join(docsDir, order[i]), "utf8");
  parts.push(md.trim());
  if (i < order.length - 1) parts.push("\n\n---\n\n");
}
const combined = parts.join("\n\n");

const html = await marked.parse(combined, { gfm: true });

const wrapped = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SecureProfit Hub — Technical Documentation</title>
<style>
body { font-family: 'Calibri', 'Helvetica', sans-serif; font-size: 11pt; line-height: 1.45; color: #1f2937; }
h1 { font-size: 22pt; color: #0F172A; border-bottom: 2px solid #22C55E; padding-bottom: 6px; margin-top: 24pt; }
h2 { font-size: 16pt; color: #0F172A; margin-top: 18pt; }
h3 { font-size: 13pt; color: #0F172A; margin-top: 14pt; }
h4 { font-size: 11.5pt; color: #334155; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; vertical-align: top; font-size: 10.5pt; }
th { background: #0F172A; color: #F1F5F9; }
code { font-family: 'Consolas', 'Courier New', monospace; background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: 10pt; }
pre { background: #0F172A; color: #F1F5F9; padding: 10px 14px; border-radius: 4px; font-family: 'Consolas', monospace; font-size: 10pt; white-space: pre-wrap; }
pre code { background: transparent; color: inherit; padding: 0; }
hr { border: none; border-top: 1px solid #94A3B8; margin: 24pt 0; }
ul, ol { margin: 6pt 0 6pt 18pt; }
li { margin: 2pt 0; }
a { color: #16a34a; text-decoration: none; }
blockquote { border-left: 3px solid #22C55E; padding-left: 12px; color: #475569; }
</style></head><body>
${html}
</body></html>`;

const buffer = await HTMLtoDOCX(wrapped, undefined, {
  table: { row: { cantSplit: true } },
  footer: true,
  pageNumber: true,
  margins: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
  title: "SecureProfit Hub — Technical Documentation",
});

writeFileSync(outPath, buffer);
console.log(`Wrote ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
