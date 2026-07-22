import Link from "next/link";
import { db } from "@/lib/db";
import { getSessionUserId, getUserPlan } from "@/lib/auth";
import { FREE_PROJECT_LIMIT } from "@/lib/plans";
import type { Blueprint } from "@/lib/types";
import StarkHudFrame, { StarkPanel } from "@/components/StarkHudFrame";

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
    <StarkHudFrame>
      <StarkPanel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300/70">
              Workshop · Projects
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight md:text-4xl">
              My Projects
              {isPro && (
                <span className="ml-3 align-middle rounded border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">
                  PRO
                </span>
              )}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {projects.length > 0
                ? `${projects.length} проект(ов), ${generated.length} с готовым планом`
                : "Создай проект или открой Design Engine — 3D-студия в стиле Stark"}
              {!isPro &&
                ` · ${Math.min(projects.length, FREE_PROJECT_LIMIT)} / ${FREE_PROJECT_LIMIT} free`}
            </p>
          </div>
          {limitReached ? (
            <Link
              href="/pricing"
              className="rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 px-6 py-2.5 text-sm font-semibold text-black shadow-[0_0_28px_rgba(77,214,255,0.35)]"
            >
              Перейти на Pro
            </Link>
          ) : (
            <Link
              href="/dashboard/new"
              className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-6 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
            >
              + Create Project
            </Link>
          )}
        </div>
      </StarkPanel>

      {limitReached && (
        <StarkPanel delay={0.05} className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cyan-400/20 bg-black/40 p-5 backdrop-blur">
            <p className="text-sm text-slate-400">
              Все {FREE_PROJECT_LIMIT} бесплатных проектов использованы. Pro снимает лимит.
            </p>
            <Link href="/pricing" className="text-sm font-semibold text-cyan-300 hover:underline">
              Смотреть тарифы →
            </Link>
          </div>
        </StarkPanel>
      )}

      <StarkPanel delay={0.08} className="mt-8">
        <Link
          href="/dashboard/design-engine"
          className="group relative block overflow-hidden rounded-2xl border border-cyan-400/25 bg-black/45 p-6 backdrop-blur-xl md:p-8"
        >
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl transition group-hover:bg-cyan-400/25" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-cyan-300/80">
                Stark Lab · Full 3D
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-semibold md:text-3xl">
                Atrion AI Design Engine
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
                Школа выглядит как школа. Части летают в воздухе как костюм Тони Старка — разборка и
                сборка. Орбита, чертежи, chat-правки.
              </p>
            </div>
            <span className="rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 px-6 py-2.5 text-sm font-semibold text-black shadow-[0_0_28px_rgba(77,214,255,0.35)]">
              Открыть Engine →
            </span>
          </div>
        </Link>
      </StarkPanel>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Projects", value: String(projects.length) },
          { label: "Blueprints", value: String(generated.length), accent: true },
          {
            label: "Avg. potential",
            value: avgScore !== null ? `${avgScore}/100` : "—",
            accent: true,
          },
        ].map((stat, index) => (
          <StarkPanel key={stat.label} delay={0.1 + index * 0.05}>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
                {stat.label}
              </p>
              <p
                className={`mt-2 text-3xl font-semibold ${
                  stat.accent ? "text-cyan-200" : "text-white"
                }`}
              >
                {stat.value}
              </p>
            </div>
          </StarkPanel>
        ))}
      </div>

      {projects.length > 0 && (
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, index) => (
            <StarkPanel key={p.id} delay={0.12 + index * 0.04}>
              <Link
                href={`/dashboard/projects/${p.id}`}
                className="block rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur transition hover:border-cyan-400/35 hover:shadow-[0_0_30px_rgba(77,214,255,0.12)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold leading-snug">{p.title}</h3>
                  <span
                    className={`shrink-0 rounded px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${
                      p.status === "generated"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : p.status === "interview"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-white/5 text-slate-500"
                    }`}
                  >
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm text-slate-400">{p.idea}</p>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-slate-600">
                  {new Date(p.updatedAt).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </Link>
            </StarkPanel>
          ))}
        </div>
      )}
    </StarkHudFrame>
  );
}
