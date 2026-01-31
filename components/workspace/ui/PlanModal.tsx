"use client";

import React, { useMemo } from "react";
import type { Entitlement, PlanId } from "@/components/workspace/WorkspaceShell";

function fmtNum(n: number | null | undefined) {
  if (n == null) return "∞";
  return String(n);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="text-[12px] font-semibold text-slate-50">{title}</div>
      <div className="mt-2 text-[11px] text-slate-300 leading-5">{children}</div>
    </div>
  );
}

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
  ent: Entitlement | null;
  onOpenRedeem: () => void;
  onManageBilling: (plan: "pro" | "ultra") => void;
  refreshEnt: () => void;
}) {
  const plan: PlanId = ent?.plan ?? "basic";
  const unlimited = !!ent?.unlimited;

  const title = isZh ? "套餐与额度" : "Plan & Quota";

  const quotaText = useMemo(() => {
    if (!ent) return null;
    return {
      detector: `${fmtNum(ent.detectorWordsPerWeek)} ${isZh ? "词/周" : "words/week"}`,
      note: `${fmtNum(ent.noteSecondsPerWeek)} ${isZh ? "秒/周" : "sec/week"}`,
      chat: `${fmtNum(ent.chatPerDay)} ${isZh ? "次/天" : "chats/day"}`,
      usedDetector: `${ent.usedDetectorWordsThisWeek}`,
      usedNote: `${ent.usedNoteSecondsThisWeek}`,
      usedChat: `${ent.usedChatCountToday}`,
    };
  }, [ent, isZh]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative w-[94vw] max-w-[760px] rounded-3xl border border-white/10 bg-slate-950/85 shadow-2xl shadow-black/50 backdrop-blur-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-50">{title}</div>
            <div className="mt-1 text-[11px] text-slate-400">
              {sessionExists
                ? isZh
                  ? "查看当前套餐、用量与升级"
                  : "View your plan, usage and upgrade"
                : isZh
                ? "未登录：登录后才会保存并启用额度"
                : "Not signed in: sign in to activate quotas"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="h-9 px-3 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-[12px] text-slate-100 transition"
              onClick={refreshEnt}
            >
              {isZh ? "刷新" : "Refresh"}
            </button>
            <button
              className="h-9 w-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 transition"
              onClick={onClose}
              title={isZh ? "关闭" : "Close"}
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Section title={isZh ? "当前套餐" : "Current plan"}>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-slate-50">{plan.toUpperCase()}</span>
              {unlimited && (
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 text-emerald-200">
                  {isZh ? "无限" : "Unlimited"}
                </span>
              )}
            </div>

            {!sessionExists && (
              <div className="mt-2 text-amber-200">
                {isZh ? "提示：请先登录，否则无法启用额度/保存历史。" : "Tip: sign in to activate plan & save history."}
              </div>
            )}
          </Section>

          <Section title={isZh ? "用量" : "Usage"}>
            {!quotaText ? (
              <div className="text-slate-400">
                {isZh ? "登录后可查看用量与额度。" : "Sign in to view usage & quotas."}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span>{isZh ? "聊天" : "Chat"}</span>
                  <span className="text-slate-50 font-semibold">
                    {quotaText.usedChat}/{quotaText.chat}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{isZh ? "检测器" : "Detector"}</span>
                  <span className="text-slate-50 font-semibold">
                    {quotaText.usedDetector}/{quotaText.detector}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{isZh ? "AI 笔记" : "AI Note"}</span>
                  <span className="text-slate-50 font-semibold">
                    {quotaText.usedNote}/{quotaText.note}
                  </span>
                </div>
              </div>
            )}
          </Section>

          <Section title={isZh ? "升级" : "Upgrade"}>
            <div className="text-slate-400">
              {isZh
                ? "Pro/Ultra 解锁更高额度（以及检测器可疑句子等功能）。"
                : "Pro/Ultra unlock higher quotas (and suspicious sentences, etc.)."}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="h-10 px-4 rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-emerald-400 text-white text-[12px] font-semibold hover:brightness-110 transition"
                onClick={() => onManageBilling("pro")}
              >
                {isZh ? "升级 Pro" : "Upgrade Pro"}
              </button>
              <button
                className="h-10 px-4 rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-amber-400 text-white text-[12px] font-semibold hover:brightness-110 transition"
                onClick={() => onManageBilling("ultra")}
              >
                {isZh ? "升级 Ultra" : "Upgrade Ultra"}
              </button>
            </div>
          </Section>

          <Section title={isZh ? "兑换礼包码" : "Redeem code"}>
            <div className="text-slate-400">
              {isZh ? "输入礼包码后可获得 Gift 权益。" : "Redeem a code to activate Gift entitlements."}
            </div>
            <div className="mt-3">
              <button
                className="h-10 px-4 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-[12px] text-slate-100 transition"
                onClick={onOpenRedeem}
              >
                {isZh ? "打开兑换" : "Open redeem"}
              </button>
            </div>
          </Section>
        </div>

        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            {isZh ? "提示：额度不足时会弹出该窗口。" : "Tip: this modal opens when quota is exceeded."}
          </div>
          <button
            className="h-10 px-4 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-[12px] text-slate-100 transition"
            onClick={onClose}
          >
            {isZh ? "完成" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}