import type { ReactNode } from "react";

import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Privacy Policy | NexusDesk",
  description:
    "Read the NexusDesk privacy policy, including how account data, temporary processing, cookies, billing systems, and AI providers are handled.",
  path: "/privacy",
  keywords: ["NexusDesk privacy policy", "AI privacy policy", "NexusDesk data handling"],
  robots: {
    index: true,
    follow: true,
  },
});

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return children;
}
