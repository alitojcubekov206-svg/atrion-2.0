import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/backend/auth";
import StarkHudFrame, { StarkPanel } from "@/frontend/components/StarkHudFrame";
import SettingsClient from "@/frontend/components/SettingsClient";
import AccountSection from "@/frontend/components/AccountSection";

export const metadata: Metadata = { title: "Настройки" };

function formatDate(date: Date) {
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isPro = user.plan === "pro";

  return (
    <StarkHudFrame>
      <StarkPanel>
        <p className="hud-chip inline-block rounded-full px-3 py-1 text-[10px] text-violet-200/90">
          Аккаунт · Настройки
        </p>
        <h1 className="display mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
          Настройки
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted">
          Аккаунт, безопасность, голос и единицы - всё рядом с проектами.
        </p>
      </StarkPanel>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <StarkPanel delay={0.05}>
            <div className="card glass p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent/80">Профиль</p>
              <h2 className="display mt-2 text-xl font-semibold text-white">{user.name}</h2>
              <p className="mt-1 text-sm text-muted">{user.email}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                    isPro ? "border-accent/40 bg-accent/15 text-accent2" : "border-line text-muted"
                  }`}
                >
                  {isPro ? "PRO" : "FREE"}
                </span>
                {isPro && user.planExpiresAt && (
                  <span className="text-xs text-muted">до {formatDate(user.planExpiresAt)}</span>
                )}
                <Link
                  href="/pricing"
                  className="rounded border border-line px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted transition hover:border-accent/40 hover:text-accent2"
                >
                  {isPro ? "Продлить" : "Тарифы"}
                </Link>
              </div>
              <p className="mt-5 text-xs text-muted">
                В аккаунте с {formatDate(user.createdAt)} ·{" "}
                <Link href="/legal" className="text-accent hover:underline">
                  правовая информация
                </Link>
              </p>
            </div>
          </StarkPanel>

          <StarkPanel delay={0.1}>
            <AccountSection />
          </StarkPanel>
        </div>

        <StarkPanel delay={0.15}>
          <SettingsClient />
        </StarkPanel>
      </div>
    </StarkHudFrame>
  );
}
