---
name: @babel/core override breaks react-native-worklets babel plugin
description: Forcing @babel/core via a pnpm override strands react-native-worklets' undeclared @babel/generator require, killing the Expo mobile production (Metro) build.
---

# @babel/core override breaks react-native-worklets' Metro transform

`react-native-worklets`' babel plugin (`plugin/index.js`) does a bare `require("@babel/generator")`
that it never declares in its own manifest. It normally resolves via pnpm hoisting alongside
`@babel/core`. When a **global pnpm `overrides` entry pins `@babel/core`** (added for CVE
GHSA-4x5r-pxfx-6jf8), pnpm re-isolates worklets into a new peer-keyed subtree
(`react-native-worklets@x_@babel+core@<pin>_...`) where `@babel/generator` is no longer reachable.
Every Metro/Babel transform then crashes on the **first module** (`expo-router/entry.js`) with
`[BABEL] Cannot find module '@babel/generator'` → Metro returns HTTP 500 → the Expo mobile
artifact's production build fails → the whole multi-artifact deployment publish is killed.

**Why this was hard to see:** the mobile build (`artifacts/mobile/scripts/build.js`) discards the
HTTP 500 response *body* (keeps only the status), so deployment logs show only "Download failed:
HTTP 500". Reproduce the real error with `pnpm exec expo export --platform ios` in `artifacts/mobile`
(in-process bundler, no port-8081 conflict with the running dev workflow). A ~600ms fast-fail on the
first module = deterministic transform error, not a resource timeout.

## The fix (rule)
Repair an **undeclared dependency of a third-party package** with pnpm `packageExtensions`, NOT a
direct devDep and NOT by removing the security override:
```yaml
packageExtensions:
  react-native-worklets:
    dependencies:
      "@babel/generator": "^7.29.6"   # keep aligned with the @babel/core override
```
- **Why packageExtensions:** the failing `require` lives *inside* worklets' subtree; under pnpm's
  isolated store a consumer-level devDep won't satisfy a nested bare require, but packageExtensions
  links it directly into worklets' `node_modules`.
- **Why keep @babel/generator pinned to the same range as @babel/core:** they version in lockstep;
  a mismatch reintroduces resolution/behavior drift.
- **How to apply:** after editing, run `pnpm install` (commit BOTH `pnpm-workspace.yaml` and
  `pnpm-lock.yaml` — deployment installs from the committed lockfile), then verify with
  `expo export` for **both** `ios` and `android` (the build script downloads both).
- **Do not** "fix" this by deleting the `@babel/core` override — that regresses the CVE.

Only the Expo mobile artifact is affected; vite-based artifacts (web/deck/mockup) use @babel/core but
not the worklets plugin, so they build fine.
