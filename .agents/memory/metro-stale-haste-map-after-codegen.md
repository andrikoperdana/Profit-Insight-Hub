---
name: Metro stale haste map after codegen
description: Why Expo/Metro intermittently logs "Unable to resolve ./generated/api" from the api-client-react barrel, and that it is a cache artifact, not a code bug.
---

# Metro "Unable to resolve ./generated/api" is a stale-cache artifact, not a bug

Symptom: the Expo/mobile Metro bundler logs
`Unable to resolve "./generated/api" from "lib/api-client-react/src/index.ts"`
(import stack: `app/_layout.tsx` → `@workspace/api-client-react` → `./generated/api`),
even though `lib/api-client-react/src/generated/api.ts` exists and the web app
(Vite) + `tsc` resolve the same barrel fine.

**Root cause:** running `api-spec codegen` rewrites the large generated
`api.ts`/`api.schemas.ts` while a Metro instance is already running. Metro's
persistent file-map (haste index) at `/tmp/metro-file-map-*` does not always pick
up the rewritten large file, so resolution fails until Metro re-indexes. It is a
cache staleness issue, NOT a resolver/config/exports bug.

**Confirmed not a code bug:** clearing `/tmp/metro-cache` + `/tmp/metro-file-map-*`
(+ `artifacts/mobile/.expo`) and restarting the mobile workflow makes the cold
rebuild resolve cleanly every time (login screen renders, "Web Bundled … 1495
modules", no error). Do not "fix" it by editing `metro.config.js`, the package
`exports` map, or adding file extensions to the barrel re-exports.

**How to apply:** after any `api-spec codegen` run, restart the mobile/Expo
workflow so Metro re-indexes the regenerated files. If the stale-resolve warning
still shows, clear the two `/tmp/metro-*` caches and restart — that is the whole
fix. The web/api-server are unaffected (they never use Metro).
