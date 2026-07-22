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
    <section className="relative flex min-h-screen items-end overflow-hidden px-6 pb-16 pt-28 md:items-center md:pb-0 md:pt-0">
      <HeroScene />

      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-3xl"
        >
          <motion.p
            initial={{ opacity: 0, letterSpacing: "0.5em" }}
            animate={{ opacity: 1, letterSpacing: "0.28em" }}
            transition={{ duration: 1.1, delay: 0.15 }}
            className="font-[family-name:var(--font-display)] text-[11px] uppercase text-cyan-300/80"
          >
            Atrion AI Design Engine
          </motion.p>

          <h1 className="mt-5 font-[family-name:var(--font-display)] text-5xl font-semibold leading-[0.95] tracking-tight text-white md:text-7xl lg:text-8xl">
            Atrion
            <span className="block bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent">
              creates with you
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300/90 md:text-lg">
            Не учись программе — говори на человеческом. Atrion собирает реальные 3D-объекты,
            архитектуру и структуру прямо в браузере.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href={loggedIn ? "/dashboard/design-engine" : "/register"}
              className="rounded-full bg-gradient-to-r from-cyan-300 to-sky-400 px-8 py-3.5 text-sm font-semibold text-black shadow-[0_0_40px_rgba(77,214,255,0.35)] transition hover:shadow-[0_0_55px_rgba(77,214,255,0.55)]"
            >
              Войти в Design Engine
            </Link>
            <Link
              href={loggedIn ? "/dashboard" : "/pricing"}
              className="rounded-full border border-white/15 px-7 py-3.5 text-sm font-medium text-slate-200 backdrop-blur transition hover:border-cyan-300/40 hover:text-white"
            >
              {loggedIn ? "Dashboard" : "Смотреть тарифы"}
            </Link>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.8 }}
        className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-[10px] uppercase tracking-[0.35em] text-slate-500 md:block"
      >
        Scroll
      </motion.div>
    </section>
  );
}
