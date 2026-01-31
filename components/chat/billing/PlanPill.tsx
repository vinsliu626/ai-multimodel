"use client";

import React from "react";
import { PlanId, planLabel } from "./planUtils";

export function PlanPillStyles() {
  return (
    <style jsx global>{`
      @keyframes mm-rainbow {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes mm-shimmer {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      @keyframes mm-pulseGlow {
        0%,100% { opacity: .55; transform: scale(1); }
        50% { opacity: .95; transform: scale(1.02); }
      }

      .mm-ultra-border {
        background: linear-gradient(90deg,#ff3b3b,#ffcc00,#2dff7a,#00d9ff,#7a5cff,#ff3b3b);
        background-size: 300% 300%;
        animation: mm-rainbow 3.5s ease-in-out infinite;
      }
      .mm-ultra-bg {
        background: linear-gradient(90deg, rgba(255,59,59,.18), rgba(255,204,0,.14), rgba(45,255,122,.14), rgba(0,217,255,.14), rgba(122,92,255,.18));
        background-size: 260% 260%;
        animation: mm-rainbow 4.2s ease-in-out infinite;
      }
      .mm-ultra-glow {
        background: radial-gradient(circle at 30% 20%, rgba(255,200,0,.22), transparent 55%),
                    radial-gradient(circle at 70% 80%, rgba(0,217,255,.20), transparent 55%),
                    radial-gradient(circle at 50% 50%, rgba(122,92,255,.18), transparent 60%);
        animation: mm-pulseGlow 2.4s ease-in-out infinite;
      }

      .mm-pro-border {
        background: linear-gradient(90deg,#3b82f6,#a855f7,#22c55e,#3b82f6);
        background-size: 260% 260%;
        animation: mm-shimmer 5s ease-in-out infinite;
      }
      .mm-pro-bg {
        background: linear-gradient(90deg, rgba(59,130,246,.16), rgba(168,85,247,.14), rgba(34,197,94,.12));
        background-size: 240% 240%;
        animation: mm-shimmer 6.5s ease-in-out infinite;
      }

      .mm-basic-border {
        background: linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.06));
      }
    `}</style>
  );
}

export function PlanPillButton({
  isZh,
  plan,
  unlimited,
  onClick,
}: {
  isZh: boolean;
  plan: PlanId;
  unlimited?: boolean;
  onClick: () => void;
}) {
  const name = planLabel(plan, isZh);

  const theme =
    plan === "ultra"
      ? {
          outer: "mm-ultra-border",
          inner: "mm-ultra-bg",
          glow: "mm-ultra-glow",
          tag: "bg-white/10 border border-white/15 text-slate-50",
          dot: "bg-white/95",
        }
      : plan === "pro"
      ? {
          outer: "mm-pro-border",
          inner: "mm-pro-bg",
          glow: "bg-gradient-to-r from-blue-500/15 via-purple-500/10 to-emerald-400/10",
          tag: "bg-white/10 border border-white/15 text-slate-50",
          dot: "bg-blue-200",
        }
      : {
          outer: "mm-basic-border",
          inner: "bg-white/5",
          glow: "bg-transparent",
          tag: "bg-white/5 border border-white/10 text-slate-200",
          dot: "bg-slate-300",
        };

  return (
    <button onClick={onClick} className="relative group">
      <div
        className={[
          "pointer-events-none absolute -inset-2 rounded-full blur-xl opacity-70 group-hover:opacity-100 transition",
          theme.glow,
        ].join(" ")}
      />

      <div className={["rounded-full p-[1px] shadow-lg", theme.outer].join(" ")}>
        <div
          className={[
            "rounded-full px-4 py-2 flex items-center gap-2 border border-white/10",
            "backdrop-blur-xl shadow-inner shadow-black/30",
            theme.inner,
          ].join(" ")}
        >
          <span className="text-[11px] text-slate-300">{isZh ? "套餐" : "Plan"}</span>

          <span className="flex items-center gap-2">
            <span className={["h-2 w-2 rounded-full", theme.dot].join(" ")} />
            <span className="text-[12px] font-semibold text-slate-50">{name}</span>
          </span>

          {unlimited && (
            <span className={["text-[10px] px-2 py-0.5 rounded-full", theme.tag].join(" ")}>
              {isZh ? "无限制" : "Unlimited"}
            </span>
          )}

          <span className="ml-1 text-[10px] text-slate-300 opacity-80 group-hover:opacity-100 transition">⌄</span>
        </div>
      </div>
    </button>
  );
}