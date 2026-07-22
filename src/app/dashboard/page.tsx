import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUserId, getUserPlan } from "@/lib/auth";
import { FREE_PROJECT_LIMIT } from "@/lib/plans";
import type { Blueprint } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  interview: "Интервью",
  generated: "План готов",
};

export default async function DashboardPage() {
  const userId = (await getSessionUserId())!;
  const [projects, plan] = await Promise.all([
    db.project.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
    getUserPlan(userId),
  ]);
  const isPro = plan === "pro";
  const limitReached = !isPro && projects.length >= FREE_PROJECT_LIMIT;

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
          <h1 className="text-3xl font-bold">
            My Projects
            {isPro && (
              <span className="ml-3 align-middle rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
                PRO
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {projects.length > 0
              ? `${projects.length} проект(ов), ${generated.length} с готовым планом`
              : "Создайте первый проект — опишите идею, остальное сделает AI"}
            {!isPro && ` · использовано ${Math.min(projects.length, FREE_PROJECT_LIMIT)} из ${FREE_PROJECT_LIMIT} бесплатных`}
          </p>
        </div>
        {limitReached ? (
          <Link href="/pricing" className="btn-primary rounded-full px-6 py-2.5 text-sm font-semibold text-white">
            ⚡ Перейти на Pro
          </Link>
        ) : (
          <Link href="/dashboard/new" className="btn-primary rounded-full px-6 py-2.5 text-sm font-semibold text-white">
            + Create Project
          </Link>
        )}
      </div>

      {limitReached && (
        <div className="card mt-6 flex flex-wrap items-center justify-between gap-4 border-accent/30 p-5">
          <p className="text-sm text-muted">
            Ты использовал все {FREE_PROJECT_LIMIT} бесплатных проектов. Pro снимает лимит полностью.
          </p>
          <Link href="/pricing" className="text-sm font-semibold text-accent hover:underline">
            Смотреть тарифы →
          </Link>
        </div>
      )}

      <Link
        href="/dashboard/design-engine"
        className="card relative mt-8 block overflow-hidden border-accent2/20 p-6 md:p-8"
      >
        <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-accent2/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-accent2/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent2">
                Design Engine
              </span>
              <span className="text-xs text-muted">Holographic 3D lab</span>
            </div>
            <h2 className="mt-3 text-2xl font-bold">Atrion AI Design Engine</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Опиши дом, мост или изделие — AI соберёт структуру, геометрию и материалы
              в премиальном 3D-viewer с chat-редактированием.
            </p>
          </div>
          <span className="btn-primary rounded-full px-6 py-2.5 text-sm font-semibold text-white">
            Открыть Engine →
          </span>
        </div>
      </Link>

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
