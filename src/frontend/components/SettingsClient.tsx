"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  listVoicesForLang,
  loadSettings,
  saveSettings,
  speakText,
  type AtrionSettings,
} from "@/frontend/settings";

const pillCls = (active: boolean) =>
  `rounded-full px-4 py-2 text-sm transition ${
    active
      ? "bg-accent/20 text-accent2 ring-1 ring-accent/40"
      : "border border-line text-muted hover:border-accent/30 hover:text-white"
  }`;

export default function SettingsClient() {
  const [settings, setSettings] = useState<AtrionSettings>(DEFAULT_SETTINGS);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    setSettings(loadSettings());
    const refresh = () => setVoices(listVoicesForLang(loadSettings().language));
    refresh();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = refresh;
    }
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  function update(partial: Partial<AtrionSettings>) {
    const next = saveSettings(partial);
    setSettings(next);
    if (partial.language) setVoices(listVoicesForLang(partial.language));
  }

  return (
    <div className="card glass p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent/80">Голос и единицы</p>
      <h2 className="display mt-2 text-xl font-semibold text-white">Озвучка</h2>

      <div className="mt-6 space-y-5">
        <div>
          <p className="text-xs text-muted">Эффекты и анимации</p>
          <div className="mt-2 flex gap-2">
            {(
              [
                ["full", "Полные"],
                ["lite", "Лёгкие"],
                ["off", "Выкл"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={settings.effects === value}
                onClick={() => update({ effects: value })}
                className={pillCls(settings.effects === value)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted/80">
            Полные - интро, частицы, переходы. Лёгкие - меньше частиц и кадров для слабых
            устройств и телефонов (выбирается автоматически). Выкл - только необходимое.
          </p>
        </div>

        <div>
          <p className="text-xs text-muted">Язык озвучки</p>
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
                onClick={() => update({ language: value, voiceURI: "" })}
                className={pillCls(settings.language === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="voice-select" className="text-xs text-muted">
            Голос (лучшие Neural/Google сверху)
          </label>
          <select
            id="voice-select"
            value={settings.voiceURI}
            onChange={(e) => update({ voiceURI: e.target.value })}
            className="mt-2 w-full rounded-xl border border-line bg-surface2 px-3 py-2.5 text-sm text-white transition focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <option value="">Авто (лучший)</option>
            {voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name} · {voice.lang}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="voice-rate" className="text-xs text-muted">
            Скорость речи: {settings.voiceRate.toFixed(2)}
          </label>
          <input
            id="voice-rate"
            type="range"
            min={0.85}
            max={1.15}
            step={0.01}
            value={settings.voiceRate}
            onChange={(e) => update({ voiceRate: Number(e.target.value) })}
            className="mt-2 w-full accent-[#a78bfa]"
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 transition hover:border-accent/30">
          <div>
            <p className="text-sm font-medium text-white">Голосовой режим</p>
            <p className="text-xs text-muted">Как ChatGPT: микрофон → ответ голосом</p>
          </div>
          <input
            type="checkbox"
            checked={settings.voiceEnabled}
            onChange={(e) => update({ voiceEnabled: e.target.checked })}
            className="h-4 w-4 accent-[#a78bfa]"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 transition hover:border-accent/30">
          <div>
            <p className="text-sm font-medium text-white">Авто-озвучка после генерации</p>
            <p className="text-xs text-muted">Говорить сразу, когда 3D готов</p>
          </div>
          <input
            type="checkbox"
            checked={settings.voiceAuto}
            onChange={(e) => update({ voiceAuto: e.target.checked })}
            disabled={!settings.voiceEnabled}
            className="h-4 w-4 accent-[#a78bfa] disabled:opacity-40"
          />
        </label>

        <div>
          <p className="text-xs text-muted">Единицы</p>
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
                className={pillCls(settings.units === value)}
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
