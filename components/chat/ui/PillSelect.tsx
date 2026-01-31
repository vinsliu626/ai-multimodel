"use client";

import React, { useEffect, useState } from "react";

export type PillOption = { value: string; label: string };

export function PillSelect({
  value,
  options,
  onChange,
  disabled,
  className = "",
}: {
  value: string;
  options: PillOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [open]);

  return (
    <div
      className={`relative ${disabled ? "opacity-60 cursor-not-allowed" : ""} ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between rounded-full border border-white/15 bg-slate-900/90 px-3 py-1 text-[11px] text-slate-100 shadow-inner shadow-slate-900/50 focus:outline-none focus:ring-1 focus:ring-blue-500/70 focus:border-blue-500/70"
      >
        <span className="truncate">{selected.label}</span>
        <span className="ml-2 text-[10px] text-slate-400">⌄</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-full min-w-[160px] rounded-2xl border border-white/10 bg-slate-950 shadow-xl z-30 py-1">
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={[
                  "w-full text-left px-3 py-1.5 text-[11px] transition-colors",
                  active ? "bg-blue-500/20 text-slate-50" : "text-slate-200 hover:bg-slate-800",
                ].join(" ")}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}