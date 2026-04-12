import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Convert PDF to JPG | NexusDesk",
  description:
    "Use NexusDesk to convert PDF to JPG with a clean file conversion workflow. Open the converter and move from PDF pages to JPG output.",
  path: "/convert-pdf-to-jpg",
  keywords: ["convert pdf to jpg", "pdf to jpg converter", "pdf page to jpg"],
  robots: {
    index: true,
    follow: true,
  },
});

export default function ConvertPdfToJpgPage() {
  return (
    <SeoLandingPage
      eyebrow="PDF to JPG"
      title="Convert PDF to JPG with the NexusDesk converter"
      intro="Need to convert PDF to JPG for sharing, previews, or image-based workflows? This page explains the NexusDesk PDF to JPG path and links directly to the converter workspace."
      paragraphs={[
        "A PDF to JPG converter is useful when you need individual pages as images for slides, websites, design reviews, or quick visual sharing. NexusDesk gives you a dedicated converter workspace with a clear FROM-to-TO flow.",
        "This landing page exists for high-intent search traffic around PDF to JPG conversion. It gives search engines plain-language HTML about the use case while pointing users into the same NexusDesk converter used for the rest of the product.",
        "If your goal is to turn a PDF into JPG output quickly and keep the workflow inside the NexusDesk environment, the converter page below is the next step.",
      ]}
      ctaHref="/converter"
      ctaLabel="Open Converter"
      secondaryHref="/jpg-to-pdf"
      secondaryLabel="See JPG to PDF"
      highlights={[
        "Useful for image previews, sharing, and visual extraction workflows.",
        "Built around a simple source-format to target-format path.",
        "Supports search intent for PDF to JPG conversion queries.",
      ]}
      relatedLinks={[
        { href: "/jpg-to-png", label: "JPG to PNG landing page" },
        { href: "/png-to-webp", label: "PNG to WEBP landing page" },
        { href: "/jpg-to-pdf", label: "JPG to PDF landing page" },
        { href: "/converter", label: "Converter workspace" },
      ]}
      faq={[
        {
          question: "Why convert PDF to JPG?",
          answer: "People often convert PDF pages to JPG when they need image previews, attachments, slide assets, or visual extracts that are easier to share than a full document.",
        },
        {
          question: "Where do I do the actual conversion?",
          answer: "Use the converter CTA on this page to open the NexusDesk converter workspace and choose the appropriate source and target formats.",
        },
      ]}
    />
  );
}
