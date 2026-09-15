"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { Blueprint, InterviewState } from "@/shared/types";
import MeshLoader from "@/frontend/components/MeshLoader";
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
  const [justGenerated, setJustGenerated] = useState(false);
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
      setJustGenerated(true);
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
          reveal={justGenerated}
        />
        {dialog}
      </>
    );
  }

  const questions = interview?.questions ?? [];
  const answered = questions.filter((q) => answers[q.id]).length;
  const allAnswered = interview !== null && answered === questions.length;

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
              <MeshLoader label="AI изучает идею и готовит вопросы" />
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
            {questions.map((q, i) => (
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
                  {q.options.map((opt) => {
                    const selected = answers[q.id] === opt;
                    return (
                      <motion.button
                        key={opt}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                        whileTap={{ scale: 0.95 }}
                        animate={selected ? { scale: [1, 1.07, 1] } : { scale: 1 }}
                        transition={{ duration: 0.35 }}
                        className={`relative rounded-full border px-4 py-2 text-sm transition ${
                          selected
                            ? "border-accent bg-accent/15 text-white"
                            : "border-line text-muted hover:border-accent/50 hover:text-white"
                        }`}
                      >
                        {selected && (
                          <motion.span
                            key={`${q.id}-${opt}`}
                            aria-hidden="true"
                            initial={{ opacity: 0.7, scale: 1 }}
                            animate={{ opacity: 0, scale: 1.7 }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                            className="pointer-events-none absolute inset-0 rounded-full border border-accent"
                          />
                        )}
                        {opt}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {phase === "generating" ? (
            <div className="card p-6">
              <MeshLoader label="AI проектирует архитектуру, БД, API и roadmap" />
            </div>
          ) : allAnswered ? (
            <motion.button
              onClick={generate}
              initial={{ scale: 0.96, opacity: 0.8 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className="btn-primary relative self-start overflow-hidden rounded-full px-8 py-3 font-semibold"
            >
              <motion.span
                aria-hidden="true"
                initial={{ x: "-120%" }}
                animate={{ x: "220%" }}
                transition={{ duration: 0.9, ease: "easeInOut", delay: 0.15 }}
                className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-white/40"
              />
              <span className="relative">Сгенерировать план проекта →</span>
            </motion.button>
          ) : (
            <button
              disabled
              className="relative self-start overflow-hidden rounded-full border border-line px-8 py-3 text-sm font-semibold text-muted"
            >
              <motion.span
                aria-hidden="true"
                animate={{ width: `${questions.length ? (answered / questions.length) * 100 : 0}%` }}
                transition={{ type: "spring", stiffness: 200, damping: 26 }}
                className="absolute inset-y-0 left-0 bg-accent/20"
              />
              <span className="relative">
                Ответьте на все вопросы · {answered}/{questions.length}
              </span>
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
