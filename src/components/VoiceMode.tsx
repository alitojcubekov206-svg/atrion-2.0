"use client";

import { useEffect, useRef, useState } from "react";
import { loadSettings, stopSpeaking } from "@/lib/settings";
import { createRecognizer, speakReply, supportsSpeechRecognition } from "@/lib/voice-chat";

type Props = {
  enabled: boolean;
  onToggle: (on: boolean) => void;
  busy?: boolean;
  onUtterance: (text: string) => Promise<string | void>;
};

export default function VoiceMode({ enabled, onToggle, busy, onUtterance }: Props) {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const handling = useRef(false);

  useEffect(() => {
    setSupported(supportsSpeechRecognition());
  }, []);

  useEffect(() => {
    if (!enabled) {
      recRef.current?.abort();
      setListening(false);
      setPartial("");
      stopSpeaking();
    }
  }, [enabled]);

  function startListen() {
    if (!enabled || busy || handling.current) return;
    setError(null);
    stopSpeaking();
    const rec = createRecognizer({
      onPartial: setPartial,
      onFinal: async (text) => {
        setPartial("");
        setListening(false);
        if (!text || handling.current) return;
        handling.current = true;
        try {
          const reply = await onUtterance(text);
          if (reply && loadSettings().voiceEnabled) speakReply(reply);
        } finally {
          handling.current = false;
        }
      },
      onError: (message) => {
        setError(message === "not-allowed" ? "Разреши микрофон в браузере" : message);
        setListening(false);
      },
      onEnd: () => setListening(false),
    });
    if (!rec) {
      setSupported(false);
      return;
    }
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Не удалось включить микрофон");
      setListening(false);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-400/25 bg-violet-400/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-violet-300/80">Voice</p>
          <p className="text-xs text-[#8f8a82]">Как ChatGPT: говори → ответ голосом</p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            enabled
              ? "bg-violet-400 text-[#050507]"
              : "border border-white/15 text-[#8f8a82] hover:text-white"
          }`}
        >
          {enabled ? "ON" : "OFF"}
        </button>
      </div>

      {enabled && (
        <div className="mt-3 space-y-2">
          {!supported ? (
            <p className="text-xs text-red-300">Микрофон недоступен в этом браузере (нужен Chrome).</p>
          ) : (
            <button
              type="button"
              disabled={busy || listening}
              onClick={startListen}
              className={`flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold transition ${
                listening
                  ? "bg-red-500/90 text-white animate-pulse"
                  : "btn-primary disabled:opacity-40"
              }`}
            >
              {listening ? "Слушаю…" : busy ? "…" : "🎤 Говори"}
            </button>
          )}
          {partial && <p className="text-center text-xs text-violet-200/80">«{partial}»</p>}
          {error && <p className="text-center text-xs text-red-300">{error}</p>}
        </div>
      )}
    </div>
  );
}
