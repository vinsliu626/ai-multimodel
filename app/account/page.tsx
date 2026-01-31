// app/account/page.tsx
"use client";

import { useBillingStatus } from "@/lib/hooks/useBillingStatus";
import { PlanCard } from "@/components/billing/PlanCard";
import { UsageCards } from "@/components/billing/UsageCards";

export default function AccountPage() {
  const { data, loading, refresh } = useBillingStatus();

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Account</h1>
        <button
          onClick={refresh}
          className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          Refresh
        </button>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : !data?.ok ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-red-700">
            Failed to load billing status. Are you logged in?
          </div>
        ) : (
          <div className="space-y-4">
            <PlanCard s={data} />
            <UsageCards s={data} />
          </div>
        )}
      </div>
    </div>
  );
}