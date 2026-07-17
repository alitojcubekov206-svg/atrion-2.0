import Link from "next/link";
import HeroScene from "@/components/three/HeroSceneLoader";
import { getCurrentUser } from "@/lib/auth";

const FEATURES = [
  { title: "AI Project Discovery", desc: "Анализ идеи: продукт, аудитория, проблема, конкуренты, потенциал." },
  { title: "AI Interview Mode", desc: "AI задаёт уточняющие вопросы перед проектированием — план получается точным." },
  { title: "Architecture Generator", desc: "Frontend, Backend, Database, AI, Deployment — с обоснованием каждого выбора." },
  { title: "Database Designer", desc: "Готовая структура таблиц с полями, типами и связями." },
  { title: "API Architect", desc: "Полный список endpoint'ов с методами и описаниями." },
  { title: "Roadmap Generator", desc: "Фазы разработки с задачами и оценкой сроков." },
  { title: "Project Score", desc: "Innovation, Difficulty, Market Potential, Cost, Risk — честная оценка 0–100." },
  { title: "AI Critic Mode", desc: "AI не соглашается со всем подряд: указывает на слабые места идеи." },
];

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="relative min-h-screen overflow-hidden">
      <nav className="glass fixed top-0 z-50 flex w-full items-center justify-between px-6 py-4 md:px-12">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Atrion <span className="text-accent">2.0</span>
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {user ? (
            <Link href="/dashboard" className="btn-primary rounded-full px-5 py-2 font-medium text-white">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-muted transition hover:text-fg">
                Sign in
              </Link>
              <Link href="/register" className="btn-primary rounded-full px-5 py-2 font-medium text-white">
                Get started
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <HeroScene />
        <p className="mb-4 rounded-full border border-line px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-muted">
          From Idea to Intelligent Architecture
        </p>
        <h1 className="max-w-4xl text-5xl font-bold leading-tight tracking-tight md:text-7xl">
          Your <span className="glow-text">AI Software</span> Architect
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Опишите идею — Atrion проведёт интервью, спроектирует архитектуру, базу данных, API,
          составит roadmap и честно оценит проект. Как senior-архитектор, только за минуту.
        </p>
        <div className="mt-10 flex gap-4">
          <Link
            href={user ? "/dashboard/new" : "/register"}
            className="btn-primary rounded-full px-8 py-3.5 font-semibold text-white"
          >
            Create Project
          </Link>
          <a
            href="#features"
            className="rounded-full border border-line px-8 py-3.5 font-semibold text-muted transition hover:border-accent hover:text-fg"
          >
            Explore
          </a>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-3xl font-bold md:text-4xl">
          Не чат-бот. <span className="glow-text">Архитектор.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-muted">
          Анализ → интервью → архитектура → план. Мышление инженера на каждом шаге.
        </p>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6">
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line px-6 py-10 text-center text-sm text-muted">
        Atrion 2.0 — AI Software Architect
      </footer>
    </main>
  );
}
