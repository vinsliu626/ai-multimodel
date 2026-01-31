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
    if (open) setCode("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-[94vw] max-w-[520px] rounded-3xl border border-white/10 bg-slate-950/85 shadow-2xl shadow-black/50 backdrop-blur-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-50">{isZh ? "兑换礼包码" : "Redeem code"}</div>
            <div className="mt-1 text-[11px] text-slate-400">{isZh ? "输入兑换码激活 Gift 权益" : "Enter a code to activate Gift entitlements"}</div>
          </div>
          <button
            className="h-9 w-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 transition"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          <label className="text-[11px] text-slate-400">{isZh ? "礼包码" : "Code"}</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={isZh ? "例如：GIFT-XXXX-XXXX" : "e.g. GIFT-XXXX-XXXX"}
            className="mt-2 w-full h-11 rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
          />

          {error && (
            <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
              {error}
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => onRedeem(code.trim())}
              disabled={loading || !code.trim()}
              className="flex-1 h-11 rounded-2xl bg-gradient-to-r from-blue-500 via-sky-500 to-emerald-400 text-white text-[12px] font-semibold shadow-md shadow-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed hover:brightness-110 transition"
            >
              {loading ? (isZh ? "兑换中…" : "Redeeming…") : isZh ? "确认兑换" : "Redeem"}
            </button>

            <button
              onClick={onClose}
              className="h-11 px-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-[12px] text-slate-100 transition"
            >
              {isZh ? "取消" : "Cancel"}
            </button>
          </div>

          <div className="mt-3 text-[11px] text-slate-500">
            {isZh ? "兑换成功后会自动刷新套餐状态。" : "Plan status will refresh after success."}
          </div>
        </div>
      </div>
    </div>
  );
}