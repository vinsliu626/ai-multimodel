// lib/hooks/useBillingStatus.ts
"use client";

import { useEffect, useState } from "react";

export type BillingStatus = {
  ok: boolean;
  userId: string;
  plan: "basic" | "pro" | "ultra";
  stripeStatus: string | null;
  daysLeft: number | null;
  entitled: boolean;

  unlimited: boolean;
  unlimitedSource: string | null;

  detectorWordsPerWeek: number | null;
  noteSecondsPerWeek: number | null;
  chatPerDay: number | null;
  canSeeSuspiciousSentences: boolean;

  usedDetectorWordsThisWeek: number;
  usedNoteSecondsThisWeek: number;
  usedChatCountToday: number;
};

export function useBillingStatus() {
  const [data, setData] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return { data, loading, refresh };
}