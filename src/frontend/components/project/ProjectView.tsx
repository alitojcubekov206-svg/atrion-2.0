"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { Blueprint, InterviewState } from "@/shared/types";
import Thinking from "@/frontend/components/Thinking";
import ConfirmDialog from "@/frontend/components/ConfirmDialog";
import { postJson, requestJson } from "@/frontend/api";
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function startInterview() {
    setError(null);
    setPhase("interviewing");
    const res = await postJson<{ questions?: InterviewState["questions"] }>(
      `/api/projects/${project.id}/interview`,
      undefined,
      70_000
    );
    if (res.ok && res.data.questions) {
      setInterview({ questions: res.data.questions, answers: {} });
    } else {
      setError(res.data.error ?? "Ошибка");
    }
    setPhase("idle");
  }

  async function generate() {
    setError(null);
    setPhase("generating");
    const res = await postJson<{ blueprint?: Blueprint }>(
      `/api/projects/${project.id}/generate`,
      { answers },
      70_000
    );
    if (res.ok && res.data.blueprint) {
      setBlueprint(res.data.blueprint);
      router.refresh();
    } else {
      setError(res.data.error ?? "Ошибка");
    }
    setPhase("idle");
  }

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    const res = await requestJson(`/api/projects/${project.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setDeleting(false);
      setDeleteError(res.data.error ?? "Не удалось удалить проект");
    }
  }

  const dialog = (
    <ConfirmDialog
      open={deleteOpen}
      danger
      title="Удалить проект?"
      description="План, интервью и все данные проекта будут удалены безвозвратно."
      confirmLabel="Удалить"
      loading={deleting}
      error={deleteError}
      onCancel={() => setDeleteOpen(false)}
      onConfirm={remove}
    />
  );

  if (blueprint) {
    return (
      <>
        <BlueprintView
          blueprint={blueprint}
          projectId={project.id}
          idea={project.idea}
          onRegenerate={generate}
          regenerating={phase === "generating"}
          onDelete={() => setDeleteOpen(true)}
        />
        {dialog}
      </>
    );
  }

  const allAnswered =
    interview !== null && interview.questions.every((q) => answers[q.id]);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">Проект</p>
      <h1 className="mt-1 text-3xl font-bold leading-tight text-white">{project.title}</h1>
      <p className="mt-3 rounded-2xl border border-line bg-surface p-5 text-muted">{project.idea}</p>

      {error && (
        <p className="mt-4 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {!interview && (
        <div className="mt-8">
          {phase === "interviewing" ? (
            <div className="card p-6">
              <Thinking label="AI изучает идею и готовит вопросы" />
            </div>
          ) : (
            <button onClick={startInterview} className="btn-primary rounded-full px-8 py-3 font-semibold">
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
                <p className="text-sm font-medium text-white">
                  <span className="mr-2 text-accent">{String(i + 1).padStart(2, "0")}</span>
                  {q.question}
                </p>
                <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={q.question}>
                  {q.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      aria-pressed={answers[q.id] === opt}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                      className={`rounded-full border px-4 py-2 text-sm transition ${
                        answers[q.id] === opt
                          ? "border-accent bg-accent/15 text-white"
                          : "border-line text-muted hover:border-accent/50 hover:text-white"
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
              className="btn-primary self-start rounded-full px-8 py-3 font-semibold disabled:opacity-50"
            >
              {allAnswered ? "Сгенерировать план проекта →" : "Ответьте на все вопросы"}
            </button>
          )}
        </div>
      )}

      <div className="mt-10 border-t border-line pt-6">
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="text-sm text-muted transition hover:text-red-300"
        >
          Удалить проект
        </button>
      </div>
      {dialog}
    </div>
  );
}
