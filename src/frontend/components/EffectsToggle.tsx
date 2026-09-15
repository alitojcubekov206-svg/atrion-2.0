"use client";

import { useEffect, useState } from "react";
import { loadSettings, saveSettings, type EffectsLevel } from "@/frontend/settings";

const OPTIONS: [EffectsLevel, string][] = [
  ["full", "полные"],
  ["lite", "лёгкие"],
  ["off", "выкл"],
];

export default function EffectsToggle() {
  const [value, setValue] = useState<EffectsLevel | null>(null);

  useEffect(() => {
    const sync = () => setValue(loadSettings().effects);
    sync();
    window.addEventListener("atrion-settings", sync);
    return () => window.removeEventListener("atrion-settings", sync);
  }, []);

  if (!value) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs" role="group" aria-label="Анимации">
      <span className="text-muted/70">Анимации:</span>
      {OPTIONS.map(([level, label]) => (
        <button
          key={level}
          type="button"
          aria-pressed={value === level}
          onClick={() => saveSettings({ effects: level })}
          className={`rounded-full px-2 py-0.5 transition ${
            value === level ? "bg-accent/20 text-accent2" : "text-muted hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
