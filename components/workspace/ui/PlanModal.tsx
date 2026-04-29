"use client";

import React, { useMemo } from "react";
import type { Entitlement, PlanId } from "@/components/workspace/WorkspaceShell";

function fmtNum(n: number | null | undefined) {
  if (n == null) return "Unlimited";
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
      <div className="mt-2 text-[11px] leading-5 text-slate-300">{children}</div>
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

  const title = isZh ? "\u5957\u9910\u4e0e\u989d\u5ea6" : "Plan & Quota";

  const quotaText = useMemo(() => {
    if (!ent) return null;
    return {
      detector: `${fmtNum(ent.detectorWordsPerWeek)} ${isZh ? "\u8bcd / \u5468" : "words/week"}`,
      note: `${fmtNum(ent.noteSecondsPerWeek)} ${isZh ? "\u79d2 / \u5468" : "sec/week"}`,
      chat: `${fmtNum(ent.chatPerDay)} ${isZh ? "\u6b21 / \u5929" : "chats/day"}`,
      usedDetector: `${ent.usedDetectorWordsThisWeek}`,
      usedNote: `${ent.usedNoteSecondsThisWeek}`,
      usedChat: `${ent.usedChatCountToday}`,
    };
  }, [ent, isZh]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-[94vw] max-w-[760px] overflow-hidden rounded-3xl border border-white/10 bg-slate-950/85 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-sm font-semibold text-slate-50">{title}</div>
            <div className="mt-1 text-[11px] text-slate-400">
              {sessionExists
                ? isZh
                  ? "\u67e5\u770b\u4f60\u7684\u5f53\u524d\u5957\u9910\u3001\u7528\u91cf\u548c\u5347\u7ea7\u9009\u9879"
                  : "View your plan, usage and upgrade"
                : isZh
                  ? "\u5c1a\u672a\u767b\u5f55\uff1a\u767b\u5f55\u540e\u624d\u4f1a\u4fdd\u5b58\u8bb0\u5f55\u5e76\u542f\u7528\u771f\u5b9e\u989d\u5ea6"
                  : "Not signed in: sign in to activate quotas"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="h-9 rounded-full border border-white/10 bg-white/5 px-3 text-[12px] text-slate-100 transition hover:bg-white/10"
              onClick={refreshEnt}
            >
              {isZh ? "\u5237\u65b0" : "Refresh"}
            </button>
            <button
              className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
              onClick={onClose}
              title={isZh ? "\u5173\u95ed" : "Close"}
            >
              ×
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2">
          <Section title={isZh ? "\u5f53\u524d\u5957\u9910" : "Current plan"}>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold text-slate-50">{plan.toUpperCase()}</span>
              {unlimited ? (
                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-200">
                  {isZh ? "\u4e0d\u9650\u91cf" : "Unlimited"}
                </span>
              ) : null}
            </div>

            {!sessionExists ? (
              <div className="mt-2 text-amber-200">
                {isZh ? "\u63d0\u793a\uff1a\u8bf7\u5148\u767b\u5f55\uff0c\u5426\u5219\u65e0\u6cd5\u542f\u7528\u989d\u5ea6\u6216\u4fdd\u5b58\u5386\u53f2\u8bb0\u5f55\u3002" : "Tip: sign in to activate plan and save history."}
              </div>
            ) : null}
          </Section>

          <Section title={isZh ? "\u7528\u91cf" : "Usage"}>
            {!quotaText ? (
              <div className="text-slate-400">
                {isZh ? "\u767b\u5f55\u540e\u53ef\u67e5\u770b\u7528\u91cf\u4e0e\u989d\u5ea6\u3002" : "Sign in to view usage and quotas."}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span>{isZh ? "\u804a\u5929" : "Chat"}</span>
                  <span className="font-semibold text-slate-50">
                    {quotaText.usedChat}/{quotaText.chat}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{isZh ? "\u68c0\u6d4b\u5668" : "Detector"}</span>
                  <span className="font-semibold text-slate-50">
                    {quotaText.usedDetector}/{quotaText.detector}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{isZh ? "AI \u7b14\u8bb0" : "AI Note"}</span>
                  <span className="font-semibold text-slate-50">
                    {quotaText.usedNote}/{quotaText.note}
                  </span>
                </div>
              </div>
            )}
          </Section>

          <Section title={isZh ? "\u5347\u7ea7" : "Upgrade"}>
            <div className="text-slate-400">
              {isZh
                ? "Pro \u548c Ultra \u53ef\u89e3\u9501\u66f4\u9ad8\u989d\u5ea6\uff0c\u4ee5\u53ca\u53ef\u7591\u53e5\u9ad8\u4eae\u7b49\u9ad8\u7ea7\u529f\u80fd\u3002"
                : "Pro and Ultra unlock higher quotas and advanced features like suspicious sentence highlights."}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="h-10 rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-emerald-400 px-4 text-[12px] font-semibold text-white transition hover:brightness-110"
                onClick={() => onManageBilling("pro")}
              >
                {isZh ? "\u5347\u7ea7 Pro" : "Upgrade Pro"}
              </button>
              <button
                className="h-10 rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-amber-400 px-4 text-[12px] font-semibold text-white transition hover:brightness-110"
                onClick={() => onManageBilling("ultra")}
              >
                {isZh ? "\u5347\u7ea7 Ultra" : "Upgrade Ultra"}
              </button>
            </div>
          </Section>

          <Section title={isZh ? "\u5151\u6362\u793c\u5305\u7801" : "Redeem code"}>
            <div className="text-slate-400">
              {isZh ? "\u8f93\u5165\u793c\u5305\u7801\u540e\u53ef\u6fc0\u6d3b Gift \u6743\u76ca\u3002" : "Redeem a code to activate Gift entitlements."}
            </div>
            <div className="mt-3">
              <button
                className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-[12px] text-slate-100 transition hover:bg-white/10"
                onClick={onOpenRedeem}
              >
                {isZh ? "\u6253\u5f00\u5151\u6362" : "Open redeem"}
              </button>
            </div>
          </Section>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-4">
          <div className="text-[11px] text-slate-500">
            {isZh ? "\u63d0\u793a\uff1a\u5f53\u989d\u5ea6\u4e0d\u8db3\u65f6\uff0c\u8fd9\u4e2a\u5f39\u7a97\u4f1a\u81ea\u52a8\u51fa\u73b0\u3002" : "Tip: this modal opens when quota is exceeded."}
          </div>
          <button
            className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-[12px] text-slate-100 transition hover:bg-white/10"
            onClick={onClose}
          >
            {isZh ? "\u5b8c\u6210" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
