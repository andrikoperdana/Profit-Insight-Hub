const TRANSIENT_CONNECTION_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);

const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

type RetryLogger = Pick<Console, "warn" | "error">;

type RetryOptions = {
  maxAttempts: number;
  logger?: RetryLogger;
  random?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
};

function errorCode(err: unknown): string {
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : "unknown";
}

export function isTransientConnectionError(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  if (TRANSIENT_CONNECTION_CODES.has(code)) return true;

  const msg = typeof e.message === "string" ? e.message : "";
  return (
    msg.includes("57P01") ||
    msg.includes("terminating connection due to administrator command") ||
    msg.includes("Server has closed the connection") ||
    msg.includes("Can't reach database server") ||
    msg.includes("Connection terminated") ||
    msg.includes("Closed the connection")
  );
}

export function isBenignIdlePoolClose(message: string): boolean {
  return (
    message.trim() ===
    "Error in PostgreSQL connection: Error { kind: Closed, cause: None }"
  );
}

export function isRetriableOperation(operation: string, _args: unknown): boolean {
  return READ_OPERATIONS.has(operation);
}

export async function withConnectionRetry<T>(
  run: () => Promise<T>,
  opLabel: string,
  retriable: boolean,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts));
  const logger = options.logger ?? console;
  const random = options.random ?? Math.random;
  const sleep =
    options.sleep ??
    ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
      const transient = isTransientConnectionError(err);
      const canRetry = transient && retriable && attempt < maxAttempts;

      if (!canRetry) {
        const code = errorCode(err);
        if (transient && retriable) {
          logger.error(
            `[db] connection retry exhausted on ${opLabel} (code=${code}) after ${attempt} attempts`,
            err,
          );
        } else if (transient) {
          logger.error(
            `[db] transient connection failure on ${opLabel} (code=${code}); operation is not safe to retry`,
            err,
          );
        }
        throw err;
      }

      logger.warn(
        `[db] transient connection error on ${opLabel} (code=${errorCode(err)}); retry ${attempt}/${maxAttempts - 1}`,
      );
      const backoff = Math.min(1000, 150 * 2 ** (attempt - 1));
      await sleep(backoff + Math.floor(random() * 100));
    }
  }
  throw lastError;
}