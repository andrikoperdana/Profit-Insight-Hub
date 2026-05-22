import { describe, it, expect, beforeEach, vi } from "vitest";

const notificationStore: Array<{ userId: string; type: string; link: string | null; createdAt: Date }> = [];
let findFirstImpl: (args: any) => Promise<any> = async (args: any) => {
  const since = args.where.createdAt?.gte as Date | undefined;
  return (
    notificationStore.find(
      (n) =>
        n.userId === args.where.userId &&
        n.type === args.where.type &&
        n.link === args.where.link &&
        (!since || n.createdAt >= since),
    ) ?? null
  );
};

vi.mock("@workspace/db", () => ({
  prisma: {
    notification: {
      findFirst: vi.fn((args: any) => findFirstImpl(args)),
      create: vi.fn(async (args: any) => {
        notificationStore.push({
          userId: args.data.userId,
          type: args.data.type,
          link: args.data.link ?? null,
          createdAt: new Date(),
        });
        return {};
      }),
    },
  },
}));

vi.mock("../notifications.js", () => ({
  notifyUser: vi.fn(async (opts: any) => {
    notificationStore.push({
      userId: opts.userId,
      type: opts.type,
      link: opts.link ?? null,
      createdAt: new Date(),
    });
  }),
}));

const { notifyOnceDailyForLead } = await import("../leadNotifications.js");

const lead = { id: "lead-1", ownerId: "user-1", title: "Test Lead" };

beforeEach(() => {
  notificationStore.length = 0;
});

describe("notifyOnceDailyForLead", () => {
  it("returns false when there are no activities", async () => {
    expect(await notifyOnceDailyForLead(lead, [])).toBe(false);
  });

  it("returns false when most recent activity has no nextActionAt", async () => {
    const result = await notifyOnceDailyForLead(lead, [
      { nextActionAt: null, occurredAt: new Date() },
    ]);
    expect(result).toBe(false);
  });

  it("returns false when nextActionAt is in the future", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const result = await notifyOnceDailyForLead(lead, [
      { nextActionAt: future, occurredAt: new Date() },
    ]);
    expect(result).toBe(false);
    expect(notificationStore).toHaveLength(0);
  });

  it("notifies when nextActionAt is overdue and no prior notification exists", async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const result = await notifyOnceDailyForLead(lead, [
      { nextActionAt: past, occurredAt: new Date() },
    ]);
    expect(result).toBe(true);
    expect(notificationStore).toHaveLength(1);
    expect(notificationStore[0]).toMatchObject({
      userId: "user-1",
      type: "LEAD_FOLLOWUP_OVERDUE",
      link: "/leads?leadId=lead-1",
    });
  });

  it("does not re-notify within the same day", async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const first = await notifyOnceDailyForLead(lead, [
      { nextActionAt: past, occurredAt: new Date() },
    ]);
    const second = await notifyOnceDailyForLead(lead, [
      { nextActionAt: past, occurredAt: new Date() },
    ]);
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(notificationStore).toHaveLength(1);
  });
});
