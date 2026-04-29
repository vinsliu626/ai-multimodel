import type { MetadataRoute } from "next";

import { blogPosts, getBlogPostUrl } from "@/lib/blog/posts";
import { absoluteUrl } from "@/lib/site-url";

export const revalidate = 86400;

const routes = [
  "/",
  "/privacy",
  "/chat",
  "/converter",
  "/ai-note",
  "/ai-detector",
  "/ai-study",
  "/ai-humanizer",
  "/blog",
  "/convert-pdf-to-jpg",
  "/jpg-to-png",
  "/png-to-webp",
  "/jpg-to-pdf",
  ...blogPosts.map((post) => getBlogPostUrl(post.slug)),
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: absoluteUrl(route),
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority:
      route === "/"
        ? 1
        : route === "/chat" ||
            route === "/converter" ||
            route === "/ai-note" ||
            route === "/ai-detector" ||
            route === "/ai-study" ||
            route === "/ai-humanizer" ||
            route === "/blog"
        ? 0.9
        : 0.8,
  }));
}
