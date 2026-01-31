"use client";

import { BillingStatus } from "@/lib/hooks/useBillingStatus";
import { fmtHours, fmtNumber, percent } from "@/lib/ui/format";

function Progress({ p }: { p: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-gray-100">
      <div className="h-2 rounded-full bg-gray-900" style={{ width: `${p}%` }} />
    </div>
  );
}

function Card({
  title,
  used,
  limit,
  unit,
}: {
  title: string;
  used: string;
  limit: string;
  unit?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-1 text-xl font-semibold">
        {used} <span className="text-sm font-normal text-gray-500">/ {limit}{unit ? ` ${unit}` : ""}</span>
      </div>
      <div className="mt-3">
        {/* Progress is rendered by parent (needs numeric) */}
      </div>
    </div>
  );
}

export function UsageCards({ s }: { s: BillingStatus }) {
  const chatLimit = s.chatPerDay; // null = unlimited
  const chatUsed = s.usedChatCountToday;

  const detLimit = s.detectorWordsPerWeek;
  const detUsed = s.usedDetectorWordsThisWeek;

  const noteLimit = s.noteSecondsPerWeek;
  const noteUsed = s.usedNoteSecondsThisWeek;

  const chatP = chatLimit == null ? 0 : percent(chatUsed, chatLimit);
  const detP = detLimit == null ? 0 : percent(detUsed, detLimit);
  const noteP = noteLimit == null ? 0 : percent(noteUsed, noteLimit);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-gray-500">Chat (today)</div>
        <div className="mt-1 text-xl font-semibold">
          {fmtNumber(chatUsed)}{" "}
          <span className="text-sm font-normal text-gray-500">
            / {chatLimit == null ? "∞" : fmtNumber(chatLimit)}
          </span>
        </div>
        <div className="mt-3">{chatLimit == null ? <div className="text-sm text-gray-500">Unlimited</div> : <Progress p={chatP} />}</div>
        <div className="mt-2 text-xs text-gray-500">✅ Only TEAM mode consumes chat quota (you set this rule)</div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-gray-500">AI Detector (this week)</div>
        <div className="mt-1 text-xl font-semibold">
          {fmtNumber(detUsed)}{" "}
          <span className="text-sm font-normal text-gray-500">
            / {detLimit == null ? "∞" : fmtNumber(detLimit)} words
          </span>
        </div>
        <div className="mt-3">{detLimit == null ? <div className="text-sm text-gray-500">Unlimited</div> : <Progress p={detP} />}</div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-gray-500">AI Note (this week)</div>
        <div className="mt-1 text-xl font-semibold">
          {fmtHours(noteUsed)}{" "}
          <span className="text-sm font-normal text-gray-500">
            / {noteLimit == null ? "∞" : fmtHours(noteLimit)}
          </span>
        </div>
        <div className="mt-3">{noteLimit == null ? <div className="text-sm text-gray-500">Unlimited</div> : <Progress p={noteP} />}</div>
      </div>
    </div>
  );
}