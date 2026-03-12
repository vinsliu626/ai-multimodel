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

function formatDifficultyList(values: ("easy" | "medium" | "hard")[] | undefined) {
  if (!values?.length) return "Standard";
  return values.map((value) => value[0]?.toUpperCase() + value.slice(1)).join(", ");
}

function formatPrice(oldPrice: string | null, newPrice: string, priceSuffix: string) {
  return { oldPrice, newPrice, priceSuffix };
}

function buildPlanFeatures(plan: ProductPlanId): FeatureRow[] {
  const limits = PRODUCT_PLAN_LIMITS[plan];

  return [
    {
      label: "AI Detector",
      value: limits.detectorWordsPerWeek == null ? "Unlimited" : `${formatNumber(limits.detectorWordsPerWeek)} words/week`,
    },
    {
      label: "AI Notes",
      value: `${limits.noteSecondsPerWeek == null ? "Unlimited" : `${formatLimitSeconds(limits.noteSecondsPerWeek)} / week`} | ${formatNumber(limits.note.generatesPerDay)}/day`,
    },
    {
      label: "Chat",
      value: `${formatNumber(limits.chat.messagesPerDay)}/day | ${formatNumber(limits.chat.maxInputChars)} chars/input`,
    },
    {
      label: "Document Study",
      value: `${formatNumber(limits.study.generationsPerDay)}/day | ${formatMb(limits.study.maxFileSizeBytes)} files`,
    },
    {
      label: "Highlights",
      value: limits.canSeeSuspiciousSentences ? "Suspicious sentences included" : "Suspicious sentences locked",
    },
  ];
}

function buildUsageRows(ent: EntitlementLike): UsageRow[] {
  return [
    {
      label: "AI Detector",
      used: formatNumber(ent.usedDetectorWordsThisWeek),
      limit: ent.detectorWordsPerWeek == null ? "Unlimited" : `${formatNumber(ent.detectorWordsPerWeek)} words/week`,
    },
    {
      label: "AI Notes",
      used: formatSecondsToHrs(ent.usedNoteSecondsThisWeek),
      limit: ent.noteSecondsPerWeek == null ? "Unlimited" : `${formatLimitSeconds(ent.noteSecondsPerWeek)} / week`,
    },
    {
      label: "Notes Generations",
      used: formatNumber(ent.usedNoteGeneratesToday ?? 0),
      limit: ent.noteGeneratesPerDay == null ? "Unlimited" : `${formatNumber(ent.noteGeneratesPerDay)}/day`,
    },
    {
      label: "Chat",
      used: formatNumber(ent.usedChatCountToday),
      limit: ent.chatPerDay == null ? "Unlimited" : `${formatNumber(ent.chatPerDay)}/day`,
    },
    {
      label: "Document Study",
      used: formatNumber(ent.usedStudyCountToday ?? 0),
      limit: ent.studyGenerationsPerDay == null ? "Unlimited" : `${formatNumber(ent.studyGenerationsPerDay)}/day`,
    },
    {
      label: "Chat Budget",
      used: formatNumber(ent.usedChatInputCharsWindow ?? 0),
      limit:
        ent.chatBudgetCharsPerWindow == null
          ? "Unlimited"
          : `${formatNumber(ent.chatBudgetCharsPerWindow)} chars / ${ent.chatBudgetWindowHours ?? 3}h`,
    },
  ];
}

function DiscountRibbon({ accentClass, sublabel }: { accentClass: string; sublabel: string }) {
  return (
    <div className="pointer-events-none absolute right-[-38px] top-[18px] z-20 w-[150px] rotate-45">
      <div
        className={[
          "border border-white/20 px-3 py-1.5 text-center shadow-[0_14px_34px_rgba(15,23,42,0.45)]",
          "backdrop-blur-md",
          accentClass,
        ].join(" ")}
      >
        <div className="text-[11px] font-black uppercase tracking-[0.24em] text-white">DISCOUNT</div>
        <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/85">{sublabel}</div>
      </div>
    </div>
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

  const cardShell = [
    "relative isolate overflow-hidden rounded-3xl border p-4 md:p-5 [contain:paint]",
    active
      ? "border-blue-400/60 bg-slate-950/80 shadow-[0_0_0_1px_rgba(59,130,246,0.3),0_26px_70px_rgba(2,6,23,0.45)]"
      : "border-white/10 bg-slate-950/72 shadow-[0_20px_60px_rgba(2,6,23,0.35)]",
  ].join(" ");

  const ctaClass = active
    ? "bg-white/10 text-slate-200 border border-white/10 hover:bg-white/15"
    : isBasic
    ? "bg-white/5 text-slate-100 border border-white/12 hover:bg-white/10 hover:border-white/20"
    : isUltra
    ? "bg-gradient-to-r from-slate-100 via-blue-100 to-cyan-200 text-slate-950 shadow-md shadow-cyan-500/20 hover:brightness-105"
    : "bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 text-white shadow-md shadow-blue-500/30 hover:brightness-110";

  return (
    <div className={cardShell}>
      {isPro ? (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit] [transform:translateZ(0)]">
          <div className="absolute inset-0 mm-pro-bg opacity-80" />
          <div className="absolute inset-x-6 top-0 h-24 bg-gradient-to-b from-white/10 via-purple-400/8 to-transparent blur-2xl" />
          <div className="absolute -left-16 bottom-10 h-36 w-36 rounded-full bg-blue-500/12 blur-3xl" />
          <DiscountRibbon accentClass="bg-gradient-to-r from-fuchsia-500 via-violet-500 to-amber-400" sublabel="SAVE NOW" />
        </div>
      ) : null}

      {isUltra ? (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit] [transform:translateZ(0)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,0.11),transparent_18%),radial-gradient(circle_at_78%_20%,rgba(96,165,250,0.22),transparent_20%),radial-gradient(circle_at_50%_120%,rgba(168,85,247,0.18),transparent_38%),linear-gradient(180deg,rgba(2,6,23,0.92),rgba(3,7,18,0.98))]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.15)_0_1px,transparent_1.4px),radial-gradient(circle_at_70%_22%,rgba(255,255,255,0.22)_0_1px,transparent_1.6px),radial-gradient(circle_at_82%_58%,rgba(255,255,255,0.18)_0_1px,transparent_1.4px),radial-gradient(circle_at_36%_62%,rgba(255,255,255,0.16)_0_1px,transparent_1.5px),radial-gradient(circle_at_58%_38%,rgba(255,255,255,0.12)_0_1px,transparent_1.4px)] opacity-80" />
          <div className="absolute -top-12 right-2 h-40 w-40 rounded-full bg-cyan-400/12 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-44 w-44 rounded-full bg-violet-500/14 blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-cyan-400/10 via-violet-500/6 to-transparent" />
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

        <button
          onClick={onClick}
          className={["mt-4 h-10 w-full rounded-2xl text-sm font-semibold transition", ctaClass].join(" ")}
        >
          {cta}
        </button>
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
  const usageRows = ent ? buildUsageRows(ent) : [];
  const proPrice = formatPrice("$6.99", "$5.99", "/ mo");
  const ultraPrice = formatPrice("$11.99", "$7.99", "/ mo");

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-6xl rounded-3xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-50">Choose a plan</p>
            <p className="mt-1 text-[12px] text-slate-400">
              Review your real limits across chat, detector, notes, and study before upgrading.
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
            aria-label="Close"
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
                      Current Plan
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[12px] font-semibold text-slate-50">
                      {planLabel(ent.plan as PlanId, isZh)}
                    </span>
                    {ent.unlimited ? (
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/12 px-3 py-1 text-[11px] text-emerald-200">
                        Unlimited
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-3 text-[12px] leading-6 text-slate-400">
                    {ent.studyMaxFileSizeBytes != null
                      ? `Study files up to ${formatMb(ent.studyMaxFileSizeBytes)}. Difficulties: ${formatDifficultyList(ent.studyAllowedDifficulties)}.`
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
                    Refresh
                  </button>
                  <button
                    onClick={onOpenRedeem}
                    className="h-10 rounded-2xl border border-white/10 bg-white/5 px-4 text-[12px] font-semibold text-slate-100 transition hover:bg-white/10"
                  >
                    Redeem code
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
              You are not signed in. Sign in to unlock pricing, saved usage, and paid quotas.
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-3xl p-[1px] mm-basic-border">
              <Card
                title="Basic (Free)"
                plan="basic"
                price="Free"
                priceSuffix=""
                badge="Starter"
                active={cur === "basic"}
                features={buildPlanFeatures("basic")}
                cta={cur === "basic" ? "Current" : "Switch to Basic"}
                onClick={async () => {
                  if (!sessionExists) return signIn();
                  await refreshEnt();
                  onClose();
                }}
              />
            </div>

            <div className="rounded-3xl p-[1px] mm-pro-border">
              <Card
                title="Pro"
                plan="pro"
                oldPrice={proPrice.oldPrice}
                price={proPrice.newPrice}
                priceSuffix={proPrice.priceSuffix}
                badge="Popular"
                active={cur === "pro"}
                features={buildPlanFeatures("pro")}
                cta={cur === "pro" ? "Manage" : sessionExists ? "Upgrade to Pro" : "Sign in to upgrade"}
                onClick={() => {
                  if (!sessionExists) return signIn();
                  onManageBilling("pro");
                }}
              />
            </div>

            <div className="rounded-3xl p-[1px] mm-ultra-border">
              <Card
                title="Ultra Pro"
                plan="ultra"
                oldPrice={ultraPrice.oldPrice}
                price={ultraPrice.newPrice}
                priceSuffix={ultraPrice.priceSuffix}
                badge="Ultimate"
                active={cur === "ultra"}
                features={buildPlanFeatures("ultra")}
                cta={cur === "ultra" ? "Manage" : sessionExists ? "Upgrade to Ultra" : "Sign in to upgrade"}
                onClick={() => {
                  if (!sessionExists) return signIn();
                  onManageBilling("ultra");
                }}
              />
            </div>
          </div>

          <div className="mt-4 text-[11px] text-slate-500">
            Plan card limits are sourced from the shared product limits config, and current usage comes from the live billing status endpoint.
          </div>
        </div>
      </div>
    </div>
  );
}
