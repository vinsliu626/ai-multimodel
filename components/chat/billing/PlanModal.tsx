"use client";

import { signIn } from "next-auth/react";
import { PRODUCT_PLAN_LIMITS, type PlanId as ProductPlanId } from "@/lib/plans/productLimits";
import { Entitlement, PlanId } from "./types";
import { formatLimitSeconds, formatSecondsToHrs, planLabel } from "./planUtils";

export type EntitlementLike = Entitlement;

type FeatureRow = {
  label: string;
  value: string;
};

type UsageRow = {
  label: string;
  used: string;
  limit: string;
};

function formatNumber(value: number | null | undefined) {
  if (value == null) return "Unlimited";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatMb(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

function formatPrice(oldPrice: string | null, newPrice: string, priceSuffix: string) {
  return { oldPrice, newPrice, priceSuffix };
}

function buildPlanFeatures(plan: ProductPlanId, isZh: boolean): FeatureRow[] {
  const limits = PRODUCT_PLAN_LIMITS[plan];

  return [
    {
      label: isZh ? "AI \u68c0\u6d4b\u5668" : "AI Detector",
      value: limits.detectorWordsPerWeek == null ? (isZh ? "\u4e0d\u9650\u91cf" : "Unlimited") : `${formatNumber(limits.detectorWordsPerWeek)} ${isZh ? "\u8bcd / \u5468" : "words/week"}`,
    },
    {
      label: isZh ? "AI \u7b14\u8bb0" : "AI Notes",
      value: `${limits.noteSecondsPerWeek == null ? (isZh ? "\u4e0d\u9650\u91cf" : "Unlimited") : `${formatLimitSeconds(limits.noteSecondsPerWeek)} ${isZh ? "/ \u5468" : "/ week"}`} | ${formatNumber(limits.note.generatesPerDay)}${isZh ? "/ \u5929" : "/day"}`,
    },
    {
      label: isZh ? "\u804a\u5929" : "Chat",
      value: `${formatNumber(limits.chat.messagesPerDay)}${isZh ? "/ \u5929" : "/day"} | ${formatNumber(limits.chat.maxInputChars)} ${isZh ? "\u5b57\u7b26 / \u6b21" : "chars/input"}`,
    },
    {
      label: isZh ? "AI Humanizer" : "AI Humanizer",
      value: `${formatNumber(limits.humanizer.wordsPerWeek)} ${isZh ? "\u8bcd / \u5468" : "words/week"} | ${formatNumber(limits.humanizer.maxInputWords)} ${isZh ? "\u8bcd / \u6b21" : "words/request"}`,
    },
    {
      label: isZh ? "AI \u5b66\u4e60" : "AI Study",
      value: `${formatNumber(limits.study.generationsPerDay)}${isZh ? "/ \u5929" : "/day"} | ${formatMb(limits.study.maxFileSizeBytes)} ${isZh ? "\u6587\u4ef6" : "files"}`,
    },
    {
      label: isZh ? "\u8f6c\u6362\u5668" : "Converter",
      value: `${formatNumber(limits.converter.conversionsPerDay)}${isZh ? "/ \u5929" : "/day"} | ${formatMb(limits.converter.maxFileSizeBytes)} ${isZh ? "\u4e0a\u9650" : "max file"} | ${
        limits.converter.allowAdvancedVideo ? (isZh ? "\u5b8c\u6574\u5a92\u4f53\u683c\u5f0f" : "full media formats") : isZh ? "\u57fa\u7840\u89c6\u9891 / \u97f3\u9891" : "basic video / audio"
      }`,
    },
    {
      label: isZh ? "\u9ad8\u4eae" : "Highlights",
      value: limits.canSeeSuspiciousSentences ? (isZh ? "\u5305\u542b\u53ef\u7591\u53e5\u9ad8\u4eae" : "Suspicious sentences included") : (isZh ? "\u53ef\u7591\u53e5\u9ad8\u4eae\u53d7\u9650" : "Suspicious sentences locked"),
    },
  ];
}

function buildUsageRows(ent: EntitlementLike, isZh: boolean): UsageRow[] {
  return [
    {
      label: isZh ? "AI \u68c0\u6d4b\u5668" : "AI Detector",
      used: formatNumber(ent.usedDetectorWordsThisWeek),
      limit: ent.detectorWordsPerWeek == null ? (isZh ? "\u4e0d\u9650\u91cf" : "Unlimited") : `${formatNumber(ent.detectorWordsPerWeek)} ${isZh ? "\u8bcd / \u5468" : "words/week"}`,
    },
    {
      label: isZh ? "AI \u7b14\u8bb0" : "AI Notes",
      used: formatSecondsToHrs(ent.usedNoteSecondsThisWeek),
      limit: ent.noteSecondsPerWeek == null ? (isZh ? "\u4e0d\u9650\u91cf" : "Unlimited") : `${formatLimitSeconds(ent.noteSecondsPerWeek)} ${isZh ? "/ \u5468" : "/ week"}`,
    },
    {
      label: isZh ? "\u7b14\u8bb0\u751f\u6210" : "Notes Generations",
      used: formatNumber(ent.usedNoteGeneratesToday ?? 0),
      limit: ent.noteGeneratesPerDay == null ? (isZh ? "\u4e0d\u9650\u91cf" : "Unlimited") : `${formatNumber(ent.noteGeneratesPerDay)}${isZh ? "/ \u5929" : "/day"}`,
    },
    {
      label: isZh ? "\u804a\u5929" : "Chat",
      used: formatNumber(ent.usedChatCountToday),
      limit: ent.chatPerDay == null ? (isZh ? "\u4e0d\u9650\u91cf" : "Unlimited") : `${formatNumber(ent.chatPerDay)}${isZh ? "/ \u5929" : "/day"}`,
    },
    {
      label: isZh ? "AI Humanizer" : "AI Humanizer",
      used: formatNumber(ent.usedHumanizerWordsThisWeek ?? 0),
      limit:
        ent.humanizerWordsPerWeek == null
          ? isZh ? "\u4e0d\u53ef\u7528" : "Unavailable"
          : `${formatNumber(ent.humanizerWordsPerWeek)} ${isZh ? "\u8bcd / \u5468" : "words/week"} | ${formatNumber(ent.humanizerMaxInputWords ?? 0)} ${isZh ? "\u8bcd / \u6b21" : "words/request"}`,
    },
    {
      label: isZh ? "AI \u5b66\u4e60" : "AI Study",
      used: formatNumber(ent.usedStudyCountToday ?? 0),
      limit: ent.studyGenerationsPerDay == null ? (isZh ? "\u4e0d\u9650\u91cf" : "Unlimited") : `${formatNumber(ent.studyGenerationsPerDay)}${isZh ? "/ \u5929" : "/day"}`,
    },
    {
      label: isZh ? "\u8f6c\u6362\u5668" : "Converter",
      used: formatNumber(ent.usedConverterCountToday ?? 0),
      limit:
        ent.converterConversionsPerDay == null
          ? isZh ? "\u4e0d\u53ef\u7528" : "Unavailable"
          : `${formatNumber(ent.converterConversionsPerDay)}${isZh ? "/ \u5929" : "/day"} | ${formatMb(ent.converterMaxFileSizeBytes ?? 0)} ${isZh ? "\u4e0a\u9650" : "max file"}`,
    },
    {
      label: isZh ? "\u804a\u5929\u9884\u7b97" : "Chat Budget",
      used: formatNumber(ent.usedChatInputCharsWindow ?? 0),
      limit:
        ent.chatBudgetCharsPerWindow == null
          ? isZh ? "\u4e0d\u9650\u91cf" : "Unlimited"
          : `${formatNumber(ent.chatBudgetCharsPerWindow)} ${isZh ? "\u5b57\u7b26 /" : "chars /"} ${ent.chatBudgetWindowHours ?? 3}h`,
    },
  ];
}

function DiscountRibbon({ accentClass, sublabel }: { accentClass: string; sublabel: string }) {
  return (
    <div className="pointer-events-none absolute right-[-38px] top-[18px] z-20 w-[150px] rotate-45">
      <div
        className={[
          "border border-white/20 px-3 py-1.5 text-center shadow-[0_14px_34px_rgba(15,23,42,0.45)]",
          accentClass,
        ].join(" ")}
      >
        <div className="text-[11px] font-black uppercase tracking-[0.24em] text-white">DISCOUNT</div>
        <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/85">{sublabel}</div>
      </div>
    </div>
  );
}

function CardEffectsStyle() {
  return (
    <style jsx>{`
      @keyframes planAuraPulse {
        0%,
        100% {
          opacity: 0.5;
        }
        50% {
          opacity: 0.9;
        }
      }

      @keyframes planAuraTwinkle {
        0%,
        100% {
          opacity: 0.22;
        }
        50% {
          opacity: 0.4;
        }
      }

      .plan-aura-soft {
        animation: planAuraPulse 3.8s ease-in-out infinite;
      }

      .plan-aura-slow {
        animation: planAuraPulse 5.4s ease-in-out infinite;
      }

      .plan-aura-twinkle {
        animation: planAuraTwinkle 4.6s ease-in-out infinite;
      }
    `}</style>
  );
}

function UsageStat({ row }: { row: UsageRow }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{row.label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-100">{row.used}</p>
      <p className="mt-1 text-[11px] text-slate-400">{row.limit}</p>
    </div>
  );
}

function Card({
  title,
  plan,
  badge,
  active,
  features,
  cta,
  onClick,
  oldPrice,
  price,
  priceSuffix,
}: {
  title: string;
  plan: ProductPlanId;
  badge?: string;
  active?: boolean;
  features: FeatureRow[];
  cta: string;
  onClick: () => void;
  oldPrice?: string | null;
  price: string;
  priceSuffix: string;
}) {
  const isBasic = plan === "basic";
  const isPro = plan === "pro";
  const isUltra = plan === "ultra";
  const staticBorderClass = isBasic
    ? "mm-basic-border"
    : isUltra
      ? "bg-[linear-gradient(90deg,#ff3b3b,#ffcc00,#2dff7a,#00d9ff,#7a5cff,#ff3b3b)]"
      : "bg-[linear-gradient(90deg,#3b82f6,#a855f7,#22c55e,#3b82f6)]";
  const cardRootClass = ["relative overflow-hidden rounded-3xl p-[1px]", staticBorderClass].join(" ");

  const premiumSurfaceClass = isUltra
    ? "bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.11),transparent_18%),radial-gradient(circle_at_78%_20%,rgba(96,165,250,0.22),transparent_20%),radial-gradient(circle_at_50%_120%,rgba(168,85,247,0.18),transparent_38%),linear-gradient(180deg,rgba(2,6,23,0.92),rgba(3,7,18,0.98))]"
    : isPro
      ? "bg-[radial-gradient(circle_at_18%_78%,rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_78%_22%,rgba(168,85,247,0.14),transparent_26%),radial-gradient(circle_at_84%_76%,rgba(34,197,94,0.10),transparent_24%),linear-gradient(90deg,rgba(59,130,246,.16),rgba(168,85,247,.14),rgba(34,197,94,.12))]"
      : "";

  const cardShell = [
    "relative overflow-hidden rounded-[23px] border p-4 md:p-5",
    active
      ? "border-blue-400/60 bg-slate-950/80 shadow-[0_0_0_1px_rgba(59,130,246,0.3),0_26px_70px_rgba(2,6,23,0.45)]"
      : "border-white/10 bg-slate-950/72 shadow-[0_20px_60px_rgba(2,6,23,0.35)]",
    premiumSurfaceClass,
  ].join(" ");

  const ctaClass = active
    ? "bg-white/10 text-slate-200 border border-white/10 hover:bg-white/15"
    : isBasic
      ? "bg-white/5 text-slate-100 border border-white/12 hover:bg-white/10 hover:border-white/20"
      : isUltra
        ? "bg-gradient-to-r from-slate-100 via-blue-100 to-cyan-200 text-slate-950 shadow-md shadow-cyan-500/20 hover:brightness-105"
        : "bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 text-white shadow-md shadow-blue-500/30 hover:brightness-110";

  return (
    <div className={cardRootClass}>
      <CardEffectsStyle />
      <div className={cardShell}>
        {isPro ? (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]">
            <div className="plan-aura-slow absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_58%)]" />
            <div className="plan-aura-twinkle absolute inset-0 bg-[linear-gradient(135deg,transparent_0%,rgba(255,255,255,0.05)_38%,transparent_62%)]" />
            <DiscountRibbon accentClass="bg-gradient-to-r from-fuchsia-500 via-violet-500 to-amber-400" sublabel="SAVE NOW" />
          </div>
        ) : null}

        {isUltra ? (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.15)_0_1px,transparent_1.4px),radial-gradient(circle_at_70%_22%,rgba(255,255,255,0.22)_0_1px,transparent_1.6px),radial-gradient(circle_at_82%_58%,rgba(255,255,255,0.18)_0_1px,transparent_1.4px),radial-gradient(circle_at_36%_62%,rgba(255,255,255,0.16)_0_1px,transparent_1.5px),radial-gradient(circle_at_58%_38%,rgba(255,255,255,0.12)_0_1px,transparent_1.4px)] opacity-80" />
            <div className="plan-aura-soft absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(34,211,238,0.12),transparent_26%),radial-gradient(circle_at_18%_72%,rgba(168,85,247,0.14),transparent_28%),radial-gradient(circle_at_52%_52%,rgba(59,130,246,0.08),transparent_24%)]" />
            <div className="plan-aura-slow absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-cyan-400/10 via-violet-500/6 to-transparent" />
            <div className="plan-aura-twinkle absolute inset-0 bg-[linear-gradient(155deg,transparent_0%,rgba(255,255,255,0.04)_46%,transparent_66%)]" />
            <DiscountRibbon accentClass="bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500" sublabel="LIMITED OFFER" />
          </div>
        ) : null}

        <div className="relative z-10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-50">{title}</p>
                {badge ? (
                  <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] text-slate-200">
                    {badge}
                  </span>
                ) : null}
                {active ? (
                  <span className="rounded-full border border-blue-400/20 bg-blue-400/15 px-2 py-0.5 text-[10px] text-blue-100">
                    Current
                  </span>
                ) : null}
              </div>

              <div className="mt-3">
                {oldPrice ? <p className="text-xs text-slate-500 line-through">{oldPrice}</p> : <div className="h-[18px]" />}
                <div className="flex items-end gap-2">
                  <span
                    className={[
                      "text-3xl font-semibold tracking-tight",
                      isUltra ? "bg-gradient-to-r from-white via-cyan-100 to-violet-200 bg-clip-text text-transparent" : "text-slate-50",
                    ].join(" ")}
                  >
                    {price}
                  </span>
                  <span className="pb-1 text-xs text-slate-400">{priceSuffix}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent" />

          <div className="mt-4 space-y-2.5">
            {features.map((feature) => (
              <div
                key={feature.label}
                className="flex items-start justify-between gap-3 rounded-2xl border border-white/7 bg-black/20 px-3 py-2.5"
              >
                <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{feature.label}</span>
                <span className="max-w-[58%] text-right text-[12px] font-medium leading-5 text-slate-100">{feature.value}</span>
              </div>
            ))}
          </div>

          <button onClick={onClick} className={["mt-4 h-10 w-full rounded-2xl text-sm font-semibold transition", ctaClass].join(" ")}>
            {cta}
          </button>
        </div>
      </div>
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
  ent: EntitlementLike | null;
  onOpenRedeem: () => void;
  onManageBilling: (plan: "pro" | "ultra") => void;
  refreshEnt: () => Promise<void> | void;
}) {
  if (!open) return null;

  const cur = ent?.plan ?? "basic";
  const usageRows = ent ? buildUsageRows(ent, isZh) : [];
  const proPrice = formatPrice("$6.99", "$5.99", "/ mo");
  const ultraPrice = formatPrice("$11.99", "$7.99", "/ mo");
  const copy = {
    title: isZh ? "\u9009\u62e9\u5957\u9910" : "Choose a plan",
    subtitle: isZh
      ? "\u5347\u7ea7\u524d\u5148\u67e5\u770b\u804a\u5929\u3001\u68c0\u6d4b\u3001\u7b14\u8bb0\u3001Humanizer\u3001\u5b66\u4e60\u548c\u8f6c\u6362\u5668\u7684\u771f\u5b9e\u989d\u5ea6\u3002"
      : "Review your real limits across chat, detector, notes, Humanizer, study, and Converter before upgrading.",
    close: isZh ? "\u5173\u95ed" : "Close",
    currentPlan: isZh ? "\u5f53\u524d\u5957\u9910" : "Current Plan",
    unlimited: isZh ? "\u4e0d\u9650\u91cf" : "Unlimited",
    refresh: isZh ? "\u5237\u65b0" : "Refresh",
    redeem: isZh ? "\u5151\u6362\u793c\u5305\u7801" : "Redeem code",
    notSignedIn: isZh ? "\u4f60\u5c1a\u672a\u767b\u5f55\u3002\u767b\u5f55\u540e\u53ef\u67e5\u770b\u771f\u5b9e\u989d\u5ea6\u3001\u4fdd\u5b58\u7528\u91cf\u5e76\u5347\u7ea7\u5957\u9910\u3002" : "You are not signed in. Sign in to unlock pricing, saved usage, and paid quotas.",
    current: isZh ? "\u5f53\u524d" : "Current",
    switchBasic: isZh ? "\u5207\u6362\u5230 Basic" : "Switch to Basic",
    manage: isZh ? "\u7ba1\u7406" : "Manage",
    upgradePro: isZh ? "\u5347\u7ea7\u5230 Pro" : "Upgrade to Pro",
    upgradeUltra: isZh ? "\u5347\u7ea7\u5230 Ultra" : "Upgrade to Ultra",
    signInToUpgrade: isZh ? "\u767b\u5f55\u540e\u5347\u7ea7" : "Sign in to upgrade",
    starter: isZh ? "\u5165\u95e8" : "Starter",
    popular: isZh ? "\u70ed\u95e8" : "Popular",
    ultimate: isZh ? "\u65d7\u8230" : "Ultimate",
    liveUsage: isZh
      ? "\u4e0b\u65b9\u5c55\u793a\u7684\u662f\u5171\u4eab\u4ea7\u54c1\u9650\u5236\u914d\u7f6e\u548c\u5f53\u524d\u5b9e\u65f6\u7528\u91cf\u3002"
      : "Plan card limits are sourced from the shared product limits config, and current usage comes from the live billing status endpoint.",
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-6xl rounded-3xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-50">{copy.title}</p>
            <p className="mt-1 text-[12px] text-slate-400">{copy.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
            aria-label={copy.close}
          >
            X
          </button>
        </div>

        <div className="custom-scrollbar max-h-[82vh] overflow-y-auto px-5 py-4">
          {sessionExists && ent ? (
            <div className="mb-5 rounded-[26px] border border-white/10 bg-gradient-to-br from-white/[0.05] via-blue-500/[0.04] to-emerald-400/[0.05] p-4 shadow-[0_18px_70px_rgba(2,6,23,0.3)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-slate-300">
                      {copy.currentPlan}
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[12px] font-semibold text-slate-50">
                      {planLabel(ent.plan as PlanId, isZh)}
                    </span>
                    {ent.unlimited ? (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/12 px-3 py-1 text-[11px] text-emerald-200">
                        {copy.unlimited}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-3 text-[12px] leading-6 text-slate-400">
                    {ent.studyMaxFileSizeBytes != null
                      ? `Study files up to ${formatMb(ent.studyMaxFileSizeBytes)}. Quiz generation uses a fixed standard exam-review level.`
                      : "Real-time usage shown below is pulled from your current billing status."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      await refreshEnt();
                    }}
                    className="h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-[12px] font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    {copy.refresh}
                  </button>
                  <button
                    onClick={onOpenRedeem}
                    className="h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-[12px] font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    {copy.redeem}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {usageRows.map((row) => (
                  <UsageStat key={row.label} row={row} />
                ))}
              </div>
            </div>
          ) : null}

          {!sessionExists ? (
            <div className="mb-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-[12px] text-amber-200">
              {copy.notSignedIn}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card
              title={isZh ? "Basic\uff08\u514d\u8d39\uff09" : "Basic (Free)"}
              plan="basic"
              price="Free"
              priceSuffix=""
              badge={copy.starter}
              active={cur === "basic"}
              features={buildPlanFeatures("basic", isZh)}
              cta={cur === "basic" ? copy.current : copy.switchBasic}
              onClick={async () => {
                if (!sessionExists) return signIn();
                await refreshEnt();
                onClose();
              }}
            />

            <Card
              title="Pro"
              plan="pro"
              oldPrice={proPrice.oldPrice}
              price={proPrice.newPrice}
              priceSuffix={proPrice.priceSuffix}
              badge={copy.popular}
              active={cur === "pro"}
              features={buildPlanFeatures("pro", isZh)}
              cta={cur === "pro" ? copy.manage : sessionExists ? copy.upgradePro : copy.signInToUpgrade}
              onClick={() => {
                if (!sessionExists) return signIn();
                onManageBilling("pro");
              }}
            />

            <Card
              title="Ultra Pro"
              plan="ultra"
              oldPrice={ultraPrice.oldPrice}
              price={ultraPrice.newPrice}
              priceSuffix={ultraPrice.priceSuffix}
              badge={copy.ultimate}
              active={cur === "ultra"}
              features={buildPlanFeatures("ultra", isZh)}
              cta={cur === "ultra" ? copy.manage : sessionExists ? copy.upgradeUltra : copy.signInToUpgrade}
              onClick={() => {
                if (!sessionExists) return signIn();
                onManageBilling("ultra");
              }}
            />
          </div>

          <div className="mt-4 text-[11px] text-slate-500">{copy.liveUsage}</div>
        </div>
      </div>
    </div>
  );
}
