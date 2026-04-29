"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import {
  PRO_TRIAL_WHEEL_PRIZES,
  type ProTrialWheelSpinResult,
  type ProTrialWheelStatus,
} from "@/lib/billing/proTrialWheelTypes";

const SPIN_DURATION_MS = 4_800;

function getPrizeMeta(durationDays: number | null | undefined) {
  return PRO_TRIAL_WHEEL_PRIZES.find((entry) => entry.durationDays === durationDays) ?? null;
}

function getCelebrationConfig(durationDays: number | null | undefined) {
  const prize = getPrizeMeta(durationDays);

  switch (prize?.weight) {
    case 1:
      return {
        particleCount: 32,
        burstScale: 1.5,
        dotSize: 3,
        titleClassName:
          "bg-gradient-to-r from-amber-200 via-yellow-100 to-white bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(251,191,36,0.32)]",
      };
    case 5:
      return {
        particleCount: 26,
        burstScale: 1.28,
        dotSize: 2.6,
        titleClassName:
          "bg-gradient-to-r from-orange-200 via-amber-100 to-white bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(249,115,22,0.26)]",
      };
    case 14:
      return {
        particleCount: 20,
        burstScale: 1.12,
        dotSize: 2.3,
        titleClassName:
          "bg-gradient-to-r from-violet-100 via-sky-100 to-emerald-100 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(124,58,237,0.18)]",
      };
    case 25:
      return {
        particleCount: 16,
        burstScale: 0.94,
        dotSize: 2.1,
        titleClassName: "bg-gradient-to-r from-white via-sky-100 to-emerald-100 bg-clip-text text-transparent",
      };
    default:
      return {
        particleCount: 10,
        burstScale: 0.76,
        dotSize: 1.8,
        titleClassName: "bg-gradient-to-r from-white via-slate-100 to-sky-100 bg-clip-text text-transparent",
      };
  }
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function formatCountdown(msRemaining: number) {
  if (msRemaining <= 0) return "00:00";
  const totalSeconds = Math.floor(msRemaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = (angleInDegrees * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function unitToPercent(value: number) {
  return `${(value / 320) * 100}%`;
}

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

function getPrizeGeometry() {
  let cumulative = -90;
  return PRO_TRIAL_WHEEL_PRIZES.map((prize) => {
    const sweep = (prize.weight / 100) * 360;
    const startAngle = cumulative;
    const endAngle = cumulative + sweep;
    const midAngle = startAngle + sweep / 2;
    cumulative = endAngle;
    return {
      ...prize,
      startAngle,
      endAngle,
      midAngle,
      sweep,
    };
  });
}

function wheelRotationForPrize(days: number) {
  const target = getPrizeGeometry().find((item) => item.durationDays === days);
  if (!target) return 0;
  return 270 - target.midAngle;
}

function WheelPointer() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-[6px] z-30 -translate-x-1/2">
      <div className="relative flex flex-col items-center">
        <div className="h-5 w-8 rounded-full border border-white/25 bg-gradient-to-b from-white via-white/85 to-amber-200 shadow-[0_0_24px_rgba(255,255,255,0.28)]" />
        <div className="-mt-1 h-0 w-0 border-x-[14px] border-t-[22px] border-x-transparent border-t-white drop-shadow-[0_0_22px_rgba(251,191,36,0.42)]" />
      </div>
    </div>
  );
}

export function ProTrialWheelReminderPrompt({
  open,
  dontRemindAgain,
  onDontRemindAgainChange,
  onSpinNow,
  onMaybeLater,
}: {
  open: boolean;
  dontRemindAgain: boolean;
  onDontRemindAgainChange: (value: boolean) => void;
  onSpinNow: () => void;
  onMaybeLater: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[215] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[rgba(2,6,23,0.5)] backdrop-blur-[5px]" onClick={onMaybeLater} />
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-[28px] border border-white/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(2,6,23,0.94))] p-5 shadow-[0_30px_110px_rgba(0,0,0,0.58)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),rgba(15,23,42,0)_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),rgba(15,23,42,0)_40%)]" />
        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.28em] text-sky-200/80">NexusDesk Reward</p>
          <h3 className="mt-2 text-[26px] font-semibold tracking-tight text-white">Try your luck for a Pro trial?</h3>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Spin the wheel for a chance to unlock free Pro access.
          </p>

          <label className="mt-5 flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-3.5 py-3 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={dontRemindAgain}
              onChange={(event) => onDontRemindAgainChange(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-slate-950 text-sky-400 focus:ring-sky-400/40"
            />
            <span>Don&apos;t remind me again</span>
          </label>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onSpinNow}
              className="h-11 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-500 to-emerald-400 px-5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(59,130,246,0.24)] transition hover:brightness-110"
            >
              Spin now
            </button>
            <button
              type="button"
              onClick={onMaybeLater}
              className="h-11 rounded-2xl border border-white/10 bg-white/[0.06] px-5 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CelebrationBursts({
  anchorClassName,
  particleCount = 18,
  burstScale = 1,
  dotSize = 2,
}: {
  anchorClassName?: string;
  particleCount?: number;
  burstScale?: number;
  dotSize?: number;
}) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${anchorClassName ?? ""}`}>
      {Array.from({ length: particleCount }).map((_, index) => {
        const angle = (index / particleCount) * Math.PI * 2;
        const x = Math.cos(angle) * (index % 2 === 0 ? 148 * burstScale : 108 * burstScale);
        const y = Math.sin(angle) * (index % 3 === 0 ? 92 * burstScale : 68 * burstScale);
        const colors = ["from-sky-300", "from-cyan-300", "from-emerald-300", "from-amber-200"];
        return (
          <motion.span
            key={index}
            className={`absolute left-1/2 top-1/2 rounded-full bg-gradient-to-r ${colors[index % colors.length]} via-white to-transparent shadow-[0_0_18px_rgba(255,255,255,0.35)]`}
            style={{ width: `${dotSize}px`, height: `${dotSize}px` }}
            initial={{ opacity: 0, scale: 0.2, x: 0, y: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1.08, 0.7], x, y }}
            transition={{ duration: 1.15, delay: index * 0.025, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

function PrizeWheel({
  spinResult,
  spinSequence,
  spinning,
  disabled,
  hasResult,
  onSpin,
}: {
  spinResult: ProTrialWheelSpinResult | null;
  spinSequence: number;
  spinning: boolean;
  disabled: boolean;
  hasResult: boolean;
  onSpin: () => Promise<ProTrialWheelSpinResult | null>;
}) {
  const geometry = useMemo(() => getPrizeGeometry(), []);
  const rotation = spinResult ? spinSequence * 2160 + wheelRotationForPrize(spinResult.prizeDurationDays) : 0;

  return (
    <div className={`relative mx-auto aspect-square w-full ${hasResult ? "max-w-[280px] sm:max-w-[320px] lg:max-w-[340px]" : "max-w-[320px] sm:max-w-[420px] lg:max-w-[520px]"}`}>
      <WheelPointer />

      <div className="absolute inset-[4%] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.24)_0%,rgba(34,197,94,0.1)_38%,rgba(15,23,42,0)_72%)] blur-2xl" />
      <div className="absolute inset-[1.5%] rounded-full border border-white/10 bg-white/[0.02] shadow-[0_0_70px_rgba(56,189,248,0.16)]" />

      <div
        className="absolute inset-[5.5%] rounded-full border border-white/12 bg-[#05070d] shadow-[0_34px_120px_rgba(0,0,0,0.58)]"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinResult ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.1,0.92,0.08,1)` : "none",
        }}
      >
        <svg viewBox="0 0 320 320" className="h-full w-full">
          <defs>
            <radialGradient id="wheelInnerGlow" cx="50%" cy="42%" r="65%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
              <stop offset="55%" stopColor="rgba(255,255,255,0.04)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>

          {geometry.map((segment) => {
            return (
              <g key={segment.durationDays}>
                <path d={describeArc(160, 160, 146, segment.startAngle, segment.endAngle)} fill={segment.color} opacity="0.98" />
                <path d={describeArc(160, 160, 146, segment.startAngle, segment.endAngle)} fill="rgba(255,255,255,0.04)" />
                <path d={describeArc(160, 160, 146, segment.startAngle, segment.endAngle)} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.4" />
              </g>
            );
          })}

          <circle cx="160" cy="160" r="148" fill="url(#wheelInnerGlow)" />
          <circle cx="160" cy="160" r="56" fill="rgba(5,10,18,0.96)" stroke="rgba(255,255,255,0.14)" strokeWidth="1.6" />
          <circle cx="160" cy="160" r="40" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.08)" />
        </svg>
      </div>

      {geometry.map((segment) => {
        const ultraNarrow = segment.sweep < 12;
        const narrow = segment.sweep < 24;
        const badgeRadius = ultraNarrow ? 176 : narrow ? 171 : segment.sweep < 70 ? 166 : 162;
        const pointerRadius = ultraNarrow ? 154 : narrow ? 150 : 148;
        const badgePoint = polarToCartesian(160, 160, badgeRadius, segment.midAngle);
        const pointerPoint = polarToCartesian(160, 160, pointerRadius, segment.midAngle);
        const badgeWidth = ultraNarrow ? 42 : narrow ? 52 : 60;
        const badgeHeight = ultraNarrow ? 28 : 30;
        const jackpot = segment.weight === 1;
        const badgeClassName = jackpot
          ? "border-white/18 bg-slate-950/88 shadow-[0_0_24px_rgba(255,255,255,0.12),0_0_30px_rgba(168,85,247,0.16)]"
          : "border-white/10 bg-slate-950/82 shadow-[0_10px_26px_rgba(2,6,23,0.3)]";
        const textClassName = jackpot
          ? "bg-[linear-gradient(90deg,#fb7185_0%,#f59e0b_22%,#fde047_40%,#4ade80_58%,#60a5fa_76%,#c084fc_100%)] bg-clip-text text-transparent drop-shadow-[0_0_14px_rgba(192,132,252,0.22)]"
          : "text-slate-100";

        return (
          <div key={`badge-${segment.durationDays}`} className="pointer-events-none absolute inset-0">
            <div
              className="absolute h-px origin-left bg-gradient-to-r from-white/0 via-white/18 to-white/0"
              style={{
                left: unitToPercent(pointerPoint.x),
                top: unitToPercent(pointerPoint.y),
                width: unitToPercent(Math.max(10, badgeRadius - pointerRadius - 12)),
                transform: `rotate(${segment.midAngle}deg)`,
              }}
            />
            <div
              className="absolute"
              style={{
                left: unitToPercent(badgePoint.x - badgeWidth / 2),
                top: unitToPercent(badgePoint.y - badgeHeight / 2),
              }}
            >
              <div
                className={`flex items-center justify-center rounded-full border px-3 py-1 text-center backdrop-blur-xl ${badgeClassName}`}
                style={{
                  minWidth: `clamp(${Math.max(38, badgeWidth - 8)}px, ${unitToPercent(badgeWidth)}, ${badgeWidth}px)`,
                  minHeight: `clamp(${Math.max(24, badgeHeight - 4)}px, ${unitToPercent(badgeHeight)}, ${badgeHeight}px)`,
                }}
              >
                <span className={`text-[11px] font-black leading-none sm:text-xs ${textClassName}`}>{segment.weight}%</span>
              </div>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => void onSpin()}
        disabled={disabled}
        className="absolute left-1/2 top-1/2 z-20 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-white/16 bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.22),rgba(255,255,255,0.04)_48%,rgba(2,6,23,0.96)_100%)] text-white shadow-[0_22px_55px_rgba(0,0,0,0.5),0_0_28px_rgba(56,189,248,0.18)] transition duration-200 hover:scale-[1.03] hover:shadow-[0_26px_65px_rgba(0,0,0,0.58),0_0_34px_rgba(56,189,248,0.24)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="text-[22px] font-black uppercase tracking-[0.28em]">{spinning ? "..." : "Spin"}</span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-300">
          {spinning ? "In Motion" : "Win Pro"}
        </span>
      </button>
    </div>
  );
}

function PrizeOdds() {
  return (
    <div className="space-y-2.5">
      {PRO_TRIAL_WHEEL_PRIZES.map((prize) => {
        const legendary = prize.tier === "Legendary";

        return (
          <div
            key={prize.durationDays}
            className={`rounded-2xl border px-3.5 py-3 ${
              legendary
                ? "border-amber-300/25 bg-amber-300/[0.08] shadow-[0_0_18px_rgba(251,191,36,0.08)]"
                : "border-white/8 bg-white/[0.035]"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-100">{prize.label}</p>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      legendary ? "text-amber-100" : "text-white"
                    }`}
                    style={{ backgroundColor: prize.color }}
                  >
                    {prize.weight}%
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className={`text-[11px] uppercase tracking-[0.18em] ${legendary ? "text-amber-200/85" : "text-slate-400"}`}>
                    {prize.tier}
                  </p>
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.08]">
                    <div className="h-full rounded-full" style={{ width: `${prize.weight}%`, backgroundColor: prize.color }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompactPrizeOdds() {
  return (
    <div className="space-y-2">
      {PRO_TRIAL_WHEEL_PRIZES.map((prize) => (
        <div key={prize.durationDays} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: prize.color }} />
            <span className={`text-sm font-medium ${prize.tier === "Legendary" ? "text-amber-100" : "text-slate-200"}`}>
              {prize.label}
            </span>
          </div>
          <span className="text-sm font-semibold text-slate-300">{prize.weight}%</span>
        </div>
      ))}
    </div>
  );
}

function ResultCard({
  spinResult,
  expired,
  countdownLabel,
  onUseCode,
}: {
  spinResult: ProTrialWheelSpinResult;
  expired: boolean;
  countdownLabel: string;
  onUseCode: (code: string) => void;
}) {
  const prize = PRO_TRIAL_WHEEL_PRIZES.find((entry) => entry.durationDays === spinResult.prizeDurationDays);
  const celebration = getCelebrationConfig(spinResult.prizeDurationDays);

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[linear-gradient(145deg,rgba(59,130,246,0.14),rgba(15,23,42,0.92)_40%,rgba(16,185,129,0.12))] p-4 shadow-[0_24px_80px_rgba(2,6,23,0.4)] sm:p-5">
      <div className="pointer-events-none absolute inset-x-10 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.15),rgba(255,255,255,0)_72%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,rgba(250,204,21,0.16),rgba(15,23,42,0)_38%)]" />
      <CelebrationBursts
        anchorClassName="opacity-90"
        particleCount={celebration.particleCount}
        burstScale={celebration.burstScale}
        dotSize={celebration.dotSize}
      />

      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{
              borderColor: prize ? `${prize.color}55` : "rgba(255,255,255,0.12)",
              backgroundColor: prize ? `${prize.color}22` : "rgba(255,255,255,0.06)",
              color: prize?.tier === "Legendary" ? "#fde68a" : "#e2e8f0",
            }}
          >
            {prize?.tier ?? "Reward"}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
            One-time code
          </span>
        </div>

        <p className={`mt-3 text-base font-semibold uppercase tracking-[0.26em] ${celebration.titleClassName}`}>
          Congratulations
        </p>
        <p className={`mt-1 text-2xl font-semibold tracking-tight sm:text-3xl ${celebration.titleClassName}`}>
          You won {spinResult.prizeDurationDays} Days Pro!
        </p>
        <p className="mt-1.5 text-sm text-slate-300">
          {expired
            ? "This code expired. Your free Pro Trial spin has already been used."
            : "Your one-time code is ready. Redeem it before the countdown ends."}
        </p>

        <div className="mt-4 rounded-[24px] border border-white/10 bg-black/25 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Your one-time code</p>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5">
            <code className="min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2.5 font-mono text-base font-semibold tracking-[0.16em] text-slate-50 sm:text-lg">
              {spinResult.code}
            </code>
            {!expired ? (
              <CopyButton
                text={spinResult.code}
                className="h-10 rounded-2xl border border-white/12 bg-white/[0.08] px-4 text-sm font-semibold text-slate-100"
              />
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2.5 text-sm">
            <div className={`rounded-full border px-3 py-1.5 ${expired ? "border-red-400/20 bg-red-500/10 text-red-100" : "border-amber-300/18 bg-amber-300/10 text-amber-100"}`}>
              {expired ? "Expired" : `Expires in ${countdownLabel}`}
            </div>
            {!expired ? <p className="text-slate-400">Valid until {formatDateTime(spinResult.codeExpiresAt)}</p> : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {!expired ? (
            <button
              type="button"
              onClick={() => onUseCode(spinResult.code)}
              className="h-12 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-500 to-emerald-400 px-5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(59,130,246,0.26)] transition hover:brightness-110"
            >
              Redeem Now
            </button>
          ) : null}
          <button
            type="button"
            disabled
            className="h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-slate-400 opacity-75"
          >
            Free spin used
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProTrialWheelModal({
  open,
  onClose,
  onUseCode,
  status,
  spinResult,
  spinSequence,
  spinning,
  error,
  onSpin,
}: {
  open: boolean;
  onClose: () => void;
  onUseCode: (code: string) => void;
  status: ProTrialWheelStatus | null;
  spinResult: ProTrialWheelSpinResult | null;
  spinSequence: number;
  spinning: boolean;
  error: string | null;
  onSpin: () => Promise<ProTrialWheelSpinResult | null>;
}) {
  const [revealedResult, setRevealedResult] = useState<ProTrialWheelSpinResult | null>(spinResult);
  const [msRemaining, setMsRemaining] = useState(0);
  const [oddsExpanded, setOddsExpanded] = useState(false);
  const revealTimeoutRef = useRef<number | null>(null);
  const previousSpinSequenceRef = useRef(spinSequence);

  useEffect(() => {
    if (revealTimeoutRef.current) {
      window.clearTimeout(revealTimeoutRef.current);
      revealTimeoutRef.current = null;
    }

    if (!spinResult) {
      setRevealedResult(null);
      previousSpinSequenceRef.current = spinSequence;
      return;
    }

    if (spinSequence !== previousSpinSequenceRef.current) {
      previousSpinSequenceRef.current = spinSequence;
      setRevealedResult(null);
      revealTimeoutRef.current = window.setTimeout(() => {
        setRevealedResult(spinResult);
        revealTimeoutRef.current = null;
      }, SPIN_DURATION_MS);
      return;
    }

    setRevealedResult(spinResult);
  }, [spinResult, spinSequence]);

  useEffect(() => {
    return () => {
      if (revealTimeoutRef.current) window.clearTimeout(revealTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!revealedResult) {
      setMsRemaining(0);
      return;
    }

    const expiresAt = new Date(revealedResult.codeExpiresAt).getTime();
    if (!Number.isFinite(expiresAt)) {
      setMsRemaining(0);
      return;
    }

    const update = () => setMsRemaining(Math.max(0, expiresAt - Date.now()));
    update();

    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [revealedResult]);

  useEffect(() => {
    setOddsExpanded(false);
  }, [revealedResult]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const resultExpired = Boolean(revealedResult && msRemaining <= 0);
  const canSpin = Boolean(status?.canSpin);
  const debugHint = process.env.NODE_ENV !== "production" && status?.devUnlimitedSpins;
  const hasResult = Boolean(revealedResult);
  const celebration = getCelebrationConfig(revealedResult?.prizeDurationDays);
  const alreadyUsed = Boolean(status?.hasSpun);

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(2,6,23,0.82)] backdrop-blur-[6px]" onClick={onClose} />

      <div className="relative w-[min(1120px,calc(100vw-24px))] max-h-[min(92vh,860px)] overflow-hidden rounded-[32px] border border-white/12 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.92))] shadow-[0_42px_140px_rgba(0,0,0,0.64)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),rgba(15,23,42,0)_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),rgba(15,23,42,0)_36%)]" />
        <div className="pointer-events-none absolute inset-[1px] rounded-[31px] border border-white/[0.06]" />

        {revealedResult ? (
          <CelebrationBursts
            anchorClassName="top-[16%]"
            particleCount={celebration.particleCount}
            burstScale={celebration.burstScale}
            dotSize={celebration.dotSize}
          />
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-950/80 text-slate-200 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:bg-white/10"
          aria-label="Close prize wheel"
        >
          X
        </button>

        <div className="relative px-5 pb-2 pt-5 pr-16 sm:px-6 sm:pt-6 sm:pr-20">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-sky-200/80">NexusDesk Pro Trial</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-[30px]">Win a Free Pro Trial</h2>
          </div>
        </div>

        <div className="wheel-modal-scrollbar relative max-h-[calc(min(92vh,860px)-64px)] overflow-y-auto px-5 pb-5 pt-2 pr-5 sm:px-6 sm:pb-6 sm:pr-6">
          <div
            className={`grid gap-6 lg:gap-8 ${
              hasResult
                ? "grid-cols-1 lg:grid-cols-[minmax(280px,420px)_minmax(360px,1fr)] lg:items-start"
                : "grid-cols-1 lg:grid-cols-[minmax(420px,1fr)_minmax(420px,620px)] lg:items-center"
            }`}
          >
          <section className="relative">
            <div className={`rounded-[30px] border border-white/10 bg-white/[0.035] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${hasResult ? "p-3.5 sm:p-4" : "p-4 sm:p-5"}`}>
              <PrizeWheel
                spinResult={spinResult}
                spinSequence={spinSequence}
                spinning={spinning}
                disabled={spinning || !canSpin}
                hasResult={hasResult}
                onSpin={onSpin}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div className={`rounded-[28px] border border-white/10 bg-white/[0.045] shadow-[0_24px_80px_rgba(2,6,23,0.32)] ${hasResult ? "p-4 sm:p-[18px]" : "p-5"}`}>
              <AnimatePresence mode="wait">
                {revealedResult ? (
                  <motion.div
                    key={`result-${spinSequence}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                  >
                    <ResultCard
                      spinResult={revealedResult}
                      expired={resultExpired}
                      countdownLabel={formatCountdown(msRemaining)}
                      onUseCode={onUseCode}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key={spinning ? "spinning" : "intro"}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                        Reward Wheel
                      </span>
                      {status?.activeTrialEndsAt ? (
                        <span className="rounded-full border border-emerald-400/18 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-100">
                          Active trial ends {formatDateTime(status.activeTrialEndsAt)}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-4 text-sm leading-7 text-slate-300">
                      Spin the wheel to generate a one-time Pro trial code. Codes expire in 10 minutes.
                    </p>

                    {alreadyUsed ? (
                      <div className="mt-4 rounded-2xl border border-amber-300/18 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                        You&apos;ve already used your free Pro Trial spin.
                      </div>
                    ) : null}

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void onSpin()}
                        disabled={spinning || !canSpin}
                        className="h-12 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-500 to-emerald-400 px-5 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(59,130,246,0.24)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {spinning ? "Spinning..." : alreadyUsed ? "Spin Used" : "Spin Now"}
                      </button>
                    </div>

                    {spinning ? (
                      <div className="mt-4 rounded-2xl border border-sky-400/18 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
                        Spinning...
                      </div>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>

              {error ? (
                <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              ) : null}

              {debugHint ? (
                <p className="mt-4 text-[11px] leading-5 text-slate-500">
                  Development mode: local spins are unrestricted and generated codes stay in server memory only.
                </p>
              ) : null}
            </div>

            <div className={`rounded-[28px] border border-white/10 bg-white/[0.03] ${hasResult ? "p-4" : "p-5"}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Prize Odds</p>
                  {!hasResult ? <p className="mt-1 text-sm text-slate-300">Each slice matches the real drop rate.</p> : null}
                </div>
                {hasResult ? (
                  <button
                    type="button"
                    onClick={() => setOddsExpanded((value) => !value)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300 transition hover:bg-white/10"
                  >
                    {oddsExpanded ? "Hide" : "Show"}
                  </button>
                ) : (
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
                    5 tiers
                  </div>
                )}
              </div>

              <div className="mt-4">
                {hasResult ? (
                  oddsExpanded ? <CompactPrizeOdds /> : <p className="text-sm text-slate-400">View prize odds</p>
                ) : (
                  <PrizeOdds />
                )}
              </div>
            </div>
          </section>
        </div>
        </div>
      </div>
      <style jsx global>{`
        .wheel-modal-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(100, 116, 139, 0.82) rgba(15, 23, 42, 0.72);
        }

        .wheel-modal-scrollbar::-webkit-scrollbar {
          width: 10px;
        }

        .wheel-modal-scrollbar::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.72);
          border-radius: 999px;
        }

        .wheel-modal-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, rgba(71, 85, 105, 0.92), rgba(59, 130, 246, 0.38));
          border-radius: 999px;
          border: 2px solid rgba(15, 23, 42, 0.84);
        }

        .wheel-modal-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, rgba(100, 116, 139, 0.96), rgba(96, 165, 250, 0.48));
        }
      `}</style>
    </div>
  );
}
