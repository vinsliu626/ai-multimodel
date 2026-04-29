import Link from "next/link";

import type { BlogPost } from "@/lib/blog/posts";
import { getBlogPostUrl, getRelatedBlogPosts } from "@/lib/blog/posts";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export function BlogArticlePage({ post }: { post: BlogPost }) {
  const relatedPosts = getRelatedBlogPosts(post.slug);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030303] px-4 py-10 text-slate-100 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#ffffff04_1px,transparent_1px),linear-gradient(to_bottom,#ffffff04_1px,transparent_1px)] bg-[size:34px_34px] opacity-50" />
      <div className="pointer-events-none absolute -top-24 left-1/4 h-[30rem] w-[30rem] rounded-full bg-blue-600/10 blur-[90px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[34rem] w-[34rem] rounded-full bg-emerald-500/10 blur-[120px]" />

      <div className="relative mx-auto max-w-5xl space-y-8">
        <nav aria-label="Breadcrumb" className="text-sm text-slate-400">
          <Link href="/" className="transition hover:text-slate-200">
            Home
          </Link>
          <span className="px-2 text-slate-600">/</span>
          <Link href="/blog" className="transition hover:text-slate-200">
            Blog
          </Link>
          <span className="px-2 text-slate-600">/</span>
          <span className="text-slate-300">{post.title}</span>
        </nav>

        <article className="overflow-hidden rounded-[32px] border border-white/10 bg-[#060606]/95 shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
          <header className="border-b border-white/10 bg-gradient-to-r from-white/[0.04] via-blue-500/[0.06] to-emerald-400/[0.06] px-6 py-8 sm:px-8">
            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
              <span>{post.category}</span>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              <span className="h-1 w-1 rounded-full bg-slate-600" />
              <span>{post.readingTime}</span>
            </div>
            <h1 className="mt-4 max-w-4xl text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">{post.title}</h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">{post.description}</p>
          </header>

          <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0">
              <div className="max-w-none">
                <p className="text-base leading-8 text-slate-300">{post.intro}</p>
              </div>

              <div className="mt-10 space-y-10">
                {post.sections.map((section) => (
                  <section key={section.heading}>
                    <h2 className="text-2xl font-semibold tracking-tight text-slate-50">{section.heading}</h2>
                    <div className="mt-4 space-y-4 text-[15px] leading-8 text-slate-300 [&_a]:font-medium [&_a]:text-blue-300 [&_a]:underline [&_a]:decoration-blue-400/50 [&_a]:underline-offset-4">
                      {section.paragraphs.map((paragraph) => (
                        <p key={paragraph} dangerouslySetInnerHTML={{ __html: paragraph }} />
                      ))}
                    </div>

                    {section.bullets?.length ? (
                      <ul className="mt-5 space-y-3 text-[15px] leading-8 text-slate-300">
                        {section.bullets.map((bullet) => (
                          <li key={bullet} className="flex gap-3">
                            <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {section.toolLinks?.length ? (
                      <div className="mt-5 flex flex-wrap gap-3">
                        {section.toolLinks.map((link) => (
                          <Link
                            key={`${section.heading}-${link.href}`}
                            href={link.href}
                            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 transition hover:border-blue-400/30 hover:bg-white/10"
                          >
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>

              <section className="mt-12 rounded-[28px] border border-emerald-400/20 bg-emerald-400/8 p-6">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-50">{post.ctaTitle}</h2>
                <p className="mt-3 max-w-2xl text-[15px] leading-8 text-slate-300">{post.ctaDescription}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {post.ctaLinks.map((link, index) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={
                        index === 0
                          ? "inline-flex items-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:scale-[1.02]"
                          : "inline-flex items-center rounded-full border border-white/10 bg-black/20 px-5 py-3 text-sm text-slate-100 transition hover:bg-white/10"
                      }
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Related NexusDesk tools</h2>
                <div className="mt-4 grid gap-3">
                  {post.ctaLinks.map((link) => (
                    <Link
                      key={`aside-${link.href}`}
                      href={link.href}
                      className="rounded-[18px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-slate-200 transition hover:border-blue-400/30 hover:bg-white/[0.05]"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </section>

              <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">More articles</h2>
                <div className="mt-4 space-y-3">
                  {relatedPosts.map((relatedPost) => (
                    <Link
                      key={relatedPost.slug}
                      href={getBlogPostUrl(relatedPost.slug)}
                      className="block rounded-[18px] border border-white/8 bg-black/20 px-4 py-4 text-sm text-slate-200 transition hover:border-emerald-400/30 hover:bg-white/[0.05]"
                    >
                      <span className="block font-medium text-slate-100">{relatedPost.title}</span>
                      <span className="mt-2 block text-xs uppercase tracking-[0.18em] text-slate-500">{relatedPost.category}</span>
                    </Link>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </article>
      </div>
    </main>
  );
}
