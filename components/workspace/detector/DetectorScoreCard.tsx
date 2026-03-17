"use client";

import { useEffect, useState } from "react";

function useAnimatedValue(target: number, duration = 850) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}

export function DetectorScoreCard({
  label,
  value,
  accentClass,
  trackClass,
}: {
  label: string;
  value: number;
  accentClass: string;
  trackClass: string;
}) {
  const animated = useAnimatedValue(value);

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">{Math.round(animated)}%</p>
        </div>
        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${accentClass} shadow-[0_0_10px_currentColor]`} />
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/8">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${trackClass}`}
          style={{ width: `${Math.round(animated)}%` }}
        />
      </div>
    </div>
  );
}
