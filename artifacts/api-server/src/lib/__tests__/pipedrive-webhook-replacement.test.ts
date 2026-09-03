import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@workspace/db", () => ({ prisma: {}, Prisma: {} }));
vi.mock("../logger.js", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const { deleteStalePipedriveWebhook, replaceManagedPipedriveWebhook } = await import("../pipedrive.js");
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
    const result = await replaceManagedPipedriveWebhook({
      subscriptionUrl: "https://new.example.com/api/pipedrive/webhook",
      secret: "secret",
      previousId: "11",
    });
    expect(calls).toEqual([
      "POST https://company.pipedrive.com/api/v1/webhooks",
      "DELETE https://company.pipedrive.com/api/v1/webhooks/11",
    ]);
    expect(result.staleWebhookId).toBeNull();
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

  it("reports an old webhook that could not be deleted without failing the replacement", async () => {
    process.env["PIPEDRIVE_API_TOKEN"] = "test-token";
    process.env["PIPEDRIVE_API_DOMAIN"] = "https://company.pipedrive.com";
    globalThis.fetch = vi.fn(async (_url, init) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ data: { id: 22 } }), { status: 200 })
        : new Response("delete failed", { status: 503 }),
    ) as any;
    const result = await replaceManagedPipedriveWebhook({
      subscriptionUrl: "https://new.example.com/api/pipedrive/webhook",
      secret: "secret",
      previousId: "11",
    });
    expect(result).toMatchObject({ id: "22", staleWebhookId: "11" });
    expect(result.cleanupError).toContain("503");
  });

  it("refuses to clean up the currently managed webhook", async () => {
    globalThis.fetch = vi.fn();
    await expect(
      deleteStalePipedriveWebhook({ staleId: "22", managedId: "22" }),
    ).rejects.toThrow("currently managed");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});