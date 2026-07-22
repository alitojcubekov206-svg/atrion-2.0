"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import HeroScene from "@/components/three/HeroSceneLoader";

export default function LandingHero({
  loggedIn,
}: {
  loggedIn: boolean;
}) {
  return (
    <section className="relative flex min-h-screen items-end overflow-hidden px-6 pb-20 pt-28 md:items-center md:pb-0 md:pt-0">
      <HeroScene />

      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-3xl"
        >
          <motion.h1
            initial={{ opacity: 0, letterSpacing: "0.4em" }}
            animate={{ opacity: 1, letterSpacing: "-0.02em" }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="font-[family-name:var(--font-display)] text-6xl font-semibold leading-[0.9] tracking-tight text-white md:text-8xl lg:text-[7.5rem]"
          >
            ATRION
          </motion.h1>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.35, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 h-px w-28 origin-left bg-gradient-to-r from-violet-300 to-transparent"
          />

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.7 }}
            className="mt-6 max-w-md text-base text-slate-300/90 md:text-lg"
          >
            Говори — и архитектура собирается в воздухе.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.7 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <Link
              href={loggedIn ? "/dashboard/design-engine" : "/register"}
              className="rounded-full bg-gradient-to-r from-violet-300 to-fuchsia-400 px-9 py-3.5 text-sm font-semibold text-black shadow-[0_0_45px_rgba(167,139,250,0.4)] transition hover:shadow-[0_0_60px_rgba(167,139,250,0.6)]"
            >
              {loggedIn ? "Design Engine" : "Войти"}
            </Link>
            {!loggedIn && (
              <Link
                href="/login"
                className="rounded-full border border-white/20 px-7 py-3.5 text-sm text-white/90 backdrop-blur transition hover:border-violet-300/50"
              >
                Sign in
              </Link>
            )}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
