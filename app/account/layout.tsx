import type { ReactNode } from "react";

import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Account | NexusDesk",
  description: "Private NexusDesk account, billing, and usage dashboard.",
  path: "/account",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
});

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
