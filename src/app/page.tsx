import Link from "next/link";
import LandingHero from "@/frontend/components/LandingHero";
import LandingCTA from "@/frontend/components/LandingCTA";
import ScrollShowcaseLoader from "@/frontend/components/three/ScrollShowcaseLoader";
import Footer from "@/frontend/components/Footer";
import { getCurrentUser } from "@/backend/auth";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <>
      <header className="fixed top-0 z-50 w-full">
        <nav className="flex items-center justify-between px-6 py-5 md:px-10">
          <Link href="/" className="display text-lg font-semibold tracking-tight text-white">
            ATRION
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <Link
                href="/dashboard/design-engine"
                className="btn-primary rounded-full px-5 py-2 text-sm"
              >
                Открыть Engine
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
                  Начать
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main className="relative min-h-screen bg-[#050507]">
        <LandingHero loggedIn={Boolean(user)} />
        <ScrollShowcaseLoader />
        <LandingCTA loggedIn={Boolean(user)} />
      </main>
      <Footer />
    </>
  );
}
