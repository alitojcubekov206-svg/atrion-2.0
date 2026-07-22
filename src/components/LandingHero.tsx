"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import HeroScene from "@/components/three/HeroSceneLoader";

const ease = [0.22, 1, 0.36, 1] as const;

export default function LandingHero({ loggedIn }: { loggedIn: boolean }) {
  return (
    <section className="relative flex min-h-screen items-end overflow-hidden px-6 pb-20 pt-28 md:items-center md:pb-0 md:pt-0">
      <HeroScene />

      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
          }}
          className="max-w-3xl"
        >
          <motion.h1
            variants={{
              hidden: { opacity: 0, y: 28, letterSpacing: "0.45em" },
              show: {
                opacity: 1,
                y: 0,
                letterSpacing: "-0.02em",
                transition: { duration: 1.15, ease },
              },
            }}
            className="font-[family-name:var(--font-display)] text-6xl font-semibold leading-[0.9] text-white md:text-8xl lg:text-[7.5rem]"
          >
            ATRION
          </motion.h1>

          <motion.p
            variants={{
              hidden: { opacity: 0, y: 18, letterSpacing: "0.2em" },
              show: {
                opacity: 1,
                y: 0,
                letterSpacing: "0.04em",
                transition: { duration: 0.9, ease },
              },
            }}
            className="mt-7 font-[family-name:var(--font-display)] text-2xl text-violet-200 md:text-4xl"
          >
            Just build it.
          </motion.p>

          <motion.div
            variants={{
              hidden: { scaleX: 0, opacity: 0 },
              show: {
                scaleX: 1,
                opacity: 1,
                transition: { duration: 0.75, ease },
              },
            }}
            className="mt-6 h-px w-28 origin-left bg-gradient-to-r from-violet-300 to-transparent"
          />

          <motion.div
            variants={{
              hidden: { opacity: 0, y: 16 },
              show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
            }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
              <Link
                href={loggedIn ? "/dashboard/design-engine" : "/register"}
                className="inline-block rounded-full bg-gradient-to-r from-violet-300 to-fuchsia-400 px-9 py-3.5 text-sm font-semibold text-black shadow-[0_0_45px_rgba(167,139,250,0.4)]"
              >
                {loggedIn ? "Engine" : "Start"}
              </Link>
            </motion.div>
            {!loggedIn && (
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/login"
                  className="inline-block rounded-full border border-white/20 px-7 py-3.5 text-sm text-white/90 backdrop-blur transition hover:border-violet-300/50"
                >
                  Sign in
                </Link>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
