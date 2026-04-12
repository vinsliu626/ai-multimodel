import type { ReactNode } from "react";

import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Workspace | NexusDesk",
  description: "Private NexusDesk workspace for chat, AI Note, AI Detector, AI Study, Humanizer, and Converter tools.",
  path: "/chat",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
});

export default function ChatLayout({ children }: { children: ReactNode }) {
  return children;
}
