"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
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
