import { Router, type IRouter, type Request } from "express";
import { prisma } from "@workspace/db";
import { signToken, verifyPassword } from "../lib/auth.js";
import { requireAuth } from "../middlewares/auth.js";
import { serializeUser } from "../lib/serializers.js";
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

export default router;
