import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";

type RouteUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function getRouteSessionUser(req: NextRequest): Promise<RouteUser | null> {
  const session = await getServerSession(authOptions);
  const sessionUser = (session as any)?.user as RouteUser | undefined;
  if (sessionUser?.id || sessionUser?.email) return sessionUser;

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token) return null;

  const email = asString(token.email) || null;
  const sub = asString(token.sub);
  const name = asString(token.name) || null;
  const image = asString((token as any).picture) || null;

  return {
    id: email || sub || undefined,
    email,
    name,
    image,
  };
}
