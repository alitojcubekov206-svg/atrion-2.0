"use client";

import { useState } from "react";
import Thinking from "@/components/Thinking";
import { download } from "@/lib/export";
import type { StarterKit } from "@/lib/types";

export default function StarterKitPanel({ projectId }: { projectId: string }) {
  const [kit, setKit] = useState<StarterKit | null>(null);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/starter`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Ошибка генерации");
      setKit(data.kit);
      setSelected(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось создать Starter Kit");
    } finally {
      setLoading(false);
    }
  }

  if (!kit) {
    return (
      <div className="card p-8 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-emerald-400">Senior Programmer</p>
        <h2 className="mt-2 text-2xl font-bold">Generate Starter Code</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
          AI прочитает Blueprint и создаст минимальный набор файлов для первого рабочего
          вертикального среза: конфигурацию, модели, API и README.
        </p>
        {loading ? (
          <div className="mx-auto mt-8 w-fit"><Thinking label="Senior Programmer пишет стартовый код" /></div>
        ) : (
          <button onClick={generate} className="btn-primary mt-7 rounded-full px-7 py-3 font-semibold text-white">
            Создать Starter Kit →
          </button>
        )}
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </div>
    );
  }

  const file = kit.files[selected];
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-400">Generated Starter Kit</p>
          <h2 className="mt-1 text-2xl font-bold">Начальная кодовая база</h2>
          <p className="mt-1 text-sm text-muted">{kit.summary}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              download("atrion-starter-kit.json", JSON.stringify(kit, null, 2), "application/json")
            }
            className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:border-accent"
          >
            Скачать всё
          </button>
          <button onClick={generate} className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:border-accent">
            ↻ Пересоздать
          </button>
        </div>
      </div>

      <div className="grid overflow-hidden rounded-2xl border border-line lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-line bg-surface p-2 lg:border-b-0 lg:border-r">
          {kit.files.map((item, index) => (
            <button
              key={`${item.path}-${index}`}
              onClick={() => setSelected(index)}
              className={`block w-full rounded-lg px-3 py-2 text-left font-mono text-xs ${
                selected === index ? "bg-accent/15 text-accent2" : "text-muted hover:bg-white/[0.03]"
              }`}
            >
              {item.path}
            </button>
          ))}
        </aside>
        <section className="min-w-0 bg-[#08080d]">
          {file ? (
            <>
              <div className="flex items-center justify-between border-b border-line px-4 py-2">
                <span className="font-mono text-xs text-muted">{file.path}</span>
                <button
                  onClick={() =>
                    download(file.path.replaceAll("/", "__"), file.content, "text/plain")
                  }
                  className="text-xs text-accent hover:underline"
                >
                  Скачать файл
                </button>
              </div>
              <pre className="max-h-[560px] overflow-auto p-5 text-xs leading-relaxed text-fg">
                <code>{file.content}</code>
              </pre>
            </>
          ) : (
            <p className="p-8 text-sm text-muted">AI не вернул файлы. Попробуйте пересоздать набор.</p>
          )}
        </section>
      </div>

      <div className="card mt-6 p-5">
        <h3 className="font-semibold">Следующие шаги</h3>
        <ol className="mt-3 space-y-2 text-sm text-muted">
          {kit.nextSteps.map((step, index) => <li key={step}>{index + 1}. {step}</li>)}
        </ol>
      </div>
    </div>
  );
}
