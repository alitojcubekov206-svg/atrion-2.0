"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { requestJson } from "@/frontend/api";
import { usePageWipe } from "@/frontend/components/PageWipe";

export const PALETTE_EVENT = "atrion:palette";

type Item = { id: string; label: string; hint?: string; group: "Действия" | "Проекты"; run: () => void };
type ProjectRow = { id: string; title: string; idea: string; status: string };

const STATUS: Record<string, string> = { draft: "Черновик", interview: "Интервью", generated: "План готов" };

export function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(PALETTE_EVENT))}
      className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted transition hover:border-accent/40 hover:text-white md:inline-flex"
      aria-label="Открыть командную палитру"
    >
      <span>⌘</span>K
    </button>
  );
}

export default function CommandPalette() {
  const router = useRouter();
  const { navigate } = usePageWipe();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const go = useCallback(
    (href: string) => {
      setOpen(false);
      navigate(href);
    },
    [navigate]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    if (projects === null) {
      requestJson<{ projects?: ProjectRow[] }>("/api/projects", { method: "GET" }).then((res) => {
        if (res.ok && res.data.projects) setProjects(res.data.projects);
        else setProjects([]);
      });
    }
    return () => clearTimeout(t);
  }, [open, projects]);

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { id: "new", label: "Новый проект", hint: "Опишите идею", group: "Действия", run: () => go("/dashboard/new") },
      { id: "engine", label: "Открыть Design Engine", hint: "Текст → 3D", group: "Действия", run: () => go("/dashboard/design-engine") },
      { id: "projects", label: "Мои проекты", group: "Действия", run: () => go("/dashboard") },
      { id: "settings", label: "Настройки", hint: "Голос, пароль, аккаунт", group: "Действия", run: () => go("/dashboard/settings") },
      { id: "pricing", label: "Тарифы", group: "Действия", run: () => go("/pricing") },
      { id: "legal", label: "Правовая информация", group: "Действия", run: () => go("/legal") },
      {
        id: "logout",
        label: "Выйти",
        group: "Действия",
        run: async () => {
          setOpen(false);
          await fetch("/api/auth/logout", { method: "POST" });
          router.push("/");
          router.refresh();
        },
      },
    ];
    const rows: Item[] = (projects ?? []).map((p) => ({
      id: `p-${p.id}`,
      label: p.title,
      hint: STATUS[p.status] ?? p.status,
      group: "Проекты",
      run: () => go(`/dashboard/projects/${p.id}`),
    }));
    const q = query.trim().toLowerCase();
    const all = [...rows, ...actions];
    if (!q) return [...actions, ...rows];
    return all.filter((i) => i.label.toLowerCase().includes(q) || i.hint?.toLowerCase().includes(q));
  }, [projects, query, go, router]);

  useEffect(() => setIndex(0), [query]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[index]?.run();
    } else if (e.key === "Escape") {
      close();
    }
  }

  let lastGroup: string | null = null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="palette"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={close}
          className="fixed inset-0 z-[130] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Командная палитра"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            className="card glass w-full max-w-lg overflow-hidden"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <span className="text-muted" aria-hidden="true">⌕</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Проект, действие…"
                aria-label="Поиск по проектам и действиям"
                className="w-full bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-muted"
              />
              <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">Esc</kbd>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
              {items.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted">Ничего не найдено</li>
              )}
              {items.map((item, i) => {
                const showGroup = item.group !== lastGroup;
                lastGroup = item.group;
                return (
                  <li key={item.id} role="option" aria-selected={i === index}>
                    {showGroup && (
                      <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted/70">
                        {item.group}
                      </p>
                    )}
                    <button
                      type="button"
                      onMouseEnter={() => setIndex(i)}
                      onClick={item.run}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                        i === index ? "bg-accent/15 text-white" : "text-muted hover:text-white"
                      }`}
                    >
                      <span className="truncate">{item.label}</span>
                      {item.hint && <span className="ml-3 shrink-0 text-xs text-muted/70">{item.hint}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
