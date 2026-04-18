import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

const COLORS = {
  bg: "#0f172a",
  primary: "#22c55e",
  accent: "#3b82f6",
  text: "#1f2937",
  muted: "#64748b",
  rule: "#cbd5e1",
  codeBg: "#f1f5f9",
  tableHead: "#0f172a",
  tableHeadText: "#e2e8f0",
  tableRowAlt: "#f8fafc",
  tableBorder: "#e2e8f0",
};

const FONTS = {
  body: "Helvetica",
  bold: "Helvetica-Bold",
  oblique: "Helvetica-Oblique",
  mono: "Courier",
  monoBold: "Courier-Bold",
};

function inlineRender(doc, text, options = {}) {
  // Render inline markdown (bold, italic, code, links) into the current line.
  const parts = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: "t", value: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith("**")) parts.push({ kind: "b", value: tok.slice(2, -2) });
    else if (tok.startsWith("`")) parts.push({ kind: "c", value: tok.slice(1, -1) });
    else if (tok.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      parts.push({ kind: "l", value: lm[1], link: lm[2] });
    } else parts.push({ kind: "i", value: tok.slice(1, -1) });
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push({ kind: "t", value: text.slice(last) });

  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    const isLast = i === parts.length - 1;
    const cont = !isLast;
    if (p.kind === "b") doc.font(FONTS.bold).fillColor(COLORS.text);
    else if (p.kind === "i") doc.font(FONTS.oblique).fillColor(COLORS.text);
    else if (p.kind === "c") doc.font(FONTS.mono).fillColor("#9333ea");
    else if (p.kind === "l") doc.font(FONTS.body).fillColor(COLORS.accent);
    else doc.font(FONTS.body).fillColor(COLORS.text);
    doc.text(p.value, { continued: cont, link: p.link, underline: p.kind === "l", ...options });
  }
  doc.font(FONTS.body).fillColor(COLORS.text);
}

function ensureSpace(doc, h) {
  if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function drawHeading(doc, level, text) {
  const sizes = { 1: 22, 2: 16, 3: 13, 4: 11 };
  const size = sizes[level] ?? 11;
  ensureSpace(doc, size + 18);
  if (level === 1) {
    if (doc.y > doc.page.margins.top + 5) doc.addPage();
  } else {
    doc.moveDown(level === 2 ? 0.8 : 0.5);
  }
  doc.font(FONTS.bold).fontSize(size).fillColor(level <= 2 ? COLORS.bg : COLORS.text);
  doc.text(text);
  if (level === 1) {
    const y = doc.y + 2;
    doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y)
      .lineWidth(2).strokeColor(COLORS.primary).stroke();
    doc.moveDown(0.6);
  } else if (level === 2) {
    doc.moveDown(0.3);
  } else {
    doc.moveDown(0.2);
  }
  doc.font(FONTS.body).fontSize(10).fillColor(COLORS.text);
}

function drawParagraph(doc, text) {
  doc.font(FONTS.body).fontSize(10).fillColor(COLORS.text);
  ensureSpace(doc, 14);
  inlineRender(doc, text, { align: "left", lineGap: 2 });
  doc.moveDown(0.5);
}

function drawListItem(doc, text, depth = 0) {
  doc.font(FONTS.body).fontSize(10).fillColor(COLORS.text);
  ensureSpace(doc, 14);
  const indent = doc.page.margins.left + depth * 14;
  const bulletX = indent;
  const textX = indent + 12;
  const startY = doc.y;
  doc.fillColor(COLORS.primary).text("•", bulletX, startY, { width: 10, continued: false });
  doc.fillColor(COLORS.text);
  const width = doc.page.width - doc.page.margins.right - textX;
  doc.x = textX;
  doc.y = startY;
  inlineRender(doc, text, { width, lineGap: 2 });
  doc.x = doc.page.margins.left;
  doc.moveDown(0.2);
}

function drawCode(doc, code) {
  const lines = code.split("\n");
  doc.font(FONTS.mono).fontSize(9);
  const lineH = doc.currentLineHeight() + 2;
  const padding = 8;
  const blockH = lines.length * lineH + padding * 2;
  ensureSpace(doc, blockH + 6);
  const x = doc.page.margins.left;
  const y = doc.y;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.save();
  doc.roundedRect(x, y, w, blockH, 4).fillColor(COLORS.codeBg).fill();
  doc.restore();
  doc.fillColor("#0f172a").font(FONTS.mono).fontSize(9);
  let ty = y + padding;
  for (const ln of lines) {
    doc.text(ln, x + padding, ty, { width: w - padding * 2, lineBreak: false });
    ty += lineH;
  }
  doc.x = doc.page.margins.left;
  doc.y = y + blockH + 6;
  doc.font(FONTS.body).fontSize(10).fillColor(COLORS.text);
}

function drawTable(doc, header, rows) {
  const cols = header.length;
  const left = doc.page.margins.left;
  const totalW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colW = totalW / cols;
  const padding = 5;
  doc.font(FONTS.bold).fontSize(9);

  const measureRow = (cells) => {
    let max = 0;
    for (let i = 0; i < cells.length; i += 1) {
      const h = doc.heightOfString(cells[i] ?? "", { width: colW - padding * 2 });
      if (h > max) max = h;
    }
    return max + padding * 2;
  };

  const drawRow = (cells, opts) => {
    const h = measureRow(cells);
    ensureSpace(doc, h);
    const y = doc.y;
    if (opts.head) {
      doc.save();
      doc.rect(left, y, totalW, h).fillColor(COLORS.tableHead).fill();
      doc.restore();
      doc.fillColor(COLORS.tableHeadText).font(FONTS.bold).fontSize(9);
    } else {
      if (opts.alt) {
        doc.save();
        doc.rect(left, y, totalW, h).fillColor(COLORS.tableRowAlt).fill();
        doc.restore();
      }
      doc.fillColor(COLORS.text).font(FONTS.body).fontSize(9);
    }
    for (let i = 0; i < cells.length; i += 1) {
      const cx = left + i * colW + padding;
      doc.text(cells[i] ?? "", cx, y + padding, {
        width: colW - padding * 2,
        lineBreak: true,
      });
    }
    doc.strokeColor(COLORS.tableBorder).lineWidth(0.5);
    doc.moveTo(left, y + h).lineTo(left + totalW, y + h).stroke();
    doc.x = left;
    doc.y = y + h;
  };

  drawRow(header, { head: true });
  rows.forEach((r, i) => drawRow(r, { alt: i % 2 === 1 }));
  doc.moveDown(0.6);
  doc.font(FONTS.body).fontSize(10).fillColor(COLORS.text);
}

function parseTable(lines, idx) {
  // returns { header, rows, next } or null
  const headerLine = lines[idx];
  const sepLine = lines[idx + 1];
  if (!headerLine || !sepLine) return null;
  if (!/^\s*\|.*\|\s*$/.test(headerLine)) return null;
  if (!/^\s*\|?\s*:?-{2,}/.test(sepLine.trim()) || !sepLine.includes("|")) return null;
  const split = (s) => s.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const header = split(headerLine);
  const rows = [];
  let i = idx + 2;
  while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
    rows.push(split(lines[i]));
    i += 1;
  }
  return { header, rows, next: i };
}

function renderMarkdown(doc, md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Code fence
    if (/^```/.test(line)) {
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      drawCode(doc, buf.join("\n"));
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      ensureSpace(doc, 14);
      const y = doc.y + 6;
      doc.moveTo(doc.page.margins.left, y)
        .lineTo(doc.page.width - doc.page.margins.right, y)
        .lineWidth(0.7).strokeColor(COLORS.rule).stroke();
      doc.y = y + 8;
      i += 1;
      continue;
    }

    // Headings
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      drawHeading(doc, h[1].length, h[2].trim());
      i += 1;
      continue;
    }

    // Tables
    const t = parseTable(lines, i);
    if (t) {
      drawTable(doc, t.header, t.rows);
      i = t.next;
      continue;
    }

    // List item (bulleted, with optional 2-space indent for sub-items)
    const li = /^(\s*)[*\-+]\s+(.*)$/.exec(line);
    if (li) {
      const depth = Math.floor(li[1].length / 2);
      drawListItem(doc, li[2], depth);
      i += 1;
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      doc.moveDown(0.4);
      i += 1;
      continue;
    }

    // Multi-line paragraph: gather until blank/heading/list/fence/table
    const paraLines = [line];
    let j = i + 1;
    while (j < lines.length) {
      const lj = lines[j];
      if (lj.trim() === "") break;
      if (/^(#{1,6})\s+/.test(lj)) break;
      if (/^```/.test(lj)) break;
      if (/^(\s*)[*\-+]\s+/.test(lj)) break;
      if (/^---+\s*$/.test(lj)) break;
      if (/^\s*\|.*\|\s*$/.test(lj)) break;
      paraLines.push(lj);
      j += 1;
    }
    drawParagraph(doc, paraLines.join(" "));
    i = j;
  }
}

function drawCover(doc, title, subtitle) {
  const cx = doc.page.width / 2;
  // Background band at top
  doc.save();
  doc.rect(0, 0, doc.page.width, 220).fillColor(COLORS.bg).fill();
  doc.restore();
  // Accent green bar
  doc.save();
  doc.rect(0, 220, doc.page.width, 4).fillColor(COLORS.primary).fill();
  doc.restore();

  // Shield-like badge
  doc.save();
  doc.circle(cx, 120, 38).lineWidth(2).strokeColor(COLORS.primary).stroke();
  doc.fillColor(COLORS.primary).font(FONTS.bold).fontSize(28)
    .text("SP", cx - 22, 105, { width: 44, align: "center" });
  doc.restore();

  doc.fillColor("#ffffff").font(FONTS.bold).fontSize(28)
    .text("SecureProfit Hub", 0, 180, { align: "center" });

  doc.fillColor(COLORS.text).font(FONTS.bold).fontSize(22)
    .text(title, 0, 280, { align: "center" });
  doc.font(FONTS.body).fontSize(12).fillColor(COLORS.muted)
    .text(subtitle, { align: "center" });

  doc.moveDown(2);
  doc.font(FONTS.body).fontSize(10).fillColor(COLORS.muted)
    .text(`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { align: "center" });

  doc.addPage();
}

function addFooters(doc, label) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 30;
    doc.font(FONTS.body).fontSize(8).fillColor(COLORS.muted);
    doc.text(label, doc.page.margins.left, y, { align: "left" });
    doc.text(`Page ${i + 1} of ${range.count}`, doc.page.margins.left, y, {
      align: "right",
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
    // top thin rule
    doc.moveTo(doc.page.margins.left, y - 6)
      .lineTo(doc.page.width - doc.page.margins.right, y - 6)
      .lineWidth(0.4).strokeColor(COLORS.rule).stroke();
    doc.page.margins.bottom = oldBottom;
  }
}

function buildPdf({ srcPath, outPath, title, subtitle, footer }) {
  const md = fs.readFileSync(srcPath, "utf8");
  // Strip the first H1 if present (we use the cover instead)
  const stripped = md.replace(/^#\s+.*\n+/, "");
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    bufferPages: true,
    info: { Title: title, Author: "SecureProfit Hub" },
  });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);
  drawCover(doc, title, subtitle);
  renderMarkdown(doc, stripped);
  addFooters(doc, footer);
  doc.end();
  return new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

const docsDir = path.resolve("docs");
await buildPdf({
  srcPath: path.join(docsDir, "USER_GUIDE.md"),
  outPath: path.join(docsDir, "SecureProfit-Hub-User-Guide.pdf"),
  title: "User Guide",
  subtitle: "Complete walkthrough for end users",
  footer: "SecureProfit Hub — User Guide",
});
await buildPdf({
  srcPath: path.join(docsDir, "TECHNICAL_DOCS.md"),
  outPath: path.join(docsDir, "SecureProfit-Hub-Technical-Documentation.pdf"),
  title: "Technical Documentation",
  subtitle: "Architecture, data model, API & operations",
  footer: "SecureProfit Hub — Technical Documentation",
});
console.log("Generated:");
console.log(" -", path.join(docsDir, "SecureProfit-Hub-User-Guide.pdf"));
console.log(" -", path.join(docsDir, "SecureProfit-Hub-Technical-Documentation.pdf"));
