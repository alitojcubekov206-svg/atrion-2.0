"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Thinking from "@/components/Thinking";
import type { InterviewQuestion, ThreeDConcept } from "@/lib/types";
import { download } from "@/lib/export";

const ConceptViewer = dynamic(() => import("@/components/three/ConceptViewer"), {
  ssr: false,
  loading: () => <div className="h-[520px] animate-pulse rounded-2xl border border-line bg-surface" />,
});

const EXAMPLES = [
  "Пешеходный мост длиной 8 метров из стали и дерева",
  "Современная садовая беседка на 8 человек",
  "Компактный письменный стол с полками для ноутбука",
  "Корпус настольного робота с камерой и колёсами",
];

const CUSTOM_OPTION = "Другое — написать свой вариант";

export default function ThreeDStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customQuestions, setCustomQuestions] = useState<Record<string, boolean>>({});
  const [concept, setConcept] = useState<ThreeDConcept | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawingView, setDrawingView] = useState<"perspective" | "top" | "front" | "side">(
    "perspective"
  );
  const [loading, setLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<"interview" | "concept">("interview");
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  async function startInterview() {
    setLoading(true);
    setLoadingMode("interview");
    setError(null);
    setLimitReached(false);
    setQuestions([]);
    setAnswers({});
    setCustomQuestions({});
    setConcept(null);
    setSelectedId(null);

    try {
      const response = await fetch("/api/3d/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (response.ok && Array.isArray(data.questions)) {
        setQuestions(data.questions);
      } else {
        setError(data.error ?? "Не удалось подготовить вопросы.");
      }
    } catch {
      setError("Соединение прервалось. Попробуйте начать интервью ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    setLoading(true);
    setLoadingMode("concept");
    setError(null);
    setLimitReached(false);
    setConcept(null);
    setSelectedId(null);

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
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};

      if (response.ok && data.concept) {
        setConcept(data.concept);
      } else {
        setLimitReached(data.code === "THREE_D_LIMIT_REACHED");
        setError(data.error ?? "Не удалось создать модель.");
      }
    } catch {
      setError("Соединение прервалось. Попробуйте создать модель ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  const allAnswered =
    questions.length > 0 && questions.every((question) => Boolean(answers[question.id]));
  const selectedPart = concept?.parts.find((part) => part.id === selectedId);
  const formatCost = (value: number) => new Intl.NumberFormat("ru-RU").format(value);

  return (
    <div>
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-10 md:px-10">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-accent2/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              Atrion AI Pro
            </span>
            <span className="text-xs text-muted">AI-powered conceptual design</span>
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight md:text-5xl">
            Atrion <span className="glow-text">3D Studio</span>
          </h1>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted">
            Опиши объект обычными словами. AI разложит его на детали, предложит материалы
            и соберёт интерактивную концептуальную 3D-модель.
          </p>
          <p className="mt-3 text-xs text-muted">
            Free: одна 3D-генерация · Pro: расширенный доступ в рамках лимитов провайдеров
          </p>

          <div className="mt-7 max-w-3xl">
            <textarea
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setQuestions([]);
                setAnswers({});
                setCustomQuestions({});
                setConcept(null);
              }}
              rows={4}
              placeholder="Например: металлический пешеходный мост длиной 8 метров с деревянным настилом..."
              className="w-full resize-none rounded-2xl border border-line bg-bg/70 p-5 outline-none transition focus:border-accent"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  onClick={() => setPrompt(example)}
                  className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-fg"
                >
                  {example}
                </button>
              ))}
            </div>
            {questions.length === 0 && (
              <button
                onClick={startInterview}
                disabled={loading || prompt.trim().length < 10}
                className="btn-primary mt-5 rounded-full px-7 py-3 font-semibold text-white disabled:opacity-50"
              >
                {loading ? "Анализ идеи…" : "Начать инженерное интервью →"}
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-400">
          <p>{error}</p>
          {limitReached && (
            <Link
              href="/pricing"
              className="mt-3 inline-block rounded-full bg-accent px-5 py-2 font-semibold text-white"
            >
              Перейти на Pro — $2/месяц
            </Link>
          )}
        </div>
      )}

      {questions.length > 0 && !concept && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-accent2">Discovery interview</p>
            <h2 className="mt-1 text-2xl font-bold">Уточним техническое задание</h2>
            <p className="mt-2 text-sm text-muted">
              Ответы нужны, чтобы AI не угадывал размеры, нагрузки, бюджет и доступное оборудование.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {questions.map((question, index) => {
              const options = [
                ...question.options.filter(
                  (option) => !/(друг|свой вариант|своими словами|other)/i.test(option)
                ),
                CUSTOM_OPTION,
              ];
              const customActive = Boolean(customQuestions[question.id]);

              return (
                <div key={question.id} className="card p-5">
                  <p className="text-sm font-medium">
                    <span className="mr-2 text-accent">{String(index + 1).padStart(2, "0")}</span>
                    {question.question}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {options.map((option) => {
                      const isCustom = option === CUSTOM_OPTION;
                      const selected = isCustom
                        ? customActive
                        : !customActive && answers[question.id] === option;

                      return (
                        <button
                          key={option}
                          onClick={() => {
                            setCustomQuestions((current) => ({
                              ...current,
                              [question.id]: isCustom,
                            }));
                            setAnswers((current) => ({
                              ...current,
                              [question.id]: isCustom ? "" : option,
                            }));
                          }}
                          className={`rounded-full border px-3 py-1.5 text-xs transition ${
                            selected
                              ? "border-accent bg-accent/15 text-fg"
                              : "border-line text-muted hover:border-accent/50 hover:text-fg"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  {customActive && (
                    <input
                      autoFocus
                      value={answers[question.id] ?? ""}
                      onChange={(event) =>
                        setAnswers((current) => ({
                          ...current,
                          [question.id]: event.target.value,
                        }))
                      }
                      placeholder="Напишите точный ответ, например: 7.5 метра"
                      className="mt-3 w-full rounded-xl border border-accent/30 bg-bg/70 px-4 py-2.5 text-sm outline-none transition focus:border-accent"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={generate}
            disabled={loading || !allAnswered}
            className="btn-primary mt-6 rounded-full px-7 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading && loadingMode === "concept"
              ? "Создаю полный проект…"
              : allAnswered
                ? "Создать 3D-чертёж и смету →"
                : "Ответьте на все вопросы"}
          </button>
        </motion.section>
      )}

      {loading && (
        <div className="card mt-6 p-8">
          <Thinking
            label={
              loadingMode === "interview"
                ? "AI анализирует идею и готовит вопросы"
                : "AI проектирует геометрию, материалы, смету и сборку"
            }
          />
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Анализ конструкции", "Создание деталей", "Подбор материалов"].map((label) => (
              <div key={label} className="rounded-xl border border-line bg-surface2 p-4 text-xs text-muted">
                {label}
              </div>
            ))}
          </div>
        </div>
      )}

      {concept && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8"
        >
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-accent2">Generated concept</p>
              <h2 className="mt-1 text-2xl font-bold">{concept.name}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted">{concept.description}</p>
            </div>
            <button
              onClick={() =>
                download(
                  `${concept.name}.atrion-3d.json`,
                  JSON.stringify(concept, null, 2),
                  "application/json"
                )
              }
              className="rounded-full border border-line px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-fg"
            >
              Скачать проект JSON
            </button>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {[
              ["perspective", "3D"],
              ["top", "Вид сверху"],
              ["front", "Спереди"],
              ["side", "Сбоку"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() =>
                  setDrawingView(value as "perspective" | "top" | "front" | "side")
                }
                className={`rounded-full border px-4 py-2 text-xs transition ${
                  drawingView === value
                    ? "border-accent2 bg-accent2/10 text-accent2"
                    : "border-line text-muted hover:border-accent2/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <ConceptViewer
            concept={concept}
            selectedId={selectedId}
            onSelect={setSelectedId}
            view={drawingView}
          />

          {selectedPart && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 rounded-xl border border-accent/20 bg-accent/5 px-5 py-3 text-sm">
              <span className="font-semibold">{selectedPart.name}</span>
              <span className="text-muted">Материал: {selectedPart.material}</span>
              <span className="text-muted">
                Размер: {selectedPart.size.join(" × ")} {concept.units}
              </span>
              <span className="text-muted">Количество: {selectedPart.quantity}</span>
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="card overflow-hidden">
              <div className="border-b border-line px-6 py-4">
                <h3 className="font-semibold">Спецификация деталей</h3>
                <p className="mt-1 text-xs text-muted">
                  Габариты: {concept.dimensions.width} × {concept.dimensions.height} ×{" "}
                  {concept.dimensions.depth} {concept.units}
                </p>
              </div>
              <div className="divide-y divide-line/50">
                {concept.parts.map((part, index) => (
                  <button
                    key={part.id}
                    onClick={() => setSelectedId(part.id)}
                    className="grid w-full grid-cols-[32px_1fr_auto] items-center gap-3 px-6 py-3 text-left transition hover:bg-white/[0.025]"
                  >
                    <span className="text-xs text-muted">{String(index + 1).padStart(2, "0")}</span>
                    <span>
                      <span className="block text-sm font-medium">{part.name}</span>
                      <span className="text-xs text-muted">{part.material}</span>
                    </span>
                    <span className="font-mono text-xs text-muted">×{part.quantity}</span>
                  </button>
                ))}
              </div>
            </section>

            <div className="flex flex-col gap-6">
              <section className="card p-6">
                <h3 className="font-semibold">Материалы</h3>
                <div className="mt-4 flex flex-col gap-4">
                  {concept.materials.map((material) => (
                    <div key={material.name}>
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="font-medium">{material.name}</span>
                        <span className="text-muted">{material.estimatedQuantity}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {material.specification} · {material.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card p-6">
                <h3 className="font-semibold">Оборудование и специалисты</h3>
                <div className="mt-4 flex flex-col gap-3">
                  {concept.equipment.map((item) => (
                    <div key={item.name} className="flex items-start justify-between gap-4 text-sm">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="mt-0.5 text-xs text-muted">{item.purpose}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted">
                        {item.access === "rent"
                          ? "Аренда"
                          : item.access === "specialist"
                            ? "Нужен специалист"
                            : "Купить"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="card p-6">
                <h3 className="font-semibold">Порядок сборки</h3>
                <ol className="mt-4 flex flex-col gap-3">
                  {concept.assemblySteps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm text-muted">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
                        {index + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="card p-6">
              <p className="text-xs uppercase tracking-[0.16em] text-muted">Примерная стоимость</p>
              <p className="mt-2 text-3xl font-bold text-accent2">
                {formatCost(concept.costEstimate.minimum)}–{formatCost(concept.costEstimate.maximum)}{" "}
                {concept.costEstimate.currency}
              </p>
              <div className="mt-5 divide-y divide-line/50">
                {concept.costEstimate.breakdown.map((item) => (
                  <div key={item.item} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                    <span>
                      {item.item}
                      <span className="ml-2 text-xs text-muted">{item.quantity}</span>
                    </span>
                    <span className="shrink-0 font-medium">
                      ≈ {formatCost(item.estimatedCost)} {concept.costEstimate.currency}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted">{concept.costEstimate.note}</p>
            </section>

            <section className="card p-6">
              <h3 className="font-semibold">Что потребуется до начала работ</h3>
              <ul className="mt-4 flex flex-col gap-2.5 text-sm text-muted">
                {concept.requirements.map((requirement) => (
                  <li key={requirement} className="flex gap-2.5">
                    <span className="text-accent2">□</span>
                    {requirement}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <section className="card border-emerald-500/20 p-6">
              <h3 className="font-semibold text-emerald-400">Плюсы решения</h3>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                {concept.advantages.map((item) => (
                  <li key={item} className="flex gap-2"><span className="text-emerald-400">+</span>{item}</li>
                ))}
              </ul>
            </section>
            <section className="card border-red-500/20 p-6">
              <h3 className="font-semibold text-red-400">Минусы и ограничения</h3>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
                {concept.disadvantages.map((item) => (
                  <li key={item} className="flex gap-2"><span className="text-red-400">−</span>{item}</li>
                ))}
              </ul>
            </section>
          </div>

          <section className="card mt-6 p-6">
            <h3 className="font-semibold">Риски проекта</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {concept.risks.map((item) => (
                <div key={item.risk} className="rounded-xl border border-line bg-surface2 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">{item.risk}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                      item.severity === "High"
                        ? "bg-red-500/10 text-red-400"
                        : item.severity === "Medium"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-emerald-500/10 text-emerald-400"
                    }`}>
                      {item.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted">{item.mitigation}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
            <h3 className="text-sm font-semibold text-amber-400">Инженерная проверка обязательна</h3>
            <p className="mt-2 text-sm text-muted">{concept.disclaimer}</p>
            {concept.engineeringNotes.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 text-xs text-muted">
                {concept.engineeringNotes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
