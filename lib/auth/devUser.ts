// lib/auth/devUser.ts
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function getUserIdOrDev() {
  // ✅ 本地绕过：只建议本地用
  if (process.env.DEV_BYPASS_AUTH === "true") {
    return "dev_user";
  }

  const session = await getServerSession(authOptions);
  return (session as any)?.user?.id as string | undefined;
}
