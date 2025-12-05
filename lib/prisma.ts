// lib/prisma.ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    '缺少 DATABASE_URL，请在 .env.local 设置，例如：DATABASE_URL="file:./dev.db"'
  );
}

// 防止 Next.js 开发模式下热重载创建多个实例
const globalForPrisma = globalThis as unknown as {
  prisma?: any;
};

// 用 require 动态加载，以绕过 TS 静态导出检查
function loadPrismaClient() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require("@prisma/client");

  if (!PrismaClient) {
    throw new Error(
      "无法从 @prisma/client 加载 PrismaClient，请检查依赖并执行 `npx prisma generate`。"
    );
  }

  return PrismaClient;
}

const adapter = new PrismaBetterSqlite3({
  url, // 例如 file:./dev.db
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
