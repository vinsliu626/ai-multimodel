"use client";

import { useEffect, useMemo, useState } from "react";

function useAnimatedValue(target: number, duration = 900) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const startValue = value;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(startValue + (target - startValue) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}

export function DetectorProgressRing({ value, label }: { value: number; label: string }) {
  const animated = useAnimatedValue(value);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = useMemo(() => circumference * (1 - animated / 100), [animated, circumference]);

  return (
    <div className="relative flex h-40 w-40 items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r={radius} className="fill-none stroke-white/10" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          className="fill-none stroke-[url(#detector-ring-gradient)] drop-shadow-[0_0_10px_rgba(59,130,246,0.35)]"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
        <defs>
          <linearGradient id="detector-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(56 189 248)" />
            <stop offset="55%" stopColor="rgb(96 165 250)" />
            <stop offset="100%" stopColor="rgb(167 139 250)" />
          </linearGradient>
        </defs>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[2rem] font-semibold tracking-tight text-slate-50">{Math.round(animated)}%</span>
        <span className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</span>
      </div>
    </div>
  );
}
