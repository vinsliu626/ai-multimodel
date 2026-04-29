import type { ReactNode } from "react";

import { SeoLandingSection } from "@/components/seo/SeoLandingSection";
import type { ToolSeoContent } from "@/lib/seo/toolPageContent";

export function ToolLandingPageSection({
  hero,
  children,
}: {
  hero: ToolSeoContent;
  children: ReactNode;
}) {
  return (
    <>
      <section className="mx-auto w-full max-w-7xl px-4 pt-8 md:px-8 md:pt-10">
        <div className="mb-8 max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{hero.heroEyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl md:text-5xl">
            {hero.heroTitle}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-300">{hero.heroSubtitle}</p>
        </div>

        {children}
      </section>

      <SeoLandingSection content={hero} />
    </>
  );
}
