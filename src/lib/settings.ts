"use client";

export type AtrionSettings = {
  language: "ru" | "en";
  voiceEnabled: boolean;
  voiceAuto: boolean;
  units: "m" | "cm";
};

const KEY = "atrion_settings_v1";

export const DEFAULT_SETTINGS: AtrionSettings = {
  language: "ru",
  voiceEnabled: true,
  voiceAuto: true,
  units: "m",
};

export function loadSettings(): AtrionSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(next: Partial<AtrionSettings>): AtrionSettings {
  const merged = { ...loadSettings(), ...next };
  localStorage.setItem(KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent("atrion-settings", { detail: merged }));
  return merged;
}

export function speakText(text: string, language?: "ru" | "en") {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const settings = loadSettings();
  if (!settings.voiceEnabled) return;
  const utter = new SpeechSynthesisUtterance(text.slice(0, 400));
  utter.lang = (language ?? settings.language) === "en" ? "en-US" : "ru-RU";
  utter.rate = 1.02;
  utter.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

export function stopSpeaking() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}
