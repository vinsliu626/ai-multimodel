"use client";

import { motion } from "framer-motion";

type RedeemSuccess = {
  plan: string;
  grantEndAt: string | null;
};

function formatGrantEndAt(grantEndAt: string | null, isZh: boolean) {
  if (!grantEndAt) return isZh ? "\u5df2\u6fc0\u6d3b" : "Active now";
  const parsed = new Date(grantEndAt);
  if (!Number.isFinite(parsed.getTime())) return grantEndAt;
  return new Intl.DateTimeFormat(isZh ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function planLabel(plan: string, isZh: boolean) {
  if (plan.toLowerCase() === "pro") return "Pro";
  if (plan.toLowerCase() === "ultra") return isZh ? "Ultra \u4e13\u4e1a\u7248" : "Ultra Pro";
  return plan;
}

export function RedeemModal({
  open,
  onClose,
  isZh,
  code,
  onCodeChange,
  onRedeem,
  onOpenTrialWheel,
  loading,
  error,
  success,
}: {
  open: boolean;
  onClose: () => void;
  isZh: boolean;
  code: string;
  onCodeChange: (code: string) => void;
  onRedeem: (code: string) => void | Promise<void>;
  onOpenTrialWheel?: () => void;
  loading: boolean;
  error: string | null;
  success: RedeemSuccess | null;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        {success ? (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-x-10 top-0 h-40 bg-gradient-to-b from-emerald-400/14 via-blue-500/10 to-transparent blur-3xl" />
            {Array.from({ length: 14 }).map((_, index) => {
              const angle = (index / 14) * Math.PI * 2;
              const x = Math.cos(angle) * (index % 2 === 0 ? 96 : 72);
              const y = Math.sin(angle) * (index % 3 === 0 ? 78 : 58);
              return (
                <motion.span
                  key={index}
                  className="absolute left-1/2 top-[42%] h-2 w-2 rounded-full bg-gradient-to-r from-blue-300 via-white to-emerald-300 shadow-[0_0_18px_rgba(96,165,250,0.65)]"
                  initial={{ opacity: 0, scale: 0.2, x: 0, y: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.4, 1.25, 0.85], x, y }}
                  transition={{ duration: 1.15, delay: index * 0.035, ease: "easeOut" }}
                />
              );
            })}
          </div>
        ) : null}

        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <p className="text-sm font-semibold text-slate-50">
            {success ? (isZh ? "\u793c\u5305\u5df2\u6fc0\u6d3b" : "Gift activated") : isZh ? "\u5151\u6362\u7801" : "Redeem code"}
          </p>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
          >
            X
          </button>
        </div>

        {success ? (
          <div className="relative px-5 py-5">
            <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-white/[0.06] via-blue-500/[0.07] to-emerald-400/[0.08] px-5 py-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl">
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="flex flex-col items-center text-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-emerald-300/20 bg-white/10 shadow-[0_0_32px_rgba(16,185,129,0.22)]">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-300 via-white to-emerald-300 shadow-[0_0_24px_rgba(96,165,250,0.55)]" />
                </div>
                <p className="mt-4 bg-gradient-to-r from-blue-200 via-white to-emerald-200 bg-clip-text text-3xl font-semibold tracking-tight text-transparent">
                  {isZh ? "\u606d\u559c\u89e3\u9501" : "Congratulations!"}
                </p>
                <p className="mt-2 text-sm text-slate-200">
                  {isZh ? "\u4f60\u7684\u793c\u5305\u5df2\u7ecf\u6210\u529f\u6fc0\u6d3b\u3002" : "Your gift has been activated."}
                </p>
                <div className="mt-5 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{isZh ? "\u8ba1\u5212" : "Plan"}</p>
                    <p className="mt-1 text-base font-semibold text-slate-50">{planLabel(success.plan, isZh)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{isZh ? "\u6709\u6548\u671f\u81f3" : "Active until"}</p>
                    <p className="mt-1 text-base font-semibold text-slate-50">{formatGrantEndAt(success.grantEndAt, isZh)}</p>
                  </div>
                </div>
                <p className="mt-4 text-[12px] text-slate-400">
                  {isZh ? "\u6b63\u5728\u5b8c\u6210\u6fc0\u6d3b\u5e76\u81ea\u52a8\u5173\u95ed..." : "Finishing activation and closing automatically..."}
                </p>
              </motion.div>
            </div>
          </div>
        ) : (
          <div className="px-5 py-4">
            <p className="text-[12px] text-slate-400">
              {isZh
                ? "\u8f93\u5165\u6709\u6548\u5151\u6362\u7801\u540e\uff0c\u5c06\u6309\u8be5\u7801\u7684\u914d\u7f6e\u89e3\u9501\u5bf9\u5e94\u65f6\u957f\u7684 Pro \u6743\u9650\u3002"
                : "Enter a valid promo code to unlock Pro access for its configured duration."}
            </p>

            <input
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder={isZh ? "\u4f8b\u5982\uff1aPROMO-7DAY-2026" : "e.g. PROMO-7DAY-2026"}
              className="mt-3 h-11 w-full rounded-2xl border border-white/15 bg-slate-900 px-4 text-sm text-slate-100 focus:border-blue-500/70 focus:outline-none focus:ring-1 focus:ring-blue-500/70"
            />

            {error ? (
              <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                {error}
              </div>
            ) : null}

            <div className="mt-4 flex gap-2">
              <button
                onClick={onClose}
                disabled={loading}
                className="h-10 flex-1 rounded-2xl border border-white/10 bg-white/5 font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-60"
              >
                {isZh ? "\u53d6\u6d88" : "Cancel"}
              </button>
              <button
                onClick={() => onRedeem(code.trim())}
                disabled={loading || !code.trim()}
                className="h-10 flex-1 rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 font-semibold text-white shadow-md shadow-blue-500/30 transition hover:brightness-110 disabled:opacity-60"
              >
                {loading ? (isZh ? "\u6821\u9a8c\u4e2d..." : "Checking...") : isZh ? "\u5151\u6362" : "Redeem"}
              </button>
            </div>

            <div className="mt-4 flex items-center justify-center">
              {onOpenTrialWheel ? (
                <button
                  onClick={onOpenTrialWheel}
                  className="rounded-full px-3 py-1 text-[12px] font-medium text-slate-300 transition hover:text-white"
                >
                  <span className="bg-gradient-to-r from-blue-200 via-slate-100 to-emerald-200 bg-clip-text text-transparent">
                    Spin for Pro Trial
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
