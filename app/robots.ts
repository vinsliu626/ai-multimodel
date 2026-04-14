import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site-url";

export const revalidate = 86400;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/account"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
