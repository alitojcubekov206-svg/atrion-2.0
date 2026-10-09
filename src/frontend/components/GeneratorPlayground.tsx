"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { buildFromPlan, planFor } from "@/backend/procedural-3d";
import { matchParts } from "@/backend/gen/match";
import { dimensionsOf, interiorCutHeight, primitiveCount, structureFromGroups } from "@/shared/geometry";
import type { ThreeDConcept } from "@/shared/types";
import OpenDesignButton from "./OpenDesignButton";
import {isLivingConcept,requestedMotion} from "@/shared/living/request";

const ConceptViewer = dynamic(() => import("@/frontend/components/three/ConceptViewer"), {
  ssr: false,
});

const PRESETS = [
  "Двухэтажный дом с мебелью",
  "Дом с диваном, кроватью и столом",
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
    if(isLivingConcept(concept))concept.motion=requestedMotion(prompt);
    return { blueprint, summary, concept, verdict: matchParts(blueprint, concept.parts) };
  }, [prompt]);

  const { verdict, summary, blueprint } = result;
  // A loaded GLB replaces the generated model until the prompt changes.
  const [override, setOverride] = useState<ThreeDConcept | null>(null);
  const [meshStatus, setMeshStatus] = useState<string | null>(null);
  const [glbUrl, setGlbUrl] = useState("");
  useEffect(() => {
    setOverride(null);
    setMeshStatus(null);
  }, [result]);
  const concept = override ?? result.concept;
  const [section, setSection] = useState<number | null>(null);
  // Same rule as the studio: a covered interior opens up on its own.
  useEffect(() => setSection(interiorCutHeight(concept)), [concept]);
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <main className="flex min-h-screen flex-col gap-4 bg-[#050507] p-4 text-sm text-[#d8d3cb] md:h-screen md:flex-row">
      <aside className="flex w-full flex-col gap-3 md:w-80 md:shrink-0 md:overflow-y-auto">
        <OpenDesignButton preview prompt={prompt} result={{kind:"model",concept,source:concept.source??"procedural",recognized:[concept.name],missing:[]}}/>
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

        <section className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#6a6560]">Импорт GLB</p>
          <div className="flex gap-2">
            <input
              value={glbUrl}
              onChange={(event) => setGlbUrl(event.target.value)}
              placeholder="Ссылка на .glb"
              aria-label="Ссылка на GLB"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-white outline-none"
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  setMeshStatus("Загружаем GLB…");
                  const { glbToParts } = await import("@/frontend/glb-import");
                  const buffer = await (await fetch(glbUrl)).arrayBuffer();
                  const parts = await glbToParts(buffer, 1.7);
                  setOverride({
                    ...result.concept,
                    parts,
                    structure: structureFromGroups(parts),
                    dimensions: dimensionsOf(parts),
                  });
                  setMeshStatus(`GLB: ${parts.length} частей, ${parts.reduce((n, p) => n + (p.mesh?.position.length ?? 0) / 3, 0)} вершин`);
                } catch (error) {
                  setMeshStatus(error instanceof Error ? error.message : String(error));
                }
              }}
              className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-violet-300"
            >
              Открыть
            </button>
          </div>
          {meshStatus && <p data-testid="mesh-status" className="text-[#b8b2a8]">{meshStatus}</p>}
        </section>

        <section className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs">
          <button
            type="button"
            onClick={() =>
              setSection((current) =>
                current !== null ? null : interiorCutHeight(concept) ?? concept.dimensions.height * 0.5
              )
            }
            className={`rounded-full px-3 py-1 ${section !== null ? "bg-violet-400 text-black" : "border border-white/10 text-violet-300"}`}
          >
            Разрез
          </button>
          {section !== null && (
            <>
              <input
                type="range"
                min={0.2}
                max={Math.max(0.3, concept.dimensions.height)}
                step={0.05}
                value={section}
                onChange={(event) => setSection(Number(event.target.value))}
                aria-label="Высота разреза"
                className="min-w-0 flex-1 accent-violet-400"
              />
              <span data-testid="section-height">{section.toFixed(1)} м</span>
            </>
          )}
        </section>
      </aside>

      <div className="relative min-h-[60vh] flex-1 overflow-hidden rounded-2xl border border-white/[0.08]">
        <ConceptViewer
          key={`${prompt}-${override ? "mesh" : "blocks"}`}
          concept={concept}
          selectedId={selectedId}
          onSelect={setSelectedId}
          sectionHeight={section}
          className="absolute inset-0"
        />
      </div>
    </main>
  );
}
