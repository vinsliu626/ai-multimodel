"use client";
import React from "react";

export function TopBar({ children }: { children?: React.ReactNode }) {
  return <header className="w-full">{children}</header>;
}