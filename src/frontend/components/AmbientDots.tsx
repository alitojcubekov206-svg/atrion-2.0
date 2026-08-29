"use client";

import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

export interface DriftDot {
  left: string;
  top: string;
  size: number;
  color: string;
  duration: number;
  delay: number;
}

/** Faint dot-grid texture, masked to fade out toward the edges. */
export function DotGrid({ className = "" }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute opacity-[0.25] [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)] ${className}`}
      style={{
        backgroundImage: "radial-gradient(circle, rgba(167,139,250,0.6) 1px, transparent 1px)",
        backgroundSize: "30px 30px",
      }}
    />
  );
}

/** Small ambient particles that slowly drift and pulse — cheap, no WebGL. */
export function AmbientDrift({ dots }: { dots: readonly DriftDot[] }) {
  return (
    <>
      {dots.map((dot, i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute rounded-full"
          style={{
            left: dot.left,
            top: dot.top,
            width: dot.size,
            height: dot.size,
            background: dot.color,
            boxShadow: `0 0 6px 1px ${dot.color}80`,
          }}
          animate={{ y: [0, -16, 0], opacity: [0.15, 0.7, 0.15] }}
          transition={{ duration: dot.duration, delay: dot.delay, repeat: Infinity, ease }}
        />
      ))}
    </>
  );
}
