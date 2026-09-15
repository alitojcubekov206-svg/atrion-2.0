"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const STORAGE_KEY = "atrion_tour_v1_done";

const STEPS = [
  {
    target: "new-project",
    title: "Начните с идеи",
    body: "Одно-два предложения - AI задаст уточняющие вопросы и соберёт архитектуру, БД, API и roadmap.",
  },
  {
    target: "engine",
    title: "Или сразу в 3D",
    body: "Design Engine превращает описание в цельную модель, которую можно крутить, разбирать и править через чат.",
  },
  {
    target: "settings",
    title: "Голос и аккаунт",
    body: "В настройках - озвучка, единицы измерения, пароль и удаление аккаунта.",
  },
] as const;

type Rect = { left: number; top: number; width: number; height: number };

function measure(target: string): Rect | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { left: r.left - 8, top: r.top - 8, width: r.width + 16, height: r.height + 16 };
}

export default function DashboardTour({ show }: { show: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!show) return;
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }
    const timer = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(timer);
  }, [show]);

  const finish = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Private mode: the tour just shows again next visit.
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const current = STEPS[step];
    const el = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    const update = () => {
      const r = measure(current.target);
      if (!r) {
        // Target hidden at this viewport (e.g. the settings link on mobile): skip it.
        if (step < STEPS.length - 1) setStep(step + 1);
        else finish();
        return;
      }
      setRect(r);
    };
    const settle = setTimeout(update, 350);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      clearTimeout(settle);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [open, step, finish]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "Enter" || e.key === "ArrowRight") {
        if (step < STEPS.length - 1) setStep(step + 1);
        else finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, finish]);

  const current = STEPS[step];
  const placeBelow = rect ? rect.top + rect.height + 190 < window.innerHeight : true;

  return (
    <AnimatePresence>
      {open && rect && (
        <motion.div
          key="tour"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
        >
          <motion.div
            animate={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className="absolute rounded-2xl ring-2 ring-accent/70"
            style={{ boxShadow: "0 0 0 9999px rgba(5,5,7,0.78), 0 0 40px rgba(167,139,250,0.35)" }}
          />
          <motion.div
            key={step}
            initial={{ opacity: 0, y: placeBelow ? 10 : -10 }}
            animate={{
              opacity: 1,
              y: 0,
              left: Math.max(16, Math.min(rect.left, window.innerWidth - 336)),
              top: placeBelow ? rect.top + rect.height + 14 : rect.top - 14,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            style={{ translateY: placeBelow ? 0 : "-100%" }}
            className="card glass absolute w-80 p-5"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent/80">
              Шаг {step + 1} из {STEPS.length}
            </p>
            <h2 id="tour-title" className="display mt-2 text-lg font-semibold text-white">
              {current.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{current.body}</p>
            <div className="mt-5 flex items-center justify-between">
              <button type="button" onClick={finish} className="text-xs text-muted transition hover:text-white">
                Пропустить
              </button>
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5" aria-hidden="true">
                  {STEPS.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full transition ${i === step ? "bg-accent" : "bg-white/15"}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => (step < STEPS.length - 1 ? setStep(step + 1) : finish())}
                  className="btn-primary rounded-full px-4 py-1.5 text-xs"
                >
                  {step < STEPS.length - 1 ? "Далее" : "Готово"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
