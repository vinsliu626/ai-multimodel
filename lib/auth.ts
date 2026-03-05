import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET || "",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async session({ session, token }) {
      const email = (token?.email as string) || session.user?.email || "";
      (session.user as any).id = email || (token?.sub as string) || "";
      return session;
    },
  },
};
