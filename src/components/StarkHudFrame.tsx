"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

const StarkAmbient = dynamic(() => import("@/components/three/StarkAmbient"), {
  ssr: false,
});

export function StarkPanel({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformPerspective: 900 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function StarkHudFrame({
  children,
  dense = false,
}: {
  children: ReactNode;
  dense?: boolean;
}) {
  return (
    <div className="relative min-h-[calc(100vh-65px)]">
      <StarkAmbient />
      <div className={`relative z-10 ${dense ? "" : "mx-auto max-w-6xl px-6 py-10"}`}>{children}</div>
    </div>
  );
}
