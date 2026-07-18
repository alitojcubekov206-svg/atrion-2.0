"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";

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
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold">Опишите вашу идею</h1>
      <p className="mt-2 text-muted">
        Одно-два предложения достаточно. Дальше AI проведёт интервью и спроектирует всё сам.
      </p>

      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        rows={5}
        placeholder="Я хочу создать приложение для..."
        className="mt-6 w-full resize-none rounded-2xl border border-line bg-surface2 p-5 text-base outline-none transition focus:border-accent"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => setIdea(ex)}
            className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-fg"
          >
            {ex.slice(0, 48)}…
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4">
          <p className="text-sm text-red-400">{error}</p>
          {limitReached && (
            <Link href="/pricing" className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">
              Посмотреть тариф Pro →
            </Link>
          )}
        </div>
      )}

      <button
        onClick={create}
        disabled={loading || idea.trim().length < 10}
        className="btn-primary mt-6 rounded-full px-8 py-3 font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Создание..." : "Начать проектирование →"}
      </button>
    </motion.div>
  );
}
