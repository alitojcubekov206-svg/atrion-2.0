"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Blueprint } from "@/lib/types";
import { blueprintToMarkdown, download } from "@/lib/export";
import ScoreRing from "./ScoreRing";
import ExpertTeam from "./ExpertTeam";
import StarterKitPanel from "./StarterKitPanel";
import { HealthScore, SharePanel, VersionHistory } from "./ProjectInsights";

const ArchGraph = dynamic(() => import("@/components/three/ArchGraph"), { ssr: false });

const TABS = [
  "Overview",
  "Health",
  "Architecture",
  "Database",
  "API",
  "Roadmap",
  "Score",
  "Risks",
  "Experts",
  "Build",
  "Versions",
  "Share",
  "Export",
] as const;
type Tab = (typeof TABS)[number];

const METHOD_COLOR: Record<string, string> = {
  GET: "text-emerald-400",
  POST: "text-sky-400",
  PUT: "text-amber-400",
  PATCH: "text-amber-400",
  DELETE: "text-red-400",
};

export default function BlueprintView({
  blueprint: bp,
  projectId,
  idea,
  onRegenerate,
  regenerating,
  onDelete,
}: {
  blueprint: Blueprint;
  projectId: string;
  idea: string;
  onRegenerate: () => void;
  regenerating: boolean;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Overview");

  return (
    <div>
      <div className="no-print flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Project Blueprint</p>
          <h1 className="mt-1 text-3xl font-bold leading-tight">{bp.overview.name}</h1>
          <p className="mt-1 text-muted">{bp.overview.tagline}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="rounded-full border border-line px-4 py-2 text-sm text-muted transition hover:border-accent hover:text-fg disabled:opacity-50"
          >
            {regenerating ? "Генерация..." : "↻ Перегенерировать"}
          </button>
          <button
            onClick={onDelete}
            className="rounded-full border border-line px-4 py-2 text-sm text-muted transition hover:border-red-400 hover:text-red-400"
          >
            Удалить
          </button>
        </div>
      </div>

      <div className="no-print mt-8 flex flex-wrap gap-1 rounded-2xl border border-line bg-surface p-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative rounded-xl px-4 py-2 text-sm transition ${
              tab === t ? "text-white" : "text-muted hover:text-fg"
            }`}
          >
            {tab === t && (
              <motion.span
                layoutId="tab-bg"
                className="absolute inset-0 rounded-xl bg-accent/20 ring-1 ring-accent/50"
                transition={{ type: "spring", duration: 0.45 }}
              />
            )}
            <span className="relative">{t}</span>
          </button>
        ))}
      </div>

      <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-8">
        {tab === "Overview" && <Overview bp={bp} idea={idea} />}
        {tab === "Health" && <HealthScore blueprint={bp} />}
        {tab === "Architecture" && (
          <div className="flex flex-col gap-6">
            <div className="card flex flex-wrap items-center justify-between gap-4 border-accent2/20 p-5">
              <div>
                <h3 className="font-semibold">Нужна физическая 3D-концепция?</h3>
                <p className="mt-1 text-sm text-muted">
                  Открой Atrion 3D Studio, чтобы создать модель, детали и список материалов.
                </p>
              </div>
              <Link
                href="/dashboard/3d-studio"
                className="rounded-full border border-accent2/40 bg-accent2/10 px-5 py-2 text-sm font-semibold text-accent2 transition hover:bg-accent2/20"
              >
                Создать 3D-модель →
              </Link>
            </div>
            <ArchGraph layers={bp.architecture} />
            <div className="grid gap-4 md:grid-cols-2">
              {bp.architecture.map((l) => (
                <div key={l.layer} className="card p-5">
                  <h3 className="font-semibold text-accent2">{l.layer}</h3>
                  <p className="mt-2 flex flex-wrap gap-1.5">
                    {l.technologies.map((t) => (
                      <span key={t} className="rounded-full bg-white/5 px-3 py-1 text-xs">{t}</span>
                    ))}
                  </p>
                  <p className="mt-3 text-sm text-muted">{l.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "Database" && (
          <div className="grid gap-4 md:grid-cols-2">
            {bp.database.map((t) => (
              <div key={t.name} className="card overflow-hidden">
                <div className="border-b border-line bg-surface2 px-5 py-3 font-mono text-sm font-semibold text-accent2">
                  {t.name}
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {t.fields.map((f) => (
                      <tr key={f.name} className="border-b border-line/50 last:border-0">
                        <td className="px-5 py-2 font-mono">{f.name}</td>
                        <td className="px-2 py-2 text-muted">{f.type}</td>
                        <td className="px-5 py-2 text-right text-xs text-muted">{f.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
        {tab === "API" && (
          <div className="card divide-y divide-line/50">
            {bp.api.map((e) => (
              <div key={e.method + e.path} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <span className={`w-16 font-mono text-sm font-bold ${METHOD_COLOR[e.method] ?? ""}`}>{e.method}</span>
                <code className="font-mono text-sm">{e.path}</code>
                <span className="ml-auto text-sm text-muted">{e.description}</span>
              </div>
            ))}
          </div>
        )}
        {tab === "Roadmap" && (
          <div className="relative flex flex-col gap-6 pl-8 before:absolute before:left-[11px] before:top-2 before:h-full before:w-px before:bg-line">
            {bp.roadmap.map((p, i) => (
              <div key={p.phase} className="relative">
                <span className="absolute -left-8 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-accent bg-bg text-xs font-bold text-accent">
                  {i + 1}
                </span>
                <div className="card p-5">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h3 className="font-semibold">{p.phase}: {p.title}</h3>
                    <span className="rounded-full bg-accent/10 px-3 py-0.5 text-xs text-accent">{p.duration}</span>
                  </div>
                  <ul className="mt-3 flex flex-col gap-1.5 text-sm text-muted">
                    {p.tasks.map((t) => (
                      <li key={t} className="flex gap-2"><span className="text-accent2">▸</span>{t}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "Score" && (
          <div className="flex flex-col gap-8">
            <div className="card flex flex-wrap justify-around gap-6 p-8">
              <ScoreRing value={bp.score.innovation} label="Innovation" />
              <ScoreRing value={bp.score.difficulty} label="Difficulty" />
              <ScoreRing value={bp.score.market} label="Market" />
              <div className="flex flex-col items-center justify-center gap-3">
                <div className="text-center">
                  <p className="text-xs uppercase tracking-wider text-muted">Cost</p>
                  <p className="mt-1 text-xl font-bold">{bp.score.cost}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs uppercase tracking-wider text-muted">Risk</p>
                  <p className={`mt-1 text-xl font-bold ${
                    bp.score.risk === "High" ? "text-red-400" : bp.score.risk === "Medium" ? "text-amber-400" : "text-emerald-400"
                  }`}>{bp.score.risk}</p>
                </div>
              </div>
            </div>
            <div className="card p-6">
              <h3 className="font-semibold">Вердикт архитектора</h3>
              <p className="mt-2 leading-relaxed text-muted">{bp.score.explanation}</p>
            </div>
          </div>
        )}
        {tab === "Risks" && (
          <div className="flex flex-col gap-6">
            <div className="card border-amber-500/20 p-6">
              <h3 className="font-semibold text-amber-400">AI Critic Mode</h3>
              <ul className="mt-3 flex flex-col gap-2.5 text-sm leading-relaxed text-muted">
                {bp.critique.map((c) => (
                  <li key={c} className="flex gap-2.5"><span className="text-amber-400">⚠</span>{c}</li>
                ))}
              </ul>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {bp.risks.map((r) => (
                <div key={r.risk} className="card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-medium">{r.risk}</h4>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs ${
                      r.severity === "High" ? "bg-red-500/10 text-red-400"
                      : r.severity === "Medium" ? "bg-amber-500/10 text-amber-400"
                      : "bg-emerald-500/10 text-emerald-400"
                    }`}>{r.severity}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{r.mitigation}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "Experts" && <ExpertTeam projectId={projectId} />}
        {tab === "Build" && <StarterKitPanel projectId={projectId} />}
        {tab === "Versions" && <VersionHistory projectId={projectId} blueprint={bp} />}
        {tab === "Share" && <SharePanel projectId={projectId} />}
        {tab === "Export" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <button
              onClick={() => download(`${bp.overview.name}.md`, blueprintToMarkdown(bp, idea), "text/markdown")}
              className="card p-6 text-left"
            >
              <h3 className="font-semibold">Markdown</h3>
              <p className="mt-2 text-sm text-muted">Полный документ для GitHub, Notion или Obsidian.</p>
            </button>
            <button
              onClick={() => download(`${bp.overview.name}.json`, JSON.stringify(bp, null, 2), "application/json")}
              className="card p-6 text-left"
            >
              <h3 className="font-semibold">JSON</h3>
              <p className="mt-2 text-sm text-muted">Структурированные данные для интеграций.</p>
            </button>
            <button onClick={() => window.print()} className="card p-6 text-left">
              <h3 className="font-semibold">PDF</h3>
              <p className="mt-2 text-sm text-muted">Печать в PDF через системный диалог.</p>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Overview({ bp, idea }: { bp: Blueprint; idea: string }) {
  const rows = [
    ["Название", bp.overview.name],
    ["Описание", bp.overview.description],
    ["Целевая аудитория", bp.overview.audience],
    ["Проблема", bp.overview.problem],
    ["Решение", bp.overview.solution],
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="card p-6">
        <h3 className="text-xs uppercase tracking-wider text-muted">Исходная идея</h3>
        <p className="mt-2">{idea}</p>
      </div>
      <div className="card divide-y divide-line/50">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 px-6 py-4 sm:grid-cols-[200px_1fr]">
            <span className="text-sm text-muted">{k}</span>
            <span className="text-sm leading-relaxed">{v}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-semibold">Потенциал</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{bp.discovery.potential}</p>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold">Конкуренты</h3>
          <ul className="mt-2 flex flex-col gap-3">
            {bp.discovery.competitors.map((c) => (
              <li key={c.name} className="text-sm">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted"> — {c.description}</span>
                <div className="mt-1 text-xs text-muted">
                  <span className="text-emerald-400">+ {c.strengths.join(", ")}</span>
                  {" · "}
                  <span className="text-red-400">− {c.weaknesses.join(", ")}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
