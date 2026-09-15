import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/backend/db";
import { getCurrentUser } from "@/backend/auth";
import { FREE_PROJECT_LIMIT } from "@/backend/plans";
import type { Blueprint } from "@/shared/types";
import StarkHudFrame, { StarkPanel } from "@/frontend/components/StarkHudFrame";
import CountUp from "@/frontend/components/CountUp";
import DashboardTour from "@/frontend/components/DashboardTour";
import ParticleField from "@/frontend/components/three/ParticleField";

export const metadata: Metadata = { title: "Проекты" };

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Черновик", className: "bg-white/5 text-muted" },
  interview: { label: "Интервью", className: "bg-accent/10 text-accent2" },
  generated: { label: "План готов", className: "bg-emerald-400/10 text-emerald-300" },
};

function parseBlueprint(raw: string | null): Blueprint | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Blueprint;
  } catch {
    return null;
  }
}

function formatDate(date: Date) {
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const projects = await db.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });
  const isPro = user.plan === "pro";
  const limitReached = !isPro && projects.length >= FREE_PROJECT_LIMIT;

  const generated = projects.filter((p) => p.status === "generated");
  const scores = generated
    .map((p) => parseBlueprint(p.blueprint))
    .filter(
      (bp): bp is Blueprint =>
        bp !== null &&
        typeof bp.score?.innovation === "number" &&
        typeof bp.score?.market === "number"
    );
  const avgScore =
    scores.length > 0
      ? Math.round(
          scores.reduce((sum, bp) => sum + (bp.score.innovation + bp.score.market) / 2, 0) /
            scores.length
        )
      : null;

  return (
    <StarkHudFrame>
      <DashboardTour show={projects.length === 0} />
      <ParticleField density="subtle" />
      <StarkPanel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="hud-chip inline-block rounded-full px-3 py-1 text-[10px] text-violet-200/90">
              Мастерская · Проекты
            </p>
            <h1 className="display mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Мои проекты
              {isPro && (
                <span
                  title={user.planExpiresAt ? `Pro до ${formatDate(user.planExpiresAt)}` : "Pro"}
                  className="ml-3 rounded border border-accent/35 bg-accent/10 px-2.5 py-1 align-middle text-[10px] font-semibold uppercase tracking-wider text-accent"
                >
                  PRO
                </span>
              )}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {projects.length > 0
                ? `${projects.length} проект(ов), ${generated.length} с готовым планом`
                : "Начните с идеи или откройте Design Engine"}
              {!isPro && ` · ${Math.min(projects.length, FREE_PROJECT_LIMIT)} / ${FREE_PROJECT_LIMIT} бесплатно`}
              {isPro && user.planExpiresAt && ` · Pro до ${formatDate(user.planExpiresAt)}`}
            </p>
          </div>
          {limitReached ? (
            <Link href="/pricing" className="btn-primary rounded-full px-6 py-2.5 text-sm">
              Перейти на Pro
            </Link>
          ) : (
            <Link
              href="/dashboard/new"
              data-tour="new-project"
              className="rounded-full border border-accent/40 bg-accent/10 px-6 py-2.5 text-sm font-semibold text-accent2 transition hover:bg-accent/20"
            >
              + Новый проект
            </Link>
          )}
        </div>
      </StarkPanel>

      {limitReached && (
        <StarkPanel delay={0.05} className="mt-6">
          <div className="card glass flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="text-sm text-muted">
              Все {FREE_PROJECT_LIMIT} бесплатных проектов использованы. Pro снимает лимит.
            </p>
            <Link href="/pricing" className="text-sm font-semibold text-accent hover:underline">
              Смотреть тарифы →
            </Link>
          </div>
        </StarkPanel>
      )}

      <StarkPanel delay={0.08} className="mt-8">
        <Link
          href="/dashboard/design-engine"
          data-tour="engine"
          className="card glass group relative block overflow-hidden p-6 transition-all duration-300 hover:-translate-y-0.5 md:p-8"
        >
          <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-accent/15 blur-3xl transition duration-500 group-hover:bg-accent/25" />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent/80">
                Design Engine
              </p>
              <h2 className="display mt-3 text-2xl font-semibold text-white md:text-3xl">
                Just build it.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
                Опишите что угодно - цельный 3D, орбита, Explode. Правьте через чат.
              </p>
            </div>
            <span className="btn-primary rounded-full px-6 py-2.5 text-sm">Открыть Engine →</span>
          </div>
        </Link>
      </StarkPanel>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Проекты", value: projects.length, suffix: "" },
          { label: "Готовых планов", value: generated.length, suffix: "", accent: true },
          { label: "Средний потенциал", value: avgScore, suffix: "/100", accent: true },
        ].map((stat, index) => (
          <StarkPanel key={stat.label} delay={0.1 + index * 0.05}>
            <div className="card p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
                {stat.label}
              </p>
              <p className={`mt-2 text-3xl font-semibold ${stat.accent ? "text-accent2" : "text-white"}`}>
                {stat.value === null ? "—" : <CountUp value={stat.value} suffix={stat.suffix} />}
              </p>
            </div>
          </StarkPanel>
        ))}
      </div>

      {projects.length === 0 ? (
        <StarkPanel delay={0.2} className="mt-10">
          <div className="card glass flex flex-col items-center p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
                  stroke="#c4b5fd"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h2 className="display mt-5 text-xl font-semibold text-white">Пока пусто</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              Опишите идею - AI проведёт интервью и соберёт архитектуру, БД, API и roadmap.
              Или сразу откройте Design Engine и постройте 3D.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/dashboard/new" className="btn-primary rounded-full px-6 py-2.5 text-sm">
                Создать проект
              </Link>
              <Link href="/dashboard/design-engine" className="btn-ghost rounded-full px-6 py-2.5 text-sm">
                Открыть Design Engine
              </Link>
            </div>
          </div>
        </StarkPanel>
      ) : (
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p, index) => {
            const status = STATUS[p.status] ?? { label: p.status, className: "bg-white/5 text-muted" };
            return (
              <StarkPanel key={p.id} delay={0.16 + index * 0.04}>
                <Link
                  href={`/dashboard/projects/${p.id}`}
                  className="card block p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_50px_rgba(167,139,250,0.14)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold leading-snug text-white">{p.title}</h3>
                    <span
                      className={`shrink-0 rounded px-2.5 py-0.5 text-[10px] uppercase tracking-wider ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-3 text-sm text-muted">{p.idea}</p>
                  <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-muted/60">
                    {formatDate(p.updatedAt)}
                  </p>
                </Link>
              </StarkPanel>
            );
          })}
        </div>
      )}
    </StarkHudFrame>
  );
}
