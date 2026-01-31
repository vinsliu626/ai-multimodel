"use client";

import React, { useMemo, useRef, useState } from "react";
import { SessionMenuPortal } from "@/components/chat/history/SessionMenuPortal";

type ChatSession = {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export function ChatHistoryRow({
  s,
  isActive,
  isZh,
  busy,
  onSelect,
  onRenamed,
  onPinnedChange,
  onDeleted,
}: {
  s: ChatSession;
  isActive: boolean;
  isZh: boolean;
  busy: boolean;
  onSelect: () => void;
  onRenamed: () => void;
  onPinnedChange: () => void;
  onDeleted: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  const timeLabel = useMemo(() => {
    try {
      return new Date(s.createdAt).toLocaleString();
    } catch {
      return String(s.createdAt);
    }
  }, [s.createdAt]);

  async function doRename() {
    const next = prompt(isZh ? "输入新标题" : "New title", s.title || "");
    if (!next) return;

    const res = await fetch(`/api/chat/session/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    });

    if (!res.ok) {
      const t = await res.text();
      alert((isZh ? "重命名失败：" : "Rename failed: ") + t);
      return;
    }

    onRenamed();
  }

  async function doTogglePin() {
    const res = await fetch(`/api/chat/session/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !s.pinned }),
    });

    if (!res.ok) {
      const t = await res.text();
      alert((isZh ? "置顶失败：" : "Pin failed: ") + t);
      return;
    }

    onPinnedChange();
  }

  async function doDelete() {
    const ok = confirm(isZh ? "确认删除该对话？" : "Delete this chat?");
    if (!ok) return;

    const res = await fetch(`/api/chat/session/${s.id}`, { method: "DELETE" });
    if (!res.ok) {
      const t = await res.text();
      alert((isZh ? "删除失败：" : "Delete failed: ") + t);
      return;
    }

    onDeleted();
  }

  return (
    <div
      className={[
        "w-full flex items-center gap-1 px-2 py-1 rounded-2xl text-xs transition-all duration-150",
        isActive
          ? "bg-blue-500/20 border border-blue-400/70 text-slate-50 shadow-[0_0_0_1px_rgba(59,130,246,0.4)]"
          : "bg-slate-900/60 border border-white/5 text-slate-300 hover:border-blue-400/60 hover:bg-slate-900",
      ].join(" ")}
    >
      {/* 左侧点击区 */}
      <button
        disabled={busy}
        onClick={onSelect}
        className="flex-1 text-left flex flex-col gap-0.5 px-1 py-1 min-w-0 disabled:opacity-60"
      >
        <div className="flex items-center gap-2 min-w-0">
          {s.pinned && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-200 border border-amber-400/20">
              {isZh ? "置顶" : "Pinned"}
            </span>
          )}
          <span className="truncate font-medium text-[12px]">
            {s.title || (isZh ? "未命名会话" : "Untitled")}
          </span>
        </div>

        <span className="text-[10px] text-slate-500">{timeLabel}</span>
      </button>

      {/* 右侧三点菜单按钮 */}
      <button
        ref={anchorRef}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        className={[
          "h-8 w-8 shrink-0 rounded-full border border-white/10 bg-white/5",
          "hover:bg-white/10 transition flex items-center justify-center",
          "disabled:opacity-60",
        ].join(" ")}
        title={isZh ? "更多" : "More"}
      >
        <span className="text-slate-200 text-lg leading-none">⋯</span>
      </button>

      {/* ✅ Portal 菜单：再也不会被 sidebar 滚动裁切 */}
      <SessionMenuPortal
        open={menuOpen}
        anchorEl={anchorRef.current}
        onClose={() => setMenuOpen(false)}
        onRename={doRename}
        onTogglePin={doTogglePin}
        onDelete={doDelete}
        isPinned={!!s.pinned}
      />
    </div>
  );
}