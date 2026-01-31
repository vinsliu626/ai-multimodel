"use client";

import React from "react";

export type PillOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function PillSelect({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: PillOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={[
        "w-full flex items-center gap-1 rounded-full border border-white/15 bg-slate-950/60 p-1",
        disabled ? "opacity-60 pointer-events-none" : "",
      ].join(" ")}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled || opt.disabled}
            onClick={() => onChange(opt.value)}
            className={[
              "flex-1 h-8 rounded-full px-3 text-[11px] font-medium transition",
              "border border-transparent",
              active
                ? "bg-white/10 text-slate-50 border-white/15 shadow-inner shadow-black/40"
                : "bg-transparent text-slate-300 hover:bg-white/5 hover:text-slate-100",
              opt.disabled ? "opacity-50 cursor-not-allowed" : "",
            ].join(" ")}
            title={opt.label}
          >
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}