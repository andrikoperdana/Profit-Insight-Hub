// Helpers for surfacing an expired session on the login page and returning the
// user to where they were after re-authenticating.
//
// The shared fetch layer (lib/api-client-react custom-fetch) writes these keys
// on a 401 response; import the constants from there so they can never drift.
import {
  SESSION_EXPIRED_KEY,
  POST_LOGIN_REDIRECT_KEY,
} from "@workspace/api-client-react";

// Flag the session as expired and remember the current location so the login
// page can show a message and bounce the user back after they sign in again.
export function markSessionExpired(nextPath?: string): void {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
    if (nextPath && !nextPath.includes("/login")) {
      sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, nextPath);
    }
  } catch {
    /* sessionStorage can throw in private-mode/quota edge cases — ignore */
  }
}

// Read-and-clear the expired flag (true only once per expiry event).
export function consumeSessionExpired(): boolean {
  try {
    const v = sessionStorage.getItem(SESSION_EXPIRED_KEY);
    if (v) sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    return Boolean(v);
  } catch {
    return false;
  }
}

// Read-and-clear the stored return path, normalized to a wouter-relative path.
// Falls back to "/" when nothing is stored or the stored value is the login page.
export function consumePostLoginRedirect(): string {
  try {
    const raw = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    if (raw) sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    if (!raw) return "/";
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    let next = raw;
    if (base && next.startsWith(base)) next = next.slice(base.length);
    if (!next.startsWith("/")) next = "/" + next;
    if (next.includes("/login")) return "/";
    return next;
  } catch {
    return "/";
  }
}
