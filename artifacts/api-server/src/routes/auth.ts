import { Router, type IRouter, type Request } from "express";
import { prisma } from "@workspace/db";
import { OAuth2Client } from "google-auth-library";
import { signToken, verifyPassword, hashPassword } from "../lib/auth.js";
import { requireAuth } from "../middlewares/auth.js";
import { serializeUser } from "../lib/serializers.js";
// avatar endpoints below use serializeUser
import { recordAuditAnon } from "../lib/audit.js";

const router: IRouter = Router();

// In-memory rate limiter: 5 failed login attempts per 15 minutes per IP+email.
// For multi-instance deployments swap with a Redis-backed bucket.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
type Bucket = { count: number; firstAt: number; blockedUntil: number };
const attempts = new Map<string, Bucket>();

function clientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

function rateKey(req: Request, email: string): string {
  return `${clientIp(req)}|${email}`;
}

function checkRate(key: string): { allowed: boolean; retryInSec?: number } {
  const now = Date.now();
  const b = attempts.get(key);
  if (!b) return { allowed: true };
  if (b.blockedUntil > now) {
    return { allowed: false, retryInSec: Math.ceil((b.blockedUntil - now) / 1000) };
  }
  if (now - b.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return { allowed: true };
  }
  return { allowed: true };
}

function recordFailure(key: string): void {
  const now = Date.now();
  const b = attempts.get(key);
  if (!b || now - b.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
    return;
  }
  b.count += 1;
  if (b.count >= MAX_ATTEMPTS) {
    b.blockedUntil = now + WINDOW_MS;
  }
}

function recordSuccess(key: string): void {
  attempts.delete(key);
}

// Periodic cleanup of stale buckets (every 30 min)
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of attempts) {
    if (b.blockedUntil < now && now - b.firstAt > WINDOW_MS) {
      attempts.delete(k);
    }
  }
}, 30 * 60 * 1000).unref?.();

router.post("/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase().trim();
  const password = String(req.body?.password || "");
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  const key = rateKey(req, email);
  const rate = checkRate(key);
  if (!rate.allowed) {
    res.status(429).json({
      error: `Too many failed login attempts. Try again in ${Math.ceil((rate.retryInSec ?? 60) / 60)} minute(s).`,
    });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || user.deletedAt) {
    recordFailure(key);
    await recordAuditAnon({
      action: "user.login_failed",
      entityType: "User",
      entityId: user?.id ?? null,
      userId: user?.id ?? null,
      userName: email,
      userRole: "ANON",
      description: `Failed login: ${email} (unknown or inactive)`,
    });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    recordFailure(key);
    await recordAuditAnon({
      action: "user.login_failed",
      entityType: "User",
      entityId: user.id,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      description: `Failed login: wrong password for ${email}`,
    });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  recordSuccess(key);
  await recordAuditAnon({
    action: "user.login",
    entityType: "User",
    entityId: user.id,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    description: `${user.name} logged in`,
  });

  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  res.json({ token, user: serializeUser(user) });
});

// ---------------------------------------------------------------------------
// Google SSO (Google Identity Services ID-token flow)
//
// Only Google Workspace accounts on SSO_EMAIL_DOMAIN may use SSO. Existing
// active users sign straight in; unknown domain emails become an AccessRequest
// (PENDING) that a Site Admin approves or rejects from the dashboard.
// The client ID is public by design — the server verifies every ID token's
// signature and audience via google-auth-library.
// ---------------------------------------------------------------------------

const SSO_EMAIL_DOMAIN = "@itsecasia.com";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const googleOAuthClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

router.get("/auth/google/config", (_req, res) => {
  res.json({ clientId: GOOGLE_CLIENT_ID || null });
});

router.post("/auth/google", async (req, res) => {
  if (!GOOGLE_CLIENT_ID || !googleOAuthClient) {
    res.status(503).json({ error: "Google sign-in is not configured" });
    return;
  }
  const credential = String(req.body?.credential || "");
  if (!credential) {
    res.status(400).json({ error: "credential is required" });
    return;
  }
  // Rate limit by IP only — the email is unknown until the token is verified.
  const key = `${clientIp(req)}|google-sso`;
  const rate = checkRate(key);
  if (!rate.allowed) {
    res.status(429).json({
      error: `Too many failed sign-in attempts. Try again in ${Math.ceil((rate.retryInSec ?? 60) / 60)} minute(s).`,
    });
    return;
  }

  let payload: import("google-auth-library").TokenPayload | undefined;
  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    recordFailure(key);
    res.status(401).json({ error: "Invalid Google credential" });
    return;
  }
  const email = String(payload?.email || "").toLowerCase().trim();
  if (!payload || !email || payload.email_verified !== true) {
    recordFailure(key);
    res.status(401).json({ error: "Google account email is not verified" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.isActive && !user.deletedAt) {
    recordSuccess(key);
    await recordAuditAnon({
      action: "user.login",
      entityType: "User",
      entityId: user.id,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      description: `${user.name} logged in with Google`,
    });
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    res.json({ status: "AUTHENTICATED", token, user: serializeUser(user) });
    return;
  }
  if (user) {
    recordFailure(key);
    await recordAuditAnon({
      action: "user.login_failed",
      entityType: "User",
      entityId: user.id,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      description: `Failed Google login: ${email} (inactive account)`,
    });
    res.status(401).json({ error: "Your account is inactive. Contact a Site Admin." });
    return;
  }
  if (!email.endsWith(SSO_EMAIL_DOMAIN)) {
    recordFailure(key);
    await recordAuditAnon({
      action: "user.login_failed",
      entityType: "User",
      entityId: null,
      userId: null,
      userName: email,
      userRole: "ANON",
      description: `Failed Google login: ${email} (outside ${SSO_EMAIL_DOMAIN})`,
    });
    res.status(403).json({ error: `Only ${SSO_EMAIL_DOMAIN} Google accounts can request access` });
    return;
  }

  const existing = await prisma.accessRequest.findUnique({ where: { email } });
  if (existing && existing.status === "REJECTED") {
    res.status(403).json({ error: "Your access request was rejected. Contact a Site Admin." });
    return;
  }
  // APPROVED with no matching user means the created account was later
  // soft-deleted — handled by the inactive branch above (the user row still
  // exists). PENDING or first-time: upsert keeps a single row per email and
  // refreshes the Google profile name on repeat attempts.
  const name = String(payload.name || email.split("@")[0]).slice(0, 200);
  const googleSub = String(payload.sub);
  await prisma.accessRequest.upsert({
    where: { email },
    update: { name, googleSub },
    create: { email, name, googleSub },
  });
  if (!existing) {
    await recordAuditAnon({
      action: "access_request.created",
      entityType: "AccessRequest",
      entityId: null,
      userId: null,
      userName: email,
      userRole: "ANON",
      description: `Access request created for ${name} (${email}) via Google sign-in`,
    });
  }
  res.json({ status: "PENDING_APPROVAL" });
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(serializeUser(user));
});

router.post("/auth/logout", requireAuth, (_req, res) => {
  res.json({ success: true });
});

router.post("/auth/change-password", requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }
  if (newPassword === currentPassword) {
    res.status(400).json({ error: "New password must be different from the current password" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user || !user.isActive) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    req.log.warn({ userId: user.id }, "change-password: wrong current password");
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  await recordAuditAnon({
    action: "user.updated",
    entityType: "User",
    entityId: user.id,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    description: `${user.email} changed their password`,
  });
  res.json({ success: true });
});

// Avatar upload — JSON body { dataUrl: "data:image/png;base64,..." }
// Max 300 KB encoded (~225 KB raw image). Stored on User.avatarDataUrl.
const AVATAR_MAX_BYTES = 300 * 1024;
const AVATAR_MIME_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/i;

router.post("/auth/avatar", requireAuth, async (req, res) => {
  const dataUrl = String(req.body?.dataUrl || "");
  if (!dataUrl) {
    res.status(400).json({ error: "dataUrl is required" });
    return;
  }
  if (!AVATAR_MIME_RE.test(dataUrl)) {
    res.status(400).json({ error: "Only PNG, JPEG, WebP, or GIF images are allowed" });
    return;
  }
  if (dataUrl.length > AVATAR_MAX_BYTES * 1.4) {
    res.status(413).json({ error: `Image is too large. Max ~${Math.round(AVATAR_MAX_BYTES / 1024)} KB.` });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: req.user!.sub },
    data: { avatarDataUrl: dataUrl },
  });
  res.json(serializeUser(updated));
});

router.delete("/auth/avatar", requireAuth, async (req, res) => {
  const updated = await prisma.user.update({
    where: { id: req.user!.sub },
    data: { avatarDataUrl: null },
  });
  res.json(serializeUser(updated));
});

export default router;
