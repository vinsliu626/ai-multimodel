"use client";

import { BillingStatus } from "@/lib/hooks/useBillingStatus";

function pillClass(ok: boolean) {
  return ok
    ? "bg-green-100 text-green-700"
    : "bg-red-100 text-red-700";
}

export function PlanCard({ s }: { s: BillingStatus }) {
  const entitled = Boolean(s.entitled);
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-gray-500">Plan</div>
          <div className="text-2xl font-semibold">{s.plan.toUpperCase()}</div>
          <div className="mt-1 text-sm text-gray-600">
            Stripe: <span className="font-medium">{s.stripeStatus ?? "—"}</span>
            {s.daysLeft != null ? (
              <span className="ml-2 text-gray-500">({s.daysLeft} days left)</span>
            ) : null}
          </div>
          {s.unlimited ? (
            <div className="mt-1 text-sm text-gray-600">
              Unlimited: <span className="font-medium">true</span>
              {s.unlimitedSource ? <span className="text-gray-500"> ({s.unlimitedSource})</span> : null}
            </div>
          ) : null}
        </div>

        <div className={`rounded-full px-3 py-1 text-sm font-medium ${pillClass(entitled)}`}>
          {entitled ? "Entitled" : "Not Entitled"}
        </div>
      </div>

      {!entitled && s.plan !== "basic" ? (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Your subscription is not active. Features may be downgraded to Basic.
        </div>
      ) : null}
    </div>
  );
}