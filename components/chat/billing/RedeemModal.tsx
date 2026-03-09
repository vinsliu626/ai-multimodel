"use client";

import React, { useEffect, useState } from "react";

export function RedeemModal({
  open,
  onClose,
  isZh,
  onRedeem,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  isZh: boolean;
  onRedeem: (code: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!open) return;
    setCode("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-50">{isZh ? "\u5151\u6362\u4F18\u60E0\u7801" : "Redeem code"}</p>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 transition flex items-center justify-center text-slate-200"
          >
            X
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-[12px] text-slate-400">
            {isZh
              ? "\u8F93\u5165\u6709\u6548\u4F18\u60E0\u7801\u540E\uFF0C\u5C06\u6309\u8BE5\u7801\u914D\u7F6E\u83B7\u5F97 Pro \u6743\u9650\u3002"
              : "Enter a valid promo code to unlock Pro access for its configured duration."}
          </p>

          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={isZh ? "\u4F8B\u5982: PROMO-7DAY-2026" : "e.g. PROMO-7DAY-2026"}
            className="mt-3 w-full h-11 rounded-2xl bg-slate-900 border border-white/15 px-4 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500/70 focus:border-blue-500/70"
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
              className="flex-1 h-10 rounded-2xl bg-white/5 border border-white/10 text-slate-200 font-semibold hover:bg-white/10 transition disabled:opacity-60"
            >
              {isZh ? "\u53D6\u6D88" : "Cancel"}
            </button>
            <button
              onClick={() => onRedeem(code.trim())}
              disabled={loading || !code.trim()}
              className="flex-1 h-10 rounded-2xl bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-400 text-white font-semibold shadow-md shadow-blue-500/30 hover:brightness-110 transition disabled:opacity-60"
            >
              {loading ? (isZh ? "\u6821\u9A8C\u4E2D..." : "Checking...") : isZh ? "\u5151\u6362" : "Redeem"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}