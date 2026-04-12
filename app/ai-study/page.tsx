import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "AI Study Tools | NexusDesk",
  description:
    "Use NexusDesk AI Study to turn uploaded documents into notes, flashcards, and quiz sets for faster revision and exam prep.",
  path: "/ai-study",
  keywords: ["AI study tool", "study notes generator", "flashcard generator", "quiz generator"],
  robots: {
    index: true,
    follow: true,
  },
});

export default function AiStudyPage() {
  return (
    <SeoLandingPage
      eyebrow="AI Study"
      title="AI Study tools for notes, flashcards, and quiz generation"
      intro="NexusDesk AI Study is the public landing page for document-driven study generation. Upload source files, extract the important information, and turn it into practical revision material."
      paragraphs={[
        "This page targets users looking for an AI study tool that can take PDFs, DOCX files, and presentation material and convert them into outputs that are easier to review. It complements the product workspace by providing a public explanation that search engines can index.",
        "Inside the tool, users can generate study notes, flashcards, and quizzes from source documents. That makes it useful for class revision, onboarding materials, internal training, or any document set that needs faster comprehension.",
        "The public landing page also creates a clearer path between discovery and action. Searchers can understand the product in plain language, then open the exact study workflow from the main CTA.",
      ]}
      ctaHref="/chat?mode=study"
      ctaLabel="Open AI Study"
      secondaryHref="/ai-note"
      secondaryLabel="See AI Note"
      highlights={[
        "Designed for document-to-study workflows.",
        "Useful for notes, flashcards, and quiz-style review content.",
        "Adds crawlable copy for search intent around AI study tools.",
      ]}
      relatedLinks={[
        { href: "/ai-note", label: "AI Note landing page" },
        { href: "/ai-detector", label: "AI Detector landing page" },
        { href: "/humanizer", label: "AI Humanizer landing page" },
        { href: "/converter", label: "Converter workspace" },
      ]}
      faq={[
        {
          question: "What files does AI Study work best with?",
          answer: "It is designed for study-oriented source documents such as PDFs, DOCX files, and slide decks that contain material worth extracting and reviewing.",
        },
        {
          question: "Why have a separate AI Study page?",
          answer: "The route gives NexusDesk an indexable public page for study-related searches instead of relying only on the gated workspace UI.",
        },
      ]}
    />
  );
}
