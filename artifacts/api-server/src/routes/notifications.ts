import { Router, type IRouter } from "express";
import { prisma } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { runAllNotificationChecks } from "../lib/notificationRules.js";

const router: IRouter = Router();
router.use(requireAuth);

// The notification rules engine is heavy (re-scans projects/timesheets/expenses)
// and is triggered from every MANAGEMENT dashboard load. Because the rules
// already dedup notifications per-day, running the full engine on every load is
// wasteful and piles onto the cold-start request burst. Throttle it to at most
// one real run per window across all callers, and coalesce concurrent triggers
// onto a single in-flight run. Failures are never cached.
type ChecksResult = Awaited<ReturnType<typeof runAllNotificationChecks>>;
const RUN_CHECKS_TTL_MS = 10 * 60_000;
let lastChecksResult: ChecksResult | null = null;
let lastChecksAt = 0;
let inFlightChecks: Promise<ChecksResult> | null = null;

async function runChecksThrottled(): Promise<ChecksResult> {
  const now = Date.now();
  if (lastChecksResult && now - lastChecksAt < RUN_CHECKS_TTL_MS) {
    return lastChecksResult;
  }
  if (inFlightChecks) return inFlightChecks;
  inFlightChecks = (async () => {
    try {
      const result = await runAllNotificationChecks();
      lastChecksResult = result;
      lastChecksAt = Date.now();
      return result;
    } finally {
      inFlightChecks = null;
    }
  })();
  return inFlightChecks;
}

function serialize(n: {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    title: n.title,
    message: n.message,
    link: n.link,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

router.get("/notifications", async (req, res) => {
  const userId = req.user!.sub;
  const list = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(list.map(serialize));
});

router.post("/notifications/:id/read", async (req, res) => {
  const userId = req.user!.sub;
  const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!n || n.userId !== userId) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const updated = await prisma.notification.update({
    where: { id: n.id },
    data: { readAt: n.readAt ?? new Date() },
  });
  res.json(serialize(updated));
});

router.post("/notifications/read-all", async (req, res) => {
  const userId = req.user!.sub;
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ success: true });
});

/**
 * Run the notification rules engine. Idempotent (dedup-per-day) and throttled
 * (see runChecksThrottled): the heavy engine runs at most once per ~10 min
 * across all callers, returning the last result otherwise.
 * MANAGEMENT or SUPER_ADMIN can trigger; everyone else gets 403.
 * Frontend calls this from dashboard load so checks stay fresh without cron.
 */
router.post("/notifications/run-checks", async (req, res) => {
  const role = req.user!.role;
  if (role !== "MANAGEMENT" && role !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const result = await runChecksThrottled();
    req.log.info({ result }, "Notification rules engine ran");
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Notification rules engine failed");
    res.status(500).json({ error: "Failed to run checks" });
  }
});

export default router;
