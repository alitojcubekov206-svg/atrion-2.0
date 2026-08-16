"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadSettings, stopSpeaking } from "@/frontend/settings";
import { createRecognizer, speakReply, supportsSpeechRecognition } from "@/frontend/voice-chat";
import { VOICE_EXAMPLES } from "@/frontend/voice-commands";

export type VoiceStatus = "idle" | "listening" | "working" | "done" | "error";

type Props = {
  enabled: boolean;
  onToggle: (on: boolean) => void;
  busy?: boolean;
  /** Resolves with the line to speak back. Must never reject. */
  onUtterance: (text: string) => Promise<string | void>;
};

/** Hard ceiling on one command. Past this the UI unblocks and says why. */
const COMMAND_TIMEOUT_MS = 25_000;

export default function VoiceMode({ enabled, onToggle, busy, onUtterance }: Props) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [partial, setPartial] = useState("");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [continuous, setContinuous] = useState(true);

  const recognizer = useRef<SpeechRecognition | null>(null);
  const handling = useRef(false);
  const wantListening = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A recognizer created three commands ago still fires this ref's current
  // value, so a spoken edit always sees the scene as it is now.
  const handler = useRef(onUtterance);
  handler.current = onUtterance;

  useEffect(() => {
    setSupported(supportsSpeechRecognition());
  }, []);

  const stopListening = useCallback(() => {
    wantListening.current = false;
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = null;
    recognizer.current?.abort();
    recognizer.current = null;
    setStatus((current) => (current === "listening" ? "idle" : current));
    setPartial("");
  }, []);

  // Turning the panel off must release the microphone immediately.
  useEffect(() => {
    if (!enabled) {
      stopListening();
      stopSpeaking();
      setHeard("");
      setReply("");
      setError(null);
    }
  }, [enabled, stopListening]);

  useEffect(() => () => stopListening(), [stopListening]);

  const runUtterance = useCallback(
    async (text: string) => {
      handling.current = true;
      setHeard(text);
      setReply("");
      setError(null);
      setStatus("working");

      // The page owns its own timeouts, but a stuck promise must never leave the
      // microphone button dead — this is the backstop for that.
      let timedOut = false;
      const guard = new Promise<string>((resolve) => {
        setTimeout(() => {
          timedOut = true;
          resolve("Долго не отвечает. Попробуй сказать короче или повтори.");
        }, COMMAND_TIMEOUT_MS);
      });

      try {
        const answer = await Promise.race([
          handler.current(text).then((value) => (typeof value === "string" ? value : "Готово.")),
          guard,
        ]);
        setReply(answer);
        setStatus(timedOut ? "error" : "done");
        if (!timedOut && loadSettings().voiceEnabled) speakReply(answer);
      } catch {
        setReply("");
        setError("Команда не выполнилась. Повтори, пожалуйста.");
        setStatus("error");
      } finally {
        handling.current = false;
        if (wantListening.current && continuous) {
          restartTimer.current = setTimeout(() => startListening(), 350);
        }
      }
    },
    // startListening is defined below and stable enough for this restart hop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [continuous]
  );

  const startListening = useCallback(() => {
    if (!enabled || handling.current) return;
    setError(null);
    stopSpeaking();

    const recognition = createRecognizer({
      onPartial: setPartial,
      onFinal: (text) => {
        setPartial("");
        if (!text || handling.current) return;
        void runUtterance(text);
      },
      onError: (message) => {
        setStatus("error");
        setError(
          message === "not-allowed"
            ? "Разреши доступ к микрофону в браузере."
            : message === "network"
              ? "Распознавание речи недоступно без интернета."
              : message === "audio-capture"
                ? "Микрофон не найден."
                : `Микрофон: ${message}`
        );
        wantListening.current = false;
      },
      onEnd: () => {
        recognizer.current = null;
        setPartial("");
        setStatus((current) => (current === "listening" ? "idle" : current));
        // Chrome stops after each phrase; keep the session alive by restarting.
        if (wantListening.current && continuous && !handling.current) {
          restartTimer.current = setTimeout(() => startListening(), 250);
        }
      },
    });

    if (!recognition) {
      setSupported(false);
      return;
    }

    recognizer.current = recognition;
    try {
      recognition.start();
      wantListening.current = true;
      setStatus("listening");
    } catch {
      setError("Не удалось включить микрофон.");
      setStatus("error");
    }
  }, [continuous, enabled, runUtterance]);

  const listening = status === "listening";
  const working = status === "working" || Boolean(busy);

  return (
    <div className="rounded-2xl border border-violet-400/25 bg-violet-400/[0.06] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-violet-300/80">Голос</p>
          <p className="truncate text-xs text-[#8f8a82]">
            Команды выполняются сразу, без ожидания сети
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          aria-pressed={enabled}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
            enabled
              ? "bg-violet-400 text-[#050507]"
              : "border border-white/15 text-[#8f8a82] hover:text-white"
          }`}
        >
          {enabled ? "ВКЛ" : "ВЫКЛ"}
        </button>
      </div>

      {enabled && (
        <div className="mt-3 space-y-2">
          {!supported ? (
            <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-2 text-xs text-amber-200">
              Браузер не поддерживает распознавание речи. Открой в Chrome или набери команду
              текстом ниже — она выполнится так же.
            </p>
          ) : (
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              disabled={working && !listening}
              className={`flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold transition ${
                listening
                  ? "bg-red-500/90 text-white"
                  : working
                    ? "bg-white/10 text-[#8f8a82]"
                    : "btn-primary"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  listening ? "animate-pulse bg-white" : working ? "animate-pulse bg-violet-300" : "bg-current"
                }`}
              />
              {listening ? "Слушаю — нажми, чтобы остановить" : working ? "Выполняю…" : "Говорить"}
            </button>
          )}

          <label className="flex items-center gap-2 text-[11px] text-[#8f8a82]">
            <input
              type="checkbox"
              checked={continuous}
              onChange={(event) => setContinuous(event.target.checked)}
              className="h-3 w-3 accent-violet-400"
            />
            Слушать непрерывно
          </label>

          {partial && (
            <p className="rounded-lg bg-white/5 px-2 py-1.5 text-center text-xs italic text-violet-200/80">
              {partial}…
            </p>
          )}

          {heard && (
            <div className="rounded-xl border border-white/10 bg-black/30 p-2 text-xs">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#6a6560]">Распознано</p>
              <p className="mt-0.5 text-[#f4f1ea]">«{heard}»</p>
              {reply && (
                <p
                  className={`mt-1.5 ${status === "error" ? "text-amber-300" : "text-violet-200"}`}
                >
                  {status === "working" ? "Выполняю…" : reply}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-300">
              {error}
            </p>
          )}

          <p className="text-[10px] leading-relaxed text-[#6a6560]">
            {VOICE_EXAMPLES.map((example) => `«${example}»`).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
