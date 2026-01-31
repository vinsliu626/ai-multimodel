"use client";
import React from "react";

export function Sidebar({ children }: { children?: React.ReactNode }) {
  return <aside className="w-full">{children}</aside>;
}