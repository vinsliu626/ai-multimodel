"use client";
import React from "react";

export function ChatPanel({ children }: { children?: React.ReactNode }) {
  return <div className="flex-1 min-w-0">{children}</div>;
}