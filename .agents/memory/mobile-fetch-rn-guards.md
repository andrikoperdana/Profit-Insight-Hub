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

## Raw fetch() that bypasses customFetch must re-add auth + client headers

customFetch has no RN blob/binary support, so binary downloads (e.g. expense
receipt PDF) use a raw `fetch()`. That path skips everything customFetch injects,
so it MUST manually set **both** `authorization: Bearer <token>` (from
`getCurrentToken()`) **and** `x-secureprofit-client: "mobile"`.

**Why:** the front-door site gate (`artifacts/api-server/src/app.ts`) rejects
`/api/*` with 403 unless there's a valid gate cookie OR the
`x-secureprofit-client === "mobile"` header. `_layout.tsx` calls
`setClientId("mobile")`, but that only adds the header inside customFetch — a raw
fetch silently 403s in any gate-enabled (prod) environment even when authed.

**How to apply:** for any new direct fetch in the mobile app, mirror customFetch's
header set (bearer + `x-secureprofit-client`). Prefer extracting a shared helper
if more than one binary endpoint needs it.
