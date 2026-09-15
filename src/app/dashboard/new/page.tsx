"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { postJson } from "@/frontend/api";
import { useEffects } from "@/frontend/effects";
import { usePageWipe } from "@/frontend/components/PageWipe";

const StarkAmbient = dynamic(() => import("@/frontend/components/three/StarkAmbient"), {
  ssr: false,
});

const EXAMPLES = [
  "Хочу сделать AI-приложение для обучения детей математике",
  "Платформа для поиска напарников по спорту в своём городе",
  "Сервис, который превращает лекции в конспекты с помощью AI",
];

const EASE = [0.22, 1, 0.36, 1] as const;

export default function NewProjectPage() {
  const router = useRouter();
  const level = useEffects();
  const { navigate } = usePageWipe();
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [created, setCreated] = useState(false);

  async function create() {
    setError(null);
    setLoading(true);
    const res = await postJson<{ project?: { id: string } }>("/api/projects", { idea });
    if (res.ok && res.data.project) {
      const href = `/dashboard/projects/${res.data.project.id}`;
      if (level === "off") {
        router.push(href);
        return;
      }
      setCreated(true);
      setTimeout(() => navigate(href), 1150);
    } else {
      setError(res.data.error ?? "Ошибка");
      setLimitReached(res.data.code === "LIMIT_REACHED");
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-65px)]">
      <StarkAmbient />
      <motion.div
        initial={{ opacity: 0, y: 24, rotateX: 10 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        style={{ transformPerspective: 1000 }}
        className="relative z-10 mx-auto max-w-2xl px-6 py-12"
      >
        <div className="card glass p-6 md:p-8">
          <p className="hud-chip inline-block rounded-full px-3 py-1 text-[10px] text-violet-200/90">
            Новый проект
          </p>
          <h1 className="display mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Опишите идею
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Одно-два предложения. AI проведёт интервью и соберёт план. Для 3D - Design Engine.
          </p>

          <label htmlFor="project-idea" className="sr-only">
            Описание идеи
          </label>
          <textarea
            id="project-idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="Я хочу создать приложение для..."
            className="mt-6 w-full resize-none rounded-2xl border border-line bg-white/[0.03] p-5 text-base text-white transition placeholder:text-muted focus:border-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <p className="mt-2 text-right font-mono text-[10px] uppercase tracking-wider text-muted/60">
            {idea.trim().length} / 2000
          </p>

          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setIdea(ex)}
                className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:border-accent/40 hover:text-white"
              >
                {ex.slice(0, 48)}…
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-4" role="alert">
              <p className="text-sm text-red-400">{error}</p>
              {limitReached && (
                <Link href="/pricing" className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">
                  Посмотреть тариф Pro →
                </Link>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={create}
              disabled={loading || idea.trim().length < 10}
              className="btn-primary rounded-full px-8 py-3 text-sm disabled:opacity-50"
            >
              {loading ? "Создание…" : "Начать →"}
            </button>
            <Link href="/dashboard/design-engine" className="btn-ghost rounded-full px-6 py-3 text-sm font-semibold">
              3D Design Engine
            </Link>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {created && (
          <motion.div
            key="created"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[140] flex items-center justify-center bg-[#050507] px-6"
            role="status"
            aria-live="polite"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(167,139,250,0.2),transparent_60%)]" />
            <div className="relative max-w-xl text-center">
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5, ease: EASE }}
                className="hud-chip inline-block rounded-full px-3 py-1 text-[10px] text-violet-200/90"
              >
                Проект создан
              </motion.p>
              <motion.p
                initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                transition={{ delay: 0.2, duration: 0.7, ease: EASE }}
                className="display mt-6 text-2xl font-semibold leading-snug text-white md:text-3xl"
              >
                {idea.trim()}
              </motion.p>
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.5, duration: 0.6, ease: EASE }}
                className="gold-line mx-auto mt-6 w-24"
              />
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7, duration: 0.4 }}
                className="mt-4 text-sm text-muted"
              >
                AI готовит интервью…
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
