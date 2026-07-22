"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import AuthForm from "@/components/AuthForm";

const StarkAmbient = dynamic(() => import("@/components/three/StarkAmbient"), {
  ssr: false,
});

export default function RegisterPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <StarkAmbient />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <Link
          href="/"
          className="mb-8 block text-center font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight"
        >
          ATRION <span className="text-cyan-300">2.0</span>
        </Link>
        <div className="rounded-3xl border border-cyan-400/20 bg-black/55 p-1 backdrop-blur-xl">
          <div className="rounded-[22px] border border-white/5 bg-black/40 p-6 md:p-8">
            <p className="mb-4 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-300/70">
              Enroll · Workshop
            </p>
            <AuthForm mode="register" />
          </div>
        </div>
      </motion.div>
    </main>
  );
}
