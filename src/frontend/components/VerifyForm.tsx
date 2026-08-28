"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function VerifyForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const inputCls =
    "w-full border-0 border-b border-white/12 bg-transparent px-1 py-3.5 text-center text-2xl tracking-[0.5em] text-white outline-none transition placeholder:text-[#6a6560] focus:border-[#a78bfa]/70";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError(data.error ?? "Что-то пошло не так");
      setLoading(false);
    }
  }

  async function resend() {
    setError(null);
    setInfo(null);
    setResending(true);
    const res = await fetch("/api/auth/resend-verification", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setInfo(data.devCode ? `Код (тест-режим): ${data.devCode}` : "Новый код отправлен на почту");
    } else {
      setError(data.error ?? "Не удалось отправить код");
    }
    setResending(false);
  }

  return (
    <motion.form
      onSubmit={onSubmit}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-9 flex w-full flex-col gap-5"
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        maxLength={6}
        required
        className={inputCls}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {info && <p className="text-sm text-[#a78bfa]">{info}</p>}
      <button
        type="submit"
        disabled={loading || code.length !== 6}
        className="btn-primary mt-1 w-full rounded-full py-3.5 text-sm disabled:opacity-60"
      >
        {loading ? "…" : "Подтвердить"}
      </button>
      <button
        type="button"
        onClick={resend}
        disabled={resending}
        className="pt-1 text-center text-sm text-[#6a6560] transition hover:text-[#a78bfa] disabled:opacity-60"
      >
        {resending ? "Отправка…" : "Отправить код повторно"}
      </button>
    </motion.form>
  );
}
