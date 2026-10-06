/**
 * Regression check for the 3D generator — every case here was a real bug.
 * Exits non-zero when any expectation fails, so it can gate a deploy.
 *
 *   npx tsx scripts/gen-check.ts
 */
import { buildFromPlan, planFor } from "@/backend/procedural-3d";
import { matchParts } from "@/backend/gen/match";
import { generateAIGeometry, pickBetterGeometry, type JsonRequester } from "@/backend/gen/ai-geometry";
import type { Blueprint } from "@/backend/gen/blueprint";
import { interiorCutHeight } from "@/shared/geometry";
import { sanitizeParts } from "@/backend/gen/validate";

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

  // A house with furniture is hollow, so the section view has something to show.
  { prompt: "Двухэтажный дом с мебелью", kind: "building", plan: (b) => b.furnishings.length >= 3 || `furnishings=${b.furnishings}` },
  { prompt: "Дом с диваном, кроватью и столом", kind: "building", plan: (b) => (b.furnishings.includes("диван") && b.furnishings.includes("кровать")) || `furnishings=${b.furnishings}` },
];

/* ---------------- generated meshes keep their texture through validation ---------------- */
{
  const tri = { position: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], index: [0, 1, 2, 2, 1, 3], uv: [0, 0, 1, 0, 0, 1, 1, 1], texture: "data:image/jpeg;base64,AAAA" };
  const [kept] = sanitizeParts([{ id: "scan", name: "Модель", shape: "mesh", position: [0, 0.5, 0], size: [1, 1, 0.01], mesh: tri }]);
  check("mesh keeps its index", kept?.mesh?.index?.length === 6, JSON.stringify(kept?.mesh?.index));
  check("mesh keeps uv and texture", kept?.mesh?.uv?.length === 8 && kept?.mesh?.texture === tri.texture);
  const [broken] = sanitizeParts([{ id: "bad", name: "x", shape: "mesh", position: [0, 0, 0], size: [1, 1, 1], mesh: { ...tri, index: [0, 1, 9] } }]);
  check("an out-of-range index is dropped", broken?.mesh?.index === undefined);
}

/* ---------------- section view opens covered interiors only ---------------- */
for (const [prompt, expected] of [
  ["Двухэтажный дом с мебелью", true],
  ["Дом с диваном, кроватью и столом", true],
  ["Двухэтажный дом 12×9 м", false],
  ["Уютная спальня 4×5 м с кроватью и столом", false],
  ["Красный спорткар", false],
] as const) {
  const cut = interiorCutHeight(buildFromPlan(planFor(prompt).blueprint));
  check(
    `${prompt}: section view ${expected ? "opens" : "stays off"}`,
    expected ? cut !== null && cut > 1 && cut < 3 : cut === null,
    String(cut)
  );
}

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

/* ---------------- AI geometry: ships when valid, missing named parts get repaired ---------------- */

type RawPart = { id: string; name: string; shape: string; position: number[]; size: number[]; color: string; material: string };
const raw = (id: string, name: string, position: number[], size: number[], shape = "box"): RawPart => ({
  id,
  name,
  shape,
  position,
  size,
  color: "#c1462f",
  material: "x",
});

const carBody = [
  raw("body", "Кузов", [0, 0.5, 0], [1.8, 0.6, 4.4]),
  raw("cabin", "Кабина", [0, 1.05, -0.2], [1.5, 0.5, 2]),
  raw("glass", "Лобовое стекло", [0, 1.05, 0.81], [1.4, 0.4, 0.02]),
];
const wheel = (id: string, x: number, z: number) => raw(id, "Колесо", [x, 0.33, z], [0.25, 0.66, 0.66], "cylinder");
const carWithWheels = [...carBody, wheel("w1", 0.8, 1.4), wheel("w2", -0.8, 1.4), wheel("w3", 0.8, -1.4), wheel("w4", -0.8, -1.4)];

async function aiChecks() {
  const prompt = "Красный спорткар с колёсами";
  const { blueprint } = planFor(prompt);
  const baseline = buildFromPlan(planFor(prompt).blueprint);

  // The brief lists what the user named, outside the size budget.
  let brief = "";
  const capture: JsonRequester = async <T>(system: string, user: string) => {
    brief = system + "\n" + user;
    return { parts: carWithWheels } as T;
  };
  await generateAIGeometry({ prompt, baseline, plan: blueprint, category: blueprint.sizeClass, request: capture, singlePass: true });
  check("brief lists the named wheels", /Components the user named[\s\S]*wheels/.test(brief), brief.slice(-400));
  const budget = brief.split("DETAIL BUDGET")[1]?.split("Hard limit:")[0] ?? "";
  check("size budget names no components", !/wheels|roof|window/i.test(budget), budget);

  // Wheels forgotten: the defect is named, a repair pass runs and its fix is kept.
  const calls: string[] = [];
  const repairing: JsonRequester = async <T>(_system: string, user: string) => {
    calls.push(user);
    return { parts: calls.length === 1 ? carBody : carWithWheels } as T;
  };
  const repaired = await generateAIGeometry({ prompt, baseline, plan: blueprint, category: blueprint.sizeClass, request: repairing });
  check("missing wheels trigger one repair pass", calls.length === 2, `calls=${calls.length}`);
  check("repair request names the missing wheels", /Нет запрошенного элемента: колёса/.test(calls[1] ?? ""), calls[1]?.slice(0, 300));
  check("repaired model keeps its wheels", (repaired?.match?.missing.length ?? 1) === 0, repaired?.match?.missing.join(","));

  // Still missing after the repair: the AI model ships anyway, with the gap reported.
  const stubborn: JsonRequester = async <T>() => ({ parts: carBody }) as T;
  const unrepaired = await generateAIGeometry({ prompt, baseline, plan: blueprint, category: blueprint.sizeClass, request: stubborn });
  const choice = pickBetterGeometry(baseline, unrepaired, blueprint);
  check("valid AI geometry ships even when incomplete", choice.source === "ai", choice.source);
  check("the gap is reported", choice.match?.missing.includes("колёса") ?? false, choice.match?.missing.join(","));

  // No AI result: the parametric model is the labelled fallback.
  const fallback = pickBetterGeometry(baseline, null, blueprint);
  check("no AI result falls back to the parametric model", fallback.source === "procedural");
  check("fallback has the named wheels", fallback.match?.missing.length === 0, fallback.match?.missing.join(","));
}

aiChecks().then(() => {
  console.log(`\n${passed} passed, ${failures} failed`);
  if (failures) process.exit(1);
});
