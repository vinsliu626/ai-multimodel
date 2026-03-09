// lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { withPrismaConnectionRetry } from "@/lib/prismaRetry";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaStartupCheckPromise?: Promise<void>;
};

function summarizeDatabaseUrl(value: string | undefined): string {
  if (!value) return "missing";
  try {
    const url = new URL(value);
    const dbName = url.pathname.replace(/^\//, "") || "(none)";
    return `${url.protocol}//${url.hostname}:${url.port || "(default)"}/${dbName}`;
  } catch {
    return "present (invalid url format)";
  }
}

function createPrismaClient() {
  const isProd = process.env.NODE_ENV === "production";
  const dbUrlSummary = summarizeDatabaseUrl(process.env.DATABASE_URL);
  console.info("[prisma] initializing client", {
    nodeEnv: process.env.NODE_ENV ?? "(unset)",
    databaseUrl: dbUrlSummary,
    directUrlPresent: Boolean(process.env.DIRECT_URL),
    useGlobalCache: !isProd,
  });

  return new PrismaClient({
    log: ["error", "warn"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function runDevStartupCheck() {
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") return;
  if (globalForPrisma.prismaStartupCheckPromise) return;

  globalForPrisma.prismaStartupCheckPromise = (async () => {
    const startedAt = Date.now();
    try {
      await withPrismaConnectionRetry(
        async () => {
          await prisma.$connect();
          await prisma.$queryRaw`SELECT 1`;
        },
        { maxRetries: 2, retryDelayMs: 200, operationName: "startup-db-check" }
      );
      console.info("[prisma] startup connectivity check passed", {
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[prisma] startup connectivity check failed", {
        durationMs: Date.now() - startedAt,
        message,
      });
    }
  })();
}

runDevStartupCheck();
