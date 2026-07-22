import Link from "next/link";
import LandingHero from "@/components/LandingHero";
import { getCurrentUser } from "@/lib/auth";

const MOMENTS = [
  {
    title: "Speak. Structure appears.",
    desc: "Опиши дом, мост или изделие — Engine собирает семантическое дерево и геометрию.",
  },
  {
    title: "Edit like a conversation.",
    desc: "«Сделай окна панорамными», «увеличь на 30%» — модель меняется через чат.",
  },
  {
    title: "See every layer.",
    desc: "Orbit, чертежи, Exploded View — лаборатория будущего прямо в браузере.",
  },
];

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03060c]">
      <nav className="fixed top-0 z-50 flex w-full items-center justify-between px-6 py-5 md:px-10">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-white"
        >
          Atrion <span className="text-cyan-300">2.0</span>
        </Link>
        <div className="flex items-center gap-3 text-sm md:gap-5">
          <Link href="/pricing" className="hidden text-slate-400 transition hover:text-white sm:inline">
            Pricing
          </Link>
          {user ? (
            <Link
              href="/dashboard/design-engine"
              className="rounded-full bg-cyan-300 px-5 py-2 font-semibold text-black"
            >
              Design Engine
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-slate-400 transition hover:text-white">
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-full border border-white/15 px-5 py-2 text-white backdrop-blur transition hover:border-cyan-300/40"
              >
                Start
              </Link>
            </>
          )}
        </div>
      </nav>

      <LandingHero loggedIn={Boolean(user)} />

      <section className="relative border-t border-white/5 px-6 py-24 md:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(77,214,255,0.08),transparent_55%)]" />
        <div className="relative mx-auto max-w-6xl">
          <p className="font-[family-name:var(--font-display)] text-xs uppercase tracking-[0.28em] text-cyan-300/70">
            Why it feels different
          </p>
          <h2 className="mt-4 max-w-3xl font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-white md:text-5xl">
            Не чат-бот.
            <span className="block text-cyan-200/90">Лаборатория проектирования.</span>
          </h2>

          <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
            {MOMENTS.map((item, index) => (
              <div key={item.title} className="relative border-t border-cyan-400/20 pt-6">
                <span className="font-[family-name:var(--font-display)] text-xs text-cyan-300/60">
                  0{index + 1}
                </span>
                <h3 className="mt-3 font-[family-name:var(--font-display)] text-xl text-white">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-20 flex flex-col items-start justify-between gap-6 rounded-[2rem] border border-cyan-400/15 bg-gradient-to-br from-cyan-400/10 via-transparent to-violet-500/10 p-8 md:flex-row md:items-center md:p-12">
            <div>
              <h3 className="font-[family-name:var(--font-display)] text-2xl text-white md:text-3xl">
                Готов увидеть кайф в 3D?
              </h3>
              <p className="mt-2 max-w-xl text-sm text-slate-400">
                Открой Design Engine и собери объект за минуту — без CAD-обучения.
              </p>
            </div>
            <Link
              href={user ? "/dashboard/design-engine" : "/register"}
              className="rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition hover:bg-cyan-100"
            >
              Запустить Engine
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 px-6 py-10 text-center text-sm text-slate-500">
        Atrion 2.0 — From Idea to Intelligent Architecture
      </footer>
    </main>
  );
}
