import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
// 可选：避免 Next.js 误缓存 auth 路由
export const dynamic = "force-dynamic";

function assertEnv() {
  const url = process.env.NEXTAUTH_URL;
  const secretLen = (process.env.NEXTAUTH_SECRET ?? "").length;

  // 这两行会直接告诉你：next start 是否读到了 env
  console.log("[NEXTAUTH] NEXTAUTH_URL =", url);
  console.log("[NEXTAUTH] NEXTAUTH_SECRET_LEN =", secretLen);

  // 生产模式下，没有 secret 基本就是“session 永远 {}”
  if (process.env.NODE_ENV === "production" && secretLen === 0) {
    console.error(
      "[NEXTAUTH] FATAL: NEXTAUTH_SECRET is missing in production. " +
        "Set NEXTAUTH_SECRET in .env.local (or environment variables) and restart."
    );
  }
}

assertEnv();

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };