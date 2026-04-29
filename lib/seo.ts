import type { Metadata } from "next";
import { absoluteUrl, getSiteUrl } from "@/lib/site-url";

export const SITE_NAME = "NexusDesk";
export { absoluteUrl, getSiteUrl } from "@/lib/site-url";

type MetadataInput = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  robots?: Metadata["robots"];
};

export function buildMetadata({ title, description, path, keywords, robots }: MetadataInput): Metadata {
  return {
    metadataBase: new URL(getSiteUrl()),
    title,
    description,
    keywords,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: absoluteUrl(path),
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots,
  };
}

export function buildArticleMetadata({ title, description, path, keywords, robots }: MetadataInput): Metadata {
  return {
    metadataBase: new URL(getSiteUrl()),
    title,
    description,
    keywords,
    alternates: {
      canonical: absoluteUrl(path),
    },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title,
      description,
      url: absoluteUrl(path),
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots,
  };
}
