"use client";

import React from "react";

export type ChatListItem = {
  id: string;
  title: string;
  updatedAt: string | number | Date;
  pinned?: boolean;
};

function fmtTime(d: ChatListItem["updatedAt"]) {
  const date = d instanceof Date ? d : new Date(d);
  // 你截图是：2026/1/30 01:11:08 这种格式
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1);
  const day = String(date.getDate());
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}:${ss}`;
}

export function ChatHistoryRow({
  item,
  isActive,
  isZh,
  onOpen,
  onRename,
  onDelete,
  onTogglePin,
}: {
  item: ChatListItem;
  isActive?: boolean;
  isZh: boolean;
  onOpen: () => void;
  onRename: (newTitle: string) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onTogglePin: () => void | Promise<void>;
}) {
  const [openMenu, setOpenMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function onDocDown(e: MouseEvent) {
      if (!openMenu) return;
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t)) setOpenMenu(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [openMenu]);

  async function handleRename() {
    setOpenMenu(false);
    const next = window.prompt(isZh ? "输入新的聊天名称：" : "New chat name:", item.title);
    const trimmed = (next ?? "").trim();
    if (!trimmed || trimmed === item.title) return;
    await onRename(trimmed);
  }

  async function handleDelete() {
    setOpenMenu(false);
    const ok = window.confirm(isZh ? "确定删除这条聊天记录吗？" : "Delete this chat?");
    if (!ok) return;
    await onDelete();
  }

  async function handlePin() {
    setOpenMenu(false);
    await onTogglePin();
  }

  return (
    <div
      className={[
        "group w-full rounded-2xl border px-4 py-3 text-left transition",
        isActive
          ? "border-white/15 bg-white/10"
          : "border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/15",
      ].join(" ")}
      onClick={onOpen}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {item.pinned && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-200 border border-amber-400/20">
                {isZh ? "置顶" : "Pinned"}
              </span>
            )}
            <div className="truncate text-[13px] font-semibold text-slate-50">
              {item.title || (isZh ? "未命名聊天" : "Untitled chat")}
            </div>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{fmtTime(item.updatedAt)}</div>
        </div>

        {/* ⋯ 菜单按钮 */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            aria-label="More"
            onClick={(e) => {
              e.stopPropagation(); // 不要触发 onOpen
              setOpenMenu((v) => !v);
            }}
            className={[
              "h-9 w-9 rounded-full border transition flex items-center justify-center",
              "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
              "opacity-100 md:opacity-0 md:group-hover:opacity-100",
            ].join(" ")}
          >
            ⋯
          </button>

          {openMenu && (
            <div
              className="absolute right-0 mt-2 w-40 rounded-2xl border border-white/10 bg-slate-950 shadow-xl overflow-hidden z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={handlePin}
                className="w-full text-left px-3 py-2 text-[12px] text-slate-100 hover:bg-white/5 transition"
              >
                {item.pinned ? (isZh ? "取消置顶" : "Unpin") : (isZh ? "置顶" : "Pin")}
              </button>

              <button
                type="button"
                onClick={handleRename}
                className="w-full text-left px-3 py-2 text-[12px] text-slate-100 hover:bg-white/5 transition"
              >
                {isZh ? "重命名" : "Rename"}
              </button>

              <div className="h-px bg-white/10" />

              <button
                type="button"
                onClick={handleDelete}
                className="w-full text-left px-3 py-2 text-[12px] text-rose-200 hover:bg-rose-500/10 transition"
              >
                {isZh ? "删除" : "Delete"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}