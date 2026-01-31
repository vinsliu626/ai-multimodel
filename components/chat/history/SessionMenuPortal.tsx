"use client";

import React, { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

export function SessionMenuPortal({
  open,
  anchorEl,
  onClose,
  onRename,
  onTogglePin,
  onDelete,
  isPinned,
}: {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  isPinned: boolean;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;

    const calc = () => {
      const r = anchorEl.getBoundingClientRect();

      const menuW = 170;
      const menuH = 150;

      // 默认：菜单出现在按钮下方，右对齐按钮
      let left = r.right - menuW;
      let top = r.bottom + 8;

      // 视口边界 clamp（防止跑出屏幕导致被“看起来裁切”）
      const pad = 8;
      left = Math.max(pad, Math.min(left, window.innerWidth - menuW - pad));
      top = Math.max(pad, Math.min(top, window.innerHeight - menuH - pad));

      setPos({ top, left });
    };

    calc();
    window.addEventListener("resize", calc);
    window.addEventListener("scroll", calc, true); // 捕捉任意滚动容器滚动

    return () => {
      window.removeEventListener("resize", calc);
      window.removeEventListener("scroll", calc, true);
    };
  }, [open, anchorEl]);

  useLayoutEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // 点击菜单以外关闭（简单判断：如果点到 anchorEl 或菜单本体不关）
      if (anchorEl && (anchorEl === t || anchorEl.contains(t))) return;
      const menu = document.getElementById("__session_menu__");
      if (menu && (menu === t || menu.contains(t))) return;
      onClose();
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, onClose, anchorEl]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      id="__session_menu__"
      className="fixed z-[9999] w-[170px] rounded-2xl border border-white/10 bg-slate-950/95 backdrop-blur-xl shadow-2xl overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
    >
      <button
        onClick={() => {
          onClose();
          onRename();
        }}
        className="w-full text-left px-4 py-3 text-sm text-slate-100 hover:bg-white/5 transition"
      >
        Rename
      </button>

      <button
        onClick={() => {
          onClose();
          onTogglePin();
        }}
        className="w-full text-left px-4 py-3 text-sm text-slate-100 hover:bg-white/5 transition"
      >
        {isPinned ? "Unpin" : "Pin"}
      </button>

      <div className="h-px bg-white/10" />

      <button
        onClick={() => {
          onClose();
          onDelete();
        }}
        className="w-full text-left px-4 py-3 text-sm text-red-300 hover:bg-red-500/10 transition"
      >
        Delete
      </button>
    </div>,
    document.body
  );
}