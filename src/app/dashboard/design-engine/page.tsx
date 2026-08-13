"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DrawingView } from "@/components/three/ConceptViewer";
import type { InterviewQuestion, ModelPart, ThreeDConcept } from "@/lib/types";
import { download } from "@/lib/export";
import { loadSettings, speakText, stopSpeaking } from "@/lib/settings";
import VoiceMode from "@/components/VoiceMode";
import CadToolbar, { type CadTool } from "@/components/CadToolbar";

const ConceptViewer = dynamic(() => import("@/components/three/ConceptViewer"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-[#2b2d33]" />,
});

const PIPELINE = ["Analyzing", "Structure", "Geometry", "Assembly", "Ready"] as const;

const EXAMPLES = [
  "Аниме девушка 3D модель с длинными волосами",
  "Уютная спальня 4×5 м с кроватью и столом",
  "Двухэтажный дом 12×9 м с двускатной крышей",
  "Школа 4 этажа ширина 60 длина 120",
  "Красный спорткар",
  "Кот сидит",
];

type ChatMessage = { role: "user" | "assistant"; text: string };
type ExportFormat = "glb" | "stl" | "obj";
type Providers = { aiConfigured?: boolean };

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
  const [providers, setProviders] = useState<Providers>({});
  const [cadTool, setCadTool] = useState<CadTool>("select");
  const [snap, setSnap] = useState(true);
  const [history, setHistory] = useState<ThreeDConcept[]>([]);
  const [future, setFuture] = useState<ThreeDConcept[]>([]);
  const [exportBusy, setExportBusy] = useState<ExportFormat | null>(null);
  const assembleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cadHistoryGate = useRef(false);
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Опиши объект — Atrion соберёт 3D-модель из примитивов с полным CAD-редактированием (Move/Rotate/Scale) каждой детали.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [voiceMode, setVoiceMode] = useState(false);
  const units = loadSettings().units;
  const snapStep = units === "cm" ? 0.05 : 0.1;

  useEffect(() => {
    fetch("/api/3d/providers")
      .then((r) => r.json())
      .then((data) => setProviders(data))
      .catch(() => undefined);
  }, []);

  function pushHistory(prev: ThreeDConcept) {
    setHistory((h) => [...h.slice(-30), structuredClone(prev)]);
    setFuture([]);
  }

  async function playAssemble(next: ThreeDConcept) {
    if (assembleTimer.current) clearTimeout(assembleTimer.current);
    setExploded(false);
    setView("perspective");
    setSelectedId(null);
    setCadTool("select");
    setConcept(next);
    setAssembling(true);
    assembleTimer.current = setTimeout(() => setAssembling(false), 3400);
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
      await new Promise((resolve) => setTimeout(resolve, i === 3 ? 300 : 180));
    }
  }

  async function startInterview() {
    // MVP: skip Q&A — straight to generation
    await generate();
  }

  async function generate() {
    if (prompt.trim().length < 10) {
      setError("Опиши объект подробнее (мин. 10 символов).");
      return;
    }
    setLoading(true);
    setError(null);
    setLimitReached(false);
    setConcept(null);
    setQuestions([]);
    setChat((prev) => [...prev, { role: "user", text: prompt.trim() }]);
    await runPipelineVisual();
    try {
      const interviewAnswers = questions.map((question) => ({
        question: question.question,
        answer: answers[question.id],
      }));
      const response = await fetch("/api/3d/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), answers: interviewAnswers }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.concept) {
        setPipelineStep(PIPELINE.length - 1);
        await playAssemble(data.concept);
        setChat((prev) => [
          ...prev,
          {
            role: "assistant",
            text: `Готово: ${data.concept.name}. CAD слева сверху — выбери деталь и правь. Голос: «разбери», «собери», «поверни».`,
          },
        ]);
      } else {
        setPipelineStep(-1);
        setLimitReached(data.code === "THREE_D_LIMIT_REACHED");
        const msg =
          data.code === "THREE_D_LIMIT_REACHED"
            ? "Лимит free генераций исчерпан. Нужен Pro."
            : data.error ?? "Не удалось создать модель.";
        setError(msg);
        setChat((prev) => [...prev, { role: "assistant", text: msg }]);
      }
    } catch {
      setPipelineStep(-1);
      setError("Соединение прервалось.");
    } finally {
      setLoading(false);
    }
  }

  function applyPartChange(id: string, patch: Partial<ModelPart>) {
    if (!concept) return;
    if (!cadHistoryGate.current) {
      pushHistory(concept);
      cadHistoryGate.current = true;
    }
    setConcept({
      ...concept,
      parts: concept.parts.map((part) => (part.id === id ? { ...part, ...patch } : part)),
    });
  }

  function undo() {
    setHistory((h) => {
      if (!h.length || !concept) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [structuredClone(concept), ...f]);
      setConcept(prev);
      return h.slice(0, -1);
    });
  }

  function redo() {
    setFuture((f) => {
      if (!f.length || !concept) return f;
      const next = f[0];
      setHistory((h) => [...h, structuredClone(concept)]);
      setConcept(next);
      return f.slice(1);
    });
  }

  async function generateFromPrompt(textPrompt: string) {
    setPrompt(textPrompt);
    setLoading(true);
    setError(null);
    setLimitReached(false);
    setConcept(null);
    await runPipelineVisual();
    try {
      const response = await fetch("/api/3d/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: textPrompt.trim(), answers: [] }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.concept) {
        setPipelineStep(PIPELINE.length - 1);
        await playAssemble(data.concept);
        setChat((prev) => [
          ...prev,
          { role: "assistant", text: `Готово: ${data.concept.name}. Скажи «разбери» или правь в CAD.` },
        ]);
      } else {
        setPipelineStep(-1);
        const msg =
          data.code === "THREE_D_LIMIT_REACHED"
            ? "Лимит free генераций. Нужен Pro."
            : data.error || "Не удалось создать модель.";
        setError(msg);
        setChat((prev) => [...prev, { role: "assistant", text: msg }]);
      }
    } catch {
      setPipelineStep(-1);
      setError("Сбой связи при генерации.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVoiceUtterance(text: string): Promise<string> {
    const raw = text.trim();
    setChat((prev) => [...prev, { role: "user", text: raw }]);
    const lower = raw.toLowerCase();

    if (/разбер|explod|разложи|разъедин/i.test(lower)) {
      if (!concept) return "Сначала создай модель.";
      setExploded(true);
      setAssembling(false);
      const reply = "Разбираю на части.";
      setChat((prev) => [...prev, { role: "assistant", text: reply }]);
      return reply;
    }
    if (/собери|assembl|собери обратно/i.test(lower)) {
      if (!concept) return "Сначала создай модель.";
      setExploded(false);
      setAssembling(true);
      if (assembleTimer.current) clearTimeout(assembleTimer.current);
      assembleTimer.current = setTimeout(() => setAssembling(false), 2800);
      const reply = "Собираю.";
      setChat((prev) => [...prev, { role: "assistant", text: reply }]);
      return reply;
    }

    if (!concept) {
      if (raw.length >= 10) {
        const reply = "Запускаю генерацию…";
        setChat((prev) => [...prev, { role: "assistant", text: reply }]);
        await generateFromPrompt(raw);
        return reply;
      }
      return "Скажи подробнее, что создать.";
    }
    try {
      const response = await fetch("/api/3d/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: raw,
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
        const err = data.error ?? "Не понял.";
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
          pushHistory(concept);
          await playAssemble(refineData.concept);
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
        body: JSON.stringify({ concept, instruction, selectedPartId: selectedId }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.concept) {
        pushHistory(concept);
        await playAssemble(data.concept);
        setChat((prev) => [...prev, { role: "assistant", text: "Правка применена." }]);
      } else {
        setError(data.error ?? "Не удалось применить правку.");
      }
    } catch {
      setError("Соединение прервалось.");
    } finally {
      setLoading(false);
    }
  }

  /** Build a real 3D file out of the procedural parts. three is loaded on demand. */
  async function exportModel(format: ExportFormat) {
    if (!concept || exportBusy) return;
    setExportBusy(format);
    setError(null);
    try {
      const exporter = await import("@/lib/export-3d");
      const blob =
        format === "glb"
          ? await exporter.exportConceptGlb(concept)
          : format === "stl"
            ? exporter.exportConceptStl(concept)
            : exporter.exportConceptObj(concept);
      exporter.downloadBlob(`${concept.name}.${format}`, blob);
    } catch (exportError) {
      setError(
        `Не удалось собрать ${format.toUpperCase()}: ${
          exportError instanceof Error ? exportError.message : "неизвестная ошибка"
        }`
      );
    } finally {
      setExportBusy(null);
    }
  }

  const allAnswered =
    questions.length > 0 && questions.every((question) => Boolean(answers[question.id]));

  const providerHint = providers.aiConfigured ? "AI-режим" : "Демо-режим";

  return (
    <div className="fixed inset-x-0 bottom-0 top-[65px] z-30 flex bg-[#141518] text-[#f4f1ea]">
      <div className={`relative min-w-0 flex-1 ${panelOpen ? "md:w-[80%]" : "w-full"}`}>
        {concept ? (
          <>
            <ConceptViewer
              concept={concept}
              selectedId={selectedId}
              onSelect={setSelectedId}
              view={view}
              exploded={exploded}
              assembling={assembling}
              autoRotate={
                !loading &&
                !assembling &&
                view === "perspective" &&
                !exploded &&
                cadTool === "select"
              }
              cadTool={cadTool}
              snap={snap}
              snapStep={snapStep}
              onPartChange={applyPartChange}
              className="h-full"
            />
            <CadToolbar
              tool={cadTool}
              onTool={(t) => {
                cadHistoryGate.current = false;
                setCadTool(t);
              }}
              snap={snap}
              onSnap={setSnap}
              canUndo={history.length > 0}
              canRedo={future.length > 0}
              onUndo={undo}
              onRedo={redo}
              units={units}
            />
          </>
        ) : (
          <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(167,139,250,0.12),transparent_50%)]" />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative flex w-full max-w-2xl flex-col items-center"
            >
              <div className="holo-ring mb-8" />
              <p className="hud-chip rounded-full px-3 py-1 text-[10px] text-[#a78bfa]/90">
                Design Engine · {providerHint}
              </p>
              <h1 className="display mt-5 text-center text-5xl font-semibold text-white md:text-6xl">
                ATRION
              </h1>
              <p className="display mt-3 text-2xl text-[#a78bfa]">Just build it.</p>
              <div className="gold-line mt-6 w-16" />

              <div className="mt-8 w-full space-y-3">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={3}
                  placeholder="Опиши объект — что угодно: дом, персонаж, машина, мебель, гаджет…"
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/45 px-5 py-4 text-sm outline-none focus:border-[#a78bfa]/50"
                />
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setPrompt(example)}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[#8f8a82] hover:border-[#a78bfa]/40"
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
          <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-full border border-[#a78bfa]/20 bg-[#050507]/75 px-2 py-1.5 backdrop-blur-xl">
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
                  setCadTool("select");
                }}
                className={`rounded-full px-3 py-1.5 text-xs ${
                  view === value && !exploded
                    ? "bg-[#a78bfa]/20 text-[#a78bfa]"
                    : "text-[#8f8a82] hover:text-white"
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
                setExploded((v) => !v);
              }}
              className={`rounded-full px-3 py-1.5 text-xs ${
                exploded ? "bg-[#a78bfa] text-black" : "text-[#a78bfa]"
              }`}
            >
              {exploded ? "Assemble" : "Explode"}
            </button>
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
            <button
              type="button"
              onClick={() => setVoiceMode((v) => !v)}
              className={`rounded-full px-3 py-1.5 text-xs ${
                voiceMode ? "bg-violet-400/25 text-violet-200" : "text-[#8f8a82]"
              }`}
            >
              Mic
            </button>
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="rounded-full px-3 py-1.5 text-xs text-[#8f8a82]"
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
              <div className="w-full max-w-xs rounded-2xl border border-[#a78bfa]/25 bg-[#121214]/95 p-5">
                <p className="mb-3 text-[10px] uppercase tracking-[0.28em] text-[#a78bfa]/80">
                  {pipelineStep >= 3 ? "Собираем детали…" : "Building"}
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
                          index <= pipelineStep ? "bg-[#a78bfa]" : "bg-[#3a3834]"
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
        <aside className="flex w-full flex-col border-l border-[#a78bfa]/10 bg-[#0e0e10]/95 backdrop-blur-2xl md:w-[min(400px,22%)] md:min-w-[300px]">
          <div className="border-b border-white/[0.06] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#a78bfa]/70">
                  {providerHint}
                </p>
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
                          className={`rounded-full border px-2.5 py-1 text-[11px] ${
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
                        ? "ml-6 bg-[#a78bfa]/12"
                        : "mr-4 border border-white/[0.07] bg-white/[0.02] text-[#b8b2a8]"
                    }`}
                  >
                    {message.text}
                  </div>
                ))}

                {concept && selectedPart && (
                  <div className="rounded-2xl border border-[#a78bfa]/25 bg-[#a78bfa]/05 p-3 text-xs">
                    <p className="font-semibold text-[#a78bfa]">{selectedPart.name}</p>
                    <p className="mt-2 text-[#8f8a82]">CAD properties ({units})</p>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {(
                        [
                          ["X", 0, "position"],
                          ["Y", 1, "position"],
                          ["Z", 2, "position"],
                          ["W", 0, "size"],
                          ["H", 1, "size"],
                          ["D", 2, "size"],
                        ] as const
                      ).map(([label, axis, field]) => (
                        <label key={`${field}-${label}`} className="space-y-1">
                          <span className="font-mono text-[10px] text-[#6a6560]">{label}</span>
                          <input
                            type="number"
                            step={snap ? snapStep : 0.01}
                            value={Number(selectedPart[field][axis].toFixed(3))}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isFinite(n)) return;
                              const next = [...selectedPart[field]] as [number, number, number];
                              next[axis] = field === "size" ? Math.max(0.05, n) : n;
                              applyPartChange(selectedPart.id, { [field]: next });
                            }}
                            className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] outline-none focus:border-[#a78bfa]/45"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {concept && treeOpen && (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#6a6560]">Parts</p>
                    <div className="mt-2 space-y-1">
                      {structure.flatMap((group) =>
                        group.partIds.map((partId) => {
                          const part = concept.parts.find((item) => item.id === partId);
                          if (!part) return null;
                          return (
                            <button
                              key={partId}
                              type="button"
                              onClick={() => setSelectedId(part.id)}
                              className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs ${
                                selectedId === part.id
                                  ? "bg-[#a78bfa]/15 text-[#a78bfa]"
                                  : "text-[#8f8a82]"
                              }`}
                            >
                              {part.name}
                            </button>
                          );
                        })
                      )}
                    </div>
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
                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => exportModel("glb")}
                      disabled={exportBusy !== null}
                      className="rounded-full border border-violet-400/30 px-3 py-1.5 text-[11px] text-violet-200 disabled:opacity-40"
                    >
                      {exportBusy === "glb" ? "готовим файл…" : "GLB"}
                    </button>
                    <button
                      type="button"
                      onClick={() => exportModel("stl")}
                      disabled={exportBusy !== null}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-[#b8b2a8] disabled:opacity-40"
                    >
                      {exportBusy === "stl" ? "готовим файл…" : "STL"}
                    </button>
                    <button
                      type="button"
                      onClick={() => exportModel("obj")}
                      disabled={exportBusy !== null}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-[#b8b2a8] disabled:opacity-40"
                    >
                      {exportBusy === "obj" ? "готовим файл…" : "OBJ"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        download(
                          `${concept.name}.atrion-design.json`,
                          JSON.stringify({ concept }, null, 2),
                          "application/json"
                        )
                      }
                      className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-[#b8b2a8]"
                    >
                      JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConcept(null);
                        setQuestions([]);
                        setAnswers({});
                        setPipelineStep(-1);
                        setPrompt("");
                        setHistory([]);
                        setFuture([]);
                        setError(null);
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
