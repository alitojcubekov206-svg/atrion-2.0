"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import HeroScene from "@/components/three/HeroSceneLoader";

const ease = [0.22, 1, 0.36, 1] as const;

export default function LandingHero({ loggedIn }: { loggedIn: boolean }) {
  return (
    <section className="relative flex min-h-screen items-end overflow-hidden px-6 pb-24 pt-28 md:items-center md:pb-0 md:pt-0">
      <HeroScene />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#050507]/85 via-[#050507]/35 to-transparent" />

      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.14, delayChildren: 0.1 } },
          }}
          className="max-w-2xl"
        >
          <motion.p
            variants={{
              hidden: { opacity: 0, y: 10 },
              show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
            }}
            className="hud-chip inline-block rounded-full px-3 py-1 text-[10px] text-violet-200/90"
          >
            AI Design Engine
          </motion.p>

          <motion.h1
            variants={{
              hidden: { opacity: 0, y: 32, letterSpacing: "0.5em" },
              show: {
                opacity: 1,
                y: 0,
                letterSpacing: "-0.03em",
                transition: { duration: 1.2, ease },
              },
            }}
            className="display mt-6 text-6xl font-semibold leading-[0.88] text-white md:text-8xl lg:text-[7.75rem]"
          >
            ATRION
          </motion.h1>

          <motion.p
            variants={{
              hidden: { opacity: 0, y: 16 },
              show: {
                opacity: 1,
                y: 0,
                letterSpacing: "0.02em",
                transition: { duration: 0.9, ease },
              },
            }}
            className="display mt-5 text-2xl font-medium tracking-tight text-[#a78bfa] md:text-4xl"
          >
            Just build it.
          </motion.p>

          <motion.div
            variants={{
              hidden: { scaleX: 0, opacity: 0 },
              show: { scaleX: 1, opacity: 1, transition: { duration: 0.8, ease } },
            }}
            className="gold-line mt-7 w-24 origin-left"
          />

          <motion.p
            variants={{
              hidden: { opacity: 0, y: 12 },
              show: { opacity: 1, y: 0, transition: { duration: 0.75, ease } },
            }}
            className="mt-6 max-w-md text-[15px] leading-relaxed text-[#908a9e] md:text-base"
          >
            Скажи идею — получишь цельный 3D. Крути. Разбирай в воздухе. Прави через чат.
          </motion.p>

          <motion.div
            variants={{
              hidden: { opacity: 0, y: 18 },
              show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
            }}
            className="mt-10 flex flex-wrap items-center gap-3"
          >
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
              <Link
                href={loggedIn ? "/dashboard/design-engine" : "/register"}
                className="btn-primary inline-block rounded-full px-9 py-3.5 text-sm"
              >
                {loggedIn ? "Открыть Engine" : "Начать"}
              </Link>
            </motion.div>
            {!loggedIn && (
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/login"
                  className="btn-ghost inline-block rounded-full px-7 py-3.5 text-sm"
                >
                  Войти
                </Link>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
