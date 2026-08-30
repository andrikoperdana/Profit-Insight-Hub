import { describe, expect, it, vi } from "vitest";
import {
  isBenignIdlePoolClose,
  isRetriableOperation,
  isTransientConnectionError,
  withConnectionRetry,
} from "@workspace/db/connection-retry";

function droppedIdleConnection(): Error & { code: string } {
  return Object.assign(new Error("Server has closed the connection."), {
    code: "P1017",
  });
}

function testOptions() {
  return {
    maxAttempts: 3,
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
    },
    random: () => 0,
    sleep: vi.fn(async () => undefined),
  };
}

describe("database connection retry reliability", () => {
  it("returns a successful read after a dropped idle connection", async () => {
    const options = testOptions();
    const run = vi
      .fn<() => Promise<{ status: number }>>()
      .mockRejectedValueOnce(droppedIdleConnection())
      .mockResolvedValueOnce({ status: 200 });

    const result = await withConnectionRetry(run, "Project.findMany", true, options);

    expect(result).toEqual({ status: 200 });
    expect(run).toHaveBeenCalledTimes(2);
    expect(options.sleep).toHaveBeenCalledTimes(1);
    expect(options.logger.warn).toHaveBeenCalledOnce();
    expect(options.logger.error).not.toHaveBeenCalled();
  });

  it("logs one meaningful error when reconnect attempts are exhausted", async () => {
    const options = testOptions();
    const finalError = droppedIdleConnection();
    const run = vi.fn<() => Promise<never>>().mockRejectedValue(finalError);

    await expect(
      withConnectionRetry(run, "Project.findMany", true, options),
    ).rejects.toBe(finalError);

    expect(run).toHaveBeenCalledTimes(3);
    expect(options.logger.warn).toHaveBeenCalledTimes(2);
    expect(options.logger.error).toHaveBeenCalledWith(
      "[db] connection retry exhausted on Project.findMany (code=P1017) after 3 attempts",
      finalError,
    );
  });

  it("does not replay a write that could have committed before disconnecting", async () => {
    const options = testOptions();
    const error = droppedIdleConnection();
    const run = vi.fn<() => Promise<never>>().mockRejectedValue(error);

    await expect(
      withConnectionRetry(run, "Expense.create", false, options),
    ).rejects.toBe(error);

    expect(run).toHaveBeenCalledOnce();
    expect(options.logger.warn).not.toHaveBeenCalled();
    expect(options.logger.error).toHaveBeenCalledWith(
      "[db] transient connection failure on Expense.create (code=P1017); operation is not safe to retry",
      error,
    );
  });

  it("keeps retry eligibility limited to reads", () => {
    expect(isRetriableOperation("findMany", {})).toBe(true);
    expect(isRetriableOperation("update", { data: { status: "APPROVED" } })).toBe(false);
    expect(
      isRetriableOperation("update", {
        data: { tasks: { create: { title: "Nested write" } } },
      }),
    ).toBe(false);
    expect(isRetriableOperation("create", { data: {} })).toBe(false);
  });

  it("recognizes both Prisma codes and idle-close messages", () => {
    expect(isTransientConnectionError({ code: "P1001" })).toBe(true);
    expect(
      isTransientConnectionError(new Error("terminating connection due to administrator command 57P01")),
    ).toBe(true);
    expect(isTransientConnectionError({ code: "P2002" })).toBe(false);
  });

  it("filters only the exact benign idle-pool close event", () => {
    expect(
      isBenignIdlePoolClose(
        "Error in PostgreSQL connection: Error { kind: Closed, cause: None }",
      ),
    ).toBe(true);
    expect(
      isBenignIdlePoolClose(
        "Invalid `prisma.project.findMany()` invocation: Server has closed the connection.",
      ),
    ).toBe(false);
    expect(isBenignIdlePoolClose("Unique constraint failed on Project.projectId")).toBe(false);
  });
});