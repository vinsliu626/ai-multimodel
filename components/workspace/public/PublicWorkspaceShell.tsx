"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getProviders, signIn, signOut, useSession, type ClientSafeProvider } from "next-auth/react";

import { useAppLanguage } from "@/components/app/AppLanguageProvider";
import { ProTrialWheelModal, ProTrialWheelReminderPrompt } from "@/components/billing/ProTrialWheelModal";
import { PlanModal } from "@/components/chat/billing/PlanModal";
import { PlanPillButton, PlanPillStyles } from "@/components/chat/billing/PlanPill";
import { RedeemModal } from "@/components/chat/billing/RedeemModal";
import type { Entitlement } from "@/components/chat/billing/types";
import { SettingsModal } from "@/components/chat/settings/SettingsModal";
import { ModeDropdown } from "@/components/chat/ui/workflow/ModeDropdown";
import type { ChatMode } from "@/components/chat/ui/workflow/types";
import { NexusOrb } from "@/components/shared/NexusOrb";
import { useProTrialWheel } from "@/lib/hooks/useProTrialWheel";
import { routeForMode } from "@/lib/productRoutes";

type RenderContext = {
  entitlement: Entitlement | null;
  locked: boolean;
  isZh: boolean;
  authLoading: boolean;
  refreshEntitlement: () => Promise<void>;
};

type RedeemSuccessState = {
  plan: string;
  grantEndAt: string | null;
};

function modeTitle(mode: ChatMode, isZh: boolean) {
  switch (mode) {
    case "normal":
      return isZh ? "💬 普通对话" : "💬 Chat / Normal";
    case "workflow":
      return isZh ? "⚙️ 工作流对话" : "⚙️ Chat / Workflow";
    case "detector":
      return isZh ? "🛡️ AI 检测器" : "🛡️ AI Detector";
    case "note":
      return isZh ? "📝 AI 笔记" : "📝 AI Note";
    case "study":
      return isZh ? "📚 AI 学习" : "📚 AI Study";
    case "humanizer":
      return isZh ? "✨ AI Humanizer" : "✨ AI Humanizer";
    case "converter":
      return isZh ? "🔄 转换器" : "🔄 Converter";
    default:
      return "NexusDesk";
  }
}

async function safeReadJson(res: Response) {
  const text = await res.text().catch(() => "");
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { text, data };
}

function HeaderAuthMenu({
  isZh,
  sessionExists,
  userInitial,
  userLabel,
  userEmail,
  visibleAuthProviders,
  onOpenAccount,
  onOpenBilling,
  onOpenSettings,
  onSignOut,
}: {
  isZh: boolean;
  sessionExists: boolean;
  userInitial: string;
  userLabel: string;
  userEmail: string;
  visibleAuthProviders: ClientSafeProvider[];
  onOpenAccount: () => void;
  onOpenBilling: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState<"signin" | "account" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(null);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(null);
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const copy = {
    signIn: isZh ? "登录" : "Sign in",
    continueWithGoogle: isZh ? "使用 Google 继续" : "Continue with Google",
    continueWithGitHub: isZh ? "使用 GitHub 继续" : "Continue with GitHub",
    noProviders: isZh ? "当前没有可用的登录方式。" : "No sign-in providers are currently available.",
    account: isZh ? "账户" : "Account",
    billing: isZh ? "套餐与额度" : "Billing",
    settings: isZh ? "设置" : "Settings",
    signOut: isZh ? "退出登录" : "Sign out",
  };

  return (
    <div ref={menuRef} className="relative">
      {sessionExists ? (
        <button
          onClick={() => setMenuOpen((current) => (current === "account" ? null : "account"))}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1.5 shadow-[0_10px_30px_rgba(2,6,23,0.2)] backdrop-blur-xl transition hover:bg-white/[0.07]"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400/90 via-blue-500/85 to-emerald-400/70 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_20px_rgba(2,6,23,0.22)]">
            {String(userInitial).toUpperCase()}
          </div>
          <div className="hidden min-w-0 sm:flex flex-col text-left leading-tight">
            <span className="max-w-[124px] truncate text-[12px] font-medium text-slate-100">{userLabel}</span>
            <span className="max-w-[124px] truncate text-[10px] text-slate-500">{userEmail}</span>
          </div>
          <span className="text-slate-500">▼</span>
        </button>
      ) : (
        <button
          onClick={() => setMenuOpen((current) => (current === "signin" ? null : "signin"))}
          className="rounded-full bg-gradient-to-r from-blue-500 via-sky-500 to-emerald-400 px-3 py-1.5 text-xs font-medium text-white shadow-md shadow-blue-500/40 transition-all hover:brightness-110"
        >
          {copy.signIn}
        </button>
      )}

      {menuOpen === "signin" && !sessionExists ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-56 rounded-3xl border border-white/10 bg-[#080808]/95 p-2 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur-xl">
          <div className="border-b border-white/8 px-3 py-2">
            <p className="text-sm font-semibold text-slate-50">{copy.signIn}</p>
          </div>
          <div className="space-y-1 px-1 py-2">
            {visibleAuthProviders.map((provider) => (
              <button
                key={provider.id}
                onClick={() => {
                  setMenuOpen(null);
                  signIn(provider.id);
                }}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm text-slate-100 transition hover:bg-white/10"
              >
                <span>
                  {provider.id === "google"
                    ? copy.continueWithGoogle
                    : provider.id === "github"
                      ? copy.continueWithGitHub
                      : provider.name}
                </span>
                <span className="text-slate-500">↗</span>
              </button>
            ))}
            {visibleAuthProviders.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-slate-400">
                {copy.noProviders}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {menuOpen === "account" && sessionExists ? (
        <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-56 rounded-3xl border border-white/10 bg-[#080808]/95 p-2 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur-xl">
          <div className="border-b border-white/8 px-3 py-2">
            <p className="truncate text-sm font-semibold text-slate-50">NexusDesk</p>
            <p className="truncate text-[11px] text-slate-500">{userEmail}</p>
          </div>
          <div className="space-y-1 px-1 py-2">
            <button
              onClick={() => {
                setMenuOpen(null);
                onOpenAccount();
              }}
              className="flex w-full items-center rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 transition hover:bg-white/10"
            >
              {copy.account}
            </button>
            <button
              onClick={() => {
                setMenuOpen(null);
                onOpenBilling();
              }}
              className="flex w-full items-center rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 transition hover:bg-white/10"
            >
              {copy.billing}
            </button>
            <button
              onClick={() => {
                setMenuOpen(null);
                onOpenSettings();
              }}
              className="flex w-full items-center rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-100 transition hover:bg-white/10"
            >
              {copy.settings}
            </button>
            <button
              onClick={() => {
                setMenuOpen(null);
                onSignOut();
              }}
              className="flex w-full items-center rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-sm text-red-100 transition hover:bg-red-500/15"
            >
              {copy.signOut}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CompactRouteIntro({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro: string;
}) {
  return (
    <div className="sr-only">
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <p>{intro}</p>
    </div>
  );
}

export function PublicWorkspaceShell({
  mode,
  children,
}: {
  mode: ChatMode;
  children: (context: RenderContext) => ReactNode;
}) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { lang, setLang, isZh, clearLang } = useAppLanguage();

  const [planOpen, setPlanOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemCodeValue, setRedeemCodeValue] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<RedeemSuccessState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authProviders, setAuthProviders] = useState<Record<string, ClientSafeProvider>>({});
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);

  const sessionExists = !!session;
  const authLoading = status === "loading";

  async function refreshEntitlement() {
    if (!sessionExists) {
      setEntitlement(null);
      return;
    }
    const res = await fetch("/api/billing/status", { cache: "no-store", credentials: "include" });
    const { data } = await safeReadJson(res);
    if (res.ok && data && typeof data === "object" && "ok" in data) {
      setEntitlement(data as Entitlement);
    }
  }

  useEffect(() => {
    void refreshEntitlement();
  }, [sessionExists]);

  useEffect(() => {
    if (sessionExists) return;
    let cancelled = false;

    void getProviders()
      .then((providers) => {
        if (!cancelled) setAuthProviders(providers ?? {});
      })
      .catch(() => {
        if (!cancelled) setAuthProviders({});
      });

    return () => {
      cancelled = true;
    };
  }, [sessionExists]);

  const visibleAuthProviders = ["google", "github"]
    .map((id) => authProviders[id])
    .filter((provider): provider is ClientSafeProvider => Boolean(provider));
  const userInitial = session?.user?.name?.[0] || session?.user?.email?.[0] || "U";
  const userLabel = session?.user?.name || session?.user?.email || "User";
  const userEmail = session?.user?.email || "";
  const trialWheel = useProTrialWheel({
    sessionExists,
    userId: session?.user?.id ?? session?.user?.email ?? null,
  });

  function openRedeemModal(prefillCode = "") {
    setRedeemError(null);
    setRedeemCodeValue(prefillCode);
    setRedeemOpen(true);
  }

  async function redeemCode(code: string) {
    setRedeemError(null);
    if (!code) return;
    setRedeemLoading(true);
    try {
      const res = await fetch("/api/billing/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ code }),
      });
      const { data } = await safeReadJson(res);
      if (!res.ok || !data || typeof data !== "object" || ("ok" in data && data.ok === false)) {
        throw new Error(
          data && typeof data === "object" && "message" in data && typeof data.message === "string"
            ? data.message
            : `Redeem error: ${res.status}`
        );
      }
      setRedeemSuccess({
        plan: typeof (data as { plan?: unknown }).plan === "string" ? (data as { plan: string }).plan : "pro",
        grantEndAt:
          typeof (data as { grantEndAt?: unknown }).grantEndAt === "string" ? (data as { grantEndAt: string }).grantEndAt : null,
      });
      setRedeemCodeValue("");
      await refreshEntitlement();
      setTimeout(() => {
        setRedeemOpen(false);
        setRedeemSuccess(null);
      }, 1400);
    } catch (error) {
      setRedeemError(error instanceof Error ? error.message : "Unable to redeem code.");
    } finally {
      setRedeemLoading(false);
    }
  }

  async function manageBilling(plan: "pro" | "ultra") {
    const billingRoute = entitlement?.plan === plan ? "/api/billing/portal" : "/api/billing/checkout";
    const res = await fetch(billingRoute, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      ...(billingRoute === "/api/billing/checkout" ? { body: JSON.stringify({ plan }) } : {}),
    });
    const { text, data } = await safeReadJson(res);
    if (!res.ok) {
      alert(`Checkout API failed (${res.status})\n` + (text || JSON.stringify(data || {})));
      return;
    }
    const url = data && typeof data === "object" && "url" in data && typeof data.url === "string" ? data.url : null;
    if (url) {
      window.location.href = url;
    }
  }

  function clearLocalData() {
    clearLang();
    try {
      window.localStorage.removeItem("theme");
    } catch {}
  }

  function onModeChange(next: ChatMode) {
    router.push(routeForMode(next));
  }

  return (
    <main className="min-h-screen w-screen overflow-hidden bg-[#030303] font-sans text-slate-200 selection:bg-blue-500/30 selection:text-blue-100">
      <PlanPillStyles />

      <div className="pointer-events-none absolute inset-0 z-0 opacity-20 base-grid" />
      <div className="pointer-events-none absolute -top-16 left-1/2 h-[520px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.14)_0%,rgba(56,189,248,0.08)_25%,rgba(16,185,129,0.05)_45%,rgba(2,6,23,0)_72%)] blur-3xl" />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-white/5 bg-[#080808]/80 px-4 backdrop-blur-md md:px-6">
          <div className="flex items-center gap-3">
            <div className="ml-1 flex items-center gap-3">
              <NexusOrb sizeClass="h-7 w-7" />
              <div className="flex flex-col">
                <p className="text-sm font-semibold tracking-wide text-slate-100">NexusDesk</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{modeTitle(mode, isZh)}</p>
              </div>
            </div>
          </div>

          <div className="hidden flex-1 items-center justify-center md:flex">
            <div className="rounded-full border border-white/5 bg-[#050505] p-0.5 shadow-inner">
              <PlanPillButton
                isZh={isZh}
                plan={entitlement?.plan ?? "basic"}
                unlimited={!!entitlement?.unlimited}
                onClick={() => {
                  void refreshEntitlement();
                  setPlanOpen(true);
                }}
              />
            </div>
          </div>

          <div className="mr-1 flex items-center gap-3 md:mr-2">
            <ModeDropdown value={mode} onChange={onModeChange} lang={lang} disabled={false} />
            <HeaderAuthMenu
              isZh={isZh}
              sessionExists={sessionExists}
              userInitial={String(userInitial)}
              userLabel={userLabel}
              userEmail={userEmail}
              visibleAuthProviders={visibleAuthProviders}
              onOpenAccount={() => router.push("/account")}
              onOpenBilling={() => {
                void refreshEntitlement();
                setPlanOpen(true);
              }}
              onOpenSettings={() => setSettingsOpen(true)}
              onSignOut={() => void signOut()}
            />
          </div>
        </header>

        {redeemSuccess ? (
          <div className="px-4 pt-4 md:px-8">
            <div className="rounded-[24px] border border-white/10 bg-gradient-to-r from-white/[0.04] via-blue-500/[0.08] to-emerald-400/[0.08] px-4 py-3 shadow-[0_18px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl">
              <p className="text-sm text-slate-100">
                {isZh ? "礼包已激活。" : "Gift activated."}{" "}
                <span className="text-slate-300">
                  {redeemSuccess.plan}
                  {redeemSuccess.grantEndAt ? ` · ${redeemSuccess.grantEndAt}` : ""}
                </span>
              </p>
            </div>
          </div>
        ) : null}

        <div className="relative z-10 flex-1 pb-4">
          {children({ entitlement, locked: !sessionExists, isZh, authLoading, refreshEntitlement })}
        </div>
      </div>

      <PlanModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        isZh={isZh}
        sessionExists={sessionExists}
        ent={entitlement}
        onOpenRedeem={() => {
          if (!sessionExists) return void signIn();
          openRedeemModal();
        }}
        onManageBilling={manageBilling}
        refreshEnt={refreshEntitlement}
      />

      <ProTrialWheelReminderPrompt
        open={trialWheel.reminderOpen}
        dontRemindAgain={trialWheel.reminderDismissed}
        onDontRemindAgainChange={trialWheel.setReminderDismissed}
        onSpinNow={trialWheel.openWheelFromReminder}
        onMaybeLater={() => trialWheel.closeReminder({ dontRemindAgain: trialWheel.reminderDismissed })}
      />

      <ProTrialWheelModal
        open={trialWheel.open}
        onClose={trialWheel.closeWheel}
        onUseCode={(code) => {
          openRedeemModal(code);
          trialWheel.clearSpinResult();
          trialWheel.closeWheel();
        }}
        status={trialWheel.status}
        spinResult={trialWheel.spinResult}
        spinSequence={trialWheel.spinSequence}
        spinning={trialWheel.spinning}
        error={trialWheel.error}
        onSpin={trialWheel.spinWheel}
      />

      <RedeemModal
        open={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        isZh={isZh}
        code={redeemCodeValue}
        onCodeChange={setRedeemCodeValue}
        onRedeem={redeemCode}
        onOpenTrialWheel={() => void trialWheel.openWheel()}
        loading={redeemLoading}
        error={redeemError}
        success={redeemSuccess}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        isZh={isZh}
        lang={lang}
        setLang={setLang}
        sessionExists={sessionExists}
        accountLabel={session?.user?.email ?? session?.user?.name ?? null}
        ent={entitlement}
        mode={mode}
        onOpenPlan={() => {
          void refreshEntitlement();
          setPlanOpen(true);
        }}
        onOpenRedeem={() => {
          if (!sessionExists) return void signIn();
          openRedeemModal();
        }}
        onSignOut={sessionExists ? () => void signOut() : undefined}
        onClearLocalData={clearLocalData}
      />

      <style jsx global>{`
        .base-grid {
          background-image: radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px);
          background-size: 24px 24px;
        }
      `}</style>
    </main>
  );
}
