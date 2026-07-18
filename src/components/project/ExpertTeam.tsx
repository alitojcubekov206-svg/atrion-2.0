"use client";

import { useEffect, useState } from "react";
import type { ExpertReply, ExpertRole } from "@/lib/types";
import Thinking from "@/components/Thinking";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  expert?: ExpertRole;
  actionItems?: string[];
  warnings?: string[];
};

const EXPERTS: { id: ExpertRole; name: string; subtitle: string; color: string }[] = [
  { id: "architect", name: "Software Architect", subtitle: "Архитектура и масштабирование", color: "text-accent2" },
  { id: "programmer", name: "Senior Programmer", subtitle: "Код, тесты и реализация", color: "text-emerald-400" },
  { id: "product", name: "Product Manager", subtitle: "MVP, рынок и метрики", color: "text-sky-400" },
  { id: "security", name: "Security Expert", subtitle: "Угрозы и защита", color: "text-red-400" },
  { id: "critic", name: "AI Critic", subtitle: "Слабые места и лишний scope", color: "text-amber-400" },
];

export default function ExpertTeam({ projectId }: { projectId: string }) {
  const [expert, setExpert] = useState<ExpertRole>("architect");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`atrion:chat:${projectId}`);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      // Ignore invalid local data.
    }
  }, [projectId]);

  function save(next: Message[]) {
    setMessages(next);
    localStorage.setItem(`atrion:chat:${projectId}`, JSON.stringify(next.slice(-30)));
  }

  async function send() {
    const text = question.trim();
    if (!text || loading) return;
    setQuestion("");
    setError(null);
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const pending = [...messages, userMessage];
    save(pending);
    setLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/expert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: expert,
          question: text,
          history: pending.slice(-6).map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Эксперт недоступен");
      const reply = data.reply as ExpertReply;
      save([
        ...pending,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          expert,
          content: reply.answer,
          actionItems: reply.actionItems,
          warnings: reply.warnings,
        },
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось получить ответ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="card h-fit p-3">
        <p className="px-3 pb-2 pt-1 text-xs uppercase tracking-wider text-muted">AI Expert Team</p>
        {EXPERTS.map((item) => (
          <button
            key={item.id}
            onClick={() => setExpert(item.id)}
            className={`w-full rounded-xl px-3 py-3 text-left transition ${
              expert === item.id ? "bg-white/[0.06] ring-1 ring-accent/30" : "hover:bg-white/[0.03]"
            }`}
          >
            <span className={`block text-sm font-semibold ${item.color}`}>{item.name}</span>
            <span className="mt-0.5 block text-xs text-muted">{item.subtitle}</span>
          </button>
        ))}
      </aside>

      <section className="card flex min-h-[520px] flex-col overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h3 className="font-semibold">{EXPERTS.find((item) => item.id === expert)?.name}</h3>
          <p className="text-xs text-muted">Эксперт видит текущий Blueprint и не обязан соглашаться с идеей.</p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
              Спроси: «С чего начать реализацию?», «Где слабое место?» или «Как уменьшить стоимость?»
            </div>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[88%] rounded-2xl p-4 text-sm leading-relaxed ${
                message.role === "user"
                  ? "ml-auto bg-accent/15"
                  : "border border-line bg-surface2"
              }`}
            >
              {message.expert && (
                <p className="mb-2 text-xs font-semibold text-accent2">
                  {EXPERTS.find((item) => item.id === message.expert)?.name}
                </p>
              )}
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.actionItems && message.actionItems.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-muted">
                  {message.actionItems.map((item) => <li key={item}>→ {item}</li>)}
                </ul>
              )}
              {message.warnings && message.warnings.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-amber-400">
                  {message.warnings.map((item) => <li key={item}>⚠ {item}</li>)}
                </ul>
              )}
            </div>
          ))}
          {loading && <Thinking label="Эксперт изучает Blueprint" />}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="border-t border-line p-4">
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void send();
              }}
              placeholder="Задайте вопрос выбранному эксперту..."
              className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-3 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={send}
              disabled={loading || !question.trim()}
              className="btn-primary rounded-xl px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Отправить
            </button>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => save([])}
              className="mt-2 text-xs text-muted hover:text-red-400"
            >
              Очистить диалог
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
