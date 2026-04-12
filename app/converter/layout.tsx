import type { ReactNode } from "react";

import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "File Converter | NexusDesk",
  description:
    "Convert PDF, JPG, PNG, WEBP, and other supported files inside the NexusDesk converter workspace with a clear format-to-format flow.",
  path: "/converter",
  keywords: ["file converter", "pdf converter", "jpg to png", "png to webp", "jpg to pdf"],
  robots: {
    index: true,
    follow: true,
  },
});

export default function ConverterLayout({ children }: { children: ReactNode }) {
  return children;
}
