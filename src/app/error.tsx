"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050507] px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(232,121,249,0.12),transparent_55%)]" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="card glass relative z-10 w-full max-w-md p-8 text-center"
      >
        <p className="hud-chip inline-block rounded-full px-3 py-1 text-[10px] text-violet-200/90">
          Ошибка
        </p>
        <h1 className="display mt-5 text-2xl font-semibold text-white">Что-то пошло не так</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Мы уже видим это в логах. Попробуйте обновить страницу - обычно помогает.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-muted/60">
            {error.digest}
          </p>
        )}
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button onClick={reset} className="btn-primary rounded-full px-6 py-2.5 text-sm">
            Попробовать снова
          </button>
          <Link href="/" className="btn-ghost rounded-full px-6 py-2.5 text-sm">
            На главную
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
