"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { useEffects } from "@/frontend/effects";

export default function MotionProvider({ children }: { children: ReactNode }) {
  const level = useEffects();
  return <MotionConfig reducedMotion={level === "off" ? "always" : "user"}>{children}</MotionConfig>;
}
