import type { ModelPart, ThreeDConcept } from "@/shared/types";
import { dimensionsOf, primitiveCount, round3, structureFromGroups } from "@/shared/geometry";
import { MAX_PARTS, validateAndRepair } from "@/backend/gen/validate";
import { parsePromptParams } from "@/backend/gen/prompt-params";
import type { Blueprint, ObjectKind } from "@/backend/gen/blueprint";
import { expectationsFor, matchParts, type MatchReport } from "@/backend/gen/match";

/** Supplied by the AI layer so this module stays provider-agnostic. */
export type JsonRequester = <T>(
  system: string,
  user: string,
  options?: { timeoutMs?: number }
) => Promise<T>;

export type AIGeometryResult = {
  name: string;
  description: string;
  parts: ModelPart[];
  /** Structure score — connected, varied, detailed. */
  score: number;
  primitives: number;
  issues: string[];
  passes: number;
  /** How well the parts match what the prompt asked for. */
  match: MatchReport;
};

const GEOMETRY_RULES = `You are Atrion's geometry engine. You design a real 3D object out of primitives.

COORDINATES
- Right-handed, metres. +y is up. The object stands on the ground: the lowest point is y = 0.
- The object is centred on x = 0 and z = 0. +z is the front (the facade / the face).
- Rotations are radians in three.js XYZ euler order.

PRIMITIVES — "size" is ALWAYS the full bounding box [width(x), height(y), depth(z)].
Never treat size as a radius. A cylinder of size [0.4, 2, 0.4] is 0.4 m thick and 2 m tall.
  box      rectangular block
  plane    thin slab — glass, panels, floors
  cylinder pillar, pipe, wheel hub; use "sides" for the segment count
  sphere   ellipsoid — heads, bushes, domes
  cone     apex up — spires, noses, trees
  pyramid  square base, apex up — hip roofs
  prism    triangular prism, ridge along z at the top centre — GABLE ROOFS
  wedge    right-triangle prism rising along +x — ramps, shed roofs
  torus    ring lying flat in the xz plane — tyres, hoops; "hole" sets tube thickness
  capsule  rounded cylinder — arms, legs, bottles
  tube     hollow cylinder; "hole" is the inner/outer radius ratio (0-0.95) — frames, railings

REPETITION — use it instead of writing near-identical parts by hand.
  "repeat": { "count": 6, "step": [2.4, 0, 0] }   // 6 windows, 2.4 m apart along x
  "mirror": "x" | "z" | "xz"                       // mirrored copies across the axes
A part with repeat count 6 and mirror "x" renders 12 instances but costs you one entry.

MATERIAL FIELDS (all optional, 0-1): opacity (glass ~0.4), metalness, roughness, emissive (screens, lamps).

HOW TO BUILD SOMETHING THAT LOOKS RIGHT
1. Start from the main volume and its real proportions, then add sub-volumes, then details.
2. Every part must touch or overlap another part. Nothing floats in the air.
3. Details are what makes it read as a finished model: frames around glass, sills under windows,
   an overhang on a roof, a ridge beam, handles on doors, trim lines, feet under furniture,
   joints between limbs. Put a frame and a sill on every window; never a bare blue rectangle.
4. Push detail parts slightly proud of the surface they sit on (2-5 cm) so they are visible.
5. Vary colour between materials. Use shading for trim rather than one flat colour everywhere.
6. Respect every measurement the user gave. Invent sensible ones for anything they did not say.

OUTPUT — strict JSON, no prose, no markdown fence:
{"name":"...","description":"...","category":"...","parts":[
  {"id":"body","name":"Корпус","shape":"box","position":[0,1.2,0],"size":[3,2.4,2],
   "rotation":[0,0,0],"color":"#d8cbb2","material":"Штукатурка","role":"volume","group":"Объём"}
]}
- id: short, unique, lowercase latin.
- name / description / material / group: the user's language.
- role: one of foundation, volume, roof, wall, window, door, detail, structure, furniture, limb, head, wheel, light.
- group: the section of the structure tree this part belongs to.`;

const EXAMPLE = `Worked example — a desk lamp, 0.45 m tall. Note the frame-plus-glass window pattern
applied to the shade, the repeat used for the vents, and every part touching its neighbour:
{"name":"Настольная лампа","description":"Лампа на круглом основании с гибкой стойкой","category":"product",
"parts":[
{"id":"base","name":"Основание","shape":"cylinder","position":[0,0.015,0],"size":[0.18,0.03,0.18],"rotation":[0,0,0],"color":"#2e3238","material":"Металл","role":"foundation","group":"База","metalness":0.7,"roughness":0.35},
{"id":"stem","name":"Стойка","shape":"cylinder","position":[0,0.19,0],"size":[0.022,0.35,0.022],"rotation":[0,0,0],"color":"#3a4048","material":"Металл","role":"structure","group":"Стойка","metalness":0.7},
{"id":"joint","name":"Шарнир","shape":"sphere","position":[0,0.36,0],"size":[0.05,0.05,0.05],"rotation":[0,0,0],"color":"#22262b","material":"Металл","role":"detail","group":"Стойка"},
{"id":"shade","name":"Плафон","shape":"cone","position":[0,0.4,0.05],"size":[0.16,0.12,0.16],"rotation":[0.5,0,0],"color":"#c94f4f","material":"Крашеный металл","role":"detail","group":"Плафон"},
{"id":"bulb","name":"Лампа","shape":"sphere","position":[0,0.36,0.08],"size":[0.05,0.05,0.05],"rotation":[0,0,0],"color":"#fff2c0","material":"Стекло","role":"light","group":"Плафон","emissive":0.9,"opacity":0.85},
{"id":"vent","name":"Вентиляция","shape":"box","position":[-0.03,0.44,0.02],"size":[0.012,0.02,0.05],"rotation":[0.5,0,0],"color":"#8f2f2f","material":"Металл","role":"detail","group":"Плафон","repeat":{"count":3,"step":[0.03,0,0]}},
{"id":"switch","name":"Выключатель","shape":"box","position":[0.06,0.035,0.05],"size":[0.02,0.01,0.014],"rotation":[0,0,0],"color":"#d8d4cd","material":"Пластик","role":"detail","group":"База"},
{"id":"cable","name":"Провод","shape":"cylinder","position":[0,0.008,-0.12],"size":[0.008,0.008,0.2],"rotation":[1.5708,0,0],"color":"#1c1e22","material":"Резина","role":"detail","group":"База"}
]}`;

/**
 * How much geometry to ask for, and what a finished model of this kind of
 * thing is made of. The kind comes from the head noun of the prompt; every
 * feature the prompt names is listed separately as a hard requirement.
 */
function detailTarget(kind: ObjectKind): { parts: string; note: string } {
  switch (kind) {
    case "landmark":
      return {
        parts: "50-85",
        note: "Foundation and bearing structure, stacked volumes, roof or crown with overhang and ridge, window units (frame + glass + sill) laid out with repeat and mirror, entrance with steps and canopy, gutters, downpipes, trim bands, railings.",
      };
    case "building":
      return {
        parts: "45-75",
        note: "Plinth, storey volumes with floor bands, roof with overhang and ridge, window units of frame + glass + sill via repeat and mirror, entrance with steps and canopy, downpipes, corner trim.",
      };
    case "room":
      return {
        parts: "45-75",
        note: "Floor slab, two or three walls (leave the front open so the inside is visible), skirting and cornice, a window with frame and sill on a wall, a door on a side wall, and every piece of furniture as its own group at real size standing on the floor.",
      };
    case "vehicle":
      return {
        parts: "40-70",
        note: "Lower body, cabin with translucent windscreen and side glass, hood and trunk, wheels as torus tyre + cylinder rim + spokes with mirror, wheel arches, lights with emissive (white front, red rear), bumpers, side mirrors, door seams and handles. Total height must stay within the requested height.",
      };
    case "aircraft":
      return {
        parts: "40-70",
        note: "Fuselage (capsule), wings with ailerons, tailplane and fin, engines or rotors, cockpit glazing, landing gear, navigation lights.",
      };
    case "watercraft":
      return {
        parts: "40-65",
        note: "V-bottom hull, deck, superstructure with windows, railing posts with repeat, mast and sail or funnel, portholes, bow detail.",
      };
    case "character":
      return {
        parts: "40-70",
        note: "Human proportions — the head is about 1/7 of the height. Pelvis, torso, neck, head with eyes, nose, mouth and ears; hair as several overlapping volumes; upper arms, forearms, hands with fingers; thighs, shins, feet; clothing as separate shells slightly larger than the body; joints at shoulders, elbows, knees. Mirror the limbs.",
      };
    case "animal":
      return {
        parts: "35-60",
        note: "Body as overlapping capsules (chest, belly, hips), neck, head with snout, eyes, ears; four legs in three segments with paws; a tail as a tapering chain of segments; any named wings, horns or spikes. The legs must reach the ground.",
      };
    case "robot":
      return {
        parts: "40-70",
        note: "Armoured torso panels, head with emissive visor or eyes, articulated limbs with visible joint cylinders, hands or grippers, feet, panel seams, bolts, antennas and lights with emissive.",
      };
    case "furniture":
      return {
        parts: "30-55",
        note: "Real furniture dimensions. Frame, legs with feet, aprons or rails, the working surface (top, seat, mattress), cushions as rounded boxes, handles and hinges, edge trim.",
      };
    case "appliance":
      return {
        parts: "30-55",
        note: "Real appliance dimensions. Casing with rounded edges, door or lid with seams, glass panels, control panel with buttons or knobs and a small emissive display, vents, feet, the functional parts the object is known for (porthole, slots, nozzle, turret).",
      };
    case "lighting":
      return {
        parts: "25-45",
        note: "Weighted base with switch, stem or jointed arm with joint spheres, shade (cone, tube or sphere) with an emissive bulb inside, cable.",
      };
    case "weapon":
      return {
        parts: "20-40",
        note: "Blade with fuller and tip, guard, grip with wrapping (repeat), pommel. Thin, flat blade — not a box.",
      };
    case "device":
    case "container":
      return {
        parts: "30-55",
        note: "Main body, functional sub-volumes, seams and panel lines, controls, ports, feet or stand, screens or lenses with emissive, fasteners.",
      };
    default:
      return {
        parts: "35-60",
        note: "Main volume, sub-volumes, then a layer of fine detail: seams, trim, joints, fasteners, and a distinct part for every feature the prompt names.",
      };
  }
}

function describeBaseline(baseline: ThreeDConcept): string {
  const groups = (baseline.structure ?? structureFromGroups(baseline.parts))
    .map((group) => `${group.label} (${group.partIds.length})`)
    .join(", ");
  return `A parametric baseline already exists for reference — beat it, do not copy it.
Baseline: ${baseline.dimensions.width} x ${baseline.dimensions.depth} x ${baseline.dimensions.height} m, sections: ${groups}.`;
}

type RawGeometry = {
  name?: unknown;
  description?: unknown;
  parts?: unknown;
};

/** Below this much time left, a second pass is not worth starting. */
const REPAIR_MIN_MS = 18_000;

/**
 * Ask the model to author the geometry itself, then validate and repair it.
 * Runs a second critique pass when the first attempt is structurally weak or
 * misses something the prompt asked for — but only if the deadline allows.
 */
export async function generateAIGeometry(options: {
  prompt: string;
  answers?: { question: string; answer: string }[];
  baseline: ThreeDConcept;
  plan: Blueprint;
  request: JsonRequester;
  /** Epoch ms by which the whole generation has to be done. */
  deadline?: number;
  /** Skip the repair pass when latency matters more than quality. */
  singlePass?: boolean;
}): Promise<AIGeometryResult | null> {
  const { prompt, baseline, plan, request } = options;
  const answers = options.answers ?? [];
  const params = parsePromptParams(prompt);
  const target = detailTarget(plan.kind);
  const expectations = expectationsFor(plan);
  const remaining = () => (options.deadline ? options.deadline - Date.now() : Infinity);

  const system = `${GEOMETRY_RULES}

DETAIL BUDGET for a ${plan.kind}: author ${target.parts} parts. ${target.note}
Repeat and mirror multiply those into more rendered instances — use them.
Hard limit: ${MAX_PARTS} entries in "parts".

NAMING — the model is checked automatically: name every part after what it is
(e.g. "Колесо", "Крыша", "Голова", "Плафон"), so each required feature is findable by name.

${EXAMPLE}`;

  const measurements = [
    params.width ? `width ${params.width} m` : null,
    params.depth ? `depth ${params.depth} m` : null,
    params.height ? `height ${params.height} m` : null,
    params.floors ? `${params.floors} floors` : null,
    params.roof ? `roof ${params.roof}` : null,
    params.material ? `material ${params.material}` : null,
    params.color ? `main colour ${params.color}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  const checklist = expectations.length
    ? `REQUIRED — the result is rejected if any of these is missing:\n${expectations
        .map((item) => `- ${item.en}${item.named ? " (asked for by the user)" : ""}`)
        .join("\n")}`
    : "";

  const user = `Design this object: ${prompt}
What it is: a ${plan.kind}. Overall size about ${round3(plan.width)} (x) × ${round3(plan.length)} (z) × ${round3(plan.height)} (y) m${plan.copies > 1 ? `, ${plan.copies} copies side by side` : ""}.
${measurements ? `Parsed from the request — honour these exactly: ${measurements}.` : "No explicit measurements were given; use realistic ones close to the size above."}
${checklist}
${answers.length ? `Clarifications:\n${answers.map((item) => `- ${item.question}: ${item.answer}`).join("\n")}` : ""}
${describeBaseline(baseline)}

Return the JSON object now.`;

  let best: AIGeometryResult | null = null;
  let passes = 0;

  try {
    const raw = await request<RawGeometry>(system, user, {
      timeoutMs: Math.max(8_000, Math.min(40_000, remaining() - 4_000)),
    });
    passes++;
    best = toResult(raw, baseline, plan, passes);
  } catch (error) {
    console.warn("AI geometry pass 1 failed", error instanceof Error ? error.name : error);
    return null;
  }

  if (!best) return null;
  const good = best.score >= 0.78 && best.match.missing.length === 0;
  if (options.singlePass || good || remaining() < REPAIR_MIN_MS) return best;

  // Second pass: hand the model its own output plus the concrete defects.
  try {
    const critique = buildCritique(best, plan);
    const repaired = await request<RawGeometry>(
      `${GEOMETRY_RULES}

You are fixing geometry you already produced. Return the COMPLETE corrected parts list,
not a patch. Keep everything that works, fix only what is listed as wrong, and add the
missing detail. Never return fewer parts than you were given.`,
      `Original request: ${prompt}

Your current model "${best.name}" has ${best.parts.length} parts (${best.primitives} rendered instances).
Problems to fix:
${critique}

Current parts:
${JSON.stringify(best.parts.map(compactPart))}

Return the corrected JSON object now.`,
      { timeoutMs: Math.max(6_000, remaining() - 4_000) }
    );
    passes++;
    const second = toResult(repaired, baseline, plan, passes);
    if (second && second.match.quality > best.match.quality) return second;
  } catch (error) {
    console.warn("AI geometry repair pass failed", error instanceof Error ? error.name : error);
  }

  return best;
}

function buildCritique(result: AIGeometryResult, plan: Blueprint): string {
  const notes: string[] = [];
  const dims = dimensionsOf(result.parts);
  const span = Math.max(dims.width, dims.height, dims.depth);

  if (result.match.missing.length) {
    notes.push(
      `- MISSING features the user asked for: ${result.match.missing.join(", ")}. Add each as named parts attached to the body.`
    );
  }
  if (result.match.sizeFit < 0.7) {
    notes.push(
      `- Wrong size: the model is ${dims.width} × ${dims.depth} × ${dims.height} m but should be about ${round3(plan.width)} × ${round3(plan.length)} × ${round3(plan.height)} m (x × z × y).`
    );
  }
  if (result.issues.length) notes.push(...result.issues.map((issue) => `- ${issue}`));
  if (result.score < 0.6) {
    notes.push(
      "- The parts do not read as one connected object. Move every part so it touches or overlaps a neighbour."
    );
  }
  if (result.primitives < 30) {
    notes.push(
      `- Only ${result.primitives} rendered primitives — too plain. Add frames, sills, trim, joints, handles and seams, and use repeat for anything that occurs in a row.`
    );
  }
  const shapes = new Set(result.parts.map((item) => item.shape));
  if (shapes.size <= 2) {
    notes.push(
      `- The model uses only ${[...shapes].join(" and ")}. Use the other primitives where they fit — prism or pyramid for roofs, cylinder and capsule for round parts, tube for frames and railings.`
    );
  }
  const oversized = result.parts.filter((item) => Math.max(...item.size) > span * 1.02);
  if (oversized.length) {
    notes.push(
      `- These parts are as large as the whole model and swallow it: ${oversized
        .slice(0, 5)
        .map((item) => item.id)
        .join(", ")}.`
    );
  }
  if (!notes.length) notes.push("- Add another layer of fine detail and tighten the proportions.");
  return notes.join("\n");
}

/** Trim a part down to the fields worth spending tokens on in the repair pass. */
function compactPart(item: ModelPart) {
  return {
    id: item.id,
    name: item.name,
    shape: item.shape,
    position: item.position,
    size: item.size,
    ...(item.rotation.some(Boolean) ? { rotation: item.rotation } : {}),
    color: item.color,
    material: item.material,
    role: item.role,
    group: item.group,
    ...(item.repeat ? { repeat: item.repeat } : {}),
    ...(item.mirror ? { mirror: item.mirror } : {}),
    ...(item.opacity !== undefined ? { opacity: item.opacity } : {}),
    ...(item.emissive !== undefined ? { emissive: item.emissive } : {}),
  };
}

function toResult(
  raw: RawGeometry,
  baseline: ThreeDConcept,
  plan: Blueprint,
  passes: number
): AIGeometryResult | null {
  if (!raw || typeof raw !== "object") return null;

  // Rescale against the planned size, not the baseline's: the baseline can be
  // the thing that is wrong.
  const targetMaxSize = Math.max(plan.width, plan.length, plan.height) * Math.max(1, plan.copies);
  const repaired = validateAndRepair(raw.parts, { targetMaxSize, clusters: plan.copies });
  if (repaired.parts.length < 4) return null;

  return {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 70) : baseline.name,
    description:
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim().slice(0, 400)
        : baseline.description,
    parts: repaired.parts,
    score: repaired.score,
    primitives: repaired.primitives,
    issues: repaired.issues,
    passes,
    match: matchParts(plan, repaired.parts),
  };
}

/**
 * Kinds the parametric builder only sketches. For these the AI gets more slack:
 * a capsule girl that scores well on tidiness is still a capsule girl.
 */
const WEAK_PROCEDURAL = new Set<ObjectKind>(["character", "animal", "robot", "product", "aircraft", "watercraft"]);

export type GeometryChoice = {
  concept: ThreeDConcept;
  source: "ai" | "procedural";
  /** Match report of the geometry that shipped. */
  match: MatchReport;
  /** Match report of the parametric baseline, for the log. */
  baseMatch: MatchReport;
  aiMatch?: MatchReport;
  reason: string;
};

/**
 * Choose between AI-authored geometry and the parametric baseline by overall
 * quality — tidy geometry *and* the things the prompt asked for. The AI reads
 * the wording, so it wins near-ties, and it wins outright when it covers
 * features the baseline is missing.
 */
export function pickBetterGeometry(
  baseline: ThreeDConcept,
  ai: AIGeometryResult | null,
  plan: Blueprint
): GeometryChoice {
  const baseMatch = matchParts(plan, baseline.parts);
  if (!ai) {
    return { concept: baseline, source: "procedural", match: baseMatch, baseMatch, reason: "AI недоступен" };
  }

  const aiMatch = ai.match;
  const margin = WEAK_PROCEDURAL.has(plan.kind) ? 0.1 : 0.04;
  const coversMore = aiMatch.coverage > baseMatch.coverage + 0.15;
  const usable = ai.score >= 0.45 && aiMatch.sizeFit >= 0.3;
  const wins = usable && (aiMatch.quality >= baseMatch.quality - margin || coversMore);

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const reason = wins
    ? `AI: качество ${pct(aiMatch.quality)} против ${pct(baseMatch.quality)}, соответствие запросу ${pct(aiMatch.coverage)} против ${pct(baseMatch.coverage)}`
    : !usable
      ? `AI-геометрия отклонена: ${ai.score < 0.45 ? "развалилась на части" : "не тот размер"}`
      : `Параметрическая модель лучше: ${pct(baseMatch.quality)} против ${pct(aiMatch.quality)}`;

  if (!wins) {
    return { concept: baseline, source: "procedural", match: baseMatch, baseMatch, aiMatch, reason };
  }

  const dims = dimensionsOf(ai.parts);
  return {
    concept: {
      ...baseline,
      name: ai.name,
      description: ai.description,
      parts: ai.parts,
      structure: structureFromGroups(ai.parts),
      dimensions: dims,
      source: "ai",
      requirements: [
        `Габариты: ${dims.width} × ${dims.depth} × ${dims.height} м`,
        `Детализация: ${primitiveCount(ai.parts)} примитивов`,
        ...baseline.requirements.slice(2),
      ],
    },
    source: "ai",
    match: aiMatch,
    baseMatch,
    aiMatch,
    reason,
  };
}
