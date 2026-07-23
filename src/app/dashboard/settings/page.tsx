import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import StarkHudFrame, { StarkPanel } from "@/components/StarkHudFrame";
import SettingsClient from "@/components/SettingsClient";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <StarkHudFrame>
      <StarkPanel>
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-violet-300/70">
          Account · Settings
        </p>
        <h1 className="display mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          Настройки
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
          Аккаунт, язык, голос — как в студии Meshy: всё под рукой рядом с проектами.
        </p>
      </StarkPanel>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <StarkPanel delay={0.05}>
          <div className="rounded-2xl border border-violet-400/20 bg-black/45 p-6 backdrop-blur-xl">
            <p className="text-[10px] uppercase tracking-[0.22em] text-violet-300/70">Profile</p>
            <h2 className="display mt-2 text-xl font-semibold">{user.name}</h2>
            <p className="mt-1 text-sm text-slate-400">{user.email}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className={`rounded border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                  user.plan === "pro"
                    ? "border-violet-400/40 bg-violet-400/15 text-violet-200"
                    : "border-white/15 text-slate-400"
                }`}
              >
                {user.plan === "pro" ? "PRO" : "FREE"}
              </span>
              <Link
                href="/pricing"
                className="rounded border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-slate-400 transition hover:border-violet-400/40 hover:text-violet-200"
              >
                Тарифы
              </Link>
            </div>
          </div>
        </StarkPanel>

        <StarkPanel delay={0.1}>
          <SettingsClient />
        </StarkPanel>
      </div>
    </StarkHudFrame>
  );
}
