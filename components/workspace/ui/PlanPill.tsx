"use client";

import React from "react";
import type { Entitlement, PlanId } from "@/components/workspace/WorkspaceShell";

function planLabel(plan: PlanId, isZh: boolean) {
  const mapZh: Record<PlanId, string> = {
    basic: "Basic",
    pro: "Pro",
    ultra: "Ultra",
    gift: "Gift",
  };
  const mapEn: Record<PlanId, string> = {
    basic: "Basic",
    pro: "Pro",
    ultra: "Ultra",
    gift: "Gift",
  };
  return (isZh ? mapZh : mapEn)[plan] ?? String(plan);
}

export function PlanPillStyles() {
  return (
    <style>{`
      @keyframes pillGlow {
        0% { transform: translateZ(0); opacity: .55; }
        50% { transform: translateZ(0); opacity: .9; }
        100% { transform: translateZ(0); opacity: .55; }
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
  unlimited: boolean;
  onClick: () => void;
}) {
  const label = planLabel(plan, isZh);

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative overflow-hidden",
        "h-10 px-4 rounded-full",
        "border border-white/15 bg-slate-900/70 backdrop-blur",
        "hover:bg-slate-900 transition",
        "shadow-md shadow-black/30",
        "flex items-center gap-2",
      ].join(" ")}
      title={isZh ? "查看套餐/额度" : "View plan / quota"}
    >
      <span
        className={[
          "absolute inset-0",
          "bg-gradient-to-r from-blue-500/15 via-purple-500/15 to-emerald-500/15",
          "pointer-events-none",
        ].join(" ")}
        style={{ animation: "pillGlow 2.4s ease-in-out infinite" }}
      />
      <span className="relative text-[11px] text-slate-300">{isZh ? "套餐" : "Plan"}</span>
      <span className="relative text-[12px] font-semibold text-slate-50">{label}</span>
      {unlimited && (
        <span className="relative text-[10px] px-2 py-0.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 text-emerald-200">
          {isZh ? "无限" : "Unlimited"}
        </span>
      )}
      <span className="relative text-slate-400">▾</span>
    </button>
  );
}