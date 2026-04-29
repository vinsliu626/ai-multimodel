type AudienceCard = {
  title: string;
  subtitle: string;
  bullets: string[];
};

export function FeatureAudienceCards({
  title,
  cards,
}: {
  title: string;
  cards: AudienceCard[];
}) {
  return (
    <section className="mt-14">
      <div className="mb-6 max-w-3xl">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">{title}</h2>
        <p className="mt-3 text-base leading-8 text-slate-400">
          Built for real workflows, not vague AI promises. Each group gets a clear reason to use the tool and a practical next
          action inside NexusDesk.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.title}
            className="rounded-[28px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.82)_0%,rgba(7,10,18,0.96)_100%)] px-6 py-6 shadow-[0_20px_50px_rgba(2,6,23,0.32)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Audience</p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-50">{card.title}</h3>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-400/10 text-sm font-semibold text-blue-200">
                {card.title.slice(0, 2).toUpperCase()}
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-300">{card.subtitle}</p>
            <ul className="mt-5 space-y-3">
              {card.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-3 text-sm leading-7 text-slate-300">
                  <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-cyan-400" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
