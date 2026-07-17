"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { Blueprint, InterviewState } from "@/lib/types";
import Thinking from "@/components/Thinking";
import BlueprintView from "./BlueprintView";

interface ProjectData {
  id: string;
  title: string;
  idea: string;
  status: string;
  interview: InterviewState | null;
  blueprint: Blueprint | null;
}

export default function ProjectView({ project }: { project: ProjectData }) {
  const router = useRouter();
  const [interview, setInterview] = useState<InterviewState | null>(project.interview);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(project.blueprint);
  const [answers, setAnswers] = useState<Record<string, string>>(project.interview?.answers ?? {});
  const [phase, setPhase] = useState<"idle" | "interviewing" | "generating">("idle");
  const [error, setError] = useState<string | null>(null);

  async function startInterview() {
    setError(null);
    setPhase("interviewing");
    const res = await fetch(`/api/projects/${project.id}/interview`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setInterview({ questions: data.questions, answers: {} });
    } else {
      setError(data.error ?? "Ошибка");
    }
    setPhase("idle");
  }

  async function generate() {
    setError(null);
    setPhase("generating");
    const res = await fetch(`/api/projects/${project.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const data = await res.json();
    if (res.ok) {
      setBlueprint(data.blueprint);
      router.refresh();
    } else {
      setError(data.error ?? "Ошибка");
    }
    setPhase("idle");
  }

  async function remove() {
    if (!confirm("Удалить проект безвозвратно?")) return;
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    router.push("/dashboard");
    router.refresh();
  }

  if (blueprint) {
    return (
      <BlueprintView
        blueprint={blueprint}
        idea={project.idea}
        onRegenerate={generate}
        regenerating={phase === "generating"}
        onDelete={remove}
      />
    );
  }

  const allAnswered =
    interview !== null && interview.questions.every((q) => answers[q.id]);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">Project</p>
      <h1 className="mt-1 text-3xl font-bold leading-tight">{project.title}</h1>
      <p className="mt-3 rounded-2xl border border-line bg-surface p-5 text-muted">{project.idea}</p>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {!interview && (
        <div className="mt-8">
          {phase === "interviewing" ? (
            <div className="card p-6">
              <Thinking label="AI изучает идею и готовит вопросы" />
            </div>
          ) : (
            <button onClick={startInterview} className="btn-primary rounded-full px-8 py-3 font-semibold text-white">
              Начать AI-интервью →
            </button>
          )}
        </div>
      )}

      {interview && (
        <div className="mt-8 flex flex-col gap-6">
          <AnimatePresence>
            {interview.questions.map((q, i) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="card p-6"
              >
                <p className="text-sm font-medium">
                  <span className="mr-2 text-accent">{String(i + 1).padStart(2, "0")}</span>
                  {q.question}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {q.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                      className={`rounded-full border px-4 py-2 text-sm transition ${
                        answers[q.id] === opt
                          ? "border-accent bg-accent/15 text-fg"
                          : "border-line text-muted hover:border-accent/50 hover:text-fg"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {phase === "generating" ? (
            <div className="card p-6">
              <Thinking label="AI проектирует архитектуру, БД, API и roadmap" />
            </div>
          ) : (
            <button
              onClick={generate}
              disabled={!allAnswered}
              className="btn-primary self-start rounded-full px-8 py-3 font-semibold text-white disabled:opacity-50"
            >
              {allAnswered ? "Сгенерировать план проекта →" : "Ответьте на все вопросы"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
