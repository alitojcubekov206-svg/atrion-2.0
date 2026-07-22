"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";

const StarkAmbient = dynamic(() => import("@/components/three/StarkAmbient"), {
  ssr: false,
});

const EXAMPLES = [
  "Хочу сделать AI-приложение для обучения детей математике",
  "Платформа для поиска напарников по спорту в своём городе",
  "Сервис, который превращает лекции в конспекты с помощью AI",
];

export default function NewProjectPage() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  async function create() {
    setError(null);
    setLoading(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea }),
    });
    const data = await res.json();
    if (res.ok) {
      router.push(`/dashboard/projects/${data.project.id}`);
    } else {
      setError(data.error ?? "Ошибка");
      setLimitReached(data.code === "LIMIT_REACHED");
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-[calc(100vh-65px)]">
      <StarkAmbient />
      <motion.div
        initial={{ opacity: 0, y: 24, rotateX: 10 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
        style={{ transformPerspective: 1000 }}
        className="relative z-10 mx-auto max-w-2xl px-6 py-12"
      >
        <div className="rounded-3xl border border-violet-400/20 bg-black/50 p-6 backdrop-blur-xl md:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-violet-300/70">
            New Construct
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Опишите вашу идею
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Одно-два предложения достаточно. Дальше AI проведёт интервью и спроектирует всё сам.
            Для зданий открой Design Engine.
          </p>

          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={5}
            placeholder="Я хочу создать приложение для..."
            className="mt-6 w-full resize-none rounded-2xl border border-violet-400/20 bg-white/[0.03] p-5 text-base outline-none transition focus:border-violet-300/50"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setIdea(ex)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition hover:border-violet-400/40 hover:text-violet-100"
              >
                {ex.slice(0, 48)}…
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-4">
              <p className="text-sm text-red-400">{error}</p>
              {limitReached && (
                <Link
                  href="/pricing"
                  className="mt-2 inline-block text-sm font-semibold text-violet-300 hover:underline"
                >
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
              className="rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-500 px-8 py-3 font-semibold text-black shadow-[0_0_28px_rgba(167,139,250,0.35)] disabled:opacity-50"
            >
              {loading ? "Создание..." : "Начать проектирование →"}
            </button>
            <Link
              href="/dashboard/design-engine"
              className="rounded-full border border-violet-400/35 px-6 py-3 text-sm font-semibold text-violet-100 transition hover:bg-violet-400/10"
            >
              3D Design Engine
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
