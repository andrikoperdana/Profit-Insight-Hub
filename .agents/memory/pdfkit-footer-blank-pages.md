---
name: PDFKit footer below bottom margin spawns blank pages
description: Writing per-page footers/text below the bottom margin makes PDFKit auto-paginate, multiplying page count
---

Rule: When stamping per-page footers (or any absolute-positioned text) at a y
BELOW the bottom margin — e.g. `doc.page.height - 40` while `margins.bottom = 60`
— PDFKit treats the write as content overflow and auto-inserts a new page for
EACH such `text()` call, even with `lineBreak: false`. A 3-page doc with two
footer lines per page balloons to 9 pages (3 + 2×3). A tell-tale symptom: the
footer reads "Page X of 3" while the file actually has 9 pages, because
`bufferedPageRange().count` was read before the loop's writes added the extras.

**Why:** PDFKit's page-break check uses `maxY = page.height - margins.bottom`;
any write past maxY triggers an internal `addPage()`.

**How to apply:** After `switchToPage(i)` and before writing the footer, set
`doc.page.margins.bottom = 0` so maxY becomes the full page height and the
near-bottom footer write no longer paginates. The same gotcha applies to any
intentional below-margin text in this repo's PDF generators (executive copilot,
surveys, reports).
