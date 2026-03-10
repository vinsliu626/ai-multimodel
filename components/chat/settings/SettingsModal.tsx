"use client";

import React from "react";
import type { ChatMode } from "@/components/chat/ui/workflow/types";

export type Lang = "zh" | "en";

type EntitlementSummary = {
  plan: "basic" | "pro" | "ultra" | "gift";
  source?: "developer_override" | "paid_subscription" | "promo" | "free";
  stripeStatus?: string | null;
  daysLeft?: number | null;
  unlimited: boolean;
  usedChatCountToday: number;
  chatPerDay: number | null;
  usedDetectorWordsThisWeek: number;
  detectorWordsPerWeek: number | null;
  usedNoteSecondsThisWeek: number;
  noteSecondsPerWeek: number | null;
  usedStudyCountToday?: number;
  studyGenerationsPerDay?: number;
  canSeeSuspiciousSentences: boolean;
};

function fmtQuota(used: number, limit: number | null | undefined) {
  return limit == null ? `${used} / Unlimited` : `${used} / ${limit}`;
}

function modeLabel(mode: ChatMode, isZh: boolean) {
  switch (mode) {
    case "workflow":
      return isZh ? "团队协作" : "Team matrix";
    case "detector":
      return "AI Detector";
    case "note":
      return "AI Note";
    case "study":
      return isZh ? "文档学习" : "Document study";
    default:
      return isZh ? "标准终端" : "Standard terminal";
  }
}

function sourceLabel(source: EntitlementSummary["source"], isZh: boolean) {
  switch (source) {
    case "paid_subscription":
      return isZh ? "付费订阅" : "Paid subscription";
    case "promo":
      return isZh ? "兑换权益" : "Redeemed access";
    case "developer_override":
      return isZh ? "开发者覆盖" : "Developer override";
    default:
      return isZh ? "免费计划" : "Free plan";
  }
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-50">{title}</h3>
          {description ? <p className="mt-1 text-[11px] leading-5 text-slate-400">{description}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-black/20 px-3 py-2">
      <span className="text-[11px] text-slate-400">{label}</span>
      <span className="text-[11px] font-medium text-slate-100">{value}</span>
    </div>
  );
}

export function SettingsModal({
  open,
  onClose,
  isZh,
  lang,
  setLang,
  sessionExists,
  accountLabel,
  ent,
  mode,
  onOpenPlan,
  onOpenRedeem,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  isZh: boolean;
  lang: Lang;
  setLang: (l: Lang) => void;
  sessionExists: boolean;
  accountLabel: string | null;
  ent: EntitlementSummary | null;
  mode: ChatMode;
  onOpenPlan: () => void;
  onOpenRedeem: () => void;
  onSignOut?: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-[#060606]/95 shadow-2xl shadow-black/50">
        <div className="border-b border-white/10 bg-gradient-to-r from-white/[0.04] via-blue-500/[0.06] to-emerald-400/[0.06] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{isZh ? "工作区偏好" : "Workspace preferences"}</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-50">{isZh ? "设置" : "Settings"}</h2>
              <p className="mt-1 text-[12px] text-slate-400">
                {isZh
                  ? "管理账号、计划状态、语言与可用功能入口。"
                  : "Manage account details, plan status, language, and product access."}
              </p>
            </div>
            <button
              onClick={onClose}
              className="h-10 w-10 rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
              aria-label={isZh ? "关闭设置" : "Close settings"}
            >
              ×
            </button>
          </div>
        </div>

        <div className="max-h-[78vh] overflow-y-auto px-5 py-5 custom-scrollbar">
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-4">
              <Section
                title={isZh ? "账号" : "Account"}
                description={isZh ? "当前登录状态与工作区上下文。" : "Current sign-in status and workspace context."}
              >
                <div className="space-y-2">
                  <StatRow label={isZh ? "状态" : "Status"} value={sessionExists ? (isZh ? "已登录" : "Signed in") : (isZh ? "未登录" : "Signed out")} />
                  <StatRow label={isZh ? "账号" : "Account"} value={accountLabel ?? (isZh ? "访客模式" : "Guest mode")} />
                  <StatRow label={isZh ? "当前模式" : "Current mode"} value={modeLabel(mode, isZh)} />
                </div>
                {onSignOut ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={onSignOut}
                      className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
                    >
                      {isZh ? "退出登录" : "Sign out"}
                    </button>
                    <a
                      href="/account"
                      className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
                    >
                      {isZh ? "查看 Account" : "Open Account"}
                    </a>
                  </div>
                ) : null}
              </Section>

              <Section
                title={isZh ? "计划与额度" : "Plan & limits"}
                description={isZh ? "展示当前权益、来源与主要用量。" : "See your active access, entitlement source, and key product usage."}
              >
                <div className="rounded-[22px] border border-blue-500/15 bg-gradient-to-br from-blue-500/10 via-transparent to-emerald-400/10 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-50">
                      {(ent?.plan ?? "basic").toUpperCase()}
                    </span>
                    {ent?.unlimited ? (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-200">
                        {isZh ? "无限额度" : "Unlimited"}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-slate-300">
                      {sourceLabel(ent?.source, isZh)}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <StatRow label={isZh ? "聊天" : "Chat"} value={fmtQuota(ent?.usedChatCountToday ?? 0, ent?.chatPerDay)} />
                    <StatRow
                      label={isZh ? "检测器" : "Detector"}
                      value={fmtQuota(ent?.usedDetectorWordsThisWeek ?? 0, ent?.detectorWordsPerWeek)}
                    />
                    <StatRow
                      label={isZh ? "AI Note" : "AI Note"}
                      value={fmtQuota(ent?.usedNoteSecondsThisWeek ?? 0, ent?.noteSecondsPerWeek)}
                    />
                    <StatRow
                      label={isZh ? "Study" : "Study"}
                      value={fmtQuota(ent?.usedStudyCountToday ?? 0, ent?.studyGenerationsPerDay)}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={onOpenPlan}
                      className="h-10 rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-emerald-400 px-4 text-[12px] font-semibold text-white shadow-md shadow-blue-500/30 transition hover:brightness-110"
                    >
                      {isZh ? "查看计划" : "View plans"}
                    </button>
                    <button
                      onClick={onOpenRedeem}
                      className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
                    >
                      {isZh ? "兑换礼包码" : "Redeem code"}
                    </button>
                  </div>
                </div>
              </Section>
            </div>

            <div className="space-y-4">
              <Section
                title={isZh ? "语言与产品偏好" : "Language & product preferences"}
                description={isZh ? "仅显示当前真实可用的偏好项。" : "Only real preferences supported by the app are shown here."}
              >
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-slate-400">{isZh ? "界面语言" : "Interface language"}</label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setLang("en")}
                        className={[
                          "h-10 rounded-2xl border text-[12px] font-medium transition",
                          lang === "en"
                            ? "border-white/15 bg-white/10 text-slate-50"
                            : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                        ].join(" ")}
                      >
                        English
                      </button>
                      <button
                        onClick={() => setLang("zh")}
                        className={[
                          "h-10 rounded-2xl border text-[12px] font-medium transition",
                          lang === "zh"
                            ? "border-white/15 bg-white/10 text-slate-50"
                            : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                        ].join(" ")}
                      >
                        中文
                      </button>
                    </div>
                  </div>

                  <StatRow
                    label={isZh ? "可疑句高亮" : "Suspicious sentence highlights"}
                    value={ent?.canSeeSuspiciousSentences ? (isZh ? "已启用" : "Enabled") : (isZh ? "当前计划不可用" : "Not included in current plan")}
                  />
                </div>
              </Section>

              <Section
                title={isZh ? "隐私与数据行为" : "Privacy & data behavior"}
                description={isZh ? "只展示当前项目里真实存在的行为。" : "Reflects only behavior that exists in the current project."}
              >
                <div className="space-y-2 text-[12px] leading-6 text-slate-300">
                  <p>{isZh ? "对话历史仅在登录后保存；访客模式不会保留会话。" : "Conversation history is only saved when signed in; guest mode does not persist sessions."}</p>
                  <p>{isZh ? "礼包码兑换会通过后端写入数据库权益记录，不会保存在浏览器。" : "Redeemed codes are applied via backend database records, not browser-only state."}</p>
                  <p>{isZh ? "语言偏好会保存在当前浏览器本地。" : "Language preference is stored locally in this browser."}</p>
                </div>
              </Section>

              <Section
                title={isZh ? "帮助与入口" : "Help & access"}
                description={isZh ? "使用项目中已有的页面与流程。" : "Uses existing pages and flows already present in the app."}
              >
                <div className="flex flex-wrap gap-2">
                  <a
                    href="/account"
                    className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
                  >
                    {isZh ? "套餐与额度" : "Plans & limits"}
                  </a>
                  <button
                    onClick={onOpenRedeem}
                    className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
                  >
                    {isZh ? "输入兑换码" : "Enter redeem code"}
                  </button>
                </div>
              </Section>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-4">
          <p className="text-[11px] text-slate-500">
            {isZh ? "主题切换已移除，工作区统一保持当前深色产品外观。" : "Theme switching has been removed; the workspace now keeps the current dark product appearance."}
          </p>
          <button
            onClick={onClose}
            className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
          >
            {isZh ? "完成" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
