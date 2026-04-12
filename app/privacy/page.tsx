"use client";

import { useEffect, useState } from "react";

type Lang = "zh" | "en";

type Section = {
  title: string;
  body?: string;
  items?: string[];
  footer?: string;
};

const copyByLang: Record<
  Lang,
  {
    legal: string;
    title: string;
    back: string;
    summaryTitle: string;
    summary: string[];
    languageLabel: string;
    updatedLabel: string;
    updatedValue: string;
    sections: Section[];
  }
> = {
  en: {
    legal: "Legal",
    title: "Privacy Policy",
    back: "Back to NexusDesk",
    summaryTitle: "Your privacy matters to us.",
    summary: [
      "NexusDesk is designed to minimize storage and reduce unnecessary data collection.",
      "Most inputs such as chat, audio, documents, and detector text are processed temporarily and are not stored long-term.",
      "We only collect the information required to operate the product, manage accounts, and enforce usage limits.",
    ],
    languageLabel: "Language",
    updatedLabel: "Last updated",
    updatedValue: "April 8, 2026",
    sections: [
      {
        title: "Information We Collect",
        items: ["Email address and account info (via OAuth providers)", "Usage data (feature usage counts, quotas)", "Device and browser metadata (for security and analytics)", "Cookies and session data"],
      },
      {
        title: "What We Do Not Store",
        items: ["Chat content", "Audio recordings", "Uploaded documents", "Detector input text", "Temporary conversion files after processing"],
      },
      {
        title: "Temporary Processing",
        body: "User inputs such as audio, text, files, and media may be processed temporarily to generate results, but they are not stored long-term unless a feature explicitly requires it.",
      },
      {
        title: "Third-Party Services",
        body: "We use services such as:",
        items: ["Vercel (hosting)", "Neon/Postgres (database)", "NextAuth (authentication)", "Stripe (billing)", "AI providers (Groq, OpenRouter, etc.)"],
        footer: "These services may process data as needed to provide product functionality.",
      },
      {
        title: "How We Use Data",
        body: "We use data only to:",
        items: ["operate the product", "manage accounts", "enforce usage limits", "improve performance and reliability"],
      },
      {
        title: "User Control",
        body: "Users can:",
        items: ["request account deletion", "clear local data or saved browser preferences", "review policy information before using the product"],
      },
      {
        title: "AI Disclaimer",
        items: ["AI-generated outputs may be inaccurate or incomplete.", "Users should verify important results independently.", "NexusDesk does not replace professional, academic, legal, or medical advice."],
      },
      {
        title: "Children",
        body: "The service is intended for users aged 13+.",
      },
      {
        title: "Changes",
        body: "We may update this policy at any time.",
      },
      {
        title: "Contact",
        body: "support@nexusdesk.app",
      },
    ],
  },
  zh: {
    legal: "法律",
    title: "隐私政策",
    back: "返回 NexusDesk",
    summaryTitle: "你的隐私对我们很重要。",
    summary: [
      "NexusDesk 会尽量减少存储，并避免不必要的数据收集。",
      "聊天、音频、文档、检测文本等大多数输入仅会被临时处理，不会长期保存。",
      "我们只收集运行产品、管理账户和执行用量限制所必需的信息。",
    ],
    languageLabel: "语言",
    updatedLabel: "最近更新",
    updatedValue: "2026 年 4 月 8 日",
    sections: [
      {
        title: "我们收集的信息",
        items: ["邮箱地址与账户信息（通过 OAuth 登录提供）", "使用数据（功能使用次数、额度）", "设备与浏览器元数据（用于安全和分析）", "Cookie 与会话数据"],
      },
      {
        title: "我们不会长期保存的内容",
        items: ["聊天内容", "音频录音", "上传文档", "检测器输入文本", "处理完成后的临时转换文件"],
      },
      {
        title: "临时处理",
        body: "音频、文本、文件和媒体等输入可能会被临时处理以生成结果；除非某项功能明确需要，否则不会长期保存。",
      },
      {
        title: "第三方服务",
        body: "我们会使用以下服务：",
        items: ["Vercel（托管）", "Neon/Postgres（数据库）", "NextAuth（认证）", "Stripe（计费）", "AI 服务商（Groq、OpenRouter 等）"],
        footer: "这些服务可能会在提供产品功能所需的范围内处理相关数据。",
      },
      {
        title: "我们如何使用数据",
        body: "数据仅用于：",
        items: ["运行产品", "管理账户", "执行用量限制", "提升性能与稳定性"],
      },
      {
        title: "用户控制",
        body: "你可以：",
        items: ["申请删除账户", "清除本地数据或浏览器保存的偏好", "在使用产品前查看政策信息"],
      },
      {
        title: "AI 免责声明",
        items: ["AI 生成结果可能不准确或不完整。", "重要内容请自行独立核实。", "NexusDesk 不替代专业、学术、法律或医疗建议。"],
      },
      {
        title: "未成年人",
        body: "本服务面向 13 岁及以上用户。",
      },
      {
        title: "政策变更",
        body: "我们可能随时更新本政策。",
      },
      {
        title: "联系方式",
        body: "support@nexusdesk.app",
      },
    ],
  },
};

function PolicyCard({ section }: { section: Section }) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
      <h2 className="text-base font-semibold text-slate-50">{section.title}</h2>
      {section.body ? <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">{section.body}</p> : null}
      {section.items ? (
        <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-300">
          {section.items.map((item) => (
            <li key={item} className="flex gap-3">
              <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {section.footer ? <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">{section.footer}</p> : null}
    </section>
  );
}

export default function PrivacyPage() {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "zh" || saved === "en") setLang(saved);
    } catch {}
  }, []);

  const copy = copyByLang[lang];

  return (
    <main className="min-h-screen bg-[#030303] px-4 py-10 text-slate-200">
      <div className="mx-auto max-w-4xl">
        <div className="overflow-hidden rounded-[32px] border border-white/10 bg-[#060606]/95 shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
          <div className="border-b border-white/10 bg-gradient-to-r from-white/[0.04] via-blue-500/[0.06] to-emerald-400/[0.06] px-6 py-6 sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{copy.legal}</p>
                <h1 className="mt-2 text-2xl font-semibold text-slate-50">{copy.title}</h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1">
                  <button
                    type="button"
                    onClick={() => setLang("en")}
                    className={["rounded-full px-3 py-1.5 text-[12px] transition", lang === "en" ? "bg-white/10 text-slate-50" : "text-slate-400 hover:text-slate-200"].join(" ")}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang("zh")}
                    className={["rounded-full px-3 py-1.5 text-[12px] transition", lang === "zh" ? "bg-white/10 text-slate-50" : "text-slate-400 hover:text-slate-200"].join(" ")}
                  >
                    中文
                  </button>
                </div>
                <a
                  href="/chat"
                  className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/5 px-4 text-[12px] font-medium text-slate-100 transition hover:bg-white/10"
                >
                  {copy.back}
                </a>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-6 py-6 sm:px-8">
            <section className="rounded-[24px] border border-white/10 bg-gradient-to-br from-white/[0.05] via-blue-500/[0.05] to-emerald-400/[0.05] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-50">{copy.summaryTitle}</h2>
                  <div className="mt-3 max-w-3xl space-y-3 text-sm leading-7 text-slate-300">
                    {copy.summary.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                </div>
                <div className="min-w-[160px] rounded-[20px] border border-white/10 bg-black/20 p-4">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{copy.languageLabel}</p>
                  <p className="mt-2 text-sm text-slate-100">{lang === "zh" ? "中文" : "English"}</p>
                  <p className="mt-4 text-[10px] uppercase tracking-[0.24em] text-slate-500">{copy.updatedLabel}</p>
                  <p className="mt-2 text-sm text-slate-100">{copy.updatedValue}</p>
                </div>
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              {copy.sections.slice(0, 6).map((section) => (
                <PolicyCard key={section.title} section={section} />
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                {copy.sections.slice(6, 8).map((section) => (
                  <PolicyCard key={section.title} section={section} />
                ))}
              </div>
              <div className="space-y-4">
                {copy.sections.slice(8).map((section) => (
                  <PolicyCard key={section.title} section={section} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
