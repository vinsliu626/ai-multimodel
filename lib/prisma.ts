// lib/prisma.ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    '缺少 DATABASE_URL，请在 .env.local 设置，例如：DATABASE_URL="file:./dev.db"'
  );
}

// 和之前一样：用 url 初始化 adapter
const adapter = new PrismaBetterSqlite3({
  url, // 比如 file:./dev.db
});

// 防止 Next.js 开发模式下热重载创建多个实例
const globalForPrisma = globalThis as unknown as {
  prisma?: any;
};

function createPrismaClient() {
  // 用 require 动态获取，绕开 TS 对导出的静态检查
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require("@prisma/client");

  if (!PrismaClient) {
    throw new Error(
      "无法从 @prisma/client 加载 PrismaClient，请确认已安装依赖并执行过 `npx prisma generate`。"
    );
  }

  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
