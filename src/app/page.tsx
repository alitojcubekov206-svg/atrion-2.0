import Link from "next/link";
import LandingHero from "@/components/LandingHero";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03060c]">
      <nav className="fixed top-0 z-50 flex w-full items-center justify-between px-6 py-5 md:px-10">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-white"
        >
          ATRION
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <Link
              href="/dashboard/design-engine"
              className="rounded-full bg-violet-300 px-5 py-2 font-semibold text-black shadow-[0_0_24px_rgba(167,139,250,0.35)]"
            >
              Engine
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-slate-400 transition hover:text-white">
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-full border border-white/20 px-5 py-2 text-white backdrop-blur transition hover:border-violet-300/50"
              >
                Start
              </Link>
            </>
          )}
        </div>
      </nav>

      <LandingHero loggedIn={Boolean(user)} />
    </main>
  );
}
