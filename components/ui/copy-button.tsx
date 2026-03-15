"use client";

import { useEffect, useRef, useState } from "react";

type CopyButtonProps = {
  text: string;
  className?: string;
  onCopied?: () => void;
};

export function CopyButton({ text, className = "", onCopied }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const resetRef = useRef<number | null>(null);
  const toastRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetRef.current) window.clearTimeout(resetRef.current);
      if (toastRef.current) window.clearTimeout(toastRef.current);
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastRef.current) window.clearTimeout(toastRef.current);
    toastRef.current = window.setTimeout(() => setToast(null), 1500);
  }

  async function handleCopy() {
    if (!text?.trim()) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied?.();
      showToast("Text copied to clipboard");
      if (resetRef.current) window.clearTimeout(resetRef.current);
      resetRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast("Copy failed. Please try again.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleCopy()}
        disabled={!text?.trim()}
        className={[
          "rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        ].join(" ")}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      {toast ? (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/95 px-4 py-2 text-xs text-slate-100 shadow-[0_16px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          {toast}
        </div>
      ) : null}
    </>
  );
}
