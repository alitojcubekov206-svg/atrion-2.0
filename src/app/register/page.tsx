"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import AuthForm from "@/components/AuthForm";

const EntryGateScene = dynamic(() => import("@/components/three/EntryGateScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#09060f]" />,
});

export default function RegisterPage() {
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#09060f]">
      <EntryGateScene />

      <div className="relative z-10 flex min-h-screen w-full flex-col justify-center px-6 py-16 md:w-[48%] md:px-12 lg:px-16">
        <motion.div
          initial={{ opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link href="/" className="inline-block">
            <motion.h1
              initial={{ opacity: 0, letterSpacing: "0.35em" }}
              animate={{ opacity: 1, letterSpacing: "0.08em" }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
              className="font-[family-name:var(--font-display)] text-5xl font-semibold tracking-tight text-white md:text-6xl lg:text-7xl"
            >
              ATRION
            </motion.h1>
          </Link>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.25, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 h-px w-24 origin-left bg-gradient-to-r from-violet-300 to-transparent"
          />

          <AuthForm mode="register" variant="gate" />
        </motion.div>
      </div>
    </main>
  );
}
