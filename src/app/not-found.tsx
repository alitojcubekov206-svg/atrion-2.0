import Link from "next/link";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050507] px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(167,139,250,0.14),transparent_55%)]" />
      </div>
      <div className="relative z-10 w-full max-w-md text-center">
        <p className="display text-7xl font-semibold text-white/90 md:text-8xl">
          4<span className="glow-text">0</span>4
        </p>
        <h1 className="display mt-4 text-xl font-semibold text-white">Здесь пусто</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Такой страницы нет - возможно, ссылка устарела или в адресе опечатка.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary rounded-full px-6 py-2.5 text-sm">
            На главную
          </Link>
          <Link href="/dashboard" className="btn-ghost rounded-full px-6 py-2.5 text-sm">
            В проекты
          </Link>
        </div>
      </div>
    </main>
  );
}
