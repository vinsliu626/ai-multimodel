import type { Metadata } from "next";
// Fonts removed to avoid build-time network fetches in production tests.
import "./globals.css";
import Providers from "./providers"; // ✅


export const metadata: Metadata = {
  title: "NexusDesk",
  description: "AI notes, AI detection, multi-model workspace",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-slate-950">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
