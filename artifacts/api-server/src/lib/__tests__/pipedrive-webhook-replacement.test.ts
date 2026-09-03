import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@workspace/db", () => ({ prisma: {}, Prisma: {} }));
vi.mock("../logger.js", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const { replaceManagedPipedriveWebhook } = await import("../pipedrive.js");
const originalFetch = globalThis.fetch;

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env["PIPEDRIVE_API_TOKEN"];
  delete process.env["PIPEDRIVE_API_DOMAIN"];
});

describe("managed Pipedrive webhook replacement", () => {
  it("creates the replacement before deleting the old webhook", async () => {
    process.env["PIPEDRIVE_API_TOKEN"] = "test-token";
    process.env["PIPEDRIVE_API_DOMAIN"] = "https://company.pipedrive.com";
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(`${init?.method} ${String(url)}`);
      return new Response(
        init?.method === "POST" ? JSON.stringify({ data: { id: 22 } }) : JSON.stringify({}),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as any;
    await replaceManagedPipedriveWebhook({
      subscriptionUrl: "https://new.example.com/api/pipedrive/webhook",
      secret: "secret",
      previousId: "11",
    });
    expect(calls).toEqual([
      "POST https://company.pipedrive.com/api/v1/webhooks",
      "DELETE https://company.pipedrive.com/api/v1/webhooks/11",
    ]);
  });

  it("never deletes the old webhook when replacement creation fails", async () => {
    process.env["PIPEDRIVE_API_TOKEN"] = "test-token";
    process.env["PIPEDRIVE_API_DOMAIN"] = "https://company.pipedrive.com";
    globalThis.fetch = vi.fn(async () => new Response("provider failure", { status: 500 })) as any;
    await expect(replaceManagedPipedriveWebhook({
      subscriptionUrl: "https://new.example.com/api/pipedrive/webhook",
      secret: "secret",
      previousId: "11",
    })).rejects.toThrow("provider failure");
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});