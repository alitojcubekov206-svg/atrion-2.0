import Link from "next/link";
import LandingHero from "@/components/LandingHero";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050507]">
      <nav className="fixed top-0 z-50 flex w-full items-center justify-between px-6 py-5 md:px-10">
        <Link href="/" className="display text-lg font-semibold tracking-tight text-white">
          ATRION
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <Link
              href="/dashboard/design-engine"
              className="btn-primary rounded-full px-5 py-2 text-sm"
            >
              Engine
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-[#8f8a82] transition hover:text-white">
                Войти
              </Link>
              <Link
                href="/register"
                className="btn-ghost rounded-full px-5 py-2 text-sm"
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
