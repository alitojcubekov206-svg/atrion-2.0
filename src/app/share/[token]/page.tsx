import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/backend/db";
import { readProjectShareToken } from "@/backend/share";
import type { Blueprint } from "@/shared/types";

type Params = { params: Promise<{ token: string }> };

async function loadShared(token: string) {
  const projectId = await readProjectShareToken(token);
  if (!projectId) return null;
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { idea: true, blueprint: true, updatedAt: true },
  });
  if (!project?.blueprint) return null;
  try {
    return { project, bp: JSON.parse(project.blueprint) as Blueprint };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const shared = await loadShared(token);
  if (!shared) return { title: "Проект не найден", robots: { index: false } };
  return {
    title: shared.bp.overview.name,
    description: shared.bp.overview.tagline,
    robots: { index: false, follow: false },
    openGraph: {
      title: `${shared.bp.overview.name} · Atrion`,
      description: shared.bp.overview.tagline,
      type: "article",
    },
  };
}

export default async function SharedProjectPage({ params }: Params) {
  const { token } = await params;
  const shared = await loadShared(token);
  if (!shared) notFound();
  const { project, bp } = shared;

  return (
    <main className="min-h-screen px-6 py-10">
      <nav className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href="/" className="display text-lg font-semibold">
          ATRION <span className="text-accent">2.0</span>
        </Link>
        <Link href="/register" className="btn-primary rounded-full px-5 py-2 text-sm">
          Создать свой проект
        </Link>
      </nav>

      <article className="mx-auto mt-14 max-w-5xl">
        <p className="text-xs uppercase tracking-[0.2em] text-accent2">Публичный план проекта</p>
        <h1 className="display mt-2 text-4xl font-semibold text-white">{bp.overview.name}</h1>
        <p className="mt-2 text-lg text-muted">{bp.overview.tagline}</p>

        <section className="card mt-8 p-6">
          <h2 className="font-semibold text-white">Идея</h2>
          <p className="mt-2 leading-relaxed text-muted">{project.idea}</p>
        </section>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {[
            ["Аудитория", bp.overview.audience],
            ["Проблема", bp.overview.problem],
            ["Решение", bp.overview.solution],
            ["Потенциал", bp.discovery.potential],
          ].map(([label, value]) => (
            <section key={label} className="card p-6">
              <h2 className="font-semibold text-white">{label}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{value}</p>
            </section>
          ))}
        </div>

        <section className="mt-8">
          <h2 className="display text-2xl font-semibold text-white">Архитектура</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {bp.architecture.map((layer) => (
              <div key={layer.layer} className="card p-5">
                <h3 className="font-semibold text-accent2">{layer.layer}</h3>
                <p className="mt-2 text-sm text-white">{layer.technologies.join(" · ")}</p>
                <p className="mt-2 text-sm text-muted">{layer.reason}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card mt-8 p-6">
          <h2 className="display text-xl font-semibold text-white">Оценка проекта</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Инновация", bp.score.innovation],
              ["Сложность", bp.score.difficulty],
              ["Рынок", bp.score.market],
              ["Риск", bp.score.risk],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white/[0.03] p-4 text-center">
                <p className="text-xs text-muted">{label}</p>
                <p className="mt-1 text-xl font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-10 text-center text-xs text-muted">
          Сгенерировано в Atrion 2.0 · Обновлено {project.updatedAt.toLocaleDateString("ru-RU")}
        </p>
      </article>
    </main>
  );
}
