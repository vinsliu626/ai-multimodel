import type { Metadata } from "next";

export const SITE_NAME = "NexusDesk";
const FALLBACK_SITE_URL = "https://nexusdesk.app";

export function getSiteUrl() {
  const candidate =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.OPENROUTER_SITE_URL ||
    FALLBACK_SITE_URL;

  try {
    return new URL(candidate).toString().replace(/\/$/, "");
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export function absoluteUrl(path = "/") {
  return new URL(path, `${getSiteUrl()}/`).toString();
}

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
