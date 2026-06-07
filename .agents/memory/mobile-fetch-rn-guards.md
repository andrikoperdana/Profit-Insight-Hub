---
name: Shared fetch browser-only guards (RN safety)
description: Why browser-only side effects in the shared api client must use isBrowserDom(), not `typeof window`, or the Expo/native app crashes.
---

# Shared fetch browser-only guards

`lib/api-client-react/src/custom-fetch.ts` is shared by the web app AND the Expo
mobile bundle. Any browser-only side effect there (the 401 → redirect-to-login
block, the 403 site-gate → `window.location.reload()` block) must be gated by
`isBrowserDom()` — which requires `window` **and** `localStorage` **and**
`window.location` — never `typeof window !== "undefined"` alone.

**Why:** React Native defines a global `window`, so a `typeof window` check passes
in the native runtime, then the body touches `localStorage`/`window.location`
which do NOT exist there, throwing **"Property 'localStorage' doesn't exist"**.
This surfaced as the mobile login error after the site-gate bypass let mobile
requests reach the API (a wrong-password 401 hit the redirect block and crashed
instead of returning a clean ApiError).

**How to apply:** when adding any DOM/storage/location access to custom-fetch,
wrap it in `isBrowserDom()`. The token-attach path already uses
`typeof localStorage !== "undefined"`; keep the same discipline everywhere. On
native, the 401/403 blocks are skipped and the normal `ApiError` propagates so the
mobile auth UI can show "invalid credentials" itself.

**Note:** the team runs the app as a native build (Expo), not the Chrome web
version — `localStorage` only fails to exist in React Native, confirming the
runtime.
