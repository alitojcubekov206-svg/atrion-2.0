"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import VerifyCodeCells, { type CellsPhase } from "@/frontend/components/VerifyCodeCells";

const CODE_LENGTH = 6;
export const DEMO_CODE = "123456";

export default function VerifyForm({
  email,
  demo = false,
}: {
  email: string;
  /** Playground mode: no network, DEMO_CODE passes, success resets instead of redirecting. */
  demo?: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [displayEmail, setDisplayEmail] = useState(email);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [phase, setPhase] = useState<CellsPhase>("input");
  const [attempt, setAttempt] = useState(0);
  const submittedRef = useRef(false);
  const busy = phase !== "input";

  async function check(value: string): Promise<{ ok: boolean; error?: string }> {
    if (demo) return value === DEMO_CODE ? { ok: true } : { ok: false, error: "Неверный код" };
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, error: data.error };
    } catch {
      return { ok: false, error: "Нет соединения. Попробуйте ещё раз." };
    }
  }

  function backToInput() {
    setCode("");
    setPhase("input");
    setAttempt((n) => n + 1);
    submittedRef.current = false;
  }

  async function submitCode(value: string) {
    setError(null);
    setInfo(null);
    setPhase("checking");

    // Let the scan run at least one full sweep so a fast reply doesn't flicker.
    const [result] = await Promise.all([
      check(value),
      new Promise((resolve) => setTimeout(resolve, 1100)),
    ]);

    setPhase(result.ok ? "success" : "error");

    setTimeout(() => {
      if (result.ok && !demo) {
        router.push("/dashboard");
        router.refresh();
      } else if (result.ok) {
        backToInput();
        setInfo("Подтверждено (демо). Можно попробовать ещё раз.");
      } else {
        backToInput();
        setError(result.error ?? "Что-то пошло не так");
      }
    }, result.ok ? 2000 : 1700);
  }

  useEffect(() => {
    if (code.length === CODE_LENGTH && !submittedRef.current) {
      submittedRef.current = true;
      submitCode(code);
    }
    if (code.length < CODE_LENGTH) submittedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function resend(emailOverride?: string) {
    setError(null);
    setInfo(null);
    setResending(true);
    if (demo) {
      if (emailOverride) setDisplayEmail(emailOverride);
      setCode("");
      setInfo(`Демо-код: ${DEMO_CODE}`);
      setResending(false);
      return true;
    }
    const res = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: emailOverride ? { "Content-Type": "application/json" } : undefined,
      body: emailOverride ? JSON.stringify({ email: emailOverride }) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (typeof data.email === "string") setDisplayEmail(data.email);
      setCode("");
      setInfo(data.devCode ? `Код (тест-режим): ${data.devCode}` : "Новый код отправлен на почту");
    } else {
      setError(data.error ?? "Не удалось отправить код");
    }
    setResending(false);
    return res.ok;
  }

  async function onChangeEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingEmail(true);
    const ok = await resend(newEmail.trim().toLowerCase());
    setSavingEmail(false);
    if (ok) {
      setChangingEmail(false);
      setNewEmail("");
    }
  }

  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? "");
  const activeIndex = Math.min(code.length, CODE_LENGTH - 1);

  return (
    <div className="mt-8 w-full">
      <p className="text-sm leading-relaxed text-muted">
        Код отправлен на{" "}
        <span className="font-medium text-white">{displayEmail}</span>.{" "}
        {!changingEmail && !busy && (
          <button
            type="button"
            onClick={() => setChangingEmail(true)}
            className="text-[#a78bfa]/85 underline-offset-2 transition hover:text-[#a78bfa] hover:underline"
          >
            Изменить email
          </button>
        )}
      </p>

      <AnimatePresence initial={false}>
        {changingEmail && (
          <motion.form
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.25 }}
            onSubmit={onChangeEmailSubmit}
            className="flex gap-2 overflow-hidden"
          >
            <label htmlFor="new-email" className="sr-only">
              Новый email
            </label>
            <input
              id="new-email"
              type="email"
              required
              autoFocus
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="новый@email.com"
              className="min-w-0 flex-1 rounded-lg border border-white/12 bg-transparent px-3 py-2 text-sm text-white outline-none transition placeholder:text-muted focus:border-[#a78bfa]/70"
            />
            <button
              type="submit"
              disabled={savingEmail}
              className="btn-ghost shrink-0 rounded-lg px-3 py-2 text-xs disabled:opacity-60"
            >
              {savingEmail ? "…" : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={() => {
                setChangingEmail(false);
                setNewEmail("");
              }}
              aria-label="Отменить изменение email"
              className="shrink-0 rounded-lg px-2 py-2 text-sm text-muted transition hover:text-white"
            >
              ✕
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <motion.form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === CODE_LENGTH) submitCode(code);
        }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative mt-7"
      >
        <label htmlFor="verify-code" className="sr-only">
          Код подтверждения
        </label>

        <VerifyCodeCells digits={digits} activeIndex={activeIndex} phase={phase} attempt={attempt} />

        <input
          id="verify-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          required
          disabled={busy}
          className="absolute inset-x-0 top-0 h-14 w-full cursor-text text-transparent caret-transparent opacity-0 outline-none focus-visible:opacity-0"
        />

        <div aria-live="polite" className="sr-only">
          {phase === "checking" && "Проверяем код"}
          {phase === "success" && "Код верный"}
          {phase === "error" && "Код неверный"}
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.p
              key="error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 text-center text-sm text-red-400"
            >
              {error}
            </motion.p>
          )}
          {info && !error && (
            <motion.p
              key="info"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 text-center text-sm text-[#a78bfa]"
            >
              {info}
            </motion.p>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={busy || code.length !== CODE_LENGTH}
          className="btn-primary mt-6 w-full rounded-full py-3.5 text-sm disabled:opacity-60"
        >
          {phase === "checking"
            ? "Проверяем…"
            : phase === "success"
              ? "Готово"
              : phase === "error"
                ? "Неверный код"
                : "Подтвердить"}
        </button>
      </motion.form>

      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-3 text-xs leading-relaxed text-muted">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          className="mt-0.5 shrink-0 text-[#a78bfa]/70"
          aria-hidden="true"
        >
          <path
            d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Не видите письмо? Проверьте папку «Спам» - коды подтверждения иногда попадают туда.</span>
      </div>

      <button
        type="button"
        onClick={() => resend()}
        disabled={resending || busy}
        className="mt-4 w-full text-center text-sm text-muted transition hover:text-[#a78bfa] disabled:opacity-60"
      >
        {resending ? "Отправка…" : "Отправить код ещё раз"}
      </button>
    </div>
  );
}
