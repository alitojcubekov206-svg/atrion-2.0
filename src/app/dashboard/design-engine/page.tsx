"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DrawingView } from "@/components/three/ConceptViewer";
import type { InterviewQuestion, ThreeDConcept } from "@/lib/types";
import { download } from "@/lib/export";
import { loadSettings, speakText, stopSpeaking } from "@/lib/settings";
import VoiceMode from "@/components/VoiceMode";

const ConceptViewer = dynamic(() => import("@/components/three/ConceptViewer"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-[#2b2d33]" />,
});

const PIPELINE = [
  "Analyzing",
  "Structure",
  "Geometry",
  "Materials",
  "Ready",
] as const;

const EXAMPLES = [
  "Аниме девушка 3D модель с длинными волосами",
  "Уютная спальня 4×5 м с кроватью и столом",
  "Двухэтажный дом 12×9 м с двускатной крышей",
  "Школа 4 этажа ширина 60 длина 120",
  "Красный спорткар",
  "Кот сидит",
];

type ChatMessage = { role: "user" | "assistant"; text: string };

export default function DesignEnginePage() {
  const [prompt, setPrompt] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState(true);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [concept, setConcept] = useState<ThreeDConcept | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<DrawingView>("perspective");
  const [exploded, setExploded] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [showMesh, setShowMesh] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const assembleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Опиши объект — при TRIPO_API_KEY соберу реальный GLB mesh (как Meshy). Без ключа — силуэт.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [voiceMode, setVoiceMode] = useState(false);

  function playAssemble(next: ThreeDConcept) {
    if (assembleTimer.current) clearTimeout(assembleTimer.current);
    setExploded(false);
    setView("perspective");
    // Show Tripo/Meshy GLB when present; otherwise solid parts silhouette
    setShowMesh(Boolean(next.meshUrl));
    setSelectedId(null);
    setConcept(next);
    setAssembling(!next.meshUrl); // assemble animation for parts only
    if (!next.meshUrl) {
      assembleTimer.current = setTimeout(() => setAssembling(false), 3400);
    } else {
      setAssembling(false);
    }
    const settings = loadSettings();
    if (settings.voiceEnabled && settings.voiceAuto) {
      speakText(`${next.name}. ${next.description}`);
    }
  }

  const selectedPart = concept?.parts.find((part) => part.id === selectedId) ?? null;
  const structure = useMemo(() => {
    if (!concept) return [];
    if (concept.structure?.length) return concept.structure;
    const groups = new Map<string, string[]>();
    for (const part of concept.parts) {
      const label = part.group || part.role || "Parts";
      groups.set(label, [...(groups.get(label) || []), part.id]);
    }
    return [...groups.entries()].map(([label, partIds], index) => ({
      id: `g-${index}`,
      label,
      partIds,
    }));
  }, [concept]);

  async function runPipelineVisual() {
    for (let i = 0; i < PIPELINE.length - 1; i++) {
      setPipelineStep(i);
      await new Promise((resolve) => setTimeout(resolve, 220));
    }
  }

  async function startInterview() {
    if (prompt.trim().length < 10) return;
    setLoading(true);
    setError(null);
    setLimitReached(false);
    setConcept(null);
    setQuestions([]);
    setChat((prev) => [...prev, { role: "user", text: prompt.trim() }]);
    try {
      const response = await fetch("/api/3d/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(data.questions)) {
        setQuestions(data.questions);
        setChat((prev) => [
          ...prev,
          { role: "assistant", text: "Несколько уточнений — и соберу модель." },
        ]);
      } else {
        setError(data.error ?? "Не удалось подготовить вопросы.");
      }
    } catch {
      setError("Соединение прервалось.");
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setLimitReached(false);
    await runPipelineVisual();
    try {
      const interviewAnswers = questions.map((question) => ({
        question: question.question,
        answer: answers[question.id],
      }));
      const response = await fetch("/api/3d/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, answers: interviewAnswers, wantMesh: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.concept) {
        setPipelineStep(PIPELINE.length - 1);
        playAssemble(data.concept);
        const meshNote = data.concept.meshUrl
          ? data.meshProvider === "tripo"
            ? " Tripo mesh готов."
            : " Mesh готов."
          : data.meshError
            ? ` Mesh: ${data.meshError}`
            : " Силуэт (добавь TRIPO_API_KEY для реального mesh).";
        setChat((prev) => [
          ...prev,
          {
            role: "assistant",
            text: `Готово: ${data.concept.name} (${data.concept.parts?.length ?? 0} частей).${meshNote}`,
          },
        ]);
      } else {
        setPipelineStep(-1);
        setLimitReached(data.code === "THREE_D_LIMIT_REACHED");
        setError(data.error ?? "Не удалось создать модель.");
      }
    } catch {
      setPipelineStep(-1);
      setError("Соединение прервалось.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVoiceUtterance(text: string): Promise<string> {
    setChat((prev) => [...prev, { role: "user", text }]);

    // No concept yet → treat speech as create prompt
    if (!concept) {
      if (text.trim().length >= 10) {
        setPrompt(text.trim());
        setChat((prev) => [
          ...prev,
          { role: "assistant", text: "Ок, запускаю. Ответь на уточнения или скажи «создай»." },
        ]);
        return "Ок, записал идею. Нажми создать или ответь на вопросы.";
      }
      return "Скажи подробнее, что построить — хотя бы пару слов.";
    }

    try {
      const response = await fetch("/api/3d/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          prompt,
          concept: {
            name: concept.name,
            description: concept.description,
            dimensions: concept.dimensions,
            parts: concept.parts.map((p) => ({ name: p.name })),
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = data.error ?? "Не понял, повтори.";
        setChat((prev) => [...prev, { role: "assistant", text: err }]);
        return err;
      }

      const reply = typeof data.reply === "string" ? data.reply : "Готово.";
      setChat((prev) => [...prev, { role: "assistant", text: reply }]);

      if (data.shouldRefine && data.refineInstruction) {
        const refineRes = await fetch("/api/3d/refine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            concept,
            instruction: data.refineInstruction,
            selectedPartId: selectedId,
          }),
        });
        const refineData = await refineRes.json().catch(() => ({}));
        if (refineRes.ok && refineData.concept) {
          playAssemble(refineData.concept);
        }
      }

      return reply;
    } catch {
      const err = "Связь оборвалась.";
      setChat((prev) => [...prev, { role: "assistant", text: err }]);
      return err;
    }
  }

  async function refine(event?: FormEvent) {
    event?.preventDefault();
    if (!concept || chatInput.trim().length < 3) return;
    const instruction = chatInput.trim();
    setChatInput("");
    setChat((prev) => [...prev, { role: "user", text: instruction }]);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/3d/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept,
          instruction,
          selectedPartId: selectedId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.concept) {
        playAssemble(data.concept);
        setChat((prev) => [
          ...prev,
          { role: "assistant", text: "Правка применена." },
        ]);
      } else {
        setError(data.error ?? "Не удалось применить правку.");
      }
    } catch {
      setError("Соединение прервалось.");
    } finally {
      setLoading(false);
    }
  }

  const allAnswered =
    questions.length > 0 && questions.every((question) => Boolean(answers[question.id]));

  return (
    <div className="fixed inset-x-0 bottom-0 top-[65px] z-30 flex bg-[#141518] text-[#f4f1ea]">
      <div className={`relative min-w-0 flex-1 ${panelOpen ? "md:w-[80%]" : "w-full"}`}>
        {concept ? (
          <ConceptViewer
            concept={concept}
            selectedId={selectedId}
            onSelect={setSelectedId}
            view={view}
            exploded={exploded}
            assembling={assembling}
            showMesh={showMesh}
            autoRotate={!loading && !assembling && view === "perspective" && !exploded}
            className="h-full"
          />
        ) : (
          <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(167,139,250,0.12),transparent_50%),radial-gradient(ellipse_at_80%_90%,rgba(255,255,255,0.03),transparent_40%)]" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(167,139,250,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(167,139,250,0.8)_1px,transparent_1px)] [background-size:56px_56px]" />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex w-full max-w-2xl flex-col items-center"
            >
              <div className="holo-ring mb-8" />
              <p className="hud-chip rounded-full px-3 py-1 text-[10px] text-[#a78bfa]/90">
                Design Engine
              </p>
              <h1 className="display mt-5 text-center text-5xl font-semibold tracking-tight text-white md:text-6xl">
                ATRION
              </h1>
              <p className="display mt-3 text-center text-2xl tracking-tight text-[#a78bfa] md:text-3xl">
                Just build it.
              </p>
              <div className="gold-line mt-6 w-16" />
              <p className="mt-5 max-w-md text-center text-sm leading-relaxed text-[#8f8a82]">
                Девушка → фигура. Комната → интерьер. Школа → школа. Не здание «на всякий».
              </p>
              <div className="mt-9 w-full space-y-3">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={3}
                  placeholder="Двухэтажный дом 12×9 с панорамными окнами…"
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/45 px-5 py-4 text-sm outline-none transition focus:border-[#a78bfa]/50"
                />
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setPrompt(example)}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[#8f8a82] transition hover:border-[#a78bfa]/40 hover:text-[#f4f1ea]"
                    >
                      {example.slice(0, 36)}…
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={loading || prompt.trim().length < 10}
                  onClick={startInterview}
                  className="btn-primary w-full rounded-full px-6 py-3.5 text-sm disabled:opacity-40"
                >
                  {loading ? "…" : "Создать →"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {concept && (
          <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-full border border-[#a78bfa]/20 bg-[#050507]/75 px-2 py-1.5 shadow-[0_0_40px_rgba(167,139,250,0.12)] backdrop-blur-xl">
            {(
              [
                ["perspective", "Orbit"],
                ["top", "Top"],
                ["front", "Front"],
                ["side", "Side"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setView(value);
                  setExploded(false);
                }}
                className={`rounded-full px-3 py-1.5 text-xs transition ${
                  view === value && !exploded
                    ? "bg-[#a78bfa]/20 text-[#a78bfa]"
                    : "text-[#8f8a82] hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="mx-0.5 h-4 w-px bg-white/10" />
            <button
              type="button"
              onClick={() => {
                setView("perspective");
                setShowMesh(false);
                setAssembling(false);
                setExploded((v) => !v);
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                exploded
                  ? "bg-[#a78bfa] text-[#050507]"
                  : "border border-[#a78bfa]/35 text-[#a78bfa] hover:bg-[#a78bfa]/15"
              }`}
            >
              {exploded ? "Assemble" : "Explode"}
            </button>
            {concept && (
              <button
                type="button"
                onClick={() => {
                  stopSpeaking();
                  speakText(`${concept.name}. ${concept.description}`);
                }}
                className="rounded-full px-3 py-1.5 text-xs text-[#8f8a82] hover:text-white"
              >
                Speak
              </button>
            )}
            <button
              type="button"
              onClick={() => setVoiceMode((v) => !v)}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                voiceMode ? "bg-violet-400/25 text-violet-200" : "text-[#8f8a82] hover:text-white"
              }`}
            >
              Mic
            </button>
            {concept?.meshUrl && (
              <button
                type="button"
                onClick={() => setShowMesh((v) => !v)}
                className={`rounded-full px-3 py-1.5 text-xs transition ${
                  showMesh ? "bg-violet-400/25 text-violet-200" : "text-[#8f8a82] hover:text-white"
                }`}
              >
                {showMesh ? "Mesh" : "Parts"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setPanelOpen((value) => !value)}
              className="rounded-full px-3 py-1.5 text-xs text-[#8f8a82] hover:text-white"
            >
              {panelOpen ? "Hide" : "Panel"}
            </button>
          </div>
        )}

        <AnimatePresence>
          {loading && pipelineStep >= 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex items-center justify-center bg-[#050507]/55 backdrop-blur-sm"
            >
              <div className="w-full max-w-xs rounded-2xl border border-[#a78bfa]/25 bg-[#121214]/95 p-5 shadow-[0_0_50px_rgba(167,139,250,0.15)]">
                <p className="mb-3 text-[10px] uppercase tracking-[0.28em] text-[#a78bfa]/80">
                  Building{pipelineStep >= 2 ? " · Tripo mesh…" : ""}
                </p>
                <ul className="space-y-2">
                  {PIPELINE.map((step, index) => (
                    <li
                      key={step}
                      className={`flex items-center gap-3 text-sm ${
                        index <= pipelineStep ? "text-[#f4f1ea]" : "text-[#5a5550]"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          index <= pipelineStep ? "bg-[#a78bfa] shadow-[0_0_8px_#a78bfa]" : "bg-[#3a3834]"
                        }`}
                      />
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {panelOpen && (
        <aside className="flex w-full max-w-full flex-col border-l border-[#a78bfa]/10 bg-[#0e0e10]/95 backdrop-blur-2xl md:w-[min(400px,22%)] md:min-w-[300px]">
          <div className="border-b border-white/[0.06] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#a78bfa]/70">Engine</p>
                <h2 className="display text-lg font-semibold">
                  ATRION <span className="text-[#a78bfa]">3D</span>
                </h2>
              </div>
              <Link href="/dashboard" className="text-xs text-[#8f8a82] hover:text-white">
                Exit
              </Link>
            </div>
          </div>

          {error && (
            <div className="mx-4 mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {error}
              {limitReached && (
                <Link href="/pricing" className="mt-2 block font-semibold text-[#a78bfa] underline">
                  Pro
                </Link>
              )}
            </div>
          )}

          {questions.length > 0 && !concept && (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                {questions.map((question) => (
                  <div
                    key={question.id}
                    className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3"
                  >
                    <p className="text-sm font-medium">{question.question}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {question.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() =>
                            setAnswers((current) => ({ ...current, [question.id]: option }))
                          }
                          className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                            answers[question.id] === option
                              ? "border-[#a78bfa]/50 bg-[#a78bfa]/15 text-[#a78bfa]"
                              : "border-white/10 text-[#8f8a82]"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={!allAnswered || loading}
                onClick={generate}
                className="btn-primary mt-4 w-full rounded-full py-3 text-sm disabled:opacity-40"
              >
                Создать 3D
              </button>
            </div>
          )}

          {(concept || questions.length === 0) && (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {chat.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      message.role === "user"
                        ? "ml-6 bg-[#a78bfa]/12 text-[#f4f1ea]"
                        : "mr-4 border border-white/[0.07] bg-white/[0.02] text-[#b8b2a8]"
                    }`}
                  >
                    {message.text}
                  </div>
                ))}

                {concept && (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#6a6560]">Parts</p>
                      <button
                        type="button"
                        onClick={() => setTreeOpen((value) => !value)}
                        className="text-[11px] text-[#8f8a82]"
                      >
                        {treeOpen ? "Hide" : "Show"}
                      </button>
                    </div>
                    {treeOpen && (
                      <div className="mt-3 space-y-2">
                        {structure.map((group) => (
                          <div key={group.id}>
                            <p className="text-[11px] font-semibold text-[#6a6560]">{group.label}</p>
                            <div className="mt-1 space-y-1">
                              {group.partIds.map((partId) => {
                                const part = concept.parts.find((item) => item.id === partId);
                                if (!part) return null;
                                return (
                                  <button
                                    key={partId}
                                    type="button"
                                    onClick={() => setSelectedId(part.id)}
                                    className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs transition ${
                                      selectedId === part.id
                                        ? "bg-[#a78bfa]/15 text-[#a78bfa]"
                                        : "text-[#8f8a82] hover:bg-white/5"
                                    }`}
                                  >
                                    {part.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedPart && (
                  <div className="rounded-2xl border border-[#a78bfa]/25 bg-[#a78bfa]/05 p-3 text-xs text-[#b8b2a8]">
                    <p className="font-semibold text-[#a78bfa]">{selectedPart.name}</p>
                    <p className="mt-1">{selectedPart.material}</p>
                  </div>
                )}
              </div>

              <form onSubmit={refine} className="border-t border-white/[0.06] p-4">
                <div className="mb-3">
                  <VoiceMode
                    enabled={voiceMode}
                    onToggle={setVoiceMode}
                    busy={loading}
                    onUtterance={handleVoiceUtterance}
                  />
                </div>
                {concept && (
                  <div className="mb-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        download(
                          `${concept.name}.atrion-design.json`,
                          JSON.stringify(concept, null, 2),
                          "application/json"
                        )
                      }
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-[#b8b2a8]"
                    >
                      Export
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConcept(null);
                        setQuestions([]);
                        setAnswers({});
                        setPipelineStep(-1);
                        setPrompt("");
                      }}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-[#b8b2a8]"
                    >
                      New
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder={concept ? "Сделай окна шире…" : "Сначала создай объект"}
                    disabled={!concept || loading}
                    className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-[#a78bfa]/45 disabled:opacity-40"
                  />
                  <button
                    type="submit"
                    disabled={!concept || loading || chatInput.trim().length < 3}
                    className="btn-primary rounded-xl px-4 text-sm disabled:opacity-40"
                  >
                    →
                  </button>
                </div>
              </form>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
