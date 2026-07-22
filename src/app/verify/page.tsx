"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";

const EntryGateScene = dynamic(() => import("@/components/three/EntryGateScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#09060f]" />,
});

function VerifyEmailForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email")?.trim().toLowerCase() ?? "";
  const initialDevCode = params.get("devCode")?.replace(/\D/g, "").slice(0, 6) ?? "";
  const [code, setCode] = useState(initialDevCode);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState(
    initialDevCode ? `Код: ${initialDevCode}` : "Код на почте"
  );
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
    if (typeof data.devCode === "string") {
      setCode(data.devCode);
      setMessage(`Код: ${data.devCode}`);
    } else {
      setMessage("Новый код отправлен");
    }
    setCooldown(60);
  }

  if (!email) {
    return (
      <div className="text-center">
        <Link href="/register" className="text-violet-200 hover:text-white">
          Регистрация
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] as const }}
      className="w-full max-w-sm"
    >
      <Link href="/">
        <h1 className="font-[family-name:var(--font-display)] text-5xl font-semibold tracking-tight text-white md:text-6xl">
          ATRION
        </h1>
      </Link>
      <div className="mt-5 h-px w-24 bg-gradient-to-r from-violet-300 to-transparent" />
      <p className="mt-8 text-sm text-slate-400">
        {message} · <span className="text-slate-200">{email}</span>
      </p>
      <form onSubmit={verify} className="mt-8 flex flex-col gap-5">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          required
          pattern="[0-9]{6}"
          className="w-full border-0 border-b border-white/15 bg-transparent py-4 text-center text-3xl tracking-[0.5em] text-white outline-none focus:border-violet-300/70"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          disabled={loading || code.length !== 6}
          className="rounded-full bg-gradient-to-r from-violet-300 to-fuchsia-400 py-3.5 text-sm font-semibold text-black shadow-[0_0_40px_rgba(167,139,250,0.4)] disabled:opacity-50"
        >
          {loading ? "…" : "Войти"}
        </button>
      </form>
      <button
        type="button"
        onClick={resend}
        disabled={cooldown > 0}
        className="mt-6 w-full text-sm text-slate-500 disabled:opacity-50"
      >
        {cooldown > 0 ? `${cooldown}s` : "Снова"}
      </button>
    </motion.div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#09060f]">
      <EntryGateScene />
      <div className="relative z-10 flex min-h-screen w-full flex-col justify-center px-6 py-16 md:w-[48%] md:px-12 lg:px-16">
        <Suspense fallback={<div className="text-slate-500">…</div>}>
          <VerifyEmailForm />
        </Suspense>
      </div>
    </main>
  );
}
