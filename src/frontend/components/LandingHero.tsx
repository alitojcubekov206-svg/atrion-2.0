"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import HeroScene from "@/frontend/components/three/HeroSceneLoader";
import { AmbientDrift, DotGrid, type DriftDot } from "@/frontend/components/AmbientDots";

const ease = [0.22, 1, 0.36, 1] as const;

/** Kept over the text side of the hero, away from the 3D building on the right. */
const HERO_DRIFT_DOTS: readonly DriftDot[] = [
  { left: "6%", top: "18%", size: 2, color: "#a78bfa", duration: 8, delay: 0.2 },
  { left: "18%", top: "72%", size: 3, color: "#e879f9", duration: 9.4, delay: 1.5 },
  { left: "30%", top: "40%", size: 2, color: "#a78bfa", duration: 7.6, delay: 0.8 },
  { left: "10%", top: "50%", size: 2, color: "#a78bfa", duration: 10.2, delay: 2.1 },
  { left: "38%", top: "82%", size: 2, color: "#e879f9", duration: 8.8, delay: 0.5 },
  { left: "4%", top: "35%", size: 2, color: "#e879f9", duration: 11, delay: 1.1 },
  { left: "24%", top: "8%", size: 2, color: "#a78bfa", duration: 9.9, delay: 2.6 },
  { left: "16%", top: "60%", size: 3, color: "#a78bfa", duration: 8.4, delay: 0.4 },
];

const IDLE_DELAY_MS = 4500;
const AUTO_SCROLL_MS = 9000;
const SESSION_KEY = "atrion_auto_intro_played";

/**
 * Desktop's scroll-scrubbed showcase only plays while someone scrolls it —
 * so anyone who never scrolls, OR scrolls partway in and then stops (reading,
 * distracted, whatever), would otherwise get stuck on a half-built scene and
 * never see the payoff. This watches for idle time and, whenever the visitor
 * hasn't reached the end of the showcase yet, auto-scrolls the rest of the
 * way for them — from wherever they currently are, not just from the top.
 *
 * Any genuine scroll-intent input (wheel, touch-drag, the keys that actually
 * move the page) cancels an in-progress auto-scroll instantly and resets the
 * idle clock. A plain click/mousedown does NOT count — clicking to focus the
 * tab or clicking around while reading isn't the same as trying to scroll.
 *
 * Once the showcase has been reached (by any means), this stops for good for
 * the rest of the tab session — it's a one-time nudge, not a recurring one.
 */
const SCROLL_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
]);
const CHECK_INTERVAL_MS = 700;
const MIN_AUTO_SCROLL_MS = 1800;

function useAutoScrollIntro() {
  useEffect(() => {
    if (window.matchMedia("(max-width: 768px)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    let lastActivity = Date.now();
    let autoScrolling = false;
    let rafId = 0;

    const stopAutoScroll = () => {
      if (!autoScrolling) return;
      autoScrolling = false;
      cancelAnimationFrame(rafId);
    };

    const markActivity = () => {
      lastActivity = Date.now();
      stopAutoScroll();
    };

    const onKeydown = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) markActivity();
    };

    window.addEventListener("wheel", markActivity, { passive: true });
    window.addEventListener("touchstart", markActivity, { passive: true });
    window.addEventListener("keydown", onKeydown);

    const showcaseBottom = () => {
      const el = document.querySelector<HTMLElement>("[data-scroll-showcase]");
      return el ? el.getBoundingClientRect().bottom + window.scrollY - 4 : null;
    };

    const runAutoScroll = (target: number) => {
      autoScrolling = true;
      const startY = window.scrollY;
      const distance = target - startY;
      const fullDistance = window.innerHeight * 4.3;
      const duration = Math.max(
        MIN_AUTO_SCROLL_MS,
        Math.min(AUTO_SCROLL_MS, (Math.abs(distance) / fullDistance) * AUTO_SCROLL_MS)
      );
      const start = performance.now();
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const step = (now: number) => {
        if (!autoScrolling) return;
        const t = Math.min(1, (now - start) / duration);
        window.scrollTo(0, startY + distance * easeOutCubic(t));
        if (t < 1) {
          rafId = requestAnimationFrame(step);
        } else {
          autoScrolling = false;
        }
      };
      rafId = requestAnimationFrame(step);
    };

    const interval = window.setInterval(() => {
      if (autoScrolling) return;
      const bottom = showcaseBottom();
      if (bottom === null) return;

      if (window.scrollY >= bottom) {
        sessionStorage.setItem(SESSION_KEY, "1");
        window.clearInterval(interval);
        return;
      }
      if (Date.now() - lastActivity < IDLE_DELAY_MS) return;
      runAutoScroll(bottom);
    }, CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      stopAutoScroll();
      window.removeEventListener("wheel", markActivity);
      window.removeEventListener("touchstart", markActivity);
      window.removeEventListener("keydown", onKeydown);
    };
  }, []);
}

export default function LandingHero({ loggedIn }: { loggedIn: boolean }) {
  useAutoScrollIntro();

  return (
    <section className="relative flex min-h-screen items-end overflow-hidden px-6 pb-24 pt-28 md:items-center md:pb-0 md:pt-0">
      <HeroScene />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#050507]/85 via-[#050507]/35 to-transparent" />
      <DotGrid className="inset-y-0 left-0 w-full md:w-3/5" />
      <div className="pointer-events-none absolute -left-24 top-1/4 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.18),transparent_65%)] blur-2xl" />
      <div className="pointer-events-none absolute -left-10 bottom-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(232,121,249,0.12),transparent_65%)] blur-2xl" />
      <AmbientDrift dots={HERO_DRIFT_DOTS} />

      <div className="relative z-10 mx-auto w-full max-w-6xl pb-28 md:pb-32">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.14, delayChildren: 0.1 } },
          }}
          className="max-w-2xl"
        >
          <motion.p
            variants={{
              hidden: { opacity: 0, y: 10 },
              show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
            }}
            className="hud-chip inline-block rounded-full px-3 py-1 text-[10px] text-violet-200/90"
          >
            AI Design Engine
          </motion.p>

          <motion.h1
            variants={{
              hidden: { opacity: 0, y: 32, letterSpacing: "0.5em" },
              show: {
                opacity: 1,
                y: 0,
                letterSpacing: "-0.03em",
                transition: { duration: 1.2, ease },
              },
            }}
            className="display mt-6 text-6xl font-semibold leading-[0.88] text-white md:text-8xl lg:text-[7.75rem]"
          >
            ATRION
          </motion.h1>

          <motion.p
            variants={{
              hidden: { opacity: 0, y: 16 },
              show: {
                opacity: 1,
                y: 0,
                letterSpacing: "0.02em",
                transition: { duration: 0.9, ease },
              },
            }}
            className="display mt-5 text-2xl font-medium tracking-tight text-[#a78bfa] md:text-4xl"
          >
            Just build it.
          </motion.p>

          <motion.div
            variants={{
              hidden: { scaleX: 0, opacity: 0 },
              show: { scaleX: 1, opacity: 1, transition: { duration: 0.8, ease } },
            }}
            className="gold-line mt-7 w-24 origin-left"
          />

          <motion.p
            variants={{
              hidden: { opacity: 0, y: 12 },
              show: { opacity: 1, y: 0, transition: { duration: 0.75, ease } },
            }}
            className="mt-6 max-w-md text-[15px] leading-relaxed text-[#908a9e] md:text-base"
          >
            Скажи идею — получишь цельный 3D. Крути. Разбирай в воздухе. Прави через чат.
          </motion.p>

        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3"
      >
        <p className="text-[11px] uppercase tracking-[0.3em] text-[#8f8a82]">Прокрутите вниз</p>
        <div className="relative flex h-11 w-7 items-start justify-center rounded-full border-2 border-[#a78bfa]/60 p-1.5">
          <motion.span
            animate={{ y: [0, 14, 0], opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease }}
            className="h-2 w-2 rounded-full bg-[#a78bfa]"
            style={{ boxShadow: "0 0 8px 2px rgba(167,139,250,0.5)" }}
          />
        </div>
      </motion.div>
    </section>
  );
}
