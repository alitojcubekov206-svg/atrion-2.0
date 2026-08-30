"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DrawingView } from "@/frontend/components/three/ConceptViewer";
import type { InterviewQuestion, ModelPart, PartShape, ThreeDConcept } from "@/shared/types";
import { download } from "@/frontend/export";
import { loadSettings, speakText, stopSpeaking } from "@/frontend/settings";
import { structureFromGroups } from "@/shared/geometry";
import VoiceMode from "@/frontend/components/VoiceMode";
import CadToolbar, { type CadTool } from "@/frontend/components/CadToolbar";
import { describeCommand, parseVoiceCommand } from "@/frontend/voice-commands";
import { BOOLEAN_LABELS, type BooleanOp } from "@/frontend/csg-types";

/**
 * Every network call in this page goes through here.
 *
 * A request that never settles is what used to freeze the studio, so each one
 * carries its own abort timer and turns a stall into a message the user can act
 * on rather than a spinner that never stops.
 */
async function postJson<T>(
  url: string,
  body: unknown,
  timeoutMs = 45_000
): Promise<{ ok: boolean; data: T & { error?: string; code?: string }; timedOut?: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    return { ok: response.ok, data };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      timedOut: aborted,
      data: {
        error: aborted
          ? "Сервер долго не отвечает. Попробуй ещё раз или упрости описание."
          : "Нет связи с сервером.",
      } as T & { error?: string },
    };
  } finally {
    clearTimeout(timer);
  }
}

const ConceptViewer = dynamic(() => import("@/frontend/components/three/ConceptViewer"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-[#2b2d33]" />,
});

const CubesLoop = dynamic(() => import("@/frontend/components/three/CubesLoop"), { ssr: false });

const PIPELINE = [
  "Читаю описание",
  "Считаю пропорции",
  "Строю геометрию",
  "Собираю детали",
  "Готово",
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
type ExportFormat = "glb" | "stl" | "obj";
type Providers = { aiConfigured?: boolean };
/** What the server read out of the prompt — ТЗ 4.1 debugging log. */
type Diagnostics = {
  plan?: string;
  matched?: string[];
  source?: "procedural" | "ai";
  score?: number;
  primitives?: number;
  parts?: number;
  notes?: string[];
};
type Measurement = {
  from: string;
  to: string;
  distance: number;
  delta: [number, number, number];
};

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
  const [addShape, setAddShape] = useState<PartShape>("box");
  const [history, setHistory] = useState<ThreeDConcept[]>([]);
  const [future, setFuture] = useState<ThreeDConcept[]>([]);
  const [exportBusy, setExportBusy] = useState<ExportFormat | null>(null);
  const [voiceThinking, setVoiceThinking] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureFrom, setMeasureFrom] = useState<string | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [booleanBusy, setBooleanBusy] = useState(false);
  const [pendingBoolean, setPendingBoolean] = useState<BooleanOp | null>(null);
  const [booleanFirst, setBooleanFirst] = useState<string | null>(null);
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

  // Voice handlers fire from a recognizer callback that may have been created
  // several edits ago — these refs make them read the live scene.
  const conceptRef = useRef<ThreeDConcept | null>(concept);
  conceptRef.current = concept;
  const selectedRef = useRef<string | null>(selectedId);
  selectedRef.current = selectedId;

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

  /**
   * The one generation path, shared by the button, the examples and the voice.
   * The request is bounded by a timeout, and every outcome — model, limit,
   * stall, refusal — ends with a message on screen and the spinner cleared.
   */
  async function runGeneration(text: string, echoPrompt: boolean) {
    const cleaned = text.trim();
    if (cleaned.length < 10) {
      setError("Опиши объект подробнее — минимум 10 символов.");
      return;
    }

    setLoading(true);
    setError(null);
    setLimitReached(false);
    setConcept(null);
    setQuestions([]);
    setDiagnostics(null);
    setMeasurement(null);
    setMeasureFrom(null);
    if (echoPrompt) setChat((prev) => [...prev, { role: "user", text: cleaned }]);
    await runPipelineVisual();

    try {
      const interviewAnswers = questions.map((question) => ({
        question: question.question,
        answer: answers[question.id],
      }));
      const result = await postJson<{
        concept?: ThreeDConcept;
        diagnostics?: Diagnostics;
      }>("/api/3d/generate", { prompt: cleaned, answers: interviewAnswers }, 90_000);

      if (result.ok && result.data.concept) {
        setPipelineStep(PIPELINE.length - 1);
        setDiagnostics(result.data.diagnostics ?? null);
        await playAssemble(result.data.concept);
        setChat((prev) => [
          ...prev,
          {
            role: "assistant",
            text: `Готово: ${result.data.concept!.name}. Выбери деталь в сцене и правь, или скажи голосом — «добавь куб», «удали крышу», «разбери».`,
          },
        ]);
        return;
      }

      setPipelineStep(-1);
      const limited = result.data.code === "THREE_D_LIMIT_REACHED";
      setLimitReached(limited);
      const message = limited
        ? "Бесплатные генерации закончились. Нужен Pro."
        : (result.data.error ?? "Не удалось создать модель.");
      setError(message);
      setChat((prev) => [...prev, { role: "assistant", text: message }]);
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    await runGeneration(prompt, true);
  }

  function applyPartChange(id: string, patch: Partial<ModelPart>) {
    const concept = conceptRef.current;
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

  /** Spawn a new primitive touching the selected part (or the top of the model) and hand it the Move gizmo. */
  function addPart(shape: PartShape = addShape): string | null {
    const concept = conceptRef.current;
    if (!concept) return null;
    pushHistory(concept);
    const maxDim = Math.max(
      concept.dimensions.width,
      concept.dimensions.height,
      concept.dimensions.depth,
      1
    );
    const size = Math.min(2, Math.max(0.05, maxDim * 0.12));
    const anchor = concept.parts.find((p) => p.id === selectedRef.current);
    const position: [number, number, number] = anchor
      ? [anchor.position[0], anchor.position[1] + anchor.size[1] / 2 + size / 2, anchor.position[2]]
      : [0, concept.dimensions.height + size / 2, 0];
    const id = `custom-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
    const newPart: ModelPart = {
      id,
      name: "Новая деталь",
      shape,
      position,
      size: [size, size, size],
      rotation: [0, 0, 0],
      color: "#a78bfa",
      material: "Новый материал",
      quantity: 1,
      role: "detail",
      group: "Добавленные детали",
      parentId: null,
    };
    const parts = [...concept.parts, newPart];
    setConcept({ ...concept, parts, structure: structureFromGroups(parts) });
    setSelectedId(id);
    cadHistoryGate.current = true;
    // The new part's mesh ref attaches on this render's commit — the gizmo
    // needs it to already exist, so enter Move on the next frame.
    requestAnimationFrame(() => setCadTool("translate"));
    return id;
  }

  function duplicatePart(): boolean {
    const concept = conceptRef.current;
    const selectedId = selectedRef.current;
    if (!concept || !selectedId) return false;
    const source = concept.parts.find((p) => p.id === selectedId);
    if (!source) return false;
    pushHistory(concept);
    const id = `${source.id}-copy-${Date.now().toString(36)}`;
    const clone: ModelPart = {
      ...source,
      id,
      name: `${source.name} (копия)`,
      position: [
        source.position[0] + Math.max(0.1, source.size[0] * 0.7),
        source.position[1],
        source.position[2],
      ],
    };
    const parts = [...concept.parts, clone];
    setConcept({ ...concept, parts, structure: structureFromGroups(parts) });
    setSelectedId(id);
    cadHistoryGate.current = true;
    requestAnimationFrame(() => setCadTool("translate"));
    return true;
  }

  function deletePart(partId?: string): boolean {
    const concept = conceptRef.current;
    const targetId = partId ?? selectedRef.current;
    if (!concept || !targetId) return false;
    if (!concept.parts.some((p) => p.id === targetId)) return false;
    if (concept.parts.length <= 1) {
      setError("Нельзя удалить последнюю деталь модели.");
      return false;
    }
    pushHistory(concept);
    const parts = concept.parts.filter((p) => p.id !== targetId);
    setConcept({ ...concept, parts, structure: structureFromGroups(parts) });
    if (selectedRef.current === targetId) setSelectedId(null);
    cadHistoryGate.current = true;
    return true;
  }

  /** Loose name match for spoken targets: "удали крышу" → the roof part. */
  function findPartByName(query: string): ModelPart | null {
    const concept = conceptRef.current;
    if (!concept) return null;
    const needle = query.toLowerCase().replace(/[.,!?]/g, "").trim();
    if (!needle) return null;
    const words = needle.split(/\s+/).filter((word) => word.length >= 3);
    const stem = (value: string) => value.toLowerCase().slice(0, Math.max(4, value.length - 2));

    const exact = concept.parts.find((p) => p.name.toLowerCase() === needle);
    if (exact) return exact;

    const contains = concept.parts.find(
      (p) => p.name.toLowerCase().includes(needle) || needle.includes(p.name.toLowerCase())
    );
    if (contains) return contains;

    // Russian endings differ between what is said and what the part is called,
    // so fall back to comparing stems of the significant words.
    let best: { part: ModelPart; score: number } | null = null;
    for (const candidate of concept.parts) {
      const haystack = `${candidate.name} ${candidate.group ?? ""} ${candidate.role ?? ""}`.toLowerCase();
      let score = 0;
      for (const word of words) {
        if (haystack.includes(stem(word))) score += 1;
      }
      if (score > 0 && (!best || score > best.score)) best = { part: candidate, score };
    }
    return best?.part ?? null;
  }

  /** Arm a boolean: the next part clicked in the scene becomes the second operand. */
  function armBoolean(op: BooleanOp) {
    if (!selectedId) {
      setError("Сначала выбери первую деталь, потом операцию.");
      return;
    }
    setMeasureMode(false);
    setCadTool("select");
    setPendingBoolean(op);
    setBooleanFirst(selectedId);
    setError(null);
  }

  async function runBoolean(firstId: string, secondId: string, op: BooleanOp) {
    const concept = conceptRef.current;
    if (!concept) return;
    const first = concept.parts.find((p) => p.id === firstId);
    const second = concept.parts.find((p) => p.id === secondId);
    setPendingBoolean(null);
    setBooleanFirst(null);
    if (!first || !second) return;

    setBooleanBusy(true);
    setError(null);
    try {
      // three + the CSG evaluator load on demand, not in the page's first chunk.
      const { booleanParts } = await import("@/frontend/csg");
      const merged = booleanParts(first, second, op);
      pushHistory(concept);
      const parts = concept.parts
        .map((item) => (item.id === firstId ? merged : item))
        .filter((item) => item.id !== secondId);
      setConcept({ ...concept, parts, structure: structureFromGroups(parts) });
      setSelectedId(merged.id);
      cadHistoryGate.current = true;
      setChat((prev) => [
        ...prev,
        { role: "assistant", text: `${BOOLEAN_LABELS[op]}: «${first.name}» и «${second.name}» — готово.` },
      ]);
    } catch (booleanError) {
      setError(
        booleanError instanceof Error
          ? booleanError.message
          : "Булеву операцию выполнить не удалось."
      );
    } finally {
      setBooleanBusy(false);
    }
  }

  /** One click in the scene: measure, complete a boolean, or just select. */
  function handleSelect(id: string | null) {
    if (!id) {
      setSelectedId(null);
      return;
    }
    if (pendingBoolean && booleanFirst && booleanFirst !== id) {
      void runBoolean(booleanFirst, id, pendingBoolean);
      return;
    }
    if (measureMode) {
      const concept = conceptRef.current;
      const from = measureFrom ? concept?.parts.find((p) => p.id === measureFrom) : null;
      const to = concept?.parts.find((p) => p.id === id);
      setSelectedId(id);
      if (!from || !to || from.id === to.id) {
        setMeasureFrom(id);
        setMeasurement(null);
        return;
      }
      const delta: [number, number, number] = [
        to.position[0] - from.position[0],
        to.position[1] - from.position[1],
        to.position[2] - from.position[2],
      ];
      setMeasurement({
        from: from.name,
        to: to.name,
        distance: Math.hypot(delta[0], delta[1], delta[2]),
        delta,
      });
      setMeasureFrom(null);
      return;
    }
    setSelectedId(id);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (typing || !concept || !selectedId) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deletePart();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [concept, selectedId]);

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
    await runGeneration(textPrompt, false);
  }

  function resetStudio() {
    setConcept(null);
    setQuestions([]);
    setAnswers({});
    setPipelineStep(-1);
    setPrompt("");
    setHistory([]);
    setFuture([]);
    setSelectedId(null);
    setMeasureFrom(null);
    setMeasurement(null);
    setError(null);
  }

  /** Apply an edit to the selected part, or to the whole model when nothing is picked. */
  function editParts(transform: (part: ModelPart) => ModelPart): number {
    const concept = conceptRef.current;
    if (!concept) return 0;
    const targetId = selectedRef.current;
    let touched = 0;
    const parts = concept.parts.map((item) => {
      if (targetId && item.id !== targetId) return item;
      touched += 1;
      return transform(item);
    });
    if (!touched) return 0;
    pushHistory(concept);
    setConcept({ ...concept, parts });
    cadHistoryGate.current = true;
    return touched;
  }

  /**
   * Voice → action.
   *
   * Recognised commands run against the scene immediately and return; only
   * free-form wording reaches the network, and that call is bounded by a
   * timeout so the studio can never sit frozen on a spoken instruction.
   */
  async function handleVoiceUtterance(text: string): Promise<string> {
    const raw = text.trim();
    setChat((prev) => [...prev, { role: "user", text: raw }]);
    const say = (message: string) => {
      setChat((prev) => [...prev, { role: "assistant", text: message }]);
      return message;
    };

    const command = parseVoiceCommand(raw);
    const concept = conceptRef.current;

    if (command.kind === "help") return say(describeCommand(command));
    if (command.kind === "reset") {
      resetStudio();
      return say(describeCommand(command));
    }
    if (command.kind === "generate") {
      say("Строю модель…");
      await generateFromPrompt(command.prompt);
      return conceptRef.current ? `Готово: ${conceptRef.current.name}.` : "Не получилось собрать модель.";
    }

    if (!concept) {
      if (raw.length >= 10) {
        say("Строю модель…");
        await generateFromPrompt(raw);
        return conceptRef.current
          ? `Готово: ${conceptRef.current.name}.`
          : "Не получилось собрать модель.";
      }
      return say("Сначала опиши, что построить — одной фразой.");
    }

    switch (command.kind) {
      case "add": {
        const id = addPart(command.shape);
        return say(id ? describeCommand(command) : "Не смог добавить деталь.");
      }
      case "delete": {
        const target = command.target ? findPartByName(command.target) : null;
        if (command.target && !target) {
          return say(`Не нашёл деталь «${command.target}». Скажи иначе или выбери её в списке.`);
        }
        const targetId = target?.id ?? selectedRef.current ?? undefined;
        if (!targetId) return say("Сначала выбери деталь или скажи, что именно удалить.");
        const removed = deletePart(targetId);
        return say(
          removed
            ? `Удалил: ${target?.name ?? "выбранную деталь"}.`
            : "Не получилось удалить — в модели должна остаться хотя бы одна деталь."
        );
      }
      case "duplicate":
        return say(duplicatePart() ? describeCommand(command) : "Сначала выбери деталь.");
      case "select": {
        const found = findPartByName(command.target);
        if (!found) return say(`Не нашёл «${command.target}».`);
        setSelectedId(found.id);
        return say(`Выбрал: ${found.name}.`);
      }
      case "color": {
        const touched = editParts((item) => ({ ...item, color: command.color }));
        return say(touched ? `Перекрасил в ${command.label}.` : "Нечего красить.");
      }
      case "scale": {
        const touched = editParts((item) => ({
          ...item,
          size: [
            Math.max(0.01, item.size[0] * command.factor),
            Math.max(0.01, item.size[1] * command.factor),
            Math.max(0.01, item.size[2] * command.factor),
          ],
          position: selectedRef.current
            ? item.position
            : ([
                item.position[0] * command.factor,
                item.position[1] * command.factor,
                item.position[2] * command.factor,
              ] as [number, number, number]),
        }));
        return say(touched ? describeCommand(command) : "Нечего масштабировать.");
      }
      case "move": {
        const axis = command.axis === "x" ? 0 : command.axis === "y" ? 1 : 2;
        const touched = editParts((item) => {
          const position = [...item.position] as [number, number, number];
          position[axis] += command.delta;
          return { ...item, position };
        });
        return say(touched ? describeCommand(command) : "Нечего двигать.");
      }
      case "rotate": {
        const axis = command.axis === "x" ? 0 : command.axis === "y" ? 1 : 2;
        const touched = editParts((item) => {
          const rotation = [...item.rotation] as [number, number, number];
          rotation[axis] += command.radians;
          return { ...item, rotation };
        });
        return say(touched ? describeCommand(command) : "Нечего поворачивать.");
      }
      case "undo":
        undo();
        return say(describeCommand(command));
      case "redo":
        redo();
        return say(describeCommand(command));
      case "explode":
        setAssembling(false);
        setView("perspective");
        setExploded(true);
        return say(describeCommand(command));
      case "assemble":
        setExploded(false);
        setAssembling(true);
        if (assembleTimer.current) clearTimeout(assembleTimer.current);
        assembleTimer.current = setTimeout(() => setAssembling(false), 2800);
        return say(describeCommand(command));
      case "view":
        setExploded(false);
        setCadTool("select");
        setView(command.view);
        return say(describeCommand(command));
      case "tool":
        setCadTool(command.tool);
        cadHistoryGate.current = false;
        return say(describeCommand(command));
      case "snap":
        setSnap(command.on);
        return say(describeCommand(command));
      case "measure":
        setCadTool("select");
        setMeasureMode(true);
        setMeasureFrom(null);
        setMeasurement(null);
        return say(describeCommand(command));
      case "export":
        void exportModel(command.format);
        return say(describeCommand(command));
      default:
        break;
    }

    // Anything the parser did not claim goes to the model — with a timeout.
    setVoiceThinking(true);
    try {
      const chatResult = await postJson<{
        reply?: string;
        shouldRefine?: boolean;
        refineInstruction?: string;
      }>(
        "/api/3d/chat",
        {
          message: raw,
          prompt,
          concept: {
            name: concept.name,
            description: concept.description,
            dimensions: concept.dimensions,
            parts: concept.parts.map((p) => ({ name: p.name })),
          },
        },
        20_000
      );

      if (!chatResult.ok) {
        return say(chatResult.data.error ?? "Не понял команду. Скажи «помощь» — перечислю команды.");
      }

      const reply =
        typeof chatResult.data.reply === "string" && chatResult.data.reply.trim()
          ? chatResult.data.reply.trim()
          : "Готово.";
      say(reply);

      if (chatResult.data.shouldRefine && chatResult.data.refineInstruction) {
        const refineResult = await postJson<{ concept?: ThreeDConcept }>(
          "/api/3d/refine",
          {
            concept,
            instruction: chatResult.data.refineInstruction,
            selectedPartId: selectedRef.current,
          },
          40_000
        );
        if (refineResult.ok && refineResult.data.concept) {
          pushHistory(concept);
          await playAssemble(refineResult.data.concept);
        } else {
          return say(refineResult.data.error ?? "Правку применить не удалось.");
        }
      }
      return reply;
    } finally {
      setVoiceThinking(false);
    }
  }

  /**
   * Typed instruction. Recognised editing commands run locally through the same
   * path as speech, so typing "удали крышу" behaves exactly like saying it —
   * and only free-form wording reaches the model.
   */
  async function refine(event?: FormEvent) {
    event?.preventDefault();
    const instruction = chatInput.trim();
    if (!concept || instruction.length < 3) return;
    setChatInput("");

    if (parseVoiceCommand(instruction).kind !== "chat") {
      await handleVoiceUtterance(instruction);
      return;
    }

    setChat((prev) => [...prev, { role: "user", text: instruction }]);
    setLoading(true);
    setError(null);
    try {
      const result = await postJson<{ concept?: ThreeDConcept }>(
        "/api/3d/refine",
        { concept, instruction, selectedPartId: selectedId },
        40_000
      );
      if (result.ok && result.data.concept) {
        pushHistory(concept);
        await playAssemble(result.data.concept);
        setChat((prev) => [...prev, { role: "assistant", text: "Правка применена." }]);
      } else {
        const message = result.data.error ?? "Не удалось применить правку.";
        setError(message);
        setChat((prev) => [...prev, { role: "assistant", text: message }]);
      }
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
      const exporter = await import("@/frontend/export-3d");
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
    <div className="fixed inset-x-0 bottom-0 top-[65px] z-30 flex flex-col bg-[#141518] text-[#f4f1ea] md:flex-row">
      {/* The scene keeps the room it has; on narrow screens the panel becomes a
          drawer under it rather than covering the model. */}
      <div className="relative min-h-0 min-w-0 flex-1">
        {concept ? (
          <>
            <ConceptViewer
              concept={concept}
              selectedId={selectedId}
              onSelect={handleSelect}
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
              addShape={addShape}
              onAddShape={setAddShape}
              onAddPart={() => addPart()}
              onDuplicatePart={() => duplicatePart()}
              onDeletePart={() => deletePart()}
              canEditSelection={Boolean(selectedId)}
              onBoolean={armBoolean}
              pendingBoolean={pendingBoolean}
              booleanBusy={booleanBusy}
              measureMode={measureMode}
              onMeasureMode={(on) => {
                setMeasureMode(on);
                setMeasureFrom(null);
                setMeasurement(null);
                if (on) {
                  setCadTool("select");
                  setPendingBoolean(null);
                  setBooleanFirst(null);
                }
              }}
            />
          </>
        ) : (
          <div className="relative flex h-full flex-col items-center justify-center overflow-y-auto px-5 py-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(167,139,250,0.12),transparent_50%)]" />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative flex w-full max-w-2xl flex-col items-center"
            >
              <div className="holo-ring mb-6 hidden sm:block" />
              <p className="hud-chip rounded-full px-3 py-1 text-[10px] text-[#a78bfa]/90">
                Design Engine · {providerHint}
              </p>
              <h1 className="display mt-5 text-center text-4xl font-semibold text-white sm:text-5xl md:text-6xl">
                ATRION
              </h1>
              <p className="display mt-3 text-center text-xl text-[#a78bfa] sm:text-2xl">
                Опиши словами — получи 3D-модель
              </p>
              <div className="gold-line mt-6 w-16" />

              <div className="mt-8 w-full space-y-3">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={3}
                  placeholder="Опиши объект — что угодно: дом, персонаж, машина, мебель, гаджет…"
                  className="w-full resize-none rounded-2xl border border-white/10 bg-black/45 px-5 py-4 text-sm outline-none focus:border-[#a78bfa]/50"
                />
                <div className="flex flex-wrap justify-center gap-2">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setPrompt(example)}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[#9a948c] transition hover:border-[#a78bfa]/40 hover:text-white"
                    >
                      {example}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={loading || prompt.trim().length < 10}
                  onClick={startInterview}
                  className="btn-primary w-full rounded-full px-6 py-3.5 text-sm disabled:opacity-40"
                >
                  {loading ? "Собираю модель…" : "Создать модель →"}
                </button>
                <p className="text-center text-[11px] leading-relaxed text-[#6a6560]">
                  Дальше можно править мышью или голосом: «добавь куб», «удали крышу»,
                  «покрась в синий», «разбери».
                </p>
              </div>
            </motion.div>
          </div>
        )}

        {concept && (
          <div className="absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border border-[#a78bfa]/20 bg-[#050507]/80 px-2 py-1.5 shadow-lg shadow-black/40 backdrop-blur-xl">
            {(
              [
                ["perspective", "Обзор"],
                ["top", "Сверху"],
                ["front", "Спереди"],
                ["side", "Сбоку"],
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
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition ${
                  view === value && !exploded
                    ? "bg-[#a78bfa]/20 text-[#a78bfa]"
                    : "text-[#9a948c] hover:text-white"
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
              Озвучить
            </button>
            <button
              type="button"
              onClick={() => {
                // The voice panel lives in the side panel — turning the mic on
                // with the panel collapsed would unmount the session at once.
                setVoiceMode((on) => {
                  if (!on) setPanelOpen(true);
                  return !on;
                });
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition ${
                voiceMode ? "bg-red-500/80 text-white" : "text-[#9a948c] hover:text-white"
              }`}
            >
              {voiceMode ? "Стоп" : "Микрофон"}
            </button>
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="rounded-full px-3 py-1.5 text-xs text-[#8f8a82]"
            >
              {panelOpen ? "Скрыть панель" : "Панель"}
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
              <div className="w-full max-w-md rounded-2xl border border-[#a78bfa]/25 bg-[#121214]/95 p-6">
                <CubesLoop className="mx-auto mb-3 h-80 w-full" />
                <p className="mb-3 text-[10px] uppercase tracking-[0.28em] text-[#a78bfa]/80">
                  {pipelineStep >= 3 ? "Собираем детали…" : "Строим модель…"}
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
        <aside className="flex max-h-[52vh] w-full shrink-0 flex-col border-t border-[#a78bfa]/15 bg-[#0e0e10]/95 backdrop-blur-2xl md:max-h-none md:w-[360px] md:border-l md:border-t-0 lg:w-[400px]">
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
                    <p className="mt-2 text-[#8f8a82]">Размеры и положение, {units}</p>
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
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <label className="col-span-2 space-y-1">
                        <span className="font-mono text-[10px] text-[#6a6560]">Форма</span>
                        <select
                          value={selectedPart.shape}
                          onChange={(e) =>
                            applyPartChange(selectedPart.id, {
                              shape: e.target.value as ModelPart["shape"],
                            })
                          }
                          className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] outline-none focus:border-[#a78bfa]/45"
                        >
                          {(
                            [
                              "box",
                              "cylinder",
                              "sphere",
                              "cone",
                              "pyramid",
                              "prism",
                              "wedge",
                              "torus",
                              "capsule",
                              "tube",
                              "plane",
                            ] as const
                          ).map((shape) => (
                            <option key={shape} value={shape}>
                              {shape}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="font-mono text-[10px] text-[#6a6560]">Цвет</span>
                        <input
                          type="color"
                          value={/^#[0-9a-f]{6}$/i.test(selectedPart.color) ? selectedPart.color : "#a78bfa"}
                          onChange={(e) => applyPartChange(selectedPart.id, { color: e.target.value })}
                          className="h-[26px] w-full cursor-pointer rounded-lg border border-white/10 bg-black/40 p-0.5"
                        />
                      </label>
                    </div>
                    <label className="mt-2 block space-y-1">
                      <span className="font-mono text-[10px] text-[#6a6560]">Название</span>
                      <input
                        type="text"
                        value={selectedPart.name}
                        onChange={(e) => applyPartChange(selectedPart.id, { name: e.target.value })}
                        className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] outline-none focus:border-[#a78bfa]/45"
                      />
                    </label>
                  </div>
                )}

                {voiceThinking && (
                  <div className="flex items-center gap-2 rounded-2xl border border-violet-400/25 bg-violet-400/[0.07] px-3 py-2 text-xs text-violet-200">
                    <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-violet-300" />
                    <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-violet-300" />
                    <span className="thinking-dot h-1.5 w-1.5 rounded-full bg-violet-300" />
                    <span className="ml-1">Думаю над командой…</span>
                  </div>
                )}

                {diagnostics && (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs">
                    <button
                      type="button"
                      onClick={() => setShowDiagnostics((value) => !value)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                    >
                      <span className="text-[10px] uppercase tracking-[0.18em] text-[#6a6560]">
                        Как собрана модель
                      </span>
                      <span className="text-[#8f8a82]">{showDiagnostics ? "свернуть" : "показать"}</span>
                    </button>
                    <p className="mt-1.5 text-[#b8b2a8]">
                      {diagnostics.parts ?? 0} деталей · {diagnostics.primitives ?? 0} примитивов ·
                      цельность {Math.round((diagnostics.score ?? 0) * 100)}%
                    </p>
                    {showDiagnostics && (
                      <div className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-2 text-[11px] text-[#8f8a82]">
                        {diagnostics.matched?.length ? (
                          <p>
                            <span className="text-[#6a6560]">Распознано в тексте: </span>
                            {diagnostics.matched.join(", ")}
                          </p>
                        ) : null}
                        {diagnostics.plan && (
                          <p className="font-mono text-[10px] leading-relaxed text-[#6a6560]">
                            {diagnostics.plan}
                          </p>
                        )}
                        <p>
                          <span className="text-[#6a6560]">Источник геометрии: </span>
                          {diagnostics.source === "ai" ? "AI" : "параметрический движок"}
                        </p>
                        {diagnostics.notes?.map((note, index) => (
                          <p key={index}>· {note}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {measureMode && (
                  <div className="rounded-2xl border border-sky-400/30 bg-sky-400/[0.07] p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sky-200">Измерение</p>
                      <button
                        type="button"
                        onClick={() => {
                          setMeasureMode(false);
                          setMeasureFrom(null);
                          setMeasurement(null);
                        }}
                        className="text-[11px] text-[#8f8a82] hover:text-white"
                      >
                        Выключить
                      </button>
                    </div>
                    {measurement ? (
                      <div className="mt-2 space-y-1 text-[#b8b2a8]">
                        <p>
                          {measurement.from} → {measurement.to}
                        </p>
                        <p className="font-mono text-sm text-white">
                          {measurement.distance.toFixed(3)} {units}
                        </p>
                        <p className="font-mono text-[10px] text-[#6a6560]">
                          ΔX {measurement.delta[0].toFixed(3)} · ΔY {measurement.delta[1].toFixed(3)} ·
                          ΔZ {measurement.delta[2].toFixed(3)}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-[#8f8a82]">
                        {measureFrom
                          ? "Теперь кликни вторую деталь."
                          : "Кликни первую деталь в сцене."}
                      </p>
                    )}
                  </div>
                )}

                {pendingBoolean && (
                  <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.07] p-3 text-xs text-amber-100">
                    {BOOLEAN_LABELS[pendingBoolean]}: выбери вторую деталь в сцене.
                    <button
                      type="button"
                      onClick={() => {
                        setPendingBoolean(null);
                        setBooleanFirst(null);
                      }}
                      className="ml-2 underline decoration-dotted"
                    >
                      отмена
                    </button>
                  </div>
                )}

                {concept && treeOpen && (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[#6a6560]">Детали модели</p>
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
                      Новая модель
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
