type StepCard = {
  title: string;
  description: string;
};

export function HowItWorksSteps({
  title,
  intro,
  steps,
}: {
  title: string;
  intro: string;
  steps: StepCard[];
}) {
  return (
    <section className="mt-16">
      <div className="mb-6 max-w-3xl">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">{title}</h2>
        <p className="mt-3 text-base leading-8 text-slate-400">{intro}</p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {steps.map((step, index) => (
          <article
            key={step.title}
            className="rounded-[28px] border border-slate-800/80 bg-[linear-gradient(180deg,rgba(9,12,21,0.94)_0%,rgba(4,8,20,0.98)_100%)] px-6 py-6 shadow-[0_20px_50px_rgba(2,6,23,0.32)]"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-blue-400/20 bg-blue-400/10 text-lg font-semibold text-blue-100">
                {index + 1}
              </div>
              <h3 className="text-xl font-semibold tracking-tight text-slate-50">{step.title}</h3>
            </div>
            <p className="mt-5 text-sm leading-7 text-slate-300">{step.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
