"use client";

import React from "react";
import type { ChatMode } from "@/components/chat/ui/workflow/types";

export type Lang = "zh" | "en";

type EntitlementSummary = {
  plan: "basic" | "pro" | "ultra" | "gift";
  unlimited: boolean;
  usedChatCountToday: number;
  chatPerDay: number | null;
  usedDetectorWordsThisWeek: number;
  detectorWordsPerWeek: number | null;
  usedNoteSecondsThisWeek: number;
  noteSecondsPerWeek: number | null;
  usedStudyCountToday?: number;
  studyGenerationsPerDay?: number;
  usedConverterCountToday?: number;
  converterConversionsPerDay?: number;
  converterMaxFileSizeBytes?: number;
};

type Copy = {
  badge: string;
  title: string;
  intro: string;
  close: string;
  account: string;
  accountDesc: string;
  email: string;
  status: string;
  signedIn: string;
  signedOut: string;
  guest: string;
  currentMode: string;
  openAccount: string;
  signOut: string;
  plan: string;
  planDesc: string;
  currentPlan: string;
  unlimited: string;
  chat: string;
  detector: string;
  note: string;
  study: string;
  converter: string;
  converterLimit: string;
  viewPlans: string;
  redeemCode: string;
  language: string;
  languageDesc: string;
  interfaceLanguage: string;
  languageHint: string;
  english: string;
  chinese: string;
  privacy: string;
  privacyDesc: string;
  privacyPolicy: string;
  terms: string;
  localData: string;
  localDataDesc: string;
  clearLocalData: string;
  deleteAccount: string;
  deleteAccountHint: string;
  aiSafety: string;
  aiSafetyText: string;
  help: string;
  helpDesc: string;
  supportEmail: string;
  helpPlans: string;
  done: string;
};

const copyByLang: Record<Lang, Copy> = {
  en: {
    badge: "Workspace preferences",
    title: "Settings",
    intro: "Manage your account, plan, language, and privacy controls.",
    close: "Close settings",
    account: "Account",
    accountDesc: "Your sign-in details.",
    email: "Email",
    status: "Status",
    signedIn: "Signed in",
    signedOut: "Signed out",
    guest: "Guest mode",
    currentMode: "Current mode",
    openAccount: "Open Account",
    signOut: "Sign out",
    plan: "Plan & Usage",
    planDesc: "Your current plan and key limits.",
    currentPlan: "Current plan",
    unlimited: "Unlimited",
    chat: "Chat",
    detector: "Detector",
    note: "AI Note",
    study: "Study",
    converter: "Converter",
    converterLimit: "Converter file size",
    viewPlans: "View plans",
    redeemCode: "Redeem code",
    language: "Language & Interface",
    languageDesc: "Keep the product in the language you prefer.",
    interfaceLanguage: "Interface language",
    languageHint: "The current language is saved in this browser for future visits.",
    english: "English",
    chinese: "Chinese",
    privacy: "Privacy & Data",
    privacyDesc: "Policy links and browser-side controls.",
    privacyPolicy: "Privacy Policy",
    terms: "Terms of Service",
    localData: "Local browser data",
    localDataDesc: "Clears saved language and interface preferences on this device only.",
    clearLocalData: "Clear local data",
    deleteAccount: "Delete account",
    deleteAccountHint: "Coming soon",
    aiSafety: "AI Safety",
    aiSafetyText: "AI results may be inaccurate. Verify important content before relying on it.",
    help: "Help & Support",
    helpDesc: "Shortcuts for common support needs.",
    supportEmail: "Support email",
    helpPlans: "Plans & limits",
    done: "Done",
  },
  zh: {
    badge: "工作区偏好",
    title: "设置",
    intro: "管理账号、套餐、语言与隐私相关控制。",
    close: "关闭设置",
    account: "账号",
    accountDesc: "你的登录信息。",
    email: "邮箱",
    status: "状态",
    signedIn: "已登录",
    signedOut: "未登录",
    guest: "访客模式",
    currentMode: "当前模式",
    openAccount: "打开账户页",
    signOut: "退出登录",
    plan: "套餐与用量",
    planDesc: "查看当前套餐与关键额度。",
    currentPlan: "当前套餐",
    unlimited: "无限",
    chat: "聊天",
    detector: "检测器",
    note: "AI 笔记",
    study: "AI 学习",
    converter: "转换器",
    converterLimit: "转换器文件上限",
    viewPlans: "查看套餐",
    redeemCode: "兑换码",
    language: "语言与界面",
    languageDesc: "让产品始终保持你偏好的语言。",
    interfaceLanguage: "界面语言",
    languageHint: "当前语言会保存在此浏览器中，方便下次继续使用。",
    english: "英文",
    chinese: "中文",
    privacy: "隐私与数据",
    privacyDesc: "查看政策链接并管理浏览器本地设置。",
    privacyPolicy: "隐私政策",
    terms: "服务条款",
    localData: "本地浏览器数据",
    localDataDesc: "只会清除这台设备里保存的语言与界面偏好，不会删除云端账户数据。",
    clearLocalData: "清除本地数据",
    deleteAccount: "删除账户",
    deleteAccountHint: "即将推出",
    aiSafety: "AI 安全提示",
    aiSafetyText: "AI 结果可能不准确。涉及重要内容时，请先自行核实。",
    help: "帮助与支持",
    helpDesc: "常用支持入口。",
    supportEmail: "支持邮箱",
    helpPlans: "套餐与额度",
    done: "完成",
  },
};

function formatQuota(used: number, limit: number | null | undefined, copy: Copy) {
  return `${used} / ${limit == null ? copy.unlimited : limit}`;
}

function formatFileSize(bytes?: number | null) {
  if (!bytes) return "--";
  const mb = bytes / (1024 * 1024);
  return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

function modeLabel(mode: ChatMode, isZh: boolean) {
  switch (mode) {
    case "workflow":
      return isZh ? "工作流对话" : "Workflow chat";
    case "detector":
      return isZh ? "AI 检测器" : "AI Detector";
    case "note":
      return isZh ? "AI 笔记" : "AI Note";
    case "study":
      return isZh ? "AI 学习" : "AI Study";
    case "humanizer":
      return "AI Humanizer";
    case "converter":
      return isZh ? "转换器" : "Converter";
    default:
      return isZh ? "普通对话" : "Normal chat";
  }
}

function planLabel(plan: EntitlementSummary["plan"], isZh: boolean) {
  switch (plan) {
    case "gift":
      return isZh ? "礼包无限版" : "Gift Unlimited";
    case "ultra":
      return isZh ? "Ultra 专业版" : "Ultra Pro";
    case "pro":
      return "Pro";
    default:
      return isZh ? "Basic（免费）" : "Basic (Free)";
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
      <h3 className="text-sm font-semibold text-slate-50">{title}</h3>
      {description ? <p className="mt-1 text-[11px] leading-5 text-slate-400">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-black/20 px-3 py-2.5">
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
  onClearLocalData,
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
  onClearLocalData: () => void;
}) {
  if (!open) return null;

  const copy = copyByLang[isZh ? "zh" : "en"];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/10 bg-[#060606]/95 shadow-2xl shadow-black/50">
        <div className="border-b border-white/10 bg-gradient-to-r from-white/[0.04] via-blue-500/[0.06] to-emerald-400/[0.06] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{copy.badge}</p>
              <h2 className="mt-2 text-lg font-semibold text-slate-50">{copy.title}</h2>
              <p className="mt-1 text-[12px] text-slate-400">{copy.intro}</p>
            </div>
            <button
              onClick={onClose}
              className="h-10 w-10 rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
              aria-label={copy.close}
            >
              ×
            </button>
          </div>
        </div>

        <div className="custom-scrollbar max-h-[78vh] overflow-y-auto px-5 py-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Section title={copy.account} description={copy.accountDesc}>
                <div className="space-y-2">
                  <StatRow label={copy.email} value={accountLabel ?? copy.guest} />
                  <StatRow label={copy.status} value={sessionExists ? copy.signedIn : copy.signedOut} />
                  <StatRow label={copy.currentMode} value={modeLabel(mode, isZh)} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {onSignOut ? (
                    <button
                      onClick={onSignOut}
                      className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
                    >
                      {copy.signOut}
                    </button>
                  ) : null}
                  <a
                    href="/account"
                    className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
                  >
                    {copy.openAccount}
                  </a>
                </div>
              </Section>

              <Section title={copy.plan} description={copy.planDesc}>
                <div className="rounded-[22px] border border-blue-500/15 bg-gradient-to-br from-blue-500/10 via-transparent to-emerald-400/10 p-4">
                  <StatRow label={copy.currentPlan} value={planLabel(ent?.plan ?? "basic", isZh)} />
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <StatRow label={copy.chat} value={formatQuota(ent?.usedChatCountToday ?? 0, ent?.chatPerDay, copy)} />
                    <StatRow label={copy.detector} value={formatQuota(ent?.usedDetectorWordsThisWeek ?? 0, ent?.detectorWordsPerWeek, copy)} />
                    <StatRow label={copy.note} value={formatQuota(ent?.usedNoteSecondsThisWeek ?? 0, ent?.noteSecondsPerWeek, copy)} />
                    <StatRow label={copy.study} value={formatQuota(ent?.usedStudyCountToday ?? 0, ent?.studyGenerationsPerDay, copy)} />
                    <StatRow label={copy.converter} value={formatQuota(ent?.usedConverterCountToday ?? 0, ent?.converterConversionsPerDay, copy)} />
                    <StatRow label={copy.converterLimit} value={formatFileSize(ent?.converterMaxFileSizeBytes)} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={onOpenPlan}
                      className="h-10 rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-emerald-400 px-4 text-[12px] font-semibold text-white shadow-md shadow-blue-500/30 transition hover:brightness-110"
                    >
                      {copy.viewPlans}
                    </button>
                    <button
                      onClick={onOpenRedeem}
                      className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
                    >
                      {copy.redeemCode}
                    </button>
                  </div>
                </div>
              </Section>

              <Section title={copy.language} description={copy.languageDesc}>
                <label className="text-[11px] text-slate-400">{copy.interfaceLanguage}</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setLang("en")}
                    className={[
                      "h-10 rounded-2xl border text-[12px] font-medium transition",
                      lang === "en" ? "border-white/15 bg-white/10 text-slate-50" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                    ].join(" ")}
                  >
                    {copy.english}
                  </button>
                  <button
                    onClick={() => setLang("zh")}
                    className={[
                      "h-10 rounded-2xl border text-[12px] font-medium transition",
                      lang === "zh" ? "border-white/15 bg-white/10 text-slate-50" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                    ].join(" ")}
                  >
                    {copy.chinese}
                  </button>
                </div>
                <p className="mt-3 text-[11px] text-slate-400">{copy.languageHint}</p>
              </Section>
            </div>

            <div className="space-y-4">
              <Section title={copy.privacy} description={copy.privacyDesc}>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="/privacy"
                      className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
                    >
                      {copy.privacyPolicy}
                    </a>
                    <button
                      type="button"
                      disabled
                      className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-500"
                    >
                      {copy.terms}
                    </button>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3">
                    <p className="text-[11px] font-medium text-slate-100">{copy.localData}</p>
                    <p className="mt-1 text-[11px] leading-5 text-slate-400">{copy.localDataDesc}</p>
                    <button
                      type="button"
                      onClick={onClearLocalData}
                      className="mt-3 inline-flex h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
                    >
                      {copy.clearLocalData}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled
                      className="inline-flex h-10 items-center rounded-full border border-red-400/20 bg-red-500/10 px-4 text-[12px] font-medium text-red-100/60"
                    >
                      {copy.deleteAccount}
                    </button>
                    <span className="inline-flex h-10 items-center rounded-full border border-white/10 bg-black/20 px-3 text-[11px] text-slate-400">
                      {copy.deleteAccountHint}
                    </span>
                  </div>
                </div>
              </Section>

              <Section title={copy.aiSafety}>
                <p className="text-[12px] leading-6 text-slate-300">{copy.aiSafetyText}</p>
              </Section>

              <Section title={copy.help} description={copy.helpDesc}>
                <div className="space-y-2">
                  <StatRow label={copy.supportEmail} value="support@nexusdesk.app" />
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="/account"
                      className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
                    >
                      {copy.helpPlans}
                    </a>
                    <button
                      onClick={onOpenRedeem}
                      className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
                    >
                      {copy.redeemCode}
                    </button>
                  </div>
                </div>
              </Section>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-white/10 px-5 py-4">
          <button
            onClick={onClose}
            className="h-10 rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
          >
            {copy.done}
          </button>
        </div>
      </div>
    </div>
  );
}
