"use client";

import { loadSettings, speakText, stopSpeaking } from "@/lib/settings";

type SpeechRec = SpeechRecognition;

export function supportsSpeechRecognition(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createRecognizer(opts: {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}): SpeechRec | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;

  const settings = loadSettings();
  const rec = new Ctor();
  rec.lang = settings.language === "en" ? "en-US" : "ru-RU";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  rec.onresult = (event: SpeechRecognitionEvent) => {
    let interim = "";
    let finalText = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0]?.transcript ?? "";
      if (event.results[i].isFinal) finalText += chunk;
      else interim += chunk;
    }
    if (interim && opts.onPartial) opts.onPartial(interim.trim());
    if (finalText.trim()) opts.onFinal(finalText.trim());
  };

  rec.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === "aborted" || event.error === "no-speech") {
      opts.onEnd?.();
      return;
    }
    opts.onError?.(event.error || "mic error");
    opts.onEnd?.();
  };

  rec.onend = () => opts.onEnd?.();
  return rec;
}

export function speakReply(text: string) {
  stopSpeaking();
  speakText(text);
}
