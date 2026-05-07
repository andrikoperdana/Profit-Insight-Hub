import { prisma } from "@workspace/db";

export async function notifyUser(opts: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
}) {
  if (!opts.userId) return;
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
  } catch {
    // best effort
  }
}

export async function notifyUsers(
  userIds: (string | null | undefined)[],
  payload: { type: string; title: string; message: string; link?: string | null },
) {
  const unique = Array.from(new Set(userIds.filter((u): u is string => !!u)));
  await Promise.all(unique.map((userId) => notifyUser({ userId, ...payload })));
}
