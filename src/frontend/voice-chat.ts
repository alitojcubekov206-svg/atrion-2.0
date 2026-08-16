"use client";

import { loadSettings, speakText, stopSpeaking } from "@/frontend/settings";

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
  /** Keep the session open across pauses instead of ending after one phrase. */
  continuous?: boolean;
}): SpeechRec | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;

  const settings = loadSettings();
  const rec = new Ctor();
  rec.lang = settings.language === "en" ? "en-US" : "ru-RU";
  rec.interimResults = true;
  rec.continuous = opts.continuous ?? false;
  // More guesses give the command parser a second chance at a mumbled word.
  rec.maxAlternatives = 3;

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
    // Silence and deliberate aborts are normal in a long session, not failures.
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

/** Speak a reply and report when the voice has stopped, so listening can resume. */
export function speakReply(text: string, onEnd?: () => void) {
  stopSpeaking();
  speakText(text, undefined, onEnd);
}
