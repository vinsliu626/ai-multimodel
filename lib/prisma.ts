// lib/prisma.ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const dbUrl = process.env.DATABASE_URL || "file:./dev.db";

const globalForPrisma = globalThis as unknown as {
  prisma?: any;
};

function loadPrismaClient() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("@prisma/client");
  const PrismaClient = mod?.PrismaClient;

  if (!PrismaClient) {
    throw new Error(
      "无法从 @prisma/client 加载 PrismaClient，请检查依赖并执行 `npx prisma generate`。"
    );
  }

  return PrismaClient;
}

const adapter = new PrismaBetterSqlite3({
  url: dbUrl,
});

export const prisma =
  globalForPrisma.prisma ??
  new (loadPrismaClient())({
    adapter,
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
