"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { useEffects } from "@/frontend/effects";
import PerformanceGuard from "@/frontend/components/PerformanceGuard";

export default function MotionProvider({ children }: { children: ReactNode }) {
  const level = useEffects();
  return (
    <MotionConfig reducedMotion={level === "off" ? "always" : "user"}>
      <PerformanceGuard />
      {children}
    </MotionConfig>
  );
}
