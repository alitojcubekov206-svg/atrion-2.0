"use client";
import {useState} from "react";
import type {Clarification} from "@/shared/design/brief";

export default function ClarificationPanel({value, busy, onAnswer, onCancel}: {value: Clarification; busy: boolean; onAnswer: (answer: string) => void; onCancel: () => void}) {
  const [answer, setAnswer] = useState("");
  const {question} = value;
  return <div className="mt-4 space-y-4 rounded-xl border border-accent/40 bg-accent/5 p-4" aria-label="Уточнение задания">
    {value.answers.length > 0 && <div className="space-y-2 border-b border-white/10 pb-3">{value.answers.map((a,i) => <p key={i} className="ml-6 rounded-xl bg-surface2 px-3 py-2 text-sm text-fg"><span className="mr-2 text-xs text-muted">Вы</span>{a.answer}</p>)}</div>}
    {value.understood.length > 0 && <p className="text-xs leading-5 text-muted">{value.source === "local-ai" ? "Предположения модели — можно уточнить" : "Уже учтено"}: {value.understood.join(" · ")}</p>}
    <div><p className="mb-1 text-xs font-medium uppercase tracking-widest text-accent">Atrion уточняет</p><h2 className="font-medium text-white">{question.text}</h2><p className="mt-1 text-xs leading-5 text-muted">{question.hint}</p></div>
    <div className="flex flex-wrap gap-2">{question.options.map(option => <button type="button" key={option} disabled={busy} className="rounded-xl border border-white/15 px-3 py-2 text-left text-sm text-fg hover:border-accent/60 disabled:opacity-40" onClick={() => onAnswer(option)}>{option}</button>)}</div>
    <form className="flex flex-wrap gap-2" onSubmit={e => {e.preventDefault(); if (answer.trim()) onAnswer(answer.trim());}}>
      <input autoFocus aria-label="Ответ на уточнение" value={answer} onChange={e => setAnswer(e.target.value)} maxLength={500} disabled={busy} placeholder="Или ответьте своими словами…" className="min-w-40 flex-1 rounded-xl border border-white/15 bg-surface2 px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"/>
      <button className="rounded-xl bg-accent px-4 py-2 text-sm text-slate-950 disabled:opacity-40" disabled={busy || !answer.trim()}>{busy ? "Обрабатываем…" : "Ответить"}</button>
      <button type="button" onClick={onCancel} disabled={busy} className="px-2 text-xs text-muted">Изменить запрос</button>
    </form>
    <p className="text-[11px] text-muted">Сначала уточним недостающие параметры, затем построим модель.</p>
  </div>;
}
