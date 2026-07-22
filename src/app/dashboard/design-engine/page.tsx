"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DrawingView } from "@/components/three/ConceptViewer";
import type { InterviewQuestion, ThreeDConcept } from "@/lib/types";
import { download } from "@/lib/export";

const ConceptViewer = dynamic(() => import("@/components/three/ConceptViewer"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-[#03060c]" />,
});

const PIPELINE = [
  "Analyzing Request",
  "Creating Structure Tree",
  "Generating Geometry",
  "Adding Materials",
  "Optimization",
  "Assembling Model",
] as const;

const EXAMPLES = [
  "Школа на 600 учеников: главный корпус, крыло спортзала, вход с козырьком",
  "Современный двухэтажный дом 12×9 м с панорамными окнами",
  "Пешеходный мост 18 м из стали и дерева",
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
  const [loading, setLoading] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const assembleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Я Atrion Core. Опиши объект — соберу цельный силуэт и соберу его в воздухе, как костюм Stark.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");

  function playAssemble(next: ThreeDConcept) {
    if (assembleTimer.current) clearTimeout(assembleTimer.current);
    setExploded(false);
    setView("perspective");
    setAssembling(true);
    setConcept(next);
    assembleTimer.current = setTimeout(() => setAssembling(false), 3400);
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
      await new Promise((resolve) => setTimeout(resolve, 280));
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
          {
            role: "assistant",
            text: "Уточню несколько параметров перед генерацией геометрии.",
          },
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
        body: JSON.stringify({ prompt, answers: interviewAnswers }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.concept) {
        setPipelineStep(PIPELINE.length - 1);
        playAssemble(data.concept);
        setChat((prev) => [
          ...prev,
          {
            role: "assistant",
            text: `Готово: ${data.concept.name}. Смотри сборку в воздухе — потом Exploded разберёт модули. Выбери деталь или скажи, что изменить.`,
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
          { role: "assistant", text: "Правка применена. Модель пересобрана. Можешь продолжать." },
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
    <div className="fixed inset-x-0 bottom-0 top-[65px] z-30 flex bg-[#02050a] text-slate-100">
      {/* Viewer */}
      <div className={`relative min-w-0 flex-1 ${panelOpen ? "md:w-[80%]" : "w-full"}`}>
        {concept ? (
          <ConceptViewer
            concept={concept}
            selectedId={selectedId}
            onSelect={setSelectedId}
            view={view}
            exploded={exploded}
            assembling={assembling}
            autoRotate={!loading && !assembling && view === "perspective" && !exploded}
            className="h-full"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6">
            <div className="holo-ring mb-8" />
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/70">
              Atrion · Stark Workshop
            </p>
            <h1 className="mt-3 max-w-2xl text-center text-3xl font-semibold tracking-tight md:text-5xl">
              Цельный объект. Сборка в воздухе.
              <span className="block text-cyan-300/90">Разборка как костюм Iron Man</span>
            </h1>
            <p className="mt-4 max-w-xl text-center text-sm text-slate-400">
              Школа = силуэт школы, не куча коробок. Опиши объект — Engine соберёт модули и сведёт их
              в один объём.
            </p>
            <div className="mt-8 flex w-full max-w-2xl flex-col gap-3">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={3}
                placeholder="Например: двухэтажный дом 12×9 с панорамными окнами на юг..."
                className="w-full resize-none rounded-2xl border border-cyan-400/20 bg-white/5 px-5 py-4 text-sm outline-none backdrop-blur focus:border-cyan-300/50"
              />
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:border-cyan-400/40 hover:text-cyan-100"
                  >
                    {example}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={loading || prompt.trim().length < 10}
                onClick={startInterview}
                className="rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 px-6 py-3 text-sm font-semibold text-black shadow-[0_0_30px_rgba(77,214,255,0.35)] disabled:opacity-40"
              >
                {loading ? "Анализ…" : "Запустить Design Engine →"}
              </button>
            </div>
          </div>
        )}

        {/* Camera toolbar */}
        {concept && (
          <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-2 backdrop-blur-xl">
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
                className={`rounded-full px-3 py-1.5 text-xs ${
                  view === value && !exploded
                    ? "bg-cyan-400/20 text-cyan-100"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setView("perspective");
                setAssembling(false);
                setExploded((value) => !value);
              }}
              className={`rounded-full px-3 py-1.5 text-xs ${
                exploded ? "bg-cyan-400/20 text-cyan-100" : "text-slate-400 hover:text-white"
              }`}
            >
              {exploded ? "Assemble" : "Explode"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!concept) return;
                setExploded(false);
                setAssembling(true);
                if (assembleTimer.current) clearTimeout(assembleTimer.current);
                assembleTimer.current = setTimeout(() => setAssembling(false), 3400);
              }}
              className="rounded-full px-3 py-1.5 text-xs text-slate-400 hover:text-white"
            >
              Replay assemble
            </button>
            <button
              type="button"
              onClick={() => setPanelOpen((value) => !value)}
              className="rounded-full px-3 py-1.5 text-xs text-slate-400 hover:text-white"
            >
              {panelOpen ? "Hide panel" : "Show panel"}
            </button>
          </div>
        )}

        {/* Pipeline overlay */}
        <AnimatePresence>
          {loading && pipelineStep >= 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 flex items-center justify-center bg-[#02050a]/55 backdrop-blur-sm"
            >
              <div className="w-full max-w-md rounded-3xl border border-cyan-400/20 bg-black/60 p-6">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Generation</p>
                <ul className="mt-4 space-y-2">
                  {PIPELINE.map((step, index) => (
                    <li
                      key={step}
                      className={`flex items-center gap-3 text-sm ${
                        index <= pipelineStep ? "text-cyan-100" : "text-slate-500"
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${
                          index < pipelineStep
                            ? "bg-cyan-300"
                            : index === pipelineStep
                              ? "animate-pulse bg-cyan-400"
                              : "bg-slate-700"
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

      {/* Side panel */}
      {panelOpen && (
        <aside className="flex w-full max-w-full flex-col border-l border-cyan-400/15 bg-[#050a12]/90 backdrop-blur-2xl md:w-[min(420px,20%)] md:min-w-[320px]">
          <div className="border-b border-white/5 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/70">
                  Atrion Core
                </p>
                <h2 className="text-lg font-semibold">AI Design Chat</h2>
              </div>
              <Link href="/dashboard" className="text-xs text-slate-400 hover:text-white">
                Exit
              </Link>
            </div>
          </div>

          {error && (
            <div className="mx-4 mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {error}
              {limitReached && (
                <Link href="/pricing" className="mt-2 block font-semibold text-cyan-200 underline">
                  Перейти на Pro
                </Link>
              )}
            </div>
          )}

          {/* Interview */}
          {questions.length > 0 && !concept && (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/70">Discovery</p>
              <div className="mt-3 space-y-4">
                {questions.map((question) => (
                  <div key={question.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-sm font-medium">{question.question}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {question.options.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() =>
                            setAnswers((current) => ({ ...current, [question.id]: option }))
                          }
                          className={`rounded-full border px-2.5 py-1 text-[11px] ${
                            answers[question.id] === option
                              ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                              : "border-white/10 text-slate-400"
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
                className="mt-4 w-full rounded-full bg-cyan-400 py-3 text-sm font-semibold text-black disabled:opacity-40"
              >
                Создать 3D-модель
              </button>
            </div>
          )}

          {/* Chat + structure after concept */}
          {(concept || questions.length === 0) && (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {chat.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      message.role === "user"
                        ? "ml-6 bg-cyan-400/15 text-cyan-50"
                        : "mr-4 border border-white/10 bg-white/[0.03] text-slate-300"
                    }`}
                  >
                    {message.text}
                  </div>
                ))}

                {concept && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/70">
                        Structure
                      </p>
                      <button
                        type="button"
                        onClick={() => setTreeOpen((value) => !value)}
                        className="text-[11px] text-slate-400"
                      >
                        {treeOpen ? "Hide" : "Show"}
                      </button>
                    </div>
                    {treeOpen && (
                      <div className="mt-3 space-y-2">
                        {structure.map((group) => (
                          <div key={group.id}>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                              {group.label}
                            </p>
                            <div className="mt-1 space-y-1">
                              {group.partIds.map((partId) => {
                                const part = concept.parts.find((item) => item.id === partId);
                                if (!part) return null;
                                return (
                                  <button
                                    key={partId}
                                    type="button"
                                    onClick={() => setSelectedId(part.id)}
                                    className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs ${
                                      selectedId === part.id
                                        ? "bg-cyan-400/15 text-cyan-100"
                                        : "text-slate-400 hover:bg-white/5"
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
                  <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-3 text-xs text-slate-300">
                    <p className="font-semibold text-cyan-100">{selectedPart.name}</p>
                    <p className="mt-1">Материал: {selectedPart.material}</p>
                    <p>
                      Размер: {selectedPart.size.map((n) => n.toFixed(2)).join(" × ")}{" "}
                      {concept?.units}
                    </p>
                  </div>
                )}
              </div>

              <form onSubmit={refine} className="border-t border-white/5 p-4">
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
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-slate-300"
                    >
                      Export JSON
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
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-slate-300"
                    >
                      New object
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder={
                      concept
                        ? "Сделай окна панорамными / увеличь на 30%..."
                        : "Сначала создай объект"
                    }
                    disabled={!concept || loading}
                    className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm outline-none focus:border-cyan-400/40 disabled:opacity-40"
                  />
                  <button
                    type="submit"
                    disabled={!concept || loading || chatInput.trim().length < 3}
                    className="rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-black disabled:opacity-40"
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
