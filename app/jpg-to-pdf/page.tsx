import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "JPG to PDF Converter | NexusDesk",
  description:
    "Convert JPG to PDF with NexusDesk when you need image files packaged as a shareable document format.",
  path: "/jpg-to-pdf",
  keywords: ["jpg to pdf", "convert jpg to pdf", "image to pdf converter"],
  robots: {
    index: true,
    follow: true,
  },
});

export default function JpgToPdfPage() {
  return (
    <SeoLandingPage
      eyebrow="JPG to PDF"
      title="Convert JPG to PDF for shareable document output"
      intro="JPG to PDF is useful when you need image files turned into a document that is easier to send, archive, or include in a workflow that expects PDF output."
      paragraphs={[
        "People often search for a JPG to PDF converter when they are packaging screenshots, scans, forms, or image assets into a single document flow. This NexusDesk landing page targets that intent directly and then points them into the converter workspace.",
        "The route improves crawlability by adding descriptive HTML around a specific conversion job instead of relying only on the interactive converter screen. That gives search engines a stronger content signal for JPG to PDF queries.",
        "If you want to move images into a PDF workflow inside NexusDesk, open the converter below and pick the matching source and target formats.",
      ]}
      ctaHref="/converter"
      ctaLabel="Open Converter"
      secondaryHref="/convert-pdf-to-jpg"
      secondaryLabel="See PDF to JPG"
      highlights={[
        "Useful for sending images as one document.",
        "Targets a specific image-to-document conversion intent.",
        "Supports the NexusDesk converter without redesigning it.",
      ]}
      relatedLinks={[
        { href: "/convert-pdf-to-jpg", label: "PDF to JPG landing page" },
        { href: "/jpg-to-png", label: "JPG to PNG landing page" },
        { href: "/png-to-webp", label: "PNG to WEBP landing page" },
        { href: "/converter", label: "Converter workspace" },
      ]}
      faq={[
        {
          question: "Why would I convert JPG to PDF?",
          answer: "JPG to PDF is common for scans, screenshots, forms, and image bundles that need to be shared or stored in a document format.",
        },
        {
          question: "Is the converter part of NexusDesk?",
          answer: "Yes. This page is the indexable public landing page and the CTA opens the existing NexusDesk converter workspace.",
        },
      ]}
    />
  );
}
