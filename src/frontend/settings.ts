"use client";

export type EffectsLevel = "full" | "lite" | "off";

export type AtrionSettings = {
  language: "ru" | "en";
  voiceEnabled: boolean;
  voiceAuto: boolean;
  units: "m" | "cm";
  voiceURI: string;
  voiceRate: number;
  effects: EffectsLevel;
  /** Set once the visitor picks a level themselves; automatic tuning then leaves it alone. */
  effectsManual?: boolean;
};

const KEY = "atrion_settings_v1";

export const DEFAULT_SETTINGS: AtrionSettings = {
  language: "ru",
  voiceEnabled: true,
  voiceAuto: false,
  units: "m",
  voiceURI: "",
  voiceRate: 1,
  effects: "full",
};

const EFFECTS_RANK: Record<EffectsLevel, number> = { off: 0, lite: 1, full: 2 };

let webglSupport: boolean | null = null;

/** Probed once per page: browsers cap how many WebGL contexts a page may create. */
function hasWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    webglSupport = Boolean(gl);
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

// First-visit default for the decorative effects: phones and low-spec machines
// start on "lite" so the landing doesn't stutter before the user ever finds
// the setting; devices that can barely run it, or can't run WebGL at all,
// start with effects off. An explicit choice in Settings overrides this.
export function detectEffectsLevel(): EffectsLevel {
  if (typeof window === "undefined") return "full";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "off";
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  if ((nav.deviceMemory ?? 8) <= 2 || !hasWebGL()) return "off";
  const weakCpu = (navigator.hardwareConcurrency ?? 8) <= 4;
  const lowMemory = (nav.deviceMemory ?? 8) <= 4;
  const phone = window.matchMedia("(max-width: 768px)").matches;
  const saveData = nav.connection?.saveData === true;
  return weakCpu || lowMemory || phone || saveData ? "lite" : "full";
}

/**
 * Ceiling set by `PerformanceGuard` after it measured this device stuttering.
 * It lasts a week, so a device that was only busy that day gets another try.
 */
const CAP_KEY = "atrion_effects_cap_v1";
const CAP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readEffectsCap(): EffectsLevel | null {
  try {
    const raw = localStorage.getItem(CAP_KEY);
    if (!raw) return null;
    const cap = JSON.parse(raw) as { level?: EffectsLevel; at?: number };
    if (!cap.level || !(cap.level in EFFECTS_RANK) || Date.now() - (cap.at ?? 0) > CAP_TTL_MS) {
      return null;
    }
    return cap.level;
  } catch {
    return null;
  }
}

/** Lowers the automatic effects level; never raises it and never overrides a manual choice. */
export function capEffects(level: Exclude<EffectsLevel, "full">) {
  try {
    localStorage.setItem(CAP_KEY, JSON.stringify({ level, at: Date.now() }));
  } catch {
    return;
  }
  window.dispatchEvent(new CustomEvent("atrion-settings"));
}

export function loadSettings(): AtrionSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<AtrionSettings>) : {};
    let effects = stored.effects ?? detectEffectsLevel();
    if (!stored.effectsManual) {
      const cap = readEffectsCap();
      if (cap && EFFECTS_RANK[cap] < EFFECTS_RANK[effects]) effects = cap;
    }
    return { ...DEFAULT_SETTINGS, ...stored, effects };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** The level to actually render at: the OS reduced-motion preference always wins. */
export function effectsLevel(): EffectsLevel {
  if (typeof window === "undefined") return "full";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "off";
  return loadSettings().effects;
}

export function saveSettings(next: Partial<AtrionSettings>): AtrionSettings {
  // Picking an effects level by hand takes over from the automatic tuning.
  const choosingEffects = next.effects !== undefined;
  const merged = { ...loadSettings(), ...next, ...(choosingEffects ? { effectsManual: true } : {}) };
  localStorage.setItem(KEY, JSON.stringify(merged));
  if (choosingEffects) {
    try {
      localStorage.removeItem(CAP_KEY);
    } catch {
      // Storage unavailable: the manual flag above already wins over any cap.
    }
  }
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
