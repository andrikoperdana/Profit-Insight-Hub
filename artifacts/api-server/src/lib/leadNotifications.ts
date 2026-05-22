import { prisma } from "@workspace/db";
import { notifyUser } from "./notifications.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * If the lead's most recent activity has an overdue `nextActionAt`, notify
 * the lead owner — at most once per day per lead.
 *
 * `activities` should be ordered desc by `occurredAt`.
 */
export async function notifyOnceDailyForLead(
  lead: { id: string; ownerId: string; title: string },
  activities: Array<{ nextActionAt: Date | null; occurredAt: Date }>,
): Promise<boolean> {
  if (!activities.length) return false;
  // The first (most recent) activity drives whether the next-action is open
  // and overdue. If a newer activity exists after the `nextActionAt`, the
  // followup is considered handled.
  const last = activities[0];
  if (!last.nextActionAt) return false;
  const now = new Date();
  if (last.nextActionAt.getTime() > now.getTime()) return false;

  const type = "LEAD_FOLLOWUP_OVERDUE";
  const link = `/leads?leadId=${lead.id}`;
  const since = new Date(Date.now() - ONE_DAY_MS);
  const dup = await prisma.notification.findFirst({
    where: { userId: lead.ownerId, type, link, createdAt: { gte: since } },
    select: { id: true },
  });
  if (dup) return false;
  await notifyUser({
    userId: lead.ownerId,
    type,
    title: `Follow-up tertunda: ${lead.title}`,
    message: `Next action sudah lewat ${last.nextActionAt.toISOString().slice(0, 10)}.`,
    link,
  });
  return true;
}
