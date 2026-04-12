import Link from "next/link";

type LinkItem = {
  href: string;
  label: string;
};

type SeoLandingPageProps = {
  eyebrow: string;
  title: string;
  intro: string;
  paragraphs: string[];
  ctaHref: string;
  ctaLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  highlights: string[];
  relatedLinks: LinkItem[];
  faq: Array<{ question: string; answer: string }>;
};

export function SeoLandingPage({
  eyebrow,
  title,
  intro,
  paragraphs,
  ctaHref,
  ctaLabel,
  secondaryHref,
  secondaryLabel,
  highlights,
  relatedLinks,
  faq,
}: SeoLandingPageProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030303] px-4 py-10 text-slate-100 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff04_1px,transparent_1px),linear-gradient(to_bottom,#ffffff04_1px,transparent_1px)] bg-[size:34px_34px] opacity-50" />
      <div className="pointer-events-none absolute -top-32 left-1/4 h-[32rem] w-[32rem] rounded-full bg-blue-600/10 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[36rem] w-[36rem] rounded-full bg-emerald-500/10 blur-[120px]" />

      <div className="relative mx-auto max-w-6xl space-y-8">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[#060606]/95 shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
          <div className="border-b border-white/10 bg-gradient-to-r from-white/[0.04] via-blue-500/[0.06] to-emerald-400/[0.06] px-6 py-6 sm:px-8">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{eyebrow}</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">{title}</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">{intro}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={ctaHref}
                className="inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
              >
                {ctaLabel}
              </Link>
              {secondaryHref && secondaryLabel ? (
                <Link
                  href={secondaryHref}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/10"
                >
                  {secondaryLabel}
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-4">
              {paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-7 text-slate-300 sm:text-[15px]">
                  {paragraph}
                </p>
              ))}
            </div>

            <aside className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Why people use it</h2>
              <ul className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
                {highlights.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-xl font-semibold text-slate-50">Frequently asked</h2>
            <div className="mt-5 space-y-4">
              {faq.map((item) => (
                <div key={item.question} className="rounded-[20px] border border-white/8 bg-black/20 p-4">
                  <h3 className="text-sm font-semibold text-slate-100">{item.question}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-300">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-xl font-semibold text-slate-50">Explore more NexusDesk tools</h2>
            <div className="mt-5 grid gap-3">
              {relatedLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-[18px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-slate-200 transition hover:border-blue-400/30 hover:bg-white/[0.05]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
