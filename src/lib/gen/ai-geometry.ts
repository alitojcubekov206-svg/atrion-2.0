import type { ModelPart, ThreeDConcept } from "@/lib/types";
import { dimensionsOf, primitiveCount, structureFromGroups } from "@/lib/gen/kit";
import { MAX_PARTS, scoreParts, validateAndRepair } from "@/lib/gen/validate";
import { parsePromptParams } from "@/lib/gen/prompt-params";

/** Supplied by the AI layer so this module stays provider-agnostic. */
export type JsonRequester = <T>(system: string, user: string) => Promise<T>;

export type AIGeometryResult = {
  name: string;
  description: string;
  parts: ModelPart[];
  score: number;
  primitives: number;
  issues: string[];
  passes: number;
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
 * How much geometry to ask for. The scale class is the only thing that changes
 * the budget — what the object actually *is* comes from the prompt itself, so
 * this never pushes the model toward a stock shape.
 */
function detailTarget(category: string): { parts: string; note: string } {
  switch (category) {
    case "landmark":
      return {
        parts: "50-85",
        note: "Foundation and bearing structure, stacked volumes, roof or crown with overhang and ridge, window units (frame + glass + sill) laid out with repeat and mirror, entrance with steps and canopy, gutters, downpipes, trim bands, railings.",
      };
    case "structure":
      return {
        parts: "45-75",
        note: "Plinth, storey volumes with floor bands, roof with overhang and ridge, window units of frame + glass + sill via repeat and mirror, entrance with steps and canopy, downpipes, corner trim.",
      };
    case "vehicle":
      return {
        parts: "40-70",
        note: "Chassis, cabin, front and rear volumes, wheels as torus tyre + cylinder rim + spokes with mirror, translucent glazing, lights with emissive, bumpers, mirrors, handles, shut lines.",
      };
    case "furniture":
      return {
        parts: "35-60",
        note: "Main mass, joints and limbs or legs with feet, cushions or panels, edge trim, fasteners, and whatever the wording adds — every named feature gets its own parts.",
      };
    case "handheld":
    case "micro":
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

/**
 * Ask the model to author the geometry itself, then validate and repair it.
 * Runs a second critique pass when the first attempt scores poorly, because a
 * single pass reliably produces floating or disconnected parts.
 */
export async function generateAIGeometry(options: {
  prompt: string;
  answers?: { question: string; answer: string }[];
  baseline: ThreeDConcept;
  category: string;
  request: JsonRequester;
  /** Skip the repair pass when latency matters more than quality. */
  singlePass?: boolean;
}): Promise<AIGeometryResult | null> {
  const { prompt, baseline, category, request } = options;
  const answers = options.answers ?? [];
  const params = parsePromptParams(prompt);
  const target = detailTarget(category);

  const system = `${GEOMETRY_RULES}

DETAIL BUDGET for a "${category}": author ${target.parts} parts. ${target.note}
Repeat and mirror multiply those into more rendered instances — use them.
Hard limit: ${MAX_PARTS} entries in "parts".

${EXAMPLE}`;

  const measurements = [
    params.width ? `width ${params.width} m` : null,
    params.depth ? `depth ${params.depth} m` : null,
    params.height ? `height ${params.height} m` : null,
    params.floors ? `${params.floors} floors` : null,
    params.count ? `count ${params.count}` : null,
    params.roof ? `roof ${params.roof}` : null,
    params.material ? `material ${params.material}` : null,
    params.color ? `main colour ${params.color}` : null,
    params.features.size ? `features: ${[...params.features].join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  const user = `Design this object: ${prompt}

${measurements ? `Parsed from the request — honour these exactly: ${measurements}.` : "No explicit measurements were given; choose realistic ones."}
${answers.length ? `Clarifications:\n${answers.map((item) => `- ${item.question}: ${item.answer}`).join("\n")}` : ""}
${describeBaseline(baseline)}

Return the JSON object now.`;

  let best: AIGeometryResult | null = null;
  let passes = 0;

  try {
    const raw = await request<RawGeometry>(system, user);
    passes++;
    best = toResult(raw, baseline, passes);
  } catch (error) {
    console.warn("AI geometry pass 1 failed", error instanceof Error ? error.name : error);
    return null;
  }

  if (!best) return null;
  if (options.singlePass || best.score >= 0.78) return best;

  // Second pass: hand the model its own output plus the concrete defects.
  try {
    const critique = buildCritique(best);
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

Return the corrected JSON object now.`
    );
    passes++;
    const second = toResult(repaired, baseline, passes);
    if (second && second.score > best.score) return second;
  } catch (error) {
    console.warn("AI geometry repair pass failed", error instanceof Error ? error.name : error);
  }

  return best;
}

function buildCritique(result: AIGeometryResult): string {
  const notes: string[] = [];
  const dims = dimensionsOf(result.parts);
  const span = Math.max(dims.width, dims.height, dims.depth);

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
  passes: number
): AIGeometryResult | null {
  if (!raw || typeof raw !== "object") return null;

  const targetMaxSize = Math.max(
    baseline.dimensions.width,
    baseline.dimensions.height,
    baseline.dimensions.depth
  );
  const repaired = validateAndRepair(raw.parts, { targetMaxSize });
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
  };
}

/**
 * Choose between AI-authored geometry and the parametric baseline.
 * The AI follows the wording more closely, so it wins ties — but it never
 * ships when it is clearly the worse model.
 */
export function pickBetterGeometry(
  baseline: ThreeDConcept,
  ai: AIGeometryResult | null
): { concept: ThreeDConcept; source: "ai" | "procedural"; aiScore: number; baseScore: number } {
  const baseScore = scoreParts(baseline.parts);
  if (!ai) return { concept: baseline, source: "procedural", aiScore: 0, baseScore };

  const wins = ai.score >= 0.45 && ai.score >= baseScore * 0.9;
  if (!wins) return { concept: baseline, source: "procedural", aiScore: ai.score, baseScore };

  return {
    concept: {
      ...baseline,
      name: ai.name,
      description: ai.description,
      parts: ai.parts,
      structure: structureFromGroups(ai.parts),
      dimensions: dimensionsOf(ai.parts),
      source: "ai",
      requirements: [
        `Габариты: ${dimensionsOf(ai.parts).width} × ${dimensionsOf(ai.parts).depth} × ${dimensionsOf(ai.parts).height} м`,
        `Детализация: ${primitiveCount(ai.parts)} примитивов`,
        ...baseline.requirements.slice(2),
      ],
    },
    source: "ai",
    aiScore: ai.score,
    baseScore,
  };
}
