"use client";

import { useEffect, useState } from "react";
import { INTRO_DONE_EVENT } from "@/frontend/components/three/CinematicIntro";

const GLYPHS = "ATRION01<>/\\|=+*#";

export default function ScrambleText({
  text,
  delay = 0,
  duration = 1100,
  className = "",
}: {
  text: string;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const [output, setOutput] = useState(text);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let timer = 0;
    let cancelled = false;

    const run = () => {
      timer = window.setTimeout(() => {
        let start = 0;
        const tick = (now: number) => {
          if (cancelled) return;
          if (!start) start = now;
          const p = Math.min(1, (now - start) / duration);
          const revealed = Math.floor(p * text.length);
          let next = "";
          for (let i = 0; i < text.length; i += 1) {
            const ch = text[i];
            if (ch === " " || i < revealed) next += ch;
            else next += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          }
          setOutput(p < 1 ? next : text);
          if (p < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      }, delay);
    };

    if (document.documentElement.dataset.intro === "playing") {
      window.addEventListener(INTRO_DONE_EVENT, run, { once: true });
    } else {
      run();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener(INTRO_DONE_EVENT, run);
    };
  }, [text, delay, duration]);

  return (
    <span className={className} aria-label={text}>
      {output}
    </span>
  );
}
