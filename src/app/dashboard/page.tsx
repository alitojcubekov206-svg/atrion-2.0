import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import type { Blueprint } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  interview: "Интервью",
  generated: "План готов",
};

export default async function DashboardPage() {
  const userId = (await getSessionUserId())!;
  const projects = await db.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  const generated = projects.filter((p) => p.status === "generated");
  const avgScore =
    generated.length > 0
      ? Math.round(
          generated.reduce((sum, p) => {
            const bp = JSON.parse(p.blueprint!) as Blueprint;
            return sum + (bp.score.innovation + bp.score.market) / 2;
          }, 0) / generated.length
        )
      : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">My Projects</h1>
          <p className="mt-1 text-sm text-muted">
            {projects.length > 0
              ? `${projects.length} проект(ов), ${generated.length} с готовым планом`
              : "Создайте первый проект — опишите идею, остальное сделает AI"}
          </p>
        </div>
        <Link href="/dashboard/new" className="btn-primary rounded-full px-6 py-2.5 text-sm font-semibold text-white">
          + Create Project
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wider text-muted">Projects</p>
          <p className="mt-2 text-3xl font-bold">{projects.length}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wider text-muted">Blueprints ready</p>
          <p className="mt-2 text-3xl font-bold text-accent2">{generated.length}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wider text-muted">Avg. potential</p>
          <p className="mt-2 text-3xl font-bold text-accent">{avgScore !== null ? `${avgScore}/100` : "—"}</p>
        </div>
      </div>

      {projects.length > 0 && (
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/dashboard/projects/${p.id}`} className="card block p-6">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold leading-snug">{p.title}</h3>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${
                    p.status === "generated"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : p.status === "interview"
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-white/5 text-muted"
                  }`}
                >
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>
              <p className="mt-3 line-clamp-3 text-sm text-muted">{p.idea}</p>
              <p className="mt-4 text-xs text-muted">
                {new Date(p.updatedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
