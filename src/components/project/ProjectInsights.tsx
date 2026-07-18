"use client";

import { useEffect, useMemo, useState } from "react";
import type { Blueprint } from "@/lib/types";

export function HealthScore({ blueprint }: { blueprint: Blueprint }) {
  const metrics = useMemo(() => {
    const highRisks = blueprint.risks.filter((risk) => risk.severity === "High").length;
    const architecture = Math.min(100, blueprint.architecture.length * 18);
    const readiness = Math.min(
      100,
      blueprint.database.length * 8 + blueprint.api.length * 3 + blueprint.roadmap.length * 12
    );
    const feasibility = Math.max(0, 100 - blueprint.score.difficulty);
    const safety = Math.max(15, 100 - highRisks * 18 - blueprint.risks.length * 4);
    const market = blueprint.score.market;
    const list = [
      ["Architecture", architecture],
      ["Build readiness", readiness],
      ["Feasibility", feasibility],
      ["Risk control", safety],
      ["Market", market],
    ] as const;
    const total = Math.round(list.reduce((sum, item) => sum + item[1], 0) / list.length);
    return { list, total };
  }, [blueprint]);

  return (
    <div>
      <div className="card flex flex-wrap items-center gap-8 p-7">
        <div className="flex h-32 w-32 items-center justify-center rounded-full border-[10px] border-accent/25 bg-accent/5">
          <div className="text-center">
            <p className="text-3xl font-bold">{metrics.total}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted">Health</p>
          </div>
        </div>
        <div className="min-w-[240px] flex-1">
          <h2 className="text-xl font-bold">Project Health Score</h2>
          <p className="mt-1 text-sm text-muted">
            Сводная готовность проекта к реализации — не только привлекательность идеи.
          </p>
          <div className="mt-5 space-y-3">
            {metrics.list.map(([label, value]) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="text-muted">{label}</span>
                  <span>{value}/100</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-accent2"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type Version = {
  id: string;
  createdAt: string;
  blueprint: Blueprint;
};

export function VersionHistory({
  projectId,
  blueprint,
}: {
  projectId: string;
  blueprint: Blueprint;
}) {
  const [versions, setVersions] = useState<Version[]>([]);
  const key = `atrion:versions:${projectId}`;

  useEffect(() => {
    let stored: Version[] = [];
    try {
      stored = JSON.parse(localStorage.getItem(key) ?? "[]");
    } catch {
      stored = [];
    }
    const signature = JSON.stringify(blueprint);
    const alreadySaved = stored.some((item) => JSON.stringify(item.blueprint) === signature);
    const next = alreadySaved
      ? stored
      : [
          {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            blueprint,
          },
          ...stored,
        ].slice(0, 10);
    localStorage.setItem(key, JSON.stringify(next));
    setVersions(next);
  }, [blueprint, key]);

  return (
    <div>
      <h2 className="text-2xl font-bold">Version History</h2>
      <p className="mt-2 text-sm text-muted">
        Atrion сохраняет до 10 сгенерированных вариантов на этом устройстве.
      </p>
      <div className="mt-6 space-y-4">
        {versions.map((version, index) => (
          <div key={version.id} className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="font-semibold">Version {versions.length - index}</p>
              <p className="mt-1 text-xs text-muted">
                {new Date(version.createdAt).toLocaleString("ru-RU")} ·{" "}
                {version.blueprint.overview.name}
              </p>
            </div>
            <div className="flex gap-4 text-xs">
              <span>Innovation <b>{version.blueprint.score.innovation}</b></span>
              <span>Market <b>{version.blueprint.score.market}</b></span>
              <span>Difficulty <b>{version.blueprint.score.difficulty}</b></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SharePanel({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createLink() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/share`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось создать ссылку");
      setUrl(data.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="card p-8 text-center">
      <p className="text-xs uppercase tracking-[0.18em] text-accent2">Public Blueprint</p>
      <h2 className="mt-2 text-2xl font-bold">Поделись проектом</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
        Создай безопасную ссылку только для чтения. Получателю не потребуется аккаунт Atrion.
        Ссылка действует 30 дней.
      </p>
      {!url ? (
        <button
          onClick={createLink}
          disabled={loading}
          className="btn-primary mt-7 rounded-full px-7 py-3 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Создание…" : "Создать публичную ссылку"}
        </button>
      ) : (
        <div className="mx-auto mt-7 flex max-w-2xl gap-2">
          <input readOnly value={url} className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-4 py-3 text-sm text-muted" />
          <button onClick={copy} className="btn-primary rounded-xl px-5 text-sm font-semibold text-white">
            {copied ? "Скопировано ✓" : "Копировать"}
          </button>
        </div>
      )}
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
  );
}
