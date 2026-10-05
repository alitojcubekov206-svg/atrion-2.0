/**
 * Regression check for the 3D generator — every case here was a real bug.
 * Exits non-zero when any expectation fails, so it can gate a deploy.
 *
 *   npx tsx scripts/gen-check.ts
 */
import { buildFromPlan, planFor } from "@/backend/procedural-3d";
import { matchParts } from "@/backend/gen/match";
import {
  generateAIGeometry,
  pickBetterGeometry,
  type AIGeometryResult,
  type JsonRequester,
} from "@/backend/gen/ai-geometry";
import { dimensionsOf, part, scaleParts } from "@/shared/geometry";
import type { ModelPart } from "@/shared/types";
import type { Blueprint } from "@/backend/gen/blueprint";

let failures = 0;
let passed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    return;
  }
  failures++;
  console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

type Case = {
  prompt: string;
  kind?: Blueprint["kind"];
  plan?: (b: Blueprint) => string | true;
  /** Built model: width (x), depth (z), height (y) in metres. */
  dims?: (d: { width: number; depth: number; height: number }) => string | true;
};

const CASES: Case[] = [
  // What the object is comes from the head noun.
  { prompt: "Аниме девушка с длинными волосами в платье", kind: "character", plan: (b) => b.length < 1.2 || `stretched to ${b.length}` },
  { prompt: "Кот сидит", kind: "animal" },
  { prompt: "Офисный стол", kind: "furniture", plan: (b) => b.roof === "none" || "table got a roof" },
  { prompt: "Робот-пылесос", kind: "appliance", plan: (b) => (b.legs === 0 && b.arms === 0 && b.head === 0) || "humanoid vacuum" },
  { prompt: "Стиральная машина", kind: "appliance", plan: (b) => b.wheels === 0 || "washing machine on wheels" },
  { prompt: "Хрустальный тостер", kind: "appliance", plan: (b) => (b.glassy && b.slots > 0) || "no glass or slots", dims: (d) => d.height < 0.4 || `toaster ${d.height} m tall` },
  { prompt: "Настольная лампа с гибкой стойкой", kind: "lighting", plan: (b) => b.lampArm || "no arm" },
  { prompt: "Меч", kind: "weapon", dims: (d) => (d.height > 0.7 && d.height < 1.4) || `sword ${d.height} m` },

  // Add-ons attach to the object instead of redefining it.
  { prompt: "Летающий дом на колёсах с трубой", kind: "building", plan: (b) => (b.wheels > 0 && b.chimneys > 0) || "wheels or chimney lost" },
  { prompt: "Робот-паук на 8 ногах с прожектором", kind: "robot", plan: (b) => (b.legs === 8 && b.sizeClass !== "handheld") || `legs=${b.legs} size=${b.sizeClass}` },
  { prompt: "Двухэтажный дом с башней, куполом и аркадой из 6 арок", kind: "building", plan: (b) => (b.floors === 2 && b.towers > 0 && b.arches === 6 && b.windows < 20) || `floors=${b.floors} arches=${b.arches} windows=${b.windows}` },
  { prompt: "Рыцарь в доспехах с мечом", kind: "character", plan: (b) => (b.blade && b.armour) || "no sword or armour" },
  { prompt: "Одноэтажный деревянный домик 6 на 5 метров с террасой и крыльцом", plan: (b) => b.wings === 0 || "крыльцо read as wings" },
  { prompt: "Белый дом с красной крышей", plan: (b) => b.primary === "#eeeae2" || `primary ${b.primary}` },
  { prompt: "Дом без окон", plan: (b) => b.windows === 0 || `windows=${b.windows}` },
  { prompt: "Дом из кирпича с металлической крышей", plan: (b) => (b.roughness > 0.85 && b.metalness < 0.3) || `metalness=${b.metalness}` },
  { prompt: "Красный спорткар с большими колёсами", kind: "vehicle", plan: (b) => (b.wheelSize > 0.4 && b.length < 5.5) || "car scaled instead of wheels", dims: (d) => d.height <= 1.6 || `car ${d.height} m tall` },
  { prompt: "Синий грузовик с прицепом", kind: "vehicle", plan: (b) => b.trailer || "no trailer" },

  // Sizes the user gave land exactly.
  { prompt: "Двухэтажный дом 12×9 м", plan: (b) => (b.width === 12 && b.length === 9) || `${b.width}×${b.length}` },
  { prompt: "Деревянный обеденный стол на 6 персон", plan: (b) => (b.width >= 1.7 && b.legs === 0) || `width=${b.width} legs=${b.legs}` },
  { prompt: "Кожаный диван трёхместный", plan: (b) => b.cushions === 3 || `cushions=${b.cushions}` },

  // Rooms are furnished, not turned into the furniture.
  { prompt: "Уютная спальня 4×5 м с кроватью и столом", kind: "room", plan: (b) => (b.furnishings.includes("кровать") && b.furnishings.includes("стол")) || `furnishings=${b.furnishings}`, dims: (d) => d.height > 2.2 || `room ${d.height} m tall` },
  { prompt: "Кухня 3 на 4 метра", kind: "room", plan: (b) => b.furnishings.includes("кухонный гарнитур") || `furnishings=${b.furnishings}` },
  { prompt: "Три деревянных стула", kind: "furniture", plan: (b) => b.copies === 3 || `copies=${b.copies}` },
];

for (const item of CASES) {
  const { blueprint } = planFor(item.prompt);
  if (item.kind) check(`${item.prompt}: kind`, blueprint.kind === item.kind, `got ${blueprint.kind}`);
  if (item.plan) {
    const verdict = item.plan(blueprint);
    check(`${item.prompt}: plan`, verdict === true, verdict === true ? "" : verdict);
  }
  const concept = buildFromPlan(planFor(item.prompt).blueprint);
  if (item.dims) {
    const verdict = item.dims(concept.dimensions);
    check(`${item.prompt}: size`, verdict === true, verdict === true ? "" : verdict);
  }
  const report = matchParts(planFor(item.prompt).blueprint, concept.parts);
  check(`${item.prompt}: has what was asked`, report.missing.length === 0, report.missing.join(", "));
  check(`${item.prompt}: quality`, report.quality >= 0.85, String(report.quality));
}

/* ---------------- AI vs parametric choice ---------------- */

function fakeAI(parts: ModelPart[], plan: Blueprint, score = 0.9): AIGeometryResult {
  return {
    name: "AI",
    description: "",
    parts,
    score,
    primitives: parts.length,
    issues: [],
    passes: 1,
    match: matchParts(plan, parts),
  };
}

const box = (id: string, name: string, position: [number, number, number], size: [number, number, number], role = "volume") =>
  part(id, name, { shape: "box", role, group: name, position, size, color: "#888888", material: "x" });

{
  // A car the AI forgot the wheels on must not beat the baseline.
  const { blueprint } = planFor("Красный спорткар");
  const baseline = buildFromPlan(planFor("Красный спорткар").blueprint);
  const wheelless = [
    box("a", "Кузов", [0, 0.5, 0], [1.8, 0.6, 4.4]),
    box("b", "Кабина", [0, 1.1, 0], [1.5, 0.5, 2]),
    box("c", "Лобовое стекло", [0, 1.1, 1.02], [1.4, 0.4, 0.02], "window"),
  ];
  const choice = pickBetterGeometry(baseline, fakeAI(wheelless, blueprint), blueprint);
  check("AI car without wheels loses", choice.source === "procedural", choice.reason);
}

{
  // A character the AI built with every named feature wins even when the
  // baseline is tidier — the baseline is a stack of capsules.
  const prompt = "Аниме девушка с длинными волосами";
  const { blueprint } = planFor(prompt);
  const baseline = buildFromPlan(planFor(prompt).blueprint);
  const figure = [
    box("t", "Торс", [0, 1.15, 0], [0.34, 0.5, 0.2]),
    box("p", "Таз", [0, 0.85, 0], [0.32, 0.18, 0.2]),
    box("h", "Голова", [0, 1.52, 0], [0.22, 0.24, 0.22], "head"),
    box("hr", "Волосы", [0, 1.45, -0.06], [0.26, 0.5, 0.18]),
    box("al", "Рука левая", [-0.23, 1.1, 0], [0.08, 0.55, 0.08], "limb"),
    box("ar", "Рука правая", [0.23, 1.1, 0], [0.08, 0.55, 0.08], "limb"),
    box("ll", "Нога левая", [-0.09, 0.4, 0], [0.11, 0.8, 0.11], "limb"),
    box("lr", "Нога правая", [0.09, 0.4, 0], [0.11, 0.8, 0.11], "limb"),
  ];
  const choice = pickBetterGeometry(baseline, fakeAI(figure, blueprint, 0.82), blueprint);
  check("AI character with all features wins", choice.source === "ai", choice.reason);
}

{
  // An AI model fifty times too big is rejected on size.
  const { blueprint } = planFor("Настольная лампа");
  const baseline = buildFromPlan(planFor("Настольная лампа").blueprint);
  const giant = scaleParts(
    [
      box("b", "Основание", [0, 0.02, 0], [0.16, 0.04, 0.16], "foundation"),
      box("s", "Стойка", [0, 0.25, 0], [0.02, 0.42, 0.02], "structure"),
      box("l", "Плафон", [0, 0.48, 0], [0.16, 0.1, 0.16], "light"),
    ],
    50
  );
  const choice = pickBetterGeometry(baseline, fakeAI(giant, blueprint), blueprint);
  check("AI model at the wrong scale loses", choice.source === "procedural", choice.reason);
  check("scaled fake is really huge", dimensionsOf(giant).height > 10);
}

/* ---------------- AI pass budgeting ---------------- */

async function budgetChecks() {
  const prompt = "Красный спорткар";
  const { blueprint } = planFor(prompt);
  const baseline = buildFromPlan(planFor(prompt).blueprint);
  const timeouts: number[] = [];
  const weakModel = {
    name: "Машина",
    parts: [
      { id: "a", name: "Кузов", shape: "box", position: [0, 0.5, 0], size: [1.8, 0.6, 4.4], color: "#c1462f", material: "x" },
      { id: "b", name: "Кабина", shape: "box", position: [0, 1.1, 0], size: [1.5, 0.5, 2], color: "#c1462f", material: "x" },
      { id: "c", name: "Фара", shape: "sphere", position: [0.6, 0.6, 2.2], size: [0.2, 0.15, 0.1], color: "#fff", material: "x" },
      { id: "d", name: "Бампер", shape: "box", position: [0, 0.3, 2.25], size: [1.8, 0.2, 0.1], color: "#222", material: "x" },
    ],
  };
  const request: JsonRequester = async <T>(_system: string, _user: string, options?: { timeoutMs?: number }) => {
    timeouts.push(options?.timeoutMs ?? -1);
    return weakModel as T;
  };

  // Plenty of time: a model missing its wheels gets a repair pass.
  timeouts.length = 0;
  await generateAIGeometry({ prompt, baseline, plan: blueprint, request, deadline: Date.now() + 50_000 });
  check("repair pass runs when time allows", timeouts.length === 2, `calls=${timeouts.length}`);
  check("every call carries a timeout", timeouts.every((ms) => ms > 0 && ms <= 50_000), timeouts.join(","));

  // Ten seconds left: no second pass that would blow the route limit.
  timeouts.length = 0;
  await generateAIGeometry({ prompt, baseline, plan: blueprint, request, deadline: Date.now() + 10_000 });
  check("repair pass skipped near the deadline", timeouts.length === 1, `calls=${timeouts.length}`);
}

budgetChecks().then(() => {
  console.log(`\n${passed} passed, ${failures} failed`);
  if (failures) process.exit(1);
});
