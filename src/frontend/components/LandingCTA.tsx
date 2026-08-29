"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AmbientDrift, DotGrid, type DriftDot } from "@/frontend/components/AmbientDots";

const ease = [0.22, 1, 0.36, 1] as const;

/** Fixed positions/timings so the ambient dots don't reshuffle on every render. */
const DRIFT_DOTS: readonly DriftDot[] = [
  { left: "12%", top: "22%", size: 3, color: "#a78bfa", duration: 7.5, delay: 0 },
  { left: "24%", top: "68%", size: 2, color: "#e879f9", duration: 9, delay: 1.2 },
  { left: "38%", top: "14%", size: 2, color: "#a78bfa", duration: 8.2, delay: 0.6 },
  { left: "62%", top: "78%", size: 3, color: "#a78bfa", duration: 10, delay: 2 },
  { left: "78%", top: "20%", size: 2, color: "#e879f9", duration: 8.8, delay: 0.9 },
  { left: "88%", top: "60%", size: 3, color: "#a78bfa", duration: 7, delay: 1.6 },
  { left: "55%", top: "40%", size: 2, color: "#e879f9", duration: 9.6, delay: 0.3 },
  { left: "8%", top: "82%", size: 2, color: "#a78bfa", duration: 8.5, delay: 1.4 },
];

export default function LandingCTA({ loggedIn }: { loggedIn: boolean }) {
  return (
    <section className="relative overflow-hidden bg-[#050507] px-6 py-28 md:py-40">
      <DotGrid className="inset-0" />
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.16),transparent_65%)] blur-2xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(232,121,249,0.14),transparent_65%)] blur-2xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(167,139,250,0.14),transparent_60%)]" />
      <AmbientDrift dots={DRIFT_DOTS} />
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.5 }}
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
        }}
        className="relative z-10 mx-auto flex max-w-2xl flex-col items-center text-center"
      >
        <motion.p
          variants={{
            hidden: { opacity: 0, y: 10 },
            show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
          }}
          className="hud-chip inline-block rounded-full px-3 py-1 text-[10px] text-violet-200/90"
        >
          От идеи до архитектуры
        </motion.p>

        <motion.h2
          variants={{
            hidden: { opacity: 0, y: 24 },
            show: { opacity: 1, y: 0, transition: { duration: 0.8, ease } },
          }}
          className="display mt-6 text-4xl font-semibold leading-tight text-white md:text-6xl"
        >
          Готовы построить своё?
        </motion.h2>

        <motion.p
          variants={{
            hidden: { opacity: 0, y: 14 },
            show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
          }}
          className="mt-5 max-w-md text-[15px] leading-relaxed text-[#908a9e] md:text-base"
        >
          Начните с одной идеи — через минуту у вас будет цельная 3D-модель, готовая к правкам.
        </motion.p>

        <motion.div
          variants={{
            hidden: { opacity: 0, y: 18 },
            show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
          }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <Link
              href={loggedIn ? "/dashboard/design-engine" : "/register"}
              className="btn-primary inline-block rounded-full px-10 py-4 text-base"
            >
              {loggedIn ? "Открыть Engine" : "Начать бесплатно"}
            </Link>
          </motion.div>
          {!loggedIn && (
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Link
                href="/login"
                className="btn-ghost inline-block rounded-full px-8 py-4 text-base"
              >
                Войти
              </Link>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </section>
  );
}
