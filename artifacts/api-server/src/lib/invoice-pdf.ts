import type { InvoiceIssuer } from "./invoice-config.js";

export interface InvoicePdfData {
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  issuer: InvoiceIssuer;
  project: { code: string; name: string };
  client: {
    name: string;
    contactPerson?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  milestone: { name: string; description?: string | null };
  vatPercent: number;
  dpp: number;
  vat: number;
  total: number;
}

function formatIdr(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function wrapText(
  text: string,
  font: { widthOfTextAtSize: (s: string, size: number) => number },
  size: number,
  maxWidth: number,
): string[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

// Indonesian number-to-words for whole rupiah (terbilang).
function terbilang(n: number): string {
  n = Math.round(Math.abs(n));
  if (n === 0) return "nol";
  const units = [
    "",
    "satu",
    "dua",
    "tiga",
    "empat",
    "lima",
    "enam",
    "tujuh",
    "delapan",
    "sembilan",
    "sepuluh",
    "sebelas",
  ];
  const toWords = (num: number): string => {
    if (num < 12) return units[num];
    if (num < 20) return `${toWords(num - 10)} belas`;
    if (num < 100)
      return `${toWords(Math.floor(num / 10))} puluh${num % 10 ? " " + toWords(num % 10) : ""}`;
    if (num < 200) return `seratus${num % 100 ? " " + toWords(num % 100) : ""}`;
    if (num < 1000)
      return `${toWords(Math.floor(num / 100))} ratus${num % 100 ? " " + toWords(num % 100) : ""}`;
    if (num < 2000) return `seribu${num % 1000 ? " " + toWords(num % 1000) : ""}`;
    if (num < 1_000_000)
      return `${toWords(Math.floor(num / 1000))} ribu${num % 1000 ? " " + toWords(num % 1000) : ""}`;
    if (num < 1_000_000_000)
      return `${toWords(Math.floor(num / 1_000_000))} juta${
        num % 1_000_000 ? " " + toWords(num % 1_000_000) : ""
      }`;
    if (num < 1_000_000_000_000)
      return `${toWords(Math.floor(num / 1_000_000_000))} miliar${
        num % 1_000_000_000 ? " " + toWords(num % 1_000_000_000) : ""
      }`;
    return `${toWords(Math.floor(num / 1_000_000_000_000))} triliun${
      num % 1_000_000_000_000 ? " " + toWords(num % 1_000_000_000_000) : ""
    }`;
  };
  return toWords(n).replace(/\s+/g, " ").trim();
}

export async function buildInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const A4: [number, number] = [595.28, 841.89];
  const page = pdf.addPage(A4);
  const { width, height } = page.getSize();

  const ink = rgb(0.06, 0.09, 0.16);
  const accent = rgb(0.13, 0.77, 0.37);
  const muted = rgb(0.39, 0.45, 0.55);
  const lightLine = rgb(0.85, 0.88, 0.92);
  const left = 50;
  const right = width - 50;

  // Header band
  const headerH = 96;
  page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: ink });
  page.drawRectangle({ x: 0, y: height - headerH - 3, width, height: 3, color: accent });
  page.drawText(data.issuer.companyName, {
    x: left,
    y: height - 36,
    size: 16,
    font: helvBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(data.issuer.brand, {
    x: left,
    y: height - 54,
    size: 10,
    font: helv,
    color: accent,
  });
  const issuerMeta = [
    ...data.issuer.addressLines,
    `NPWP: ${data.issuer.npwp}`,
    [data.issuer.email, data.issuer.phone].filter(Boolean).join("  •  "),
  ].filter(Boolean);
  let hy = height - 70;
  for (const line of issuerMeta.slice(0, 2)) {
    page.drawText(line, { x: left, y: hy, size: 8, font: helv, color: rgb(0.8, 0.85, 0.92) });
    hy -= 11;
  }
  // INVOICE title (right aligned)
  const title = "INVOICE";
  page.drawText(title, {
    x: right - helvBold.widthOfTextAtSize(title, 26),
    y: height - 44,
    size: 26,
    font: helvBold,
    color: accent,
  });
  const numLabel = data.invoiceNumber;
  page.drawText(numLabel, {
    x: right - helv.widthOfTextAtSize(numLabel, 10),
    y: height - 62,
    size: 10,
    font: helv,
    color: rgb(0.8, 0.85, 0.92),
  });

  // Bill To + meta
  let y = height - headerH - 30;
  page.drawText("BILL TO", { x: left, y, size: 9, font: helvBold, color: muted });
  page.drawText(data.client.name, { x: left, y: y - 16, size: 12, font: helvBold, color: ink });
  let by = y - 32;
  const billLines = [
    data.client.contactPerson ? `Attn: ${data.client.contactPerson}` : "",
    data.client.email ?? "",
    data.client.phone ?? "",
  ].filter(Boolean);
  for (const line of billLines) {
    page.drawText(line, { x: left, y: by, size: 9, font: helv, color: muted });
    by -= 12;
  }

  // Meta block (right)
  const metaX = 360;
  const metaRows: [string, string][] = [
    ["Invoice Date", fmtDate(data.invoiceDate)],
    ["Due Date", data.dueDate ? fmtDate(data.dueDate) : "—"],
    ["Project", data.project.code],
  ];
  let my = y;
  for (const [label, value] of metaRows) {
    page.drawText(label.toUpperCase(), { x: metaX, y: my, size: 8, font: helvBold, color: muted });
    page.drawText(value, {
      x: right - helv.widthOfTextAtSize(value, 10),
      y: my,
      size: 10,
      font: helv,
      color: ink,
    });
    my -= 16;
  }

  // Line items table
  y = Math.min(by, my) - 24;
  const colAmountX = right;
  const tableTop = y;
  page.drawRectangle({
    x: left,
    y: tableTop - 4,
    width: right - left,
    height: 22,
    color: rgb(0.95, 0.97, 0.96),
  });
  page.drawText("DESCRIPTION", { x: left + 8, y: tableTop + 3, size: 9, font: helvBold, color: ink });
  const amtHead = "AMOUNT (DPP)";
  page.drawText(amtHead, {
    x: colAmountX - 8 - helvBold.widthOfTextAtSize(amtHead, 9),
    y: tableTop + 3,
    size: 9,
    font: helvBold,
    color: ink,
  });
  y = tableTop - 16;

  // Item row
  const descMaxWidth = 320;
  const titleLines = wrapText(`${data.milestone.name} — ${data.project.name}`, helv, 10, descMaxWidth);
  let ry = y;
  for (const line of titleLines) {
    page.drawText(line, { x: left + 8, y: ry, size: 10, font: helvBold, color: ink });
    ry -= 13;
  }
  if (data.milestone.description) {
    const descLines = wrapText(data.milestone.description, helv, 8.5, descMaxWidth);
    for (const line of descLines.slice(0, 3)) {
      page.drawText(line, { x: left + 8, y: ry, size: 8.5, font: helv, color: muted });
      ry -= 11;
    }
  }
  const dppStr = formatIdr(data.dpp);
  page.drawText(dppStr, {
    x: colAmountX - 8 - helv.widthOfTextAtSize(dppStr, 10),
    y: y,
    size: 10,
    font: helv,
    color: ink,
  });
  const rowBottom = Math.min(ry, y) - 6;
  page.drawLine({
    start: { x: left, y: rowBottom },
    end: { x: right, y: rowBottom },
    thickness: 0.75,
    color: lightLine,
  });

  // Totals
  const totalsX = 340;
  const totalRow = (label: string, value: string, bold = false, color = ink) => {
    const f = bold ? helvBold : helv;
    page.drawText(label, { x: totalsX, y: ty, size: bold ? 11 : 10, font: f, color });
    page.drawText(value, {
      x: colAmountX - 8 - f.widthOfTextAtSize(value, bold ? 11 : 10),
      y: ty,
      size: bold ? 11 : 10,
      font: f,
      color,
    });
    ty -= bold ? 20 : 16;
  };
  let ty = rowBottom - 22;
  totalRow("Subtotal (DPP)", formatIdr(data.dpp));
  totalRow(`VAT / PPN ${data.vatPercent}%`, formatIdr(data.vat));
  page.drawLine({
    start: { x: totalsX, y: ty + 6 },
    end: { x: right - 8, y: ty + 6 },
    thickness: 0.75,
    color: lightLine,
  });
  ty -= 4;
  totalRow("TOTAL", formatIdr(data.total), true, accent);

  // Amount in words
  ty -= 4;
  const wordsLabel = "Terbilang:";
  page.drawText(wordsLabel, { x: left, y: ty, size: 8.5, font: helvBold, color: muted });
  const words = `${terbilang(data.total)} rupiah`;
  const wordsCap = words.charAt(0).toUpperCase() + words.slice(1);
  const wordLines = wrapText(wordsCap, helv, 8.5, right - left - 60);
  let wy = ty;
  for (const line of wordLines.slice(0, 3)) {
    page.drawText(line, { x: left + 56, y: wy, size: 8.5, font: helv, color: ink });
    wy -= 11;
  }
  ty = wy - 18;

  // Payment details box
  const boxTop = ty;
  const boxH = 76;
  page.drawRectangle({
    x: left,
    y: boxTop - boxH,
    width: 250,
    height: boxH,
    borderColor: lightLine,
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });
  page.drawText("PAYMENT DETAILS", {
    x: left + 12,
    y: boxTop - 18,
    size: 9,
    font: helvBold,
    color: ink,
  });
  const payLines = [
    data.issuer.bankName,
    `A/N: ${data.issuer.bankAccountName}`,
    `No: ${data.issuer.bankAccountNumber}`,
  ];
  let py = boxTop - 34;
  for (const line of payLines) {
    page.drawText(line, { x: left + 12, y: py, size: 9, font: helv, color: muted });
    py -= 13;
  }

  // Signature area (right)
  const sigX = 360;
  page.drawText(`${data.issuer.city}, ${fmtDate(data.invoiceDate)}`, {
    x: sigX,
    y: boxTop - 18,
    size: 9,
    font: helv,
    color: muted,
  });
  page.drawText(data.issuer.companyName, {
    x: sigX,
    y: boxTop - 34,
    size: 9,
    font: helvBold,
    color: ink,
  });
  page.drawLine({
    start: { x: sigX, y: boxTop - boxH + 6 },
    end: { x: right, y: boxTop - boxH + 6 },
    thickness: 0.75,
    color: lightLine,
  });
  page.drawText("Authorized Signature", {
    x: sigX,
    y: boxTop - boxH - 8,
    size: 8,
    font: helv,
    color: muted,
  });

  // Footer
  page.drawText(
    `Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC — ${data.issuer.brand}`,
    { x: left, y: 36, size: 8, font: helv, color: muted },
  );

  return pdf.save();
}
