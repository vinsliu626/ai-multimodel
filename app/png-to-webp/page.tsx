import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "PNG to WEBP Converter | NexusDesk",
  description:
    "Convert PNG to WEBP with NexusDesk to prepare lighter image files for web delivery and modern asset pipelines.",
  path: "/png-to-webp",
  keywords: ["png to webp", "convert png to webp", "png webp converter"],
  robots: {
    index: true,
    follow: true,
  },
});

export default function PngToWebpPage() {
  return (
    <SeoLandingPage
      eyebrow="PNG to WEBP"
      title="Convert PNG to WEBP for lighter web-ready images"
      intro="PNG to WEBP is a high-intent conversion path for people optimizing images for sites, apps, and performance-focused delivery. This NexusDesk page explains the workflow and links to the converter."
      paragraphs={[
        "WEBP is commonly chosen when users want smaller image files and a format that fits modern web delivery. That makes PNG to WEBP a strong search-intent route and a practical addition to the NexusDesk public surface.",
        "The page gives search engines direct text about PNG to WEBP conversion instead of forcing discovery through the interactive app alone. It also keeps the visual treatment consistent with the existing NexusDesk design language.",
        "Use the CTA below to open the converter workspace and handle the actual image conversion inside the product.",
      ]}
      ctaHref="/converter"
      ctaLabel="Open Converter"
      secondaryHref="/jpg-to-png"
      secondaryLabel="See JPG to PNG"
      highlights={[
        "Built for web-ready image optimization intent.",
        "Creates a dedicated indexable route for PNG to WEBP queries.",
        "Routes users into the existing NexusDesk converter workflow.",
      ]}
      relatedLinks={[
        { href: "/jpg-to-png", label: "JPG to PNG landing page" },
        { href: "/jpg-to-pdf", label: "JPG to PDF landing page" },
        { href: "/convert-pdf-to-jpg", label: "PDF to JPG landing page" },
        { href: "/converter", label: "Converter workspace" },
      ]}
      faq={[
        {
          question: "Why convert PNG to WEBP?",
          answer: "PNG to WEBP is common when users want lighter web image files while staying in a modern delivery format used across websites and apps.",
        },
        {
          question: "How do I start the conversion?",
          answer: "Open the NexusDesk converter from the CTA, choose PNG as the source format, and select WEBP as the target format.",
        },
      ]}
    />
  );
}
