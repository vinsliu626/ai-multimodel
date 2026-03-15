"use client";

import { useMemo, useState } from "react";
import { countHumanizerWords } from "@/lib/humanizer/text";

type HumanizerEntitlement = {
  humanizerWordsPerWeek?: number;
  humanizerMaxInputWords?: number;
  humanizerMinInputWords?: number;
  usedHumanizerWordsThisWeek?: number;
};

type UsageState = {
  inputWords: number;
  outputWords: number;
  remainingWeeklyWords: number;
  weeklyLimit: number;
} | null;

function apiErrorMessage(payload: { error?: unknown; message?: unknown } | null | undefined, fallback: string) {
  const code = String(payload?.error || "");
  if (code === "HUMANIZER_WEEKLY_LIMIT_REACHED") return "You've reached your weekly Humanizer limit.";
  if (code === "HUMANIZER_INPUT_TOO_SHORT") return "Please enter at least 20 words.";
  if (code === "HUMANIZER_INPUT_TOO_LARGE") return "This request exceeds your plan's Humanizer limit.";
  if (code === "AUTH_REQUIRED") return "Please sign in to use AI Humanizer.";
  return typeof payload?.message === "string" && payload.message.trim() ? payload.message : fallback;
}

export function useHumanizerController({
  locked,
  entitlement,
  onUsageRefresh,
}: {
  locked: boolean;
  entitlement: HumanizerEntitlement | null;
  onUsageRefresh?: () => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<UsageState>(null);

  const inputWords = useMemo(() => countHumanizerWords(text), [text]);
  const weeklyLimit = usage?.weeklyLimit ?? entitlement?.humanizerWordsPerWeek ?? 0;
  const remainingWeeklyWords =
    usage?.remainingWeeklyWords ?? Math.max(0, (entitlement?.humanizerWordsPerWeek ?? 0) - (entitlement?.usedHumanizerWordsThisWeek ?? 0));
  const minWords = entitlement?.humanizerMinInputWords ?? 20;
  const maxWords = entitlement?.humanizerMaxInputWords ?? 0;

  const canSubmit =
    !locked &&
    !loading &&
    inputWords >= minWords &&
    (!!maxWords ? inputWords <= maxWords : true) &&
    text.trim().length > 0 &&
    remainingWeeklyWords > 0;

  async function humanize() {
    if (locked) {
      setError("Please sign in to use AI Humanizer.");
      return;
    }
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/humanizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) {
        throw new Error(apiErrorMessage(data, "Unable to humanize text right now."));
      }

      setOutput(String(data?.output ?? ""));
      setUsage(data?.usage ?? null);
      setSuccess("Text humanized.");
      await onUsageRefresh?.();
    } catch (humanizeError) {
      const message = humanizeError instanceof Error ? humanizeError.message : "Unable to humanize text right now.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return {
    text,
    output,
    error,
    success,
    loading,
    usage,
    inputWords,
    weeklyLimit,
    remainingWeeklyWords,
    minWords,
    maxWords,
    canSubmit,
    setText,
    humanize,
  };
}
