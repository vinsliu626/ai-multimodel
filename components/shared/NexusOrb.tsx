"use client";

import React from "react";

export function NexusOrb({
  className = "",
  sizeClass = "h-8 w-8",
}: {
  className?: string;
  sizeClass?: string;
}) {
  return (
    <>
      <div className={["relative", sizeClass, className].join(" ")}>
        <div className="nexus-avatar-frame absolute inset-0 rounded-2xl opacity-80" />
        <div className="nexus-avatar-glow absolute inset-0 rounded-2xl" />
        <div className="absolute inset-[1px] rounded-2xl border border-white/10 bg-[#0a0a0a]/84 backdrop-blur-md" />
        <div className="absolute inset-[7px] rounded-[0.9rem] bg-[linear-gradient(135deg,rgba(59,130,246,0.2),rgba(16,185,129,0.14),rgba(255,255,255,0.02))]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[0.8rem] font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-white/45">
            N
          </span>
        </div>
      </div>

      <style jsx>{`
        .nexus-avatar-frame {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.88), rgba(139, 92, 246, 0.78), rgba(16, 185, 129, 0.76));
        }

        .nexus-avatar-glow {
          background: radial-gradient(circle at 50% 50%, rgba(96, 165, 250, 0.22), transparent 72%);
          filter: blur(8px);
          opacity: 0.38;
        }
      `}</style>
    </>
  );
}
