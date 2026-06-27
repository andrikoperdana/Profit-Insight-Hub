---
name: codegen empty barrel needs force rebuild
description: After api-spec codegen, the incremental tsc --build can emit an EMPTY api-client-react dist barrel; web typecheck then fails with "dist/index.d.ts is not a module".
---

# api-spec codegen → empty dist barrel → force rebuild

Re-running `pnpm --filter @workspace/api-spec run codegen` makes orval **clean and
recreate** `lib/api-client-react/src/generated/*`. The codegen script then runs
`tsc --build` (typecheck:libs), but the **incremental** build cache
(`lib/api-client-react/tsconfig.tsbuildinfo`) can get out of sync with the
freshly-recreated source and emit a **0-line `dist/index.d.ts`** (just a
sourcemap comment, no `export *`).

Symptom: web (and any consumer of the `dist` build) typecheck fails with a burst
of unrelated-looking errors, all rooted in:
`File '.../lib/api-client-react/dist/index.d.ts' is not a module.`
plus cascading TS2339/TS2538/TS7006 because every generated type now resolves to
`{}` / `unknown`.

**Fix:** force a full lib rebuild, ignoring the incremental cache:
`pnpm exec tsc --build --force` (from repo root), then re-typecheck. Verify the
barrel is non-empty: `wc -l lib/api-client-react/dist/index.d.ts` should be ~4
lines with `export * from "./generated/api"`.

**Why:** consumers import `@workspace/api-client-react` which resolves to the
built `dist`, not `src`. An empty emitted barrel silently breaks all generated
hooks/types downstream even though `src/generated` is fine.

**How to apply:** any time you re-run api-spec codegen and a downstream artifact
suddenly can't see generated hooks/types, suspect the empty dist barrel first —
`--force` rebuild before chasing the individual TS errors.
