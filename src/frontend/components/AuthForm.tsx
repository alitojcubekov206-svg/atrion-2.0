"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import AuthTransition from "@/frontend/components/AuthTransition";

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
  const [transitioning, setTransitioning] = useState(false);

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
      setTransitioning(true);
      setTimeout(() => {
        router.push(mode === "register" ? "/verify" : "/dashboard");
        router.refresh();
      }, 1100);
    } else {
      setError(data.error ?? "Что-то пошло не так");
      setLoading(false);
    }
  }

  if (transitioning) {
    return (
      <AuthTransition label={mode === "register" ? "Создаём аккаунт…" : "Входим…"} />
    );
  }

  if (variant === "gate") {
    const gateInput =
      "w-full border-0 border-b border-white/12 bg-transparent px-1 py-3.5 text-[15px] text-white transition placeholder:text-muted focus:border-[#a78bfa]/70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a78bfa]";

    return (
      <motion.form
        onSubmit={onSubmit}
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.1, delayChildren: 0.4 } },
        }}
        className="mt-9 flex w-full max-w-sm flex-col gap-5"
      >
        {mode === "register" && (
          <motion.div variants={gateItem}>
            <label htmlFor="gate-name" className="sr-only">Имя</label>
            <input
              id="gate-name"
              name="name"
              placeholder="Имя"
              required
              autoComplete="name"
              className={gateInput}
            />
          </motion.div>
        )}
        <motion.div variants={gateItem}>
          <label htmlFor="gate-email" className="sr-only">Email</label>
          <input
            id="gate-email"
            name="email"
            type="email"
            placeholder="Email"
            required
            autoComplete="email"
            className={gateInput}
          />
        </motion.div>
        <motion.div variants={gateItem}>
          <label htmlFor="gate-password" className="sr-only">Пароль</label>
          <input
            id="gate-password"
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
          className="btn-primary mt-3 w-full rounded-full py-3.5 text-sm disabled:opacity-60"
        >
          {loading ? "…" : mode === "login" ? "Войти" : "Начать"}
        </motion.button>
        {mode === "register" && (
          <motion.p variants={gateItem} className="text-center text-xs leading-relaxed text-muted">
            Создавая аккаунт, вы соглашаетесь с{" "}
            <Link href="/legal#terms" className="text-[#a78bfa]/85 transition hover:text-[#a78bfa]">
              условиями
            </Link>{" "}
            и{" "}
            <Link href="/legal#privacy" className="text-[#a78bfa]/85 transition hover:text-[#a78bfa]">
              политикой конфиденциальности
            </Link>
            .
          </motion.p>
        )}
        <motion.p variants={gateItem} className="pt-1 text-center text-sm text-muted">
          {mode === "login" ? (
            <Link href="/register" className="text-[#a78bfa]/85 transition hover:text-[#a78bfa]">
              Создать аккаунт
            </Link>
          ) : (
            <Link href="/login" className="text-[#a78bfa]/85 transition hover:text-[#a78bfa]">
              Уже есть доступ
            </Link>
          )}
        </motion.p>
      </motion.form>
    );
  }

  const inputCls =
    "w-full rounded-xl border border-line bg-surface2 px-4 py-3 text-sm transition focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

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
          <>
            <label htmlFor="card-name" className="sr-only">Имя</label>
            <input id="card-name" name="name" placeholder="Имя" required className={inputCls} />
          </>
        )}
        <label htmlFor="card-email" className="sr-only">Email</label>
        <input id="card-email" name="email" type="email" placeholder="Email" required className={inputCls} />
        <label htmlFor="card-password" className="sr-only">Пароль</label>
        <input
          id="card-password"
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
          className="btn-primary mt-2 rounded-xl py-3 text-sm disabled:opacity-60"
        >
          {loading ? "..." : mode === "login" ? "Войти" : "Зарегистрироваться"}
        </button>
      </form>

      {mode === "register" && (
        <p className="mt-4 text-center text-xs leading-relaxed text-muted">
          Регистрируясь, вы соглашаетесь с{" "}
          <Link href="/legal#terms" className="text-accent hover:underline">условиями</Link>{" "}
          и{" "}
          <Link href="/legal#privacy" className="text-accent hover:underline">политикой конфиденциальности</Link>.
        </p>
      )}

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
