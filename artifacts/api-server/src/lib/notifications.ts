import { prisma } from "@workspace/db";
import { maybeSendNotificationEmail, shouldEmailNotification } from "./email.js";

export async function notifyUser(opts: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
}) {
  if (!opts.userId) return;
  let created = false;
  try {
    await prisma.notification.create({
      data: {
        userId: opts.userId,
        type: opts.type,
        title: opts.title,
        message: opts.message,
        link: opts.link ?? null,
      },
    });
    created = true;
  } catch {
    // best effort
  }
  // Best-effort email for important notifications. The in-app notification is
  // the source of truth; email is fired without awaiting and never throws.
  if (created && shouldEmailNotification(opts.type)) {
    void maybeSendNotificationEmail({
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      link: opts.link ?? null,
    });
  }
}

export async function notifyUsers(
  userIds: (string | null | undefined)[],
  payload: { type: string; title: string; message: string; link?: string | null },
) {
  const unique = Array.from(new Set(userIds.filter((u): u is string => !!u)));
  await Promise.all(unique.map((userId) => notifyUser({ userId, ...payload })));
}
