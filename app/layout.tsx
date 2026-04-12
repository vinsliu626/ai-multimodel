import type { Metadata } from "next";

import "./globals.css";
import Providers from "./providers";
import { SITE_NAME, getSiteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: SITE_NAME,
  title: {
    default: "NexusDesk | AI Note, AI Detector, AI Study, and Converter Tools",
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "NexusDesk is an AI workspace with public landing pages for AI Note, AI Detector, AI Study, Humanizer, and file conversion tools.",
  keywords: [
    "NexusDesk",
    "AI note generator",
    "AI detector",
    "AI study tools",
    "AI humanizer",
    "file converter",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    google: "-V_q2yY-OlZKMUhdL8jAvanAfn1_EIhnFzWLdL-0oRc",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "NexusDesk | AI Note, AI Detector, AI Study, and Converter Tools",
    description:
      "AI workspace with note generation, AI detection, study tools, humanizing, and file conversion workflows.",
    url: getSiteUrl(),
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "NexusDesk | AI Note, AI Detector, AI Study, and Converter Tools",
    description:
      "AI workspace with note generation, AI detection, study tools, humanizing, and file conversion workflows.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-950">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
