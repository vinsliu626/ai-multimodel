"use client";

import React from "react";
import { signIn } from "next-auth/react";
import { Entitlement, PlanId } from "./types";
import { formatLimitSeconds, formatSecondsToHrs, planLabel } from "./planUtils";

export type EntitlementLike = Entitlement;

export function PlanModal({
  open,
  onClose,
  isZh,
  sessionExists,
  ent,
  onOpenRedeem,
  onManageBilling,
  refreshEnt,
}: {
  open: boolean;
  onClose: () => void;
  isZh: boolean;
  sessionExists: boolean;
  ent: EntitlementLike | null;
  onOpenRedeem: () => void;
  onManageBilling: (plan: "pro" | "ultra") => void;
  refreshEnt: () => Promise<void> | void;
}) {
  if (!open) return null;

  const cur = ent?.plan ?? "basic";

  const Card = ({
    title,
    price,
    badge,
    active,
    items,
    cta,
    onClick,
  }: {
    title: string;
    price: string;
    badge?: string;
    active?: boolean;
    items: string[];
    cta: string;
    onClick: () => void;
  }) => (
    <div
      className={[
        "rounded-3xl border p-4",
        active
          ? "border-blue-400/70 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
          : "border-white/10 bg-white/5",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-50">{title}</p>
            {badge && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-200 border border-emerald-400/20">
                {badge}
              </span>
            )}
            {active && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-400/15 text-blue-200 border border-blue-400/20">
                {isZh ? "当前" : "Current"}
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-slate-300">{price}</p>
        </div>
      </div>

      <ul className="mt-3 space-y-2 text-[12px] text-slate-200">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-emerald-300">✓</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={onClick}
        className={[
          "mt-4 w-full h-10 rounded-2xl font-semibold text-sm transition",
          active
            ? "bg-white/10 text-slate-200 border border-white/10 hover:bg-white/15"
            : title.toLowerCase().includes("basic")
            ? "bg-white/5 text-slate-100 border border-white/12 hover:bg-white/10 hover:border-white/20"
            : "bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 text-white shadow-md shadow-blue-500/30 hover:brightness-110",
        ].join(" ")}
      >
        {cta}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-50">{isZh ? "选择套餐" : "Choose a plan"}</p>
            <p className="text-[12px] text-slate-400 mt-1">
              {isZh
                ? "Basic 有额度限制；Pro/Ultra 解锁更高额度；礼包码可兑换Pro套餐体验。"
                : "Basic has limits. Pro/Ultra increases limits. The gift code can be redeemed for a Pro plan trial."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4">
          {sessionExists && ent && (
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] text-slate-300">
                    {isZh ? "当前套餐：" : "Current plan: "}
                    <span className="font-semibold text-slate-50">{planLabel(ent.plan as PlanId, isZh)}</span>
                    {ent.unlimited && (
                      <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-200 border border-emerald-400/20">
                        {isZh ? "无限制" : "Unlimited"}
                      </span>
                    )}
                  </p>

                  {!ent.unlimited && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      {isZh ? "本周检测：" : "Detector this week: "}
                      <span className="text-slate-200">
                        {ent.usedDetectorWordsThisWeek}/{ent.detectorWordsPerWeek}
                      </span>
                      {" · "}
                      {isZh ? "本周笔记：" : "Notes this week: "}
                      <span className="text-slate-200">
                        {formatSecondsToHrs(ent.usedNoteSecondsThisWeek)}/{formatLimitSeconds(ent.noteSecondsPerWeek)}
                      </span>
                      {" · "}
                      {isZh ? "今日聊天：" : "Chat today: "}
                      <span className="text-slate-200">
                        {ent.usedChatCountToday}/{ent.chatPerDay}
                      </span>
                    </p>
                  )}
                </div>

                <button
                  onClick={onOpenRedeem}
                  className="h-9 px-4 rounded-2xl bg-white/5 border border-white/10 text-slate-100 text-[12px] font-semibold hover:bg-white/10 transition"
                >
                  {isZh ? "输入礼包码" : "Redeem code"}
                </button>
              </div>
            </div>
          )}

          {!sessionExists && (
            <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-[12px] text-amber-200">
              {isZh
                ? "你还没登录：只能聊天，无法使用检测器/笔记，也不会保存记忆。登录后可开启套餐与额度。"
                : "You are not signed in: chat only. Detector/Notes are locked and memory won't be saved. Sign in to unlock plans & quotas."}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-3xl p-[1px] mm-basic-border">
              <div className="rounded-3xl border border-white/10 bg-slate-950/50 backdrop-blur-xl p-4">
                <Card
                  title={isZh ? "Basic（免费）" : "Basic (Free)"}
                  price={isZh ? "免费" : "Free"}
                  badge={isZh ? "入门" : "Starter"}
                  active={cur === "basic"}
                  items={[
                    isZh ? "AI 检测器：5000 词/周" : "AI Detector: 5000 words/week",
                    isZh ? "AI 笔记：2 小时/周" : "AI Notes: 2 hours/week",
                    isZh ? "聊天：10 次/天" : "Chat: 10/day",
                  ]}
                  cta={cur === "basic" ? (isZh ? "当前套餐" : "Current") : (isZh ? "切换到 Basic" : "Switch to Basic")}
                  onClick={async () => {
                    if (!sessionExists) return signIn();
                    await refreshEnt();
                    onClose();
                  }}
                />
              </div>
            </div>

            <div className="rounded-3xl p-[1px] mm-pro-border">
              <div className="rounded-3xl border border-white/10 bg-slate-950/50 backdrop-blur-xl p-4">
                <Card
                  title="Pro"
                  price={isZh ? "$5.99 / 月" : "$5.99 / mo"}
                  badge={isZh ? "推荐" : "Popular"}
                  active={cur === "pro"}
                  items={[
                    isZh ? "AI 检测器：25000 词/周" : "AI Detector: 25000 words/week",
                    isZh ? "AI 笔记：30 小时/周" : "AI Notes: 30 hours/week",
                    isZh ? "可疑句子列表" : "Suspicious sentence list",
                    isZh ? "多模型聊天：无限制" : "Multi-model chat: unlimited",
                  ]}
                  cta={
                    cur === "pro"
                      ? (isZh ? "管理订阅" : "Manage")
                      : sessionExists
                      ? (isZh ? "升级到 Pro" : "Upgrade to Pro")
                      : (isZh ? "登录后升级" : "Sign in to upgrade")
                  }
                  onClick={() => {
                    if (!sessionExists) return signIn();
                    onManageBilling("pro");
                  }}
                />
              </div>
            </div>

            <div className="rounded-3xl p-[1px] mm-ultra-border">
              <div className="rounded-3xl border border-white/10 bg-slate-950/50 backdrop-blur-xl p-4">
                <Card
                  title="Ultra Pro"
                  price={isZh ? "$7.99 / 月" : "$7.99 / mo"}
                  badge={isZh ? "最强" : "Best"}
                  active={cur === "ultra"}
                  items={[
                    isZh ? "AI 检测器：无限制" : "AI Detector: unlimited",
                    isZh ? "AI 笔记：无限制" : "AI Notes: unlimited",
                    isZh ? "多模型聊天：无限制" : "Multi-model chat: unlimited",
                    isZh ? "所有功能解锁" : "Everything unlocked",
                  ]}
                  cta={
                    cur === "ultra"
                      ? (isZh ? "管理订阅" : "Manage")
                      : sessionExists
                      ? (isZh ? "升级到 Ultra" : "Upgrade to Ultra")
                      : (isZh ? "登录后升级" : "Sign in to upgrade")
                  }
                  onClick={() => {
                    if (!sessionExists) return signIn();
                    onManageBilling("ultra");
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-slate-500">
            {isZh ? "提示：付款用 Stripe 最省事；礼包码适合早期内测/推广。" : "Tip: Stripe is easiest for billing. Gift codes are great for early access & partnerships."}
          </div>
        </div>
      </div>
    </div>
  );
}