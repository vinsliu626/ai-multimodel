import { Prisma } from "@prisma/client";

type RetryOptions = {
  maxRetries?: number;
  retryDelayMs?: number;
};

const TRANSIENT_CODES = new Set(["E57P01", "57P01", "P1001", "P1002", "P1017"]);

const TRANSIENT_MESSAGE_PATTERNS = [
  "terminating connection due to administrator command",
  "connection reset",
  "econnreset",
  "server closed the connection unexpectedly",
  "e57p01",
  "57p01",
];

function getErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim().length > 0) return code.trim().toUpperCase();
  }
  return null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase();
  if (typeof error === "string") return error.toLowerCase();
  return "";
}

export function isTransientPrismaConnectionError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code && TRANSIENT_CODES.has(code)) return true;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return TRANSIENT_CODES.has(error.code.toUpperCase());
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  const message = getErrorMessage(error);
  return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withPrismaConnectionRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 1;
  const retryDelayMs = options.retryDelayMs ?? 120;

  let retries = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientPrismaConnectionError(error) || retries >= maxRetries) {
        throw error;
      }
      retries += 1;
      if (retryDelayMs > 0) {
        const backoffMs = retryDelayMs * Math.pow(2, retries - 1);
        await sleep(backoffMs);
      }
    }
  }
}
