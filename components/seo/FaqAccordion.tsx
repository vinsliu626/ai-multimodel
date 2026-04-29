type FaqItem = {
  question: string;
  answer: string;
};

export function FaqAccordion({
  title,
  items,
}: {
  title: string;
  items: FaqItem[];
}) {
  return (
    <section className="mt-16">
      <div className="mb-6 max-w-3xl">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">{title}</h2>
        <p className="mt-3 text-base leading-8 text-slate-400">
          Direct answers for the decisions students, educators, and busy teams usually need to make before they trust a tool.
        </p>
      </div>

      <div className="space-y-4">
        {items.map((item) => (
          <details
            key={item.question}
            className="group rounded-[24px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(10,14,24,0.94)_0%,rgba(5,8,18,0.98)_100%)] px-5 py-4 shadow-[0_18px_42px_rgba(2,6,23,0.28)]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
              <span className="text-lg font-semibold tracking-tight text-slate-50">{item.question}</span>
              <span className="text-slate-500 transition group-open:rotate-45 group-open:text-blue-300">+</span>
            </summary>
            <p className="mt-4 border-t border-slate-800 pt-4 text-sm leading-7 text-slate-300">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
