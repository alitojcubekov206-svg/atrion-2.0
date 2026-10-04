"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useEffects } from "@/frontend/effects";

export type CellsPhase = "input" | "checking" | "success" | "error";

const LENGTH = 6;
const randomDigits = () =>
  Array.from({ length: LENGTH }, () => String(Math.floor(Math.random() * 10)));

// Fixed so server and client markup match; spread wide and flat to read as a burst.
const SPARKS = Array.from({ length: 20 }, (_, i) => {
  const angle = (i / 20) * Math.PI * 2 + (i % 2 ? 0.16 : 0);
  const dist = 64 + (i % 3) * 24;
  return {
    x: Math.cos(angle) * dist * 1.9,
    y: Math.sin(angle) * dist * 0.7,
    size: i % 3 === 0 ? 5 : 3,
    delay: (i % 4) * 0.025,
  };
});
const FALL = [-22, 14, -9, 18, -15, 24];

const GLITCH_OFF = "0px 0px 0px rgba(255,60,110,0), 0px 0px 0px rgba(90,220,255,0)";
const GLITCH = [
  GLITCH_OFF,
  "3px 0px 0px rgba(255,60,110,0.9), -3px 0px 0px rgba(90,220,255,0.8)",
  "-2px 1px 0px rgba(255,60,110,0.9), 2px -1px 0px rgba(90,220,255,0.8)",
  "2px 0px 0px rgba(255,60,110,0.7), -1px 0px 0px rgba(90,220,255,0.6)",
  GLITCH_OFF,
];

/**
 * The six code cells and their check animation: digits scramble while a scan
 * beam sweeps the row, then lock in one by one. Success flips the cells,
 * collapses them into a check badge with a shockwave and sparks; failure
 * glitches the row red, shakes it and lets the digits fall away.
 */
export default function VerifyCodeCells({
  digits,
  activeIndex,
  phase,
  attempt,
}: {
  digits: string[];
  activeIndex: number;
  phase: CellsPhase;
  /** Bump to remount the row fresh after a finished attempt. */
  attempt: number;
}) {
  const level = useEffects();
  const lively = level !== "off";
  const [noise, setNoise] = useState<string[]>(randomDigits);
  const [locked, setLocked] = useState(LENGTH);

  useEffect(() => {
    if (phase === "checking") {
      setLocked(0);
      if (!lively) return;
      const id = setInterval(() => setNoise(randomDigits()), 55);
      return () => clearInterval(id);
    }
    if (phase === "success" || phase === "error") {
      let n = 0;
      const id = setInterval(() => {
        n += 1;
        setLocked(n);
        setNoise(randomDigits());
        if (n >= LENGTH) clearInterval(id);
      }, 55);
      return () => clearInterval(id);
    }
    setLocked(LENGTH);
  }, [phase, lively]);

  const shown = digits.map((d, i) =>
    phase === "input" || i < locked || !lively ? d : noise[i]
  );

  return (
    <div className="relative h-14" aria-hidden="true">
      <motion.div
        key={attempt}
        className="relative flex h-14 justify-between gap-2"
        initial={{ opacity: 0, y: 6 }}
        animate={
          phase === "error"
            ? { opacity: 1, y: 0, x: [0, -11, 10, -8, 6, -3, 0] }
            : { opacity: 1, y: 0, x: 0 }
        }
        transition={
          phase === "error"
            ? { x: { duration: 0.5, delay: 0.36, ease: "easeInOut" } }
            : { duration: 0.3 }
        }
      >
        {phase === "checking" && lively && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl">
            <motion.div
              className="absolute inset-y-0 w-20 bg-[linear-gradient(90deg,transparent,rgba(167,139,250,0.55),rgba(232,121,249,0.35),transparent)] blur-[2px]"
              initial={{ left: "-25%" }}
              animate={{ left: ["-25%", "110%"] }}
              transition={{ duration: 0.85, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        )}

        {shown.map((d, i) => {
          const isLocked = i < locked;
          const tone =
            phase === "error" && isLocked
              ? "border-red-400/70 bg-red-500/[0.1] text-red-100"
              : phase === "success" && isLocked
                ? "border-[#c4b5fd] bg-[linear-gradient(160deg,rgba(167,139,250,0.35),rgba(232,121,249,0.18))] text-white shadow-[0_0_24px_rgba(167,139,250,0.55)]"
                : phase === "checking" || phase === "success" || phase === "error"
                  ? "border-[#a78bfa]/45 bg-[#a78bfa]/[0.06] text-[#ddd6fe]"
                  : i === activeIndex
                    ? "border-[#a78bfa]/70 bg-[#a78bfa]/[0.06] text-white shadow-[0_0_0_3px_rgba(167,139,250,0.12)]"
                    : d
                      ? "border-white/20 bg-white/[0.03] text-white"
                      : "border-white/10 bg-white/[0.02] text-white";

          const animate =
            phase === "checking"
              ? { y: [0, -4, 0] }
              : phase === "success"
                ? { rotateX: 360, x: `${(2.5 - i) * 112}%`, scale: 0.4, opacity: 0 }
                : phase === "error"
                  ? { textShadow: GLITCH, y: 46, rotate: FALL[i], opacity: 0 }
                  : { y: 0 };

          const transition =
            phase === "checking"
              ? { duration: 0.8, repeat: Infinity, delay: i * 0.09, ease: "easeInOut" as const }
              : phase === "success"
                ? {
                    rotateX: { duration: 0.5, delay: i * 0.055, ease: "easeOut" as const },
                    x: { duration: 0.38, delay: 0.78, ease: [0.7, 0, 0.84, 0] as const },
                    scale: { duration: 0.38, delay: 0.78, ease: [0.7, 0, 0.84, 0] as const },
                    opacity: { duration: 0.18, delay: 1.0 },
                  }
                : phase === "error"
                  ? {
                      textShadow: { duration: 0.45, delay: 0.34 },
                      y: { duration: 0.5, delay: 0.95 + i * 0.045, ease: [0.55, 0, 1, 0.45] as const },
                      rotate: { duration: 0.5, delay: 0.95 + i * 0.045, ease: "easeIn" as const },
                      opacity: { duration: 0.35, delay: 1.1 + i * 0.045 },
                    }
                  : { duration: 0.2 };

          return (
            <motion.div
              key={i}
              className={`relative flex h-14 flex-1 items-center justify-center rounded-xl border text-2xl font-semibold tabular-nums transition-colors duration-200 ${tone}`}
              style={{ transformPerspective: 420 }}
              animate={animate}
              transition={transition}
            >
              {d}
            </motion.div>
          );
        })}
      </motion.div>

      {phase === "success" && (
        <div className="pointer-events-none absolute left-1/2 top-1/2">
          <motion.div
            className="absolute -left-24 -top-24 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(196,181,253,0.55),rgba(232,121,249,0.18)_40%,transparent_70%)]"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: [0.3, 1.5], opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.9, delay: 1.0, ease: "easeOut" }}
          />
          {[0, 0.14].map((delay) => (
            <motion.div
              key={delay}
              className="absolute -left-8 -top-8 h-16 w-16 rounded-full border-2 border-[#c4b5fd]"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 3.4, opacity: [0, 0.85, 0] }}
              transition={{ duration: 0.85, delay: 1.0 + delay, ease: "easeOut" }}
            />
          ))}
          {lively &&
            SPARKS.map((s, i) => (
              <motion.span
                key={i}
                className="absolute rounded-full bg-[#e9d5ff] shadow-[0_0_8px_rgba(232,121,249,0.9)]"
                style={{ width: s.size, height: s.size, left: -s.size / 2, top: -s.size / 2 }}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                animate={{ x: s.x, y: s.y, opacity: [0, 1, 0], scale: [0, 1.2, 0.4] }}
                transition={{ duration: 0.75, delay: 1.02 + s.delay, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          <motion.div
            className="absolute -left-7 -top-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#a78bfa,#e879f9)] shadow-[0_0_34px_rgba(196,181,253,0.7)]"
            initial={{ scale: 0, rotate: -120 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 17, delay: 0.98 }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <motion.path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="white"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 1.15, ease: "easeOut" }}
              />
            </svg>
          </motion.div>
        </div>
      )}
    </div>
  );
}
