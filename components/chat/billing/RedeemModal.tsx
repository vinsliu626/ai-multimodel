"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

type RedeemSuccess = {
  plan: string;
  grantEndAt: string | null;
};

function formatGrantEndAt(grantEndAt: string | null, isZh: boolean) {
  if (!grantEndAt) return isZh ? "已激活" : "Active now";
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
  if (plan.toLowerCase() === "ultra") return isZh ? "Ultra 专业版" : "Ultra Pro";
  return plan;
}

export function RedeemModal({
  open,
  onClose,
  isZh,
  onRedeem,
  loading,
  error,
  success,
}: {
  open: boolean;
  onClose: () => void;
  isZh: boolean;
  onRedeem: (code: string) => void;
  loading: boolean;
  error: string | null;
  success: RedeemSuccess | null;
}) {
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!open) return;
    setCode("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        {success && (
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
        )}

        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <p className="text-sm font-semibold text-slate-50">
            {success ? (isZh ? "礼遇已激活" : "Gift activated") : isZh ? "兑换优惠码" : "Redeem code"}
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
                  {isZh ? "恭喜解锁" : "Congratulations!"}
                </p>
                <p className="mt-2 text-sm text-slate-200">
                  {isZh ? "你的礼包已经成功激活。" : "Your gift has been activated."}
                </p>
                <div className="mt-5 grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{isZh ? "计划" : "Plan"}</p>
                    <p className="mt-1 text-base font-semibold text-slate-50">{planLabel(success.plan, isZh)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{isZh ? "有效期至" : "Active until"}</p>
                    <p className="mt-1 text-base font-semibold text-slate-50">{formatGrantEndAt(success.grantEndAt, isZh)}</p>
                  </div>
                </div>
                <p className="mt-4 text-[12px] text-slate-400">
                  {isZh ? "正在完成激活并自动关闭…" : "Finishing activation and closing automatically..."}
                </p>
              </motion.div>
            </div>
          </div>
        ) : (
          <div className="px-5 py-4">
            <p className="text-[12px] text-slate-400">
              {isZh
                ? "输入有效优惠码后，将按该码配置获得 Pro 权限。"
                : "Enter a valid promo code to unlock Pro access for its configured duration."}
            </p>

            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={isZh ? "例如: PROMO-7DAY-2026" : "e.g. PROMO-7DAY-2026"}
              className="mt-3 h-11 w-full rounded-2xl border border-white/15 bg-slate-900 px-4 text-sm text-slate-100 focus:border-blue-500/70 focus:outline-none focus:ring-1 focus:ring-blue-500/70"
            />

            {error && (
              <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
                {error}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 h-10 rounded-2xl border border-white/10 bg-white/5 font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-60"
              >
                {isZh ? "取消" : "Cancel"}
              </button>
              <button
                onClick={() => onRedeem(code.trim())}
                disabled={loading || !code.trim()}
                className="flex-1 h-10 rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 font-semibold text-white shadow-md shadow-blue-500/30 transition hover:brightness-110 disabled:opacity-60"
              >
                {loading ? (isZh ? "校验中..." : "Checking...") : isZh ? "兑换" : "Redeem"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
