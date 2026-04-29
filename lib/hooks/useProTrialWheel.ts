"use client";

import { useEffect, useState } from "react";
import type { ProTrialWheelSpinResult, ProTrialWheelStatus } from "@/lib/billing/proTrialWheelTypes";

const REMINDER_DISMISSED_STORAGE_KEY = "proWheelReminderDismissed";

async function readJson<T>(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return (text ? JSON.parse(text) : null) as T | null;
  } catch {
    return null;
  }
}

function fallbackStatus(userId: string): ProTrialWheelStatus {
  return {
    ok: true,
    userId,
    canSpin: true,
    devUnlimitedSpins: false,
    hasSpun: false,
    spinUsedAt: null,
    activeTrialEndsAt: null,
  };
}

export function useProTrialWheel({
  sessionExists,
  userId,
}: {
  sessionExists: boolean;
  userId: string | null | undefined;
}) {
  const [status, setStatus] = useState<ProTrialWheelStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderDismissed, setReminderDismissedState] = useState(false);
  const [reminderShownThisVisit, setReminderShownThisVisit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spinResult, setSpinResult] = useState<ProTrialWheelSpinResult | null>(null);
  const [spinSequence, setSpinSequence] = useState(0);

  async function refreshStatus() {
    if (!sessionExists) {
      setStatus(null);
      return null;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/billing/wheel/status", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await readJson<ProTrialWheelStatus>(res);
      if (!res.ok || !data?.ok) {
        setStatus(null);
        return null;
      }
      setStatus(data);
      return data;
    } finally {
      setLoading(false);
    }
  }

  function openWheel() {
    setError(null);
    setReminderOpen(false);
    if (sessionExists && userId && !status) {
      setStatus(fallbackStatus(userId));
    }
    setOpen(true);
    if (sessionExists) {
      void refreshStatus();
    }
  }

  function closeWheel() {
    setOpen(false);
    setError(null);
  }

  function setReminderDismissed(value: boolean) {
    setReminderDismissedState(value);
    if (typeof window === "undefined") return;
    if (value) {
      window.localStorage.setItem(REMINDER_DISMISSED_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(REMINDER_DISMISSED_STORAGE_KEY);
    }
  }

  function closeReminder(options?: { dontRemindAgain?: boolean }) {
    if (options?.dontRemindAgain) {
      setReminderDismissed(true);
    }
    setReminderOpen(false);
    setReminderShownThisVisit(true);
  }

  function openWheelFromReminder() {
    setReminderOpen(false);
    setReminderShownThisVisit(true);
    openWheel();
  }

  function clearSpinResult() {
    setSpinResult(null);
    setError(null);
  }

  async function spinWheel() {
    if (spinning) return null;

    setError(null);
    setSpinning(true);
    try {
      const res = await fetch("/api/billing/wheel/spin", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      const data = await readJson<ProTrialWheelSpinResult & { error?: string; message?: string }>(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || data?.error || "Unable to spin right now.");
      }
      setSpinResult(data);
      setStatus(data.status);
      setSpinSequence((value) => value + 1);
      return data;
    } catch (spinError) {
      setError(spinError instanceof Error ? spinError.message : "Unable to spin right now.");
      return null;
    } finally {
      setSpinning(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionExists, userId]);

  useEffect(() => {
    if (!sessionExists) {
      setOpen(false);
      setReminderOpen(false);
      setStatus(null);
      setSpinResult(null);
      setError(null);
      setSpinSequence(0);
      setReminderShownThisVisit(false);
    }
  }, [sessionExists]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setReminderDismissedState(window.localStorage.getItem(REMINDER_DISMISSED_STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!sessionExists) return;
    if (!status) return;
    if (reminderDismissed) return;
    if (!status.canSpin) return;
    if (reminderShownThisVisit) return;
    setReminderOpen(true);
    setReminderShownThisVisit(true);
  }, [sessionExists, status, reminderDismissed, reminderShownThisVisit]);

  return {
    status,
    open,
    reminderOpen,
    reminderDismissed,
    loading,
    spinning,
    error,
    spinResult,
    spinSequence,
    refreshStatus,
    openWheel,
    openWheelFromReminder,
    closeWheel,
    closeReminder,
    setReminderDismissed,
    clearSpinResult,
    spinWheel,
  };
}
