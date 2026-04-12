import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "AI Humanizer | NexusDesk",
  description:
    "Rewrite text with the NexusDesk AI Humanizer to improve flow, readability, and natural phrasing while keeping the original meaning intact.",
  path: "/humanizer",
  keywords: ["AI humanizer", "rewrite AI text", "make AI text sound natural", "AI writing humanizer"],
  robots: {
    index: true,
    follow: true,
  },
});

export default function HumanizerPage() {
  return (
    <SeoLandingPage
      eyebrow="AI Humanizer"
      title="AI Humanizer for more natural phrasing and readability"
      intro="NexusDesk AI Humanizer is the public entry page for users who need smoother wording, better rhythm, and more natural text without changing the core meaning."
      paragraphs={[
        "Searchers looking for an AI humanizer usually want to improve writing flow, reduce robotic phrasing, and make generated or awkward text sound more human. This landing page explains that use case clearly and links straight into the tool mode in NexusDesk.",
        "The humanizer works well after AI detection or after draft generation, especially when a passage feels repetitive, stiff, or overly polished. It fits naturally into a broader editing workflow instead of existing as an isolated gimmick.",
        "From an SEO perspective, the route adds crawlable text content for humanizer-related queries while still keeping the real workspace interface behind the main product shell.",
      ]}
      ctaHref="/chat?mode=humanizer"
      ctaLabel="Open AI Humanizer"
      secondaryHref="/ai-detector"
      secondaryLabel="See AI Detector"
      highlights={[
        "Improves wording and readability without changing the goal of the text.",
        "Useful after AI detection or draft generation.",
        "Supports search discovery for humanizer-focused queries.",
      ]}
      relatedLinks={[
        { href: "/ai-detector", label: "AI Detector landing page" },
        { href: "/ai-note", label: "AI Note landing page" },
        { href: "/ai-study", label: "AI Study landing page" },
        { href: "/converter", label: "Converter workspace" },
      ]}
      faq={[
        {
          question: "What is an AI humanizer used for?",
          answer: "It is used to rewrite stiff or machine-like text so the phrasing feels more natural, readable, and consistent with human writing patterns.",
        },
        {
          question: "Should I run AI Detector or Humanizer first?",
          answer: "A common flow is to review the text with AI Detector first, then use Humanizer to revise sections that feel too mechanical.",
        },
      ]}
    />
  );
}
