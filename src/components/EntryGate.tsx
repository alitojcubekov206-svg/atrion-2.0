"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import AuthForm from "@/components/AuthForm";

const EntryGateScene = dynamic(() => import("@/components/three/EntryGateScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#09060f]" />,
});

const ease = [0.22, 1, 0.36, 1] as const;

function GateBrand({ mode }: { mode: "login" | "register" }) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.14, delayChildren: 0.05 } },
      }}
    >
      <Link href="/" className="inline-block">
        <motion.h1
          variants={{
            hidden: { opacity: 0, y: 24, letterSpacing: "0.4em" },
            show: {
              opacity: 1,
              y: 0,
              letterSpacing: "0.06em",
              transition: { duration: 1.1, ease },
            },
          }}
          className="font-[family-name:var(--font-display)] text-5xl font-semibold text-white md:text-6xl lg:text-7xl"
        >
          ATRION
        </motion.h1>
      </Link>

      <motion.p
        variants={{
          hidden: { opacity: 0, y: 14, letterSpacing: "0.18em" },
          show: {
            opacity: 1,
            y: 0,
            letterSpacing: "0.06em",
            transition: { duration: 0.85, ease },
          },
        }}
        className="mt-5 font-[family-name:var(--font-display)] text-xl text-violet-200 md:text-2xl"
      >
        Just build it.
      </motion.p>

      <motion.div
        variants={{
          hidden: { scaleX: 0, opacity: 0 },
          show: { scaleX: 1, opacity: 1, transition: { duration: 0.7, ease } },
        }}
        className="mt-5 h-px w-24 origin-left bg-gradient-to-r from-violet-300 to-transparent"
      />

      <AuthForm mode={mode} variant="gate" />
    </motion.div>
  );
}

export function LoginGate() {
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#09060f]">
      <EntryGateScene />
      <div className="relative z-10 flex min-h-screen w-full flex-col justify-center px-6 py-16 md:w-[48%] md:px-12 lg:px-16">
        <GateBrand mode="login" />
      </div>
    </main>
  );
}

export function RegisterGate() {
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#09060f]">
      <EntryGateScene />
      <div className="relative z-10 flex min-h-screen w-full flex-col justify-center px-6 py-16 md:w-[48%] md:px-12 lg:px-16">
        <GateBrand mode="register" />
      </div>
    </main>
  );
}
