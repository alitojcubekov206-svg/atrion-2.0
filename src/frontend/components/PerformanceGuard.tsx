"use client";

import { useEffect } from "react";
import { useEffects } from "@/frontend/effects";
import { capEffects, loadSettings } from "@/frontend/settings";

/**
 * Watches how smoothly the page actually runs and steps the decorative effects
 * down on devices that can't keep up. The hardware hints behind the first-visit
 * default (cores, memory, screen width) miss plenty of slow phones, so this
 * measures the browser's frame rate in short windows a moment after load: two
 * slow windows in a row lower the level one step (full → lite → off) and store
 * it as a cap. It never raises the level and stays out of the way once the
 * visitor has picked a level by hand.
 *
 * It also mirrors the level onto `<html data-effects>` so CSS can drop costly
 * styles such as backdrop blur.
 */

const START_DELAY_MS = 2500;
const WINDOW_MS = 3000;
const MAX_WINDOWS = 8;
const GOOD_WINDOWS_TO_STOP = 3;
/** A gap this long between frames means the tab was hidden or paused, not slow. */
const STALL_MS = 500;
/** Below this average frame rate a window counts as slow. */
const SLOW_FPS = { full: 40, lite: 24 } as const;
const PASSED_KEY = "atrion_perf_passed";

export default function PerformanceGuard() {
  const level = useEffects();

  useEffect(() => {
    if (level) document.documentElement.dataset.effects = level;
  }, [level]);

  useEffect(() => {
    if (level === null || level === "off") return;
    if (loadSettings().effectsManual) return;
    try {
      if (sessionStorage.getItem(PASSED_KEY) === level) return;
    } catch {
      // No session storage: measure on every load instead.
    }

    let raf = 0;
    let frames = 0;
    let windowStart = 0;
    let lastFrame = 0;
    let stalled = false;
    let windows = 0;
    let slowInRow = 0;
    let goodInRow = 0;

    const finishWindow = (now: number) => {
      const fps = (frames * 1000) / (now - windowStart);
      const valid = !stalled && !document.hidden;
      windows += 1;
      if (valid && fps < SLOW_FPS[level]) {
        slowInRow += 1;
        goodInRow = 0;
      } else if (valid) {
        slowInRow = 0;
        goodInRow += 1;
      }
      if (slowInRow >= 2) {
        // The level change re-runs this effect, which measures the lighter level next.
        capEffects(level === "full" ? "lite" : "off");
        return false;
      }
      if (goodInRow >= GOOD_WINDOWS_TO_STOP) {
        try {
          sessionStorage.setItem(PASSED_KEY, level);
        } catch {
          // Fine: it simply measures again on the next load.
        }
        return false;
      }
      return windows < MAX_WINDOWS;
    };

    const tick = (now: number) => {
      if (now - lastFrame > STALL_MS) stalled = true;
      lastFrame = now;
      frames += 1;
      if (now - windowStart >= WINDOW_MS) {
        if (!finishWindow(now)) return;
        frames = 0;
        windowStart = now;
        stalled = false;
      }
      raf = requestAnimationFrame(tick);
    };

    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame((now) => {
        windowStart = now;
        lastFrame = now;
        raf = requestAnimationFrame(tick);
      });
    }, START_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [level]);

  return null;
}
