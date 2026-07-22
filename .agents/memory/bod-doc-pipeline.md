---
name: BOD documentation asset pipeline
description: How the board-facing DOCX (and future PPT) is regenerated — screenshots, diagrams, builder scripts and their constraints.
---

Reusable pipeline for board/management-facing documents (a PPT mandate is expected later; reuse these assets).

- `scripts/src/bod-screenshots.mjs` — authenticated app captures into `docs/bod-assets/screens/` (subcommands `setup` / `copilot` / `shots FROM TO` / `list`; state in `/tmp/bod-state.json`). **Run in batches of ≤6 shots** — a full run exceeds the 120s bash cap.
- `scripts/src/bod-render-svg.mjs` — renders every SVG in `docs/bod-assets/diagrams/` to PNG @2x via chromium/puppeteer-core. Diagrams are hand-written SVGs (white bg, red #dc2626 accents, print-friendly).
- `scripts/src/bod-docx.mjs` — builds `docs/SecureProfit-Hub-BOD-Overview.docx` with the `docx` v9 package (ImageRun needs `type:"png"`; PNG size read from IHDR; images capped 600px wide / 780px tall to fit A4 with 2cm margins).

**Why:** screenshots depend on deep links working after hard refresh — auth must initialize synchronously from localStorage (lazy useState in web `auth.tsx`), or ProtectedRoute bounces every deep link to /login→dashboard on render #1.

**How to apply:** after UI changes, recapture only affected shots (`shots FROM TO`), re-render diagrams if edited, rerun the docx builder. Factual claims in the doc must match server gates — notably the COMPLETE gate requires milestones **invoiced** (no PLANNED left), not paid; email notifications are behind a kill-switch (default off), so word claims as "optional email".
