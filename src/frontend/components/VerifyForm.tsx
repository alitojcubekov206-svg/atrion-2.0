"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

const CODE_LENGTH = 6;

const GRID_POS = [
  { x: 18, y: 28 },
  { x: 50, y: 28 },
  { x: 82, y: 28 },
  { x: 18, y: 72 },
  { x: 50, y: 72 },
  { x: 82, y: 72 },
];
const MESH_LINES: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5],
  [1, 2], [1, 3], [1, 4], [1, 5],
  [2, 3], [2, 4], [2, 5],
  [3, 4], [3, 5],
  [4, 5],
];

type Phase = "input" | "connecting" | "result";

export default function VerifyForm({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [displayEmail, setDisplayEmail] = useState(email);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [phase, setPhase] = useState<Phase>("input");
  const [converge, setConverge] = useState(false);
  const [resultOk, setResultOk] = useState(false);
  const submittedRef = useRef(false);
  const busy = phase !== "input";

  async function submitCode(value: string) {
    setError(null);
    setInfo(null);
    setPhase("connecting");
    setConverge(false);

    const fetchPromise = fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: value }),
    }).then(async (res) => ({ res, data: await res.json().catch(() => ({})) }));

    await new Promise((resolve) => setTimeout(resolve, 1500));
    setConverge(true);

    const [{ res, data }] = await Promise.all([
      fetchPromise,
      new Promise((resolve) => setTimeout(resolve, 700)),
    ]);

    setResultOk(res.ok);
    setPhase("result");

    setTimeout(() => {
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(data.error ?? "Что-то пошло не так");
        setCode("");
        setPhase("input");
        setConverge(false);
        submittedRef.current = false;
      }
    }, 1300);
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

        <div className="relative h-14">
          {phase === "input" && (
            <div className="flex h-14 justify-between gap-2" aria-hidden="true">
              {digits.map((d, i) => (
                <motion.div
                  layoutId={`digit-${i}`}
                  key={i}
                  className={`flex h-14 flex-1 items-center justify-center rounded-xl border text-2xl font-semibold text-white transition-colors ${
                    i === activeIndex
                      ? "border-[#a78bfa]/70 bg-[#a78bfa]/[0.06] shadow-[0_0_0_3px_rgba(167,139,250,0.12)]"
                      : d
                        ? "border-white/20 bg-white/[0.03]"
                        : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  {d}
                </motion.div>
              ))}
            </div>
          )}

          {phase !== "input" && (
            <div className="relative mx-auto h-32 w-full max-w-[220px]" aria-hidden="true">
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
                {phase === "connecting" &&
                  MESH_LINES.map(([a, b], i) => {
                    const p1 = GRID_POS[a];
                    const p2 = GRID_POS[b];
                    return (
                      <motion.line
                        key={i}
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke="#a78bfa"
                        strokeWidth="1"
                        strokeLinecap="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={
                          converge
                            ? { opacity: 0 }
                            : { pathLength: 1, opacity: [0, 0.85, 0.45] }
                        }
                        transition={
                          converge
                            ? { duration: 0.5, ease: "easeOut" }
                            : {
                                pathLength: { duration: 0.6, delay: i * 0.045, ease: "easeOut" },
                                opacity: { duration: 1.3, delay: i * 0.045, times: [0, 0.5, 1] },
                              }
                        }
                      />
                    );
                  })}
              </svg>

              {phase === "connecting" &&
                digits.map((d, i) => (
                  <motion.div
                    layoutId={`digit-${i}`}
                    key={i}
                    initial={false}
                    animate={
                      converge
                        ? { left: "50%", top: "50%", scale: 0, opacity: 0 }
                        : {
                            left: `${GRID_POS[i].x}%`,
                            top: `${GRID_POS[i].y}%`,
                            opacity: 1,
                            scale: 1,
                          }
                    }
                    transition={
                      converge
                        ? { duration: 0.7, ease: "easeIn" }
                        : { type: "spring", stiffness: 260, damping: 24 }
                    }
                    style={{ position: "absolute", x: "-50%", y: "-50%" }}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#a78bfa]/60 bg-[#a78bfa]/10 text-base font-semibold text-white shadow-[0_0_18px_rgba(167,139,250,0.4)]"
                  >
                    {d}
                  </motion.div>
                ))}

              {phase === "result" && (
                <motion.div
                  initial={{ scale: 0.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.05 }}
                  style={{ position: "absolute", left: "50%", top: "50%", x: "-50%", y: "-50%" }}
                  className={`flex h-16 w-16 items-center justify-center rounded-2xl border ${
                    resultOk
                      ? "border-[#a78bfa]/60 bg-[#a78bfa]/15 shadow-[0_0_26px_rgba(167,139,250,0.45)]"
                      : "border-red-400/50 bg-red-400/10 shadow-[0_0_20px_rgba(248,113,113,0.3)]"
                  }`}
                >
                  {resultOk ? (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M5 13l4 4L19 7"
                        stroke="#c4b5fd"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M6 6l12 12M18 6L6 18"
                        stroke="#f87171"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </motion.div>
              )}
            </div>
          )}
        </div>

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
          {phase === "connecting" && "Проверяем код"}
          {phase === "result" && (resultOk ? "Код верный" : "Код неверный")}
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

        {phase === "input" && (
          <button
            type="submit"
            disabled={code.length !== CODE_LENGTH}
            className="btn-primary mt-6 w-full rounded-full py-3.5 text-sm disabled:opacity-60"
          >
            Подтвердить
          </button>
        )}
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
