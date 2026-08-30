"use client";

export type AtrionSettings = {
  language: "ru" | "en";
  voiceEnabled: boolean;
  voiceAuto: boolean;
  units: "m" | "cm";
  voiceURI: string;
  voiceRate: number;
};

const KEY = "atrion_settings_v1";

export const DEFAULT_SETTINGS: AtrionSettings = {
  language: "ru",
  voiceEnabled: true,
  voiceAuto: false,
  units: "m",
  voiceURI: "",
  voiceRate: 1,
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

function scoreVoice(voice: SpeechSynthesisVoice, lang: "ru" | "en"): number {
  const target = lang === "en" ? "en" : "ru";
  if (!voice.lang.toLowerCase().startsWith(target)) return -100;
  let score = 10;
  const name = voice.name.toLowerCase();
  if (/neural|natural|online|google|premium|enhanced/i.test(name)) score += 40;
  if (/microsoft.*online|samantha|aria|jenny|irina.*online/i.test(name)) score += 25;
  if (/desktop|espeak|compact/i.test(name)) score -= 20;
  if (voice.localService === false) score += 15;
  return score;
}

export function pickBestVoice(
  language?: "ru" | "en",
  preferredURI?: string
): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const settings = loadSettings();
  const lang = language ?? settings.language;
  const uri = preferredURI ?? settings.voiceURI;
  if (uri) {
    const preferred = voices.find((v) => v.voiceURI === uri);
    if (preferred) return preferred;
  }
  return [...voices].sort((a, b) => scoreVoice(b, lang) - scoreVoice(a, lang))[0] ?? null;
}

export function listVoicesForLang(language?: "ru" | "en"): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  const lang = language ?? loadSettings().language;
  const prefix = lang === "en" ? "en" : "ru";
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith(prefix))
    .sort((a, b) => scoreVoice(b, lang) - scoreVoice(a, lang));
}

/**
 * Speak a line.
 *
 * `onEnd` always fires — on completion, on error, and when speech is switched
 * off entirely. A continuous voice session resumes listening from it, so a
 * callback that never arrives would leave the microphone dead.
 */
export function speakText(text: string, language?: "ru" | "en", onEnd?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.();
    return;
  }
  const settings = loadSettings();
  if (!settings.voiceEnabled) {
    onEnd?.();
    return;
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onEnd?.();
  };

  const run = () => {
    const utter = new SpeechSynthesisUtterance(text.slice(0, 400));
    const lang = language ?? settings.language;
    utter.lang = lang === "en" ? "en-US" : "ru-RU";
    utter.rate = Math.min(1.15, Math.max(0.85, settings.voiceRate || 1));
    utter.pitch = 1;
    const voice = pickBestVoice(lang);
    if (voice) utter.voice = voice;
    utter.onend = finish;
    utter.onerror = finish;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
    // Some Chrome builds drop `onend` for long utterances; this is the backstop.
    window.setTimeout(finish, Math.min(15000, 1800 + text.length * 90));
  };

  // Chrome loads voices async
  if (!window.speechSynthesis.getVoices().length) {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      run();
    };
    // fallback kick
    window.setTimeout(run, 250);
    return;
  }
  run();
}

export function stopSpeaking() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}
