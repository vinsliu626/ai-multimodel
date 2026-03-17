"use client";

export function DetectorResultSummary({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-blue-500/10 via-white/[0.03] to-purple-500/10 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Summary</p>
      <h3 className="mt-3 text-base font-semibold leading-6 text-slate-50">{title}</h3>
      <p className="mt-2 text-[13px] leading-6 text-slate-300">{description}</p>
    </div>
  );
}
