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
        <div className="rounded-3xl border border-[#a78bfa]/20 bg-black/55 p-6 backdrop-blur-xl md:p-8">
          <p className="hud-chip inline-block rounded-full px-3 py-1 text-[10px] text-[#a78bfa]/90">
            New Project
          </p>
          <h1 className="display mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
            Опиши идею
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[#8f8a82]">
            Одно-два предложения. AI проведёт интервью и соберёт план. Для 3D — Design Engine.
          </p>

          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={5}
            placeholder="Я хочу создать приложение для..."
            className="mt-6 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-base outline-none transition focus:border-[#a78bfa]/50"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setIdea(ex)}
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[#8f8a82] transition hover:border-[#a78bfa]/40 hover:text-[#f4f1ea]"
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
                  className="mt-2 inline-block text-sm font-semibold text-[#a78bfa] hover:underline"
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
              className="btn-primary rounded-full px-8 py-3 text-sm disabled:opacity-50"
            >
              {loading ? "Создание..." : "Начать →"}
            </button>
            <Link
              href="/dashboard/design-engine"
              className="btn-ghost rounded-full px-6 py-3 text-sm font-semibold"
            >
              3D Design Engine
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
