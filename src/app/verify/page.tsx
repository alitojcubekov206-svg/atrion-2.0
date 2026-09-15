import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/backend/auth";
import { isEmailVerificationEnabled } from "@/backend/verification";
import VerifyForm from "@/frontend/components/VerifyForm";
import LogoutButton from "@/frontend/components/LogoutButton";

export const metadata: Metadata = { title: "Подтверждение email" };

export default async function VerifyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isEmailVerificationEnabled() || user.emailVerified) redirect("/dashboard");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050507] px-6 py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(167,139,250,0.16),transparent_55%)]" />
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.14),transparent_65%)] blur-2xl" />
        <div className="absolute -right-24 bottom-1/4 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(232,121,249,0.1),transparent_65%)] blur-2xl" />
      </div>

      <div className="card glass relative z-10 w-full max-w-sm p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#a78bfa]/30 bg-[#a78bfa]/10">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 7.5 11.15 13a1.7 1.7 0 0 0 1.7 0L21 7.5M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
              stroke="#c4b5fd"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1 className="display mt-5 text-2xl font-semibold text-white">Подтвердите email</h1>
        <div className="gold-line mt-4 w-12 origin-left" />

        <VerifyForm email={user.email} />

        <LogoutButton className="mt-8 block w-full text-center text-xs text-muted transition hover:text-white">
          Выйти и начать заново
        </LogoutButton>
      </div>
    </main>
  );
}
