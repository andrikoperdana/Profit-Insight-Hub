---
name: Shared-lib stale dist types
description: Why a new lib/shared export is "not an exported member" for consumers' tsc, and a pnpm quirk that silently skips fallbacks.
---

**Rule:** After adding an export to `lib/shared` (or any composite-referenced workspace lib), run `pnpm exec tsc --build --force lib/shared` before trusting consumers' typechecks.

**Why:** Consumer `tsc -p --noEmit` resolves `@workspace/*` imports through TypeScript project references, which read the lib's emitted `dist/*.d.ts` — not `src`. A stale dist yields `TS2305: no exported member` even though the source export exists. Vitest, esbuild bundles, and Vite resolve the package exports straight to `src/*.ts`, so tests and runtime pass while tsc fails (or vice versa) — don't chase the phantom in consumer code.

**Also:** `pnpm --filter <pkg> run <script>` exits **0** when the script doesn't exist ("None of the selected packages has a ... script"), so `pnpm run build || fallback` chains silently skip the fallback. Check the script exists (`jq .scripts package.json`) instead of relying on `||`.

**How to apply:** Any time an export is added/renamed in `lib/shared`, `lib/db`, or another composite lib: build it with `tsc --build --force <libdir>`, then re-run consumer typechecks.
