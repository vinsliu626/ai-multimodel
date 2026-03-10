import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";

function hasEnv(name: string) {
  return (process.env[name] ?? "").trim().length > 0;
}

const providers = [];

if (hasEnv("GITHUB_CLIENT_ID") || hasEnv("GITHUB_ID")) {
  providers.push(
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET || "",
    })
  );
}

if (hasEnv("GOOGLE_CLIENT_ID") && hasEnv("GOOGLE_CLIENT_SECRET")) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    })
  );
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers,
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async session({ session, token }) {
      const email = (token?.email as string) || session.user?.email || "";
      (session.user as any).id = email || (token?.sub as string) || "";
      return session;
    },
  },
};
