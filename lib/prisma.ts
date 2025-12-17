// lib/prisma.ts
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// ✅ Node 环境下给 Neon 配 WebSocket（Neon 官方写法）
neonConfig.webSocketConstructor = ws;
// 如果你需要 Edge 才开这个：neonConfig.poolQueryViaFetch = true

const adapter = new PrismaNeon({ connectionString });

export const prisma =
  global.prisma ??
  new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") global.prisma = prisma;
