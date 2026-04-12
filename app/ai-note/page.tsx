import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "AI Note Generator | NexusDesk",
  description:
    "Turn transcripts, lecture recordings, and source text into structured AI notes with NexusDesk. Generate cleaner study notes from audio or text.",
  path: "/ai-note",
  keywords: ["AI note generator", "lecture note generator", "transcript to notes", "audio to notes"],
  robots: {
    index: true,
    follow: true,
  },
});

export default function AiNotePage() {
  return (
    <SeoLandingPage
      eyebrow="AI Note"
      title="AI Note generator for transcripts, recordings, and study material"
      intro="NexusDesk AI Note helps you turn rough source material into clean, structured notes. Paste text, upload audio, and move from raw content to readable summaries faster."
      paragraphs={[
        "This AI note generator is built for students, researchers, and teams who need better notes from lectures, meetings, or long-form text. Instead of manually rewriting source material, you can use NexusDesk to organize the important points into a cleaner note format.",
        "The page gives search engines crawlable HTML that explains what the tool does, while the actual NexusDesk workspace keeps the interactive note workflow in one place. That means people can discover AI Note through search, then jump directly into the product when they are ready to generate notes.",
        "If you need a transcript to notes workflow, an audio to notes workflow, or a fast way to turn long text into study-ready summaries, this page is the public entry point and the workspace link below opens the correct tool mode.",
      ]}
      ctaHref="/chat?mode=note"
      ctaLabel="Open AI Note"
      secondaryHref="/ai-study"
      secondaryLabel="See AI Study"
      highlights={[
        "Generate notes from audio uploads or pasted source text.",
        "Useful for lectures, meeting recaps, transcript cleanup, and study prep.",
        "Creates a strong indexable entry page for search terms around AI note generation.",
      ]}
      relatedLinks={[
        { href: "/ai-detector", label: "AI Detector landing page" },
        { href: "/ai-study", label: "AI Study landing page" },
        { href: "/humanizer", label: "AI Humanizer landing page" },
        { href: "/converter", label: "Converter workspace" },
      ]}
      faq={[
        {
          question: "What is the difference between AI Note and AI Study?",
          answer: "AI Note focuses on turning source material into a clear note output. AI Study is broader and can produce notes, flashcards, and quiz content from uploaded documents.",
        },
        {
          question: "Can I use AI Note for transcripts?",
          answer: "Yes. The workflow is designed for transcripts, lecture recordings, meeting audio, and pasted text that needs to become structured notes.",
        },
      ]}
    />
  );
}
