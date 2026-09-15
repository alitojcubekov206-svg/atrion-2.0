"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import AuthTransition from "@/frontend/components/AuthTransition";
import { postJson } from "@/frontend/api";

const inputCls =
  "w-full border-0 border-b border-white/12 bg-transparent px-1 py-3.5 text-[15px] text-white transition placeholder:text-muted focus:border-[#a78bfa]/70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a78bfa]";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function ForgotPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function requestCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await postJson<{ devCode?: string }>("/api/auth/forgot-password", {
      email: email.trim().toLowerCase(),
    });
    setLoading(false);
    if (res.ok) {
      setInfo(
        res.data.devCode
          ? `Код (тест-режим): ${res.data.devCode}`
          : "Если аккаунт с таким email существует, код уже в пути. Проверьте и папку «Спам»."
      );
      setStep("reset");
    } else {
      setError(res.data.error ?? "Не удалось отправить код");
    }
  }

  async function resetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }
    setLoading(true);
    const res = await postJson("/api/auth/reset-password", {
      email: email.trim().toLowerCase(),
      code: code.trim(),
      password,
    });
    if (res.ok) {
      setDone(true);
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1100);
    } else {
      setLoading(false);
      setError(res.data.error ?? "Не удалось сменить пароль");
    }
  }

  if (done) return <AuthTransition label="Пароль обновлён…" />;

  return (
    <div className="mt-9 w-full max-w-sm">
      <AnimatePresence mode="wait" initial={false}>
        {step === "email" ? (
          <motion.form
            key="email"
            onSubmit={requestCode}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex flex-col gap-5"
          >
            <div>
              <label htmlFor="forgot-email" className="sr-only">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className={inputCls}
              />
            </div>
            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary mt-3 w-full rounded-full py-3.5 text-sm disabled:opacity-60"
            >
              {loading ? "…" : "Получить код"}
            </button>
          </motion.form>
        ) : (
          <motion.form
            key="reset"
            onSubmit={resetPassword}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex flex-col gap-5"
          >
            {info && <p className="text-sm leading-relaxed text-[#a78bfa]">{info}</p>}
            <div>
              <label htmlFor="reset-code" className="sr-only">
                Код из письма
              </label>
              <input
                id="reset-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Код из письма"
                className={`${inputCls} tracking-[0.4em]`}
              />
            </div>
            <div>
              <label htmlFor="reset-password" className="sr-only">
                Новый пароль
              </label>
              <input
                id="reset-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Новый пароль (мин. 8 символов)"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="reset-confirm" className="sr-only">
                Повторите пароль
              </label>
              <input
                id="reset-confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Повторите пароль"
                className={inputCls}
              />
            </div>
            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="btn-primary mt-3 w-full rounded-full py-3.5 text-sm disabled:opacity-60"
            >
              {loading ? "…" : "Сменить пароль"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setError(null);
              }}
              className="text-center text-sm text-muted transition hover:text-[#a78bfa]"
            >
              Отправить код ещё раз
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <p className="mt-5 text-center text-sm text-muted">
        Вспомнили пароль?{" "}
        <Link href="/login" className="text-[#a78bfa]/85 transition hover:text-[#a78bfa]">
          Войти
        </Link>
      </p>
    </div>
  );
}
