import type { ReactNode } from "react";
import Link from "next/link";

import { FaqAccordion } from "@/components/seo/FaqAccordion";
import { FeatureAudienceCards } from "@/components/seo/FeatureAudienceCards";
import { HowItWorksSteps } from "@/components/seo/HowItWorksSteps";
import { RelatedToolsGrid } from "@/components/seo/RelatedToolsGrid";
import type { ToolSeoContent } from "@/lib/seo/toolPageContent";

const relatedTools = [
  {
    href: "/ai-detector",
    title: "AI Detector",
    description: "Check drafts for AI-like writing patterns and review suspicious passages before you submit.",
    category: "Content Analysis",
  },
  {
    href: "/ai-humanizer",
    title: "AI Humanizer",
    description: "Smooth stiff wording and make text read more naturally while preserving the original meaning.",
    category: "Content Analysis",
  },
  {
    href: "/ai-note",
    title: "AI Note",
    description: "Turn recordings, lectures, and source text into structured notes you can study from later.",
    category: "Study Tools",
  },
  {
    href: "/ai-study",
    title: "AI Study",
    description: "Generate revision-ready notes, flashcards, and quiz sets from documents and study material.",
    category: "Study Tools",
  },
  {
    href: "/converter",
    title: "Converter",
    description: "Handle PDF, image, and document conversion tasks quickly without leaving the workspace.",
    category: "File Tools",
  },
  {
    href: "/blog",
    title: "Blog",
    description: "Read practical guides on studying, note-taking, AI writing review, and productivity workflows.",
    category: "Resources",
  },
] as const;

const footerGroups = [
  {
    title: "Content Analysis",
    links: [
      { href: "/ai-detector", label: "AI Detector" },
      { href: "/ai-humanizer", label: "AI Humanizer" },
    ],
  },
  {
    title: "Study Tools",
    links: [
      { href: "/ai-note", label: "AI Note" },
      { href: "/ai-study", label: "AI Study" },
      { href: "/blog", label: "Blog" },
    ],
  },
  {
    title: "File Tools",
    links: [
      { href: "/converter", label: "Converter" },
      { href: "/convert-pdf-to-jpg", label: "PDF to JPG" },
      { href: "/jpg-to-pdf", label: "JPG to PDF" },
      { href: "/png-to-webp", label: "PNG to WEBP" },
    ],
  },
  {
    title: "Other",
    links: [
      { href: "/", label: "All tools" },
      { href: "/sitemap.xml", label: "Sitemap" },
    ],
  },
] as const;

export function SeoLandingSection({ content }: { content: ToolSeoContent }) {
  const renderNodes = (nodes: ReactNode[]) =>
    nodes.map((node, index) => (
      <p
        key={index}
        className="[&_a]:font-medium [&_a]:text-slate-900 [&_a]:underline [&_a]:decoration-slate-300 [&_a]:underline-offset-4"
      >
        {node}
      </p>
    ));

  return (
    <section aria-label={content.seoTitle} className="mx-auto mt-20 w-full max-w-7xl px-4 pb-18 md:px-8">
      <div className="relative overflow-hidden rounded-[40px] border border-slate-800/80 bg-[linear-gradient(180deg,#020617_0%,#040816_38%,#050816_100%)] shadow-[0_28px_110px_rgba(2,6,23,0.42)]">
        <div className="pointer-events-none absolute inset-x-12 top-0 h-28 bg-[radial-gradient(circle,rgba(59,130,246,0.2)_0%,rgba(3,7,18,0)_72%)] blur-3xl" />
        <div className="pointer-events-none absolute right-0 bottom-0 h-48 w-48 rounded-full bg-cyan-400/6 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/35 to-transparent" />

        <article className="relative mx-auto max-w-6xl px-5 py-10 sm:px-8 md:px-10 md:py-14">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{content.guideLabel}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">{content.seoTitle}</h2>
            <p className="mt-4 text-base leading-8 text-slate-300">{content.overviewIntro}</p>
          </div>

          <section className="mt-14 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[32px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(10,14,24,0.94)_0%,rgba(5,8,18,0.98)_100%)] px-6 py-6 shadow-[0_20px_50px_rgba(2,6,23,0.32)]">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-50">What is {content.productName}?</h2>
              <div className="mt-5 space-y-4 text-[15px] leading-8 text-slate-300 [&_a]:font-medium [&_a]:text-blue-300 [&_a]:underline [&_a]:decoration-blue-400/45 [&_a]:underline-offset-4">
                {renderNodes(content.whatIs)}
              </div>
            </div>

            <div className="rounded-[32px] border border-indigo-500/16 bg-[linear-gradient(180deg,rgba(17,24,39,0.96)_0%,rgba(8,14,29,0.98)_100%)] px-6 py-6 text-slate-100 shadow-[0_18px_44px_rgba(15,23,42,0.22)]">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">How it works</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">How does it work?</h2>
              <div className="mt-5 space-y-4 text-[15px] leading-8 text-slate-300 [&_a]:font-medium [&_a]:text-blue-300 [&_a]:underline [&_a]:decoration-blue-400/45 [&_a]:underline-offset-4">
                {content.howItWorks.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </div>
          </section>

          <FeatureAudienceCards title={content.audienceTitle} cards={content.audiences} />

          <HowItWorksSteps title="How to use it" intro={content.stepsIntro} steps={content.steps} />

          <section className="mt-16 grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="relative overflow-hidden rounded-[32px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(8,12,22,0.98)_0%,rgba(3,7,18,1)_100%)] px-6 py-6 text-white shadow-[0_18px_44px_rgba(15,23,42,0.22)]">
              <div className="absolute top-6 right-6 h-24 w-24 rounded-full bg-blue-400/16 blur-2xl" />
              <div className="absolute bottom-6 left-8 h-16 w-16 rounded-full bg-emerald-400/12 blur-xl" />
              <div className="relative flex min-h-[260px] flex-col justify-between">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                    <div className="h-10 w-10 rounded-2xl bg-blue-400/15 p-2">
                      <div className="h-full w-full rounded-xl border border-blue-300/40" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-white">Responsible use</p>
                    <p className="mt-2 text-sm leading-7 text-slate-300">Clear inputs, clear review, better decisions.</p>
                  </div>
                  <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                    <div className="h-10 w-10 rounded-2xl bg-emerald-400/15 p-2">
                      <div className="h-full w-full rounded-full border border-emerald-300/40" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-white">Academic flow</p>
                    <p className="mt-2 text-sm leading-7 text-slate-300">Notes, study, review, and file prep in one route.</p>
                  </div>
                </div>
                <div className="mt-6 rounded-[26px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full bg-blue-300" />
                    <span className="h-3 w-3 rounded-full bg-slate-500" />
                    <span className="h-3 w-3 rounded-full bg-emerald-300" />
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-200">Input</div>
                    <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-200">Review</div>
                    <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-200">Improve</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(10,14,24,0.94)_0%,rgba(5,8,18,0.98)_100%)] px-6 py-6 shadow-[0_20px_50px_rgba(2,6,23,0.32)]">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Trust and value</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">{content.trustTitle}</h2>
              <div className="mt-5 space-y-4 text-[15px] leading-8 text-slate-300 [&_a]:font-medium [&_a]:text-blue-300 [&_a]:underline [&_a]:decoration-blue-400/45 [&_a]:underline-offset-4">
                {content.trustParagraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-16 grid gap-6 lg:grid-cols-2">
            <div className="rounded-[32px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(10,14,24,0.94)_0%,rgba(5,8,18,0.98)_100%)] px-6 py-6 shadow-[0_20px_50px_rgba(2,6,23,0.32)]">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-50">Key benefits</h2>
              <div className="mt-6 grid gap-4">
                {content.benefits.map((benefit) => (
                  <div key={benefit.title} className="rounded-[24px] border border-slate-800/80 bg-white/[0.03] px-5 py-5">
                    <div className="flex items-start gap-4">
                      <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-cyan-400" />
                      <div>
                        <h3 className="text-lg font-semibold tracking-tight text-slate-50">{benefit.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-slate-300">{benefit.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(9,12,21,0.94)_0%,rgba(4,8,20,0.98)_100%)] px-6 py-6 shadow-[0_20px_50px_rgba(2,6,23,0.32)]">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-50">Limitations</h2>
              <div className="mt-6 grid gap-4">
                {content.limitations.map((limitation) => (
                  <div key={limitation.title} className="rounded-[24px] border border-slate-800/80 bg-white/[0.03] px-5 py-5">
                    <h3 className="text-lg font-semibold tracking-tight text-slate-50">{limitation.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{limitation.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-16">
            <div className="mb-6 max-w-3xl">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">Use cases</h2>
              <p className="mt-3 text-base leading-8 text-slate-400">{content.useCasesIntro}</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {content.useCases.map((useCase) => (
                <article
                  key={useCase.title}
                  className="rounded-[28px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(10,14,24,0.94)_0%,rgba(5,8,18,0.98)_100%)] px-6 py-6 shadow-[0_18px_46px_rgba(2,6,23,0.3)]"
                >
                  <h3 className="text-xl font-semibold tracking-tight text-slate-50">{useCase.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-slate-300">{useCase.description}</p>
                </article>
              ))}
            </div>
          </section>

          <RelatedToolsGrid title="Related tools" cards={relatedTools.map((card) => ({ ...card }))} />

          <FaqAccordion title="FAQ" items={content.faqs} />

          <section className="mt-16 rounded-[32px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(9,12,21,0.98)_0%,rgba(3,7,18,1)_100%)] px-6 py-8 text-white shadow-[0_20px_50px_rgba(2,6,23,0.34)]">
            <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Internal links</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight">Keep the workflow connected</h2>
                <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                  The strongest NexusDesk pages do not end at one result. Move into the next step immediately, whether that means
                  rewriting flagged passages, building flashcards, or converting a file for class.
                </p>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {footerGroups.map((group) => (
                  <div key={group.title} className="rounded-[24px] border border-white/10 bg-white/[0.04] px-5 py-5">
                    <h3 className="text-lg font-semibold tracking-tight text-white">{group.title}</h3>
                    <div className="mt-4 space-y-3">
                      {group.links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="flex items-center justify-between text-sm text-slate-300 transition hover:text-blue-200"
                        >
                          <span>{link.label}</span>
                          <span className="text-slate-500 hover:text-blue-200">↗</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </article>
      </div>
    </section>
  );
}
