"use client";

import { useEffect, useState } from "react";
import { effectsLevel, type EffectsLevel } from "@/frontend/settings";

/** Current effects level, or null before hydration so WebGL never mounts twice. */
export function useEffects(): EffectsLevel | null {
  const [level, setLevel] = useState<EffectsLevel | null>(null);

  useEffect(() => {
    const sync = () => setLevel(effectsLevel());
    sync();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    window.addEventListener("atrion-settings", sync);
    media.addEventListener("change", sync);
    return () => {
      window.removeEventListener("atrion-settings", sync);
      media.removeEventListener("change", sync);
    };
  }, []);

  return level;
}
