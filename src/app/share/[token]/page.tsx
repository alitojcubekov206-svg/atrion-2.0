import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { readProjectShareToken } from "@/lib/share";
import type { Blueprint } from "@/lib/types";

export default async function SharedProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const projectId = await readProjectShareToken(token);
  if (!projectId) notFound();

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { idea: true, blueprint: true, updatedAt: true },
  });
  if (!project?.blueprint) notFound();
  const bp = JSON.parse(project.blueprint) as Blueprint;

  return (
    <main className="min-h-screen px-6 py-10">
      <nav className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href="/" className="text-lg font-semibold">
          Atrion <span className="text-accent">2.0</span>
        </Link>
        <Link href="/register" className="btn-primary rounded-full px-5 py-2 text-sm font-semibold text-white">
          Создать свой проект
        </Link>
      </nav>

      <article className="mx-auto mt-14 max-w-5xl">
        <p className="text-xs uppercase tracking-[0.2em] text-accent2">Shared Project Blueprint</p>
        <h1 className="mt-2 text-4xl font-bold">{bp.overview.name}</h1>
        <p className="mt-2 text-lg text-muted">{bp.overview.tagline}</p>

        <section className="card mt-8 p-6">
          <h2 className="font-semibold">Идея</h2>
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
              <h2 className="font-semibold">{label}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{value}</p>
            </section>
          ))}
        </div>

        <section className="mt-8">
          <h2 className="text-2xl font-bold">Architecture</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {bp.architecture.map((layer) => (
              <div key={layer.layer} className="card p-5">
                <h3 className="font-semibold text-accent2">{layer.layer}</h3>
                <p className="mt-2 text-sm">{layer.technologies.join(" · ")}</p>
                <p className="mt-2 text-sm text-muted">{layer.reason}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="card mt-8 p-6">
          <h2 className="text-xl font-bold">Project Score</h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Innovation", bp.score.innovation],
              ["Difficulty", bp.score.difficulty],
              ["Market", bp.score.market],
              ["Risk", bp.score.risk],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white/[0.03] p-4 text-center">
                <p className="text-xs text-muted">{label}</p>
                <p className="mt-1 text-xl font-bold">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-10 text-center text-xs text-muted">
          Generated with Atrion 2.0 · Updated {project.updatedAt.toLocaleDateString("ru-RU")}
        </p>
      </article>
    </main>
  );
}
