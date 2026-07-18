import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { PLANS } from "@/lib/plans";

export default async function PricingPage() {
  const user = await getCurrentUser();
  const isPro = user?.plan === "pro";

  // WhatsApp number for manual payment, e.g. 996700123456 (digits only)
  const wa = process.env.PAYMENT_WHATSAPP;
  const waLink = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent(
        `Привет! Хочу подписку Atrion Pro ($2/мес). Мой email на сайте: ${user?.email ?? ""}`
      )}`
    : null;

  return (
    <main className="min-h-screen px-6 py-16">
      <nav className="mx-auto mb-16 flex max-w-5xl items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Atrion <span className="text-accent">2.0</span>
        </Link>
        <Link
          href={user ? "/dashboard" : "/login"}
          className="rounded-full border border-line px-5 py-2 text-sm text-muted transition hover:border-accent hover:text-fg"
        >
          {user ? "Dashboard" : "Sign in"}
        </Link>
      </nav>

      <div className="mx-auto max-w-5xl text-center">
        <h1 className="text-4xl font-bold md:text-5xl">
          Простые <span className="glow-text">тарифы</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          Начни бесплатно. Когда идей станет больше — переходи на Pro.
        </p>
      </div>

      <div className="mx-auto mt-14 grid max-w-3xl gap-6 md:grid-cols-2">
        <div className="card p-8">
          <h2 className="text-xl font-semibold">{PLANS.free.name}</h2>
          <p className="mt-3 text-4xl font-bold">{PLANS.free.price}</p>
          <p className="mt-1 text-sm text-muted">навсегда</p>
          <ul className="mt-6 flex flex-col gap-2.5 text-sm text-muted">
            {PLANS.free.features.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="text-accent2">✓</span>
                {f}
              </li>
            ))}
          </ul>
          <Link
            href={user ? "/dashboard" : "/register"}
            className="mt-8 block rounded-full border border-line py-3 text-center font-semibold text-muted transition hover:border-accent hover:text-fg"
          >
            {user ? "Твой текущий план" : "Начать бесплатно"}
          </Link>
        </div>

        <div className="card relative overflow-hidden border-accent/40 p-8">
          <span className="absolute right-4 top-4 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
            Популярный
          </span>
          <h2 className="text-xl font-semibold">{PLANS.pro.name}</h2>
          <p className="mt-3 text-4xl font-bold">{PLANS.pro.price}</p>
          <p className="mt-1 text-sm text-muted">30 дней доступа после оплаты</p>
          <ul className="mt-6 flex flex-col gap-2.5 text-sm text-muted">
            {PLANS.pro.features.map((f) => (
              <li key={f} className="flex gap-2">
                <span className="text-accent">✓</span>
                {f}
              </li>
            ))}
          </ul>
          {isPro ? (
            <div className="btn-primary mt-8 block rounded-full py-3 text-center font-semibold text-white opacity-70">
              Pro активен ✓
            </div>
          ) : waLink ? (
            <div className="mt-8">
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary block rounded-full py-3 text-center font-semibold text-white"
              >
                Оплатить $2 — написать в WhatsApp
              </a>
              <p className="mt-3 text-center text-xs text-muted">
                Перевод через Mbank / O!Деньги / Элсом. Активация Pro в течение часа после оплаты.
              </p>
              <p className="mt-2 text-center text-xs text-accent2">
                Скоро: автоматическая оплата через Finik
              </p>
            </div>
          ) : (
            <div className="mt-8">
              <div className="btn-primary block cursor-not-allowed rounded-full py-3 text-center font-semibold text-white opacity-80">
                Оплата через WhatsApp настраивается
              </div>
              <p className="mt-3 text-center text-xs text-accent2">
                Скоро: автоматическая оплата через Finik
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
