"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadSettings, stopSpeaking } from "@/frontend/settings";
import { createRecognizer, speakReply, supportsSpeechRecognition } from "@/frontend/voice-chat";
import { VOICE_EXAMPLES } from "@/frontend/voice-commands";

type Phase = "off" | "listening" | "working" | "speaking";

type Props = {
  enabled: boolean;
  onToggle: (on: boolean) => void;
  busy?: boolean;
  /** Resolves with the line to speak back. Must never reject. */
  onUtterance: (text: string) => Promise<string | void>;
};

/** Hard ceiling on one command. Past this the session unblocks and says why. */
const COMMAND_TIMEOUT_MS = 25_000;

/**
 * A continuous voice session, the way a voice assistant behaves: switch it on
 * and it keeps listening — through pauses, through its own replies — until it
 * is switched off. Recognition is suspended only while Atrion is speaking, so
 * the reply is not fed back in as the next command.
 */
export default function VoiceMode({ enabled, onToggle, busy, onUtterance }: Props) {
  const [phase, setPhase] = useState<Phase>("off");
  const [partial, setPartial] = useState("");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recognizer = useRef<SpeechRecognition | null>(null);
  const sessionOn = useRef(false);
  const handling = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<() => void>(() => {});
  // A recognizer created several commands ago still calls the current handler,
  // so a spoken edit always sees the scene as it is now.
  const handler = useRef(onUtterance);
  handler.current = onUtterance;

  useEffect(() => {
    setSupported(supportsSpeechRecognition());
  }, []);

  const clearRestart = () => {
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = null;
  };

  const stopSession = useCallback(() => {
    sessionOn.current = false;
    clearRestart();
    recognizer.current?.abort();
    recognizer.current = null;
    stopSpeaking();
    setPhase("off");
    setPartial("");
  }, []);

  /** Restart the microphone unless the session ended or a command is running. */
  const resume = useCallback((delay = 250) => {
    clearRestart();
    if (!sessionOn.current || handling.current) return;
    restartTimer.current = setTimeout(() => startRef.current(), delay);
  }, []);

  const runUtterance = useCallback(
    async (text: string) => {
      handling.current = true;
      clearRestart();
      recognizer.current?.stop();
      setHeard(text);
      setReply("");
      setError(null);
      setPhase("working");

      // The page bounds its own requests, but a promise that never settles must
      // not leave the session dead — this is the backstop for that.
      let timedOut = false;
      const guard = new Promise<string>((resolve) => {
        setTimeout(() => {
          timedOut = true;
          resolve("Долго не отвечает. Скажи короче или повтори.");
        }, COMMAND_TIMEOUT_MS);
      });

      let answer = "Готово.";
      try {
        answer = await Promise.race([
          handler.current(text).then((value) => (typeof value === "string" ? value : "Готово.")),
          guard,
        ]);
      } catch {
        answer = "Не получилось выполнить. Повтори, пожалуйста.";
        setError(answer);
      }

      setReply(answer);
      handling.current = false;

      if (!sessionOn.current) {
        setPhase("off");
        return;
      }
      if (timedOut || !loadSettings().voiceEnabled) {
        setPhase("listening");
        resume(150);
        return;
      }

      setPhase("speaking");
      speakReply(answer, () => {
        if (!sessionOn.current) return;
        setPhase("listening");
        resume(120);
      });
    },
    [resume]
  );

  const start = useCallback(() => {
    if (!sessionOn.current || handling.current) return;
    clearRestart();
    recognizer.current?.abort();

    const recognition = createRecognizer({
      continuous: true,
      onPartial: setPartial,
      onFinal: (text) => {
        setPartial("");
        if (!text || handling.current) return;
        void runUtterance(text);
      },
      onError: (message) => {
        const fatal = message === "not-allowed" || message === "service-not-allowed";
        setError(
          message === "not-allowed" || message === "service-not-allowed"
            ? "Браузер не дал доступ к микрофону. Разреши его в адресной строке и включи снова."
            : message === "network"
              ? "Распознавание речи недоступно без интернета."
              : message === "audio-capture"
                ? "Микрофон не найден."
                : `Микрофон: ${message}`
        );
        if (fatal) {
          sessionOn.current = false;
          setPhase("off");
        }
      },
      onEnd: () => {
        recognizer.current = null;
        setPartial("");
        // Chrome ends the session on its own after a pause; keep it alive.
        resume(200);
      },
    });

    if (!recognition) {
      setSupported(false);
      sessionOn.current = false;
      setPhase("off");
      return;
    }

    recognizer.current = recognition;
    try {
      recognition.start();
      setPhase("listening");
    } catch {
      // start() throws when the previous instance has not released the mic yet.
      resume(400);
    }
  }, [resume, runUtterance]);

  startRef.current = start;

  const beginSession = useCallback(() => {
    setError(null);
    setHeard("");
    setReply("");
    sessionOn.current = true;
    start();
  }, [start]);

  // The panel switch owns the session: on means listening, off releases the mic.
  useEffect(() => {
    if (enabled) {
      if (!sessionOn.current) beginSession();
    } else {
      stopSession();
    }
  }, [enabled, beginSession, stopSession]);

  useEffect(() => () => stopSession(), [stopSession]);

  const live = phase !== "off";
  const status =
    phase === "listening"
      ? "Слушаю"
      : phase === "working"
        ? "Выполняю"
        : phase === "speaking"
          ? "Отвечаю"
          : busy
            ? "Занят"
            : "Выключен";

  return (
    <div
      className={`rounded-2xl border p-3 transition ${
        live ? "border-violet-400/45 bg-violet-400/[0.09]" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-violet-300/80">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                phase === "listening"
                  ? "animate-pulse bg-red-400"
                  : phase === "working" || phase === "speaking"
                    ? "animate-pulse bg-violet-300"
                    : "bg-white/25"
              }`}
            />
            Голос · {status}
          </p>
          <p className="truncate text-xs text-[#8f8a82]">
            {live ? "Говори — я слушаю всё время" : "Включи и просто говори"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          aria-pressed={enabled}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
            live
              ? "bg-red-500/90 text-white hover:bg-red-500"
              : "btn-primary"
          }`}
        >
          {live ? "Стоп" : "Включить"}
        </button>
      </div>

      {!supported && enabled && (
        <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-2 text-xs text-amber-200">
          Этот браузер не умеет распознавать речь. Открой в Chrome — или набери ту же команду
          текстом ниже, она выполнится точно так же.
        </p>
      )}

      {live && (
        <div className="mt-3 space-y-2">
          <div className="min-h-[46px] rounded-xl border border-white/10 bg-black/30 p-2 text-xs">
            {partial ? (
              <p className="italic text-violet-200/80">{partial}…</p>
            ) : heard ? (
              <>
                <p className="text-[#f4f1ea]">«{heard}»</p>
                {reply && (
                  <p className="mt-1 text-violet-200">
                    {phase === "working" ? "Выполняю…" : reply}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[#6a6560]">Скажи, например: «{VOICE_EXAMPLES[0]}»</p>
            )}
          </div>

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
