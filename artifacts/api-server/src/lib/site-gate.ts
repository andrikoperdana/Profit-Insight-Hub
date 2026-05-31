import crypto from "crypto";

// Optional front-door gate that sits in front of the entire app on public
// deployments. When SITE_GATE_PASS is set, every /api request (except the
// gate endpoints and health check) requires a valid signed gate cookie. This
// is a shared username/password deterrent — orthogonal to the per-user JWT
// auth — so a published demo isn't openly reachable with known credentials.
//
// The gate uses its own HttpOnly cookie (never the Authorization header), so
// it never collides with the Bearer JWT the app already sends.

const USER = process.env["SITE_GATE_USER"] ?? "";
const PASS = process.env["SITE_GATE_PASS"] ?? "";
const SECRET = process.env["SESSION_SECRET"] ?? "dev-secret";

export const GATE_COOKIE = "sp_gate";

export function gateEnabled(): boolean {
  return PASS.length > 0;
}

// Stable token derived from the configured credentials. Rotating either the
// username or password invalidates all previously issued cookies.
export function gateToken(): string {
  return crypto
    .createHmac("sha256", SECRET)
    .update(`sp-site-gate|${USER}|${PASS}`)
    .digest("hex");
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function verifyGateToken(token: string | undefined): boolean {
  if (!token) return false;
  return timingSafeEqual(token, gateToken());
}

export function checkCredentials(username: unknown, password: unknown): boolean {
  if (!gateEnabled()) return false;
  if (typeof username !== "string" || typeof password !== "string") return false;
  const userOk = timingSafeEqual(username, USER);
  const passOk = timingSafeEqual(password, PASS);
  return userOk && passOk;
}

export function readGateCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === GATE_COOKIE) {
      const raw = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
}
