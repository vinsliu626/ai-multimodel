// lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    '缺少 DATABASE_URL，请在 .env.local 设置，例如：DATABASE_URL="file:./dev.db"'
  );
}

// 防止 Next.js 开发模式下热重载创建多个实例
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const adapter = new PrismaBetterSqlite3({
  url, // 这里用的就是 file:./dev.db
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
