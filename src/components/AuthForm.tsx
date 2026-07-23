"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

const gateItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE },
  },
};

export default function AuthForm({
  mode,
  variant = "card",
}: {
  mode: "login" | "register";
  variant?: "card" | "gate";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(form.entries());

    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      if (data.requiresVerification && data.email) {
        const verifyUrl = new URL("/verify", window.location.origin);
        verifyUrl.searchParams.set("email", data.email);
        if (typeof data.devCode === "string") {
          verifyUrl.searchParams.set("devCode", data.devCode);
        }
        router.push(`${verifyUrl.pathname}${verifyUrl.search}`);
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } else {
      if (data.code === "EMAIL_NOT_VERIFIED" && data.email) {
        router.push(`/verify?email=${encodeURIComponent(data.email)}`);
        return;
      }
      setError(data.error ?? "Что-то пошло не так");
      setLoading(false);
    }
  }

  if (variant === "gate") {
    const gateInput =
      "w-full border-0 border-b border-white/15 bg-transparent px-1 py-3.5 text-[15px] text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/70";

    return (
      <motion.form
        onSubmit={onSubmit}
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.1, delayChildren: 0.45 } },
        }}
        className="mt-10 flex w-full max-w-sm flex-col gap-5"
      >
        {mode === "register" && (
          <motion.div variants={gateItem}>
            <input name="name" placeholder="Имя" required autoComplete="name" className={gateInput} />
          </motion.div>
        )}
        <motion.div variants={gateItem}>
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            autoComplete="email"
            className={gateInput}
          />
        </motion.div>
        <motion.div variants={gateItem}>
          <input
            name="password"
            type="password"
            placeholder="Пароль"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className={gateInput}
          />
        </motion.div>
        {error && (
          <motion.p variants={gateItem} className="text-sm text-red-400">
            {error}
          </motion.p>
        )}
        <motion.button
          type="submit"
          disabled={loading}
          variants={gateItem}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="mt-4 w-full rounded-full bg-gradient-to-r from-amber-300 via-amber-200 to-yellow-400 py-3.5 text-sm font-semibold text-black shadow-[0_0_40px_rgba(245,197,24,0.4)] disabled:opacity-60"
        >
          {loading ? "…" : mode === "login" ? "Войти" : "Начать"}
        </motion.button>
        <motion.p variants={gateItem} className="pt-2 text-center text-sm text-slate-500">
          {mode === "login" ? (
            <Link href="/register" className="text-amber-200/80 transition hover:text-amber-100">
              Создать аккаунт
            </Link>
          ) : (
            <Link href="/login" className="text-amber-200/80 transition hover:text-amber-100">
              Войти
            </Link>
          )}
        </motion.p>
      </motion.form>
    );
  }

  const inputCls =
    "w-full rounded-xl border border-line bg-surface2 px-4 py-3 text-sm outline-none transition focus:border-accent";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="card w-full max-w-md p-8"
    >
      <h1 className="text-2xl font-bold">
        {mode === "login" ? "С возвращением" : "Создать аккаунт"}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {mode === "login" ? "Войдите, чтобы продолжить" : "Начните проектировать за минуту"}
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        {mode === "register" && (
          <input name="name" placeholder="Имя" required className={inputCls} />
        )}
        <input name="email" type="email" placeholder="Email" required className={inputCls} />
        <input
          name="password"
          type="password"
          placeholder="Пароль (мин. 6 символов)"
          required
          minLength={6}
          className={inputCls}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          disabled={loading}
          className="btn-primary mt-2 rounded-xl py-3 font-semibold text-white disabled:opacity-60"
        >
          {loading ? "..." : mode === "login" ? "Войти" : "Зарегистрироваться"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {mode === "login" ? (
          <>
            Нет аккаунта?{" "}
            <Link href="/register" className="text-accent hover:underline">
              Регистрация
            </Link>
          </>
        ) : (
          <>
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Войти
            </Link>
          </>
        )}
      </p>
    </motion.div>
  );
}
