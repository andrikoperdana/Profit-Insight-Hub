import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "../lib/auth.js";
import { prisma, type UserRole } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Idempotency guard — CRITICAL for latency. Most sub-routers are mounted
  // WITHOUT a path prefix and start with `router.use(requireAuth)`, so a single
  // request traverses every earlier router's requireAuth before reaching its
  // handler (up to ~37 of them). Each run used to hit the DB for the user row;
  // against a remote database that stacked into 10-40s per request in
  // production. `req.user` is only ever set below, after a successful
  // verification within this same request, so if it is present the request has
  // already been fully authenticated and re-running the check is pure waste.
  if (req.user) {
    next();
    return;
  }
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice("Bearer ".length);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  // Reject non-session tokens (e.g. calendar ICS subscription tokens) from
  // being replayed as session credentials. Session tokens carry email+role.
  const anyPayload = payload as unknown as { kind?: string; email?: string; role?: string };
  if (anyPayload.kind && anyPayload.kind !== "session") {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  if (!anyPayload.email || !anyPayload.role) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, isActive: true, role: true, deletedAt: true },
  });
  if (!user || !user.isActive || user.deletedAt) {
    res.status(401).json({ error: "User not active" });
    return;
  }
  req.user = { ...payload, role: user.role };
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    // Super Admin is the top-level god account: it passes every role guard.
    if (req.user.role === "SUPER_ADMIN") {
      next();
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
