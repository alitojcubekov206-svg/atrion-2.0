import LandingHero from "@/frontend/components/LandingHero";
import LandingCTA from "@/frontend/components/LandingCTA";
import ScrollShowcaseLoader from "@/frontend/components/three/ScrollShowcaseLoader";
import ParticleField from "@/frontend/components/three/ParticleField";
import CinematicIntro from "@/frontend/components/three/CinematicIntro";
import TransitionLink from "@/frontend/components/TransitionLink";
import Magnetic from "@/frontend/components/Magnetic";
import Footer from "@/frontend/components/Footer";
import { getCurrentUser } from "@/backend/auth";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <>
      <CinematicIntro />
      <ParticleField />

      <header className="fixed top-0 z-50 w-full">
        <nav className="flex items-center justify-between px-6 py-5 md:px-10">
          <TransitionLink href="/" className="display text-lg font-semibold tracking-tight text-white">
            ATRION
          </TransitionLink>
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <Magnetic>
                <TransitionLink
                  href="/dashboard/design-engine"
                  className="btn-primary inline-block rounded-full px-5 py-2 text-sm"
                >
                  Открыть Engine
                </TransitionLink>
              </Magnetic>
            ) : (
              <>
                <TransitionLink href="/login" className="text-[#8f8a82] transition hover:text-white">
                  Войти
                </TransitionLink>
                <Magnetic>
                  <TransitionLink
                    href="/register"
                    className="btn-ghost inline-block rounded-full px-5 py-2 text-sm"
                  >
                    Начать
                  </TransitionLink>
                </Magnetic>
              </>
            )}
          </div>
        </nav>
      </header>

      <main className="relative z-10 min-h-screen">
        <LandingHero loggedIn={Boolean(user)} />
        <ScrollShowcaseLoader />
        <LandingCTA loggedIn={Boolean(user)} />
      </main>
      <div className="relative z-10">
        <Footer />
      </div>
    </>
  );
}
