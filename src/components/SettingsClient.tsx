"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  speakText,
  type AtrionSettings,
} from "@/lib/settings";

export default function SettingsClient() {
  const [settings, setSettings] = useState<AtrionSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function update(partial: Partial<AtrionSettings>) {
    setSettings(saveSettings(partial));
  }

  return (
    <div className="rounded-2xl border border-violet-400/20 bg-black/45 p-6 backdrop-blur-xl">
      <p className="text-[10px] uppercase tracking-[0.22em] text-violet-300/70">Preferences</p>
      <h2 className="display mt-2 text-xl font-semibold">Язык и голос</h2>

      <div className="mt-6 space-y-5">
        <div>
          <p className="text-xs text-slate-500">Язык интерфейса / озвучки</p>
          <div className="mt-2 flex gap-2">
            {(
              [
                ["ru", "Русский"],
                ["en", "English"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => update({ language: value })}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  settings.language === value
                    ? "bg-violet-400/25 text-violet-100 ring-1 ring-violet-400/40"
                    : "border border-white/10 text-slate-400 hover:border-violet-400/30"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Голосовой режим</p>
            <p className="text-xs text-slate-500">Как ChatGPT: микрофон → ответ голосом</p>
          </div>
          <input
            type="checkbox"
            checked={settings.voiceEnabled}
            onChange={(e) => update({ voiceEnabled: e.target.checked })}
            className="h-4 w-4 accent-violet-400"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Авто-озвучка после генерации</p>
            <p className="text-xs text-slate-500">Говорить сразу, когда 3D готов</p>
          </div>
          <input
            type="checkbox"
            checked={settings.voiceAuto}
            onChange={(e) => update({ voiceAuto: e.target.checked })}
            disabled={!settings.voiceEnabled}
            className="h-4 w-4 accent-violet-400 disabled:opacity-40"
          />
        </label>

        <div>
          <p className="text-xs text-slate-500">Единицы</p>
          <div className="mt-2 flex gap-2">
            {(
              [
                ["m", "Метры"],
                ["cm", "См"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => update({ units: value })}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  settings.units === value
                    ? "bg-violet-400/25 text-violet-100 ring-1 ring-violet-400/40"
                    : "border border-white/10 text-slate-400 hover:border-violet-400/30"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            speakText(
              settings.language === "en"
                ? "Atrion voice is ready. Your settings are saved."
                : "Голос Atrion готов. Настройки сохранены."
            )
          }
          className="btn-primary w-full rounded-full py-3 text-sm"
        >
          Проверить голос
        </button>
      </div>
    </div>
  );
}
