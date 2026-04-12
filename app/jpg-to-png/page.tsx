import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "JPG to PNG Converter | NexusDesk",
  description:
    "Convert JPG to PNG with NexusDesk. Use the converter workspace for image format changes when you need lossless PNG output.",
  path: "/jpg-to-png",
  keywords: ["jpg to png", "convert jpg to png", "jpg png converter"],
  robots: {
    index: true,
    follow: true,
  },
});

export default function JpgToPngPage() {
  return (
    <SeoLandingPage
      eyebrow="JPG to PNG"
      title="Convert JPG to PNG for cleaner image workflows"
      intro="The NexusDesk converter supports image-focused workflows such as JPG to PNG, giving users a simple path when they need PNG output for editing, transparency workflows, or cleaner asset handling."
      paragraphs={[
        "JPG to PNG conversion is a common need when users want a format that fits design tools, editing pipelines, or image processing tasks more cleanly. This public page explains that use case and helps search engines understand the converter feature.",
        "Instead of sending users to a generic tools directory, the page matches a precise format-conversion query and then routes them into the main NexusDesk converter workspace. That improves both user intent matching and crawlability.",
        "If you are looking for a JPG to PNG converter in NexusDesk, the CTA below opens the actual conversion tool.",
      ]}
      ctaHref="/converter"
      ctaLabel="Open Converter"
      secondaryHref="/png-to-webp"
      secondaryLabel="See PNG to WEBP"
      highlights={[
        "Good for design, editing, and image asset workflows.",
        "Matches a high-intent image conversion search phrase.",
        "Keeps users inside the same NexusDesk converter experience.",
      ]}
      relatedLinks={[
        { href: "/png-to-webp", label: "PNG to WEBP landing page" },
        { href: "/jpg-to-pdf", label: "JPG to PDF landing page" },
        { href: "/convert-pdf-to-jpg", label: "PDF to JPG landing page" },
        { href: "/converter", label: "Converter workspace" },
      ]}
      faq={[
        {
          question: "Why would I convert JPG to PNG?",
          answer: "Users often want PNG output for editing pipelines, compatibility, or image tasks where PNG is the preferred target format.",
        },
        {
          question: "Does this page include the tool itself?",
          answer: "This route is the SEO landing page. The main call to action opens the converter workspace where the actual file conversion happens.",
        },
      ]}
    />
  );
}
