---
name: Session-expiry sessionStorage keys
description: The "session expired" + return-path UX is wired through two sessionStorage keys duplicated across a lib/app boundary that can't share imports.
---

The web "session expired -> sign in -> return to last page" flow is driven by two
sessionStorage keys: `session_expired` and `post_login_redirect`.

**Constraint:** these key literals exist in TWO places that cannot import each
other:
- `artifacts/web/src/lib/session.ts` (markSessionExpired / consumeSessionExpired /
  consumePostLoginRedirect) — the canonical helpers used by the web app.
- `lib/api-client-react/src/custom-fetch.ts` 401 handler — writes the same two
  keys inline as string literals, because the shared client lib can't import from
  the web artifact.

**Why:** a 401 from the server and a client-side idle logout must produce the
*same* login-page UX. The shared fetch layer owns the 401 path; the web app owns
the idle path. If one side renames a key, the other silently stops showing the
expired notice / loses the return path.

**How to apply:** change both sides in lockstep. The expiry path also stores
`window.location.pathname + window.location.search` (includes the app BASE_URL
prefix); `consumePostLoginRedirect()` strips that prefix to a wouter-relative
path and ignores `/login`.

**Read-and-clear is destructive:** consume the flag and the redirect ONCE via a
lazy `useState` initializer in login.tsx, never inside a re-running effect — an
effect re-run would consume the path and then navigate to "/".

Two triggers: server 401 (hard `window.location.href` reload) and 30-min idle
auto-logout in AuthProvider (soft `setLocation`). Both call the same flag-then-
navigate sequence. JWT session lifetime is 1d (api-server auth.ts EXPIRES_IN).
