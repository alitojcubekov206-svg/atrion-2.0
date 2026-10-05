"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { buildFromPlan, planFor } from "@/backend/procedural-3d";
import { matchParts } from "@/backend/gen/match";
import { primitiveCount } from "@/shared/geometry";

const ConceptViewer = dynamic(() => import("@/frontend/components/three/ConceptViewer"), {
  ssr: false,
});

const PRESETS = [
  "Красный спорткар с большими колёсами",
  "Синий грузовик с прицепом",
  "Настольная лампа с гибкой стойкой",
  "Торшер",
  "Робот-пылесос",
  "Хрустальный тостер",
  "Стиральная машина",
  "Холодильник",
  "Рыцарь в доспехах с мечом",
  "Меч",
  "Уютная спальня 4×5 м с кроватью и столом",
  "Кухня 3 на 4 метра с гарнитуром",
  "Три деревянных стула",
  "Летающий дом на колёсах с трубой",
  "Двухэтажный дом с башней, куполом и аркадой из 6 арок",
  "Робот-паук на 8 ногах с прожектором",
];

/**
 * Dev sandbox for the parametric generator: the exact build the studio falls
 * back to, with the prompt-match verdict next to it. No account, no AI calls.
 */
export default function GeneratorPlayground({ initialPrompt }: { initialPrompt?: string }) {
  const [draft, setDraft] = useState(initialPrompt || PRESETS[0]);
  const [prompt, setPrompt] = useState(initialPrompt || PRESETS[0]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const result = useMemo(() => {
    const { blueprint, summary } = planFor(prompt);
    const concept = buildFromPlan(planFor(prompt).blueprint);
    return { blueprint, summary, concept, verdict: matchParts(blueprint, concept.parts) };
  }, [prompt]);

  const { concept, verdict, summary, blueprint } = result;
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <main className="flex min-h-screen flex-col gap-4 bg-[#050507] p-4 text-sm text-[#d8d3cb] md:h-screen md:flex-row">
      <aside className="flex w-full flex-col gap-3 md:w-80 md:shrink-0 md:overflow-y-auto">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSelectedId(null);
            setPrompt(draft.trim() || PRESETS[0]);
          }}
          className="flex gap-2"
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-violet-400/60"
            aria-label="Описание объекта"
          />
          <button type="submit" className="rounded-lg bg-violet-500/80 px-3 py-2 font-medium text-white">
            Собрать
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setDraft(preset);
                setSelectedId(null);
                setPrompt(preset);
              }}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                preset === prompt
                  ? "border-violet-400/60 bg-violet-400/15 text-white"
                  : "border-white/10 text-[#8f8a82] hover:text-white"
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        <section className="space-y-1.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#6a6560]">Вердикт</p>
          <p data-testid="verdict">
            тип {blueprint.kind} · качество {pct(verdict.quality)} · цельность {pct(verdict.structure)} · по
            запросу {pct(verdict.match)} (детали {pct(verdict.coverage)}, размер {pct(verdict.sizeFit)})
          </p>
          <p>
            {concept.parts.length} деталей · {primitiveCount(concept.parts)} примитивов ·{" "}
            {concept.dimensions.width} × {concept.dimensions.depth} × {concept.dimensions.height} м
          </p>
          {verdict.missing.length ? (
            <p className="text-amber-300/80">Не хватает: {verdict.missing.join(", ")}</p>
          ) : (
            <p className="text-emerald-300/80">Всё, что названо в запросе, на месте</p>
          )}
          <p className="text-[#8f8a82]">Распознано: {blueprint.matched.join(", ") || "—"}</p>
          <p className="font-mono text-[10px] leading-relaxed text-[#6a6560]">{summary}</p>
        </section>
      </aside>

      <div className="relative min-h-[60vh] flex-1 overflow-hidden rounded-2xl border border-white/[0.08]">
        <ConceptViewer
          key={prompt}
          concept={concept}
          selectedId={selectedId}
          onSelect={setSelectedId}
          className="absolute inset-0"
        />
      </div>
    </main>
  );
}
