---
name: Expo dev-workflow port probe & verification
description: Why restart_workflow can falsely fail for Expo Metro, and how to verify an Expo app without a persistent dev server.
---

# Expo dev-workflow port probe & verification

`restart_workflow` for an Expo artifact can fail with `DIDNT_OPEN_A_PORT` even though Metro
binds the port correctly (logs show "Waiting on http://localhost:<PORT>", and the Expo dev
tunnel `https://$REPLIT_EXPO_DEV_DOMAIN/status` returns 200). The probe tear-down then kills
Metro. This is environmental port-detection, **not** a code defect, and it is **not** fixed by:
- retrying restart_workflow (observed failing 7+ times consecutively),
- `CI=1` in the dev script (changes Metro to non-interactive but probe still fails, and it
  also disables hot-reload — so don't keep it),
- signal-trap changes or warm caches.

**Why it matters:** the failure only affects the in-Replit dev preview pane. The published
build (static `expo export` + `serve`) and Expo Go QR scanning use different mechanisms and
are unaffected — so `suggestDeploy()` is still the right terminal action.

**How to verify an Expo app without a running workflow** (background/detached processes die
on tool return here, so you cannot keep Metro alive across tool calls to screenshot):
- In a SINGLE bash call: `setsid` Metro, poll `127.0.0.1:<PORT>/status` until 200, then
  `curl GET /` (the HTML page — returns 200), extract the real bundle `src` from the HTML
  (it's `expo-router/entry.bundle?...`, NOT `/index.bundle`), and `curl` that bundle URL.
- A genuine JS payload (`var __BUNDLE_START_TIME__...`, multi-MB, HTTP 200) proves the whole
  app compiles through React Compiler + Hermes. An error JSON `{"type":"...Error"...}` means
  a real resolution/compile error.
- `pnpm --filter @workspace/<slug> run typecheck` covers TS/module resolution and is the
  cheapest first gate.
