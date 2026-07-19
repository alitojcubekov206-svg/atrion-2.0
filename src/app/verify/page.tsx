"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email")?.trim().toLowerCase() ?? "";
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("Мы отправили шестизначный код на вашу почту.");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function verify(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    setError(data.error ?? "Не удалось подтвердить email");
    setLoading(false);
  }

  async function resend() {
    setError(null);
    setMessage("");
    const response = await fetch("/api/auth/resend-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Не удалось отправить код");
      return;
    }
    setMessage("Новый код отправлен. Проверьте также папку «Спам».");
    setCooldown(60);
  }

  if (!email) {
    return (
      <div className="card w-full max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">Email не указан</h1>
        <Link href="/register" className="mt-6 inline-block text-accent hover:underline">
          Вернуться к регистрации
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="card w-full max-w-md p-8"
    >
      <div className="mb-5 text-4xl">✉️</div>
      <h1 className="text-2xl font-bold">Подтвердите email</h1>
      <p className="mt-2 text-sm text-muted">
        {message} <span className="text-white">{email}</span>
      </p>

      <form onSubmit={verify} className="mt-8 flex flex-col gap-4">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          required
          pattern="[0-9]{6}"
          className="w-full rounded-xl border border-line bg-surface2 px-4 py-4 text-center text-2xl tracking-[0.45em] outline-none transition focus:border-accent"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          disabled={loading || code.length !== 6}
          className="btn-primary rounded-xl py-3 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Проверяем..." : "Подтвердить"}
        </button>
      </form>

      <button
        type="button"
        onClick={resend}
        disabled={cooldown > 0}
        className="mt-5 w-full text-sm text-accent disabled:text-muted"
      >
        {cooldown > 0 ? `Отправить снова через ${cooldown} сек.` : "Отправить код снова"}
      </button>
    </motion.div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense fallback={<div className="text-muted">Загрузка...</div>}>
        <VerifyEmailForm />
      </Suspense>
    </main>
  );
}
