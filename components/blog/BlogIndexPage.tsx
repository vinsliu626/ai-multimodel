import Link from "next/link";

import { blogPosts, getBlogPostUrl } from "@/lib/blog/posts";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export function BlogIndexPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030303] px-4 py-12 text-slate-100 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff04_1px,transparent_1px),linear-gradient(to_bottom,#ffffff04_1px,transparent_1px)] bg-[size:34px_34px] opacity-50" />
      <div className="pointer-events-none absolute -top-24 left-1/4 h-[30rem] w-[30rem] rounded-full bg-blue-600/10 blur-[90px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[34rem] w-[34rem] rounded-full bg-emerald-500/10 blur-[120px]" />

      <div className="relative mx-auto max-w-6xl space-y-10">
        <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[#060606]/95 shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
          <div className="border-b border-white/10 bg-gradient-to-r from-white/[0.04] via-blue-500/[0.06] to-emerald-400/[0.06] px-6 py-8 sm:px-8">
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">NexusDesk Blog</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
              Practical AI guides for students
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">
              Useful articles on studying, note-taking, AI writing review, and file workflows. Every post connects back to
              the tools students actually use inside NexusDesk.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/ai-study"
                className="inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
              >
                Try NexusDesk for free
              </Link>
              <Link
                href="/"
                className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-slate-100 transition hover:bg-white/10"
              >
                Back to homepage
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-5">
          {blogPosts.map((post) => (
            <article
              key={post.slug}
              className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_18px_45px_rgba(0,0,0,0.24)] transition hover:border-blue-400/25 hover:bg-white/[0.05]"
            >
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
                <span>{post.category}</span>
                <span className="h-1 w-1 rounded-full bg-slate-600" />
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                <span className="h-1 w-1 rounded-full bg-slate-600" />
                <span>{post.readingTime}</span>
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-50">
                <Link href={getBlogPostUrl(post.slug)} className="transition hover:text-blue-300">
                  {post.title}
                </Link>
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 sm:text-[15px]">{post.description}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href={getBlogPostUrl(post.slug)}
                  className="inline-flex items-center rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:scale-[1.02]"
                >
                  Read article
                </Link>
                <Link
                  href={post.relatedToolUrl}
                  className="inline-flex items-center rounded-full border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-slate-200 transition hover:border-emerald-400/30 hover:bg-white/[0.05]"
                >
                  Related tool
                </Link>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

