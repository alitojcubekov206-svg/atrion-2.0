"use client";

import { motion } from "framer-motion";

const ease = [0.22, 1, 0.36, 1] as const;

export default function AuthTransition({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#050507]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(167,139,250,0.16),transparent_60%)]" />
      <div className="relative flex flex-col items-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease }}
          className="relative flex h-20 w-20 items-center justify-center"
        >
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full border border-transparent border-t-[#a78bfa] border-r-[#e879f9]/60"
          />
          <motion.span
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 1.6, repeat: Infinity, ease }}
            className="h-3 w-3 rounded-full bg-[#a78bfa]"
            style={{ boxShadow: "0 0 24px 6px rgba(167,139,250,0.55)" }}
          />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5, ease }}
          className="display mt-6 text-lg font-semibold tracking-tight text-white"
        >
          ATRION
        </motion.p>
        <motion.p
          key={label}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-2 text-sm text-[#8f8a82]"
        >
          {label}
        </motion.p>
      </div>
    </motion.div>
  );
}
