import type { ModelPart, ThreeDConcept } from "@/shared/types";
import { dimensionsOf, primitiveCount, structureFromGroups } from "@/shared/geometry";
import { isSupportedPrimitive, MAX_PARTS, scoreParts, validateAndRepair } from "@/backend/gen/validate";
import { parsePromptParams } from "@/backend/gen/prompt-params";
import { planFromPrompt, type Blueprint } from "@/backend/gen/blueprint";
import { expectationsFor, matchParts, missingNamed, type MatchReport } from "@/backend/gen/match";

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
  /** Diagnostics: requested features found by name, and size against the plan. Never used to reject the model. */
  match?: MatchReport;
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
2. Connect components where the object's construction requires it. Preserve intentional gaps,
   separate objects, moving joints and exploded layouts when requested; do not glue them together.
3. Choose details from the requested object and its function. Preserve its defining silhouette,
   proportions, orientation and named components before adding detail. Architectural parts belong
   only on objects that need them; vehicle classes do not imply wheels or a road-car chassis.
   Do not add unrelated parts merely to reach a part-count target.
4. Push detail parts slightly proud of the surface they sit on (2-5 cm) so they are visible.
5. Vary colour between materials. Use shading for trim rather than one flat colour everywhere.
6. Respect every measurement the user gave. Overall height includes base, body and top together;
   do not give the body the full height and then add a top outside that height.
7. Count requested components exactly. repeat.count includes the original instance.
   repeat.step is linear translation, not a circular array; place radial components separately.
8. Check that visible surfaces (windows, controls, trim) are not entirely hidden inside opaque volumes.
   Main sub-volumes must meet at sensible joints; do not bury an entire nose or lid inside the body.

OUTPUT — strict JSON, no prose, no markdown fence:
{"name":"...","description":"...","category":"...","parts":[
  {"id":"body","name":"Корпус","shape":"box","position":[0,1.2,0],"size":[3,2.4,2],
   "rotation":[0,0,0],"color":"#d8cbb2","material":"Штукатурка","role":"volume","group":"Объём"}
]}
- id: short, unique, lowercase latin.
- name / description / material / group: the user's language.
- role: one of foundation, volume, roof, wall, window, door, detail, structure, furniture, limb, head, wheel, light.
- group: the section of the structure tree this part belongs to.`;

const EXAMPLE = `Schema example only — a desk lamp, 0.45 m tall. Its parts and proportions are specific to
a lamp; do not transfer them to another requested object. Note the repeat and connected joints:
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
  // Scale controls capacity, never the object's anatomy or required components.
  // A target range, not a ceiling: "up to N, use fewer" produced blockouts.
  const budgets:Record<string,string>={landmark:"70-140",structure:"60-120",vehicle:"55-100",furniture:"40-80",handheld:"35-70",micro:"30-60"};
  return {
    parts:Object.hasOwn(budgets,category)?budgets[category]:"45-90",
    note:"This is a complexity target, not a component list or an object type. Identify the requested object from the user's description and clarifications. Deliver a finished, realistic model, not a blockout: get its real structure and proportions right, then model the secondary forms, joints, edges and functional elements that make it recognisable at a glance, each as its own part placed exactly where it belongs. Prefer several well-placed smaller parts over one large box, and use repeat and mirror for anything that occurs many times. Never invent components the object does not have.",
  };
}

type RawGeometry = {
  name?: unknown;
  description?: unknown;
  parts?: unknown;
};

/**
 * Ask the model to author the geometry itself, then validate and repair it.
 * Corrects reported validation issues, without ranking meaning by part count.
 */
export async function generateAIGeometry(options: {
  prompt: string;
  answers?: { question: string; answer: string }[];
  baseline: ThreeDConcept;
  category: string;
  request: JsonRequester;
  /** The parsed prompt; derived from `prompt` when not given. */
  plan?: Blueprint;
  /** Skip the repair pass when latency matters more than quality. */
  singlePass?: boolean;
  /** Per-request token: the same words should not give the same design every time. */
  variation?: string;
}): Promise<AIGeometryResult | null> {
  const { prompt, baseline, category, request } = options;
  const answers = options.answers ?? [];
  const params = parsePromptParams(prompt);
  const target = detailTarget(category);
  const plan = options.plan ?? planFromPrompt(prompt);
  const anatomy = plan.kind === "character" ? `HUMAN ANATOMY: preserve the requested age/style. For an adult, head height is about 1/7.5 of overall height, hips at about half height, shoulders below the neck. Shape chest, waist and pelvis separately. Place ears on skull sides, visible eyes/nose/lips on +z, hair above/behind the face. Connect tapered upper/lower limbs at knees and elbows, feet on the floor, hands and fingers at wrists. Separate skin, clothing, hair and footwear materials. No animal muzzle on a human. For editable motion use groups Тело, Ноги, Руки, Голова, Волосы, Хвост; name upper leg Бедро, shoulder Плечо, knee Колено and elbow Локоть. Requested proportions and missing limbs take priority.` : plan.kind === "animal" ? `ANIMAL ANATOMY: identify the actual requested species before drawing. Cats, dogs, horses, rabbits, birds and fish have different silhouettes, limb proportions, faces, ears and tails. Use a connected shaped torso, species-appropriate neck/head/muzzle and articulated legs with paws or hooves. Put eyes and muzzle visibly on the head, ears connected to the skull, tail connected at the rear. Do not substitute one generic capsule for every species or add human hands to an ordinary quadruped. For editable motion use groups Тело, Ноги, Голова, Хвост, Крылья; name upper leg Бедро and knee Колено. Obey explicit missing limbs/features.` : "";
  // Only what the user named outright — a class of object never implies parts.
  const named = expectationsFor(plan).filter((item) => item.named);

  const system = `${GEOMETRY_RULES}

${anatomy}

DETAIL BUDGET for scale class "${category}": approximately ${target.parts} parts. ${target.note}
Repeat and mirror multiply those into more rendered instances — use them.
Hard limit: ${MAX_PARTS} entries in "parts".

NAMING: name each part after what it is (e.g. "Колесо", "Крыша", "Плафон"), so every
component the user named can be found by name when the model is checked.

${EXAMPLE}`;

  const measurements = [
    params.width ? `width ${params.width} m` : null,
    params.depth ? `depth ${params.depth} m` : null,
    params.height ? `height ${params.height} m` : null,
    params.size ? `longest side ${params.size} m` : null,
  ]
    .filter(Boolean)
    .join("; ");

  // "3 этажный дом" is one building; the model must not read the number as a count of houses.
  const storeys = plan.kind === "building" && plan.copies <= 1 && plan.floors > 1
    ? `This is ONE building with ${plan.floors} storeys stacked vertically, not ${plan.floors} separate buildings.`
    : "";
  const user = `Design this object: ${prompt}
${storeys}

${measurements ? `Parsed from the request — honour these exactly: ${measurements}.` : "No explicit measurements were given; choose realistic ones."}
${answers.length ? `Clarifications:\n${answers.map((item) => `- ${item.question}: ${item.answer}`).join("\n")}` : ""}
${named.length ? `Components the user named — each must be present as its own named parts:\n${named.map((item) => `- ${item.en}`).join("\n")}` : ""}
The request and explicit measurements take priority. No template defines the requested object's parts.
${options.variation ? `Design variation ${options.variation}: where the request leaves something open (style, proportions, colours, secondary features), make your own distinct choices instead of the most generic version.` : ""}

Return the JSON object now.`;

  let best: AIGeometryResult | null = null;
  let passes = 0;
  let invalidReason = "No usable parts were returned.";

  try {
    passes++;
    const raw = await request<RawGeometry>(system, user);
    invalidReason = invalidGeometryReason(raw) ?? invalidReason;
    best = toResult(raw, baseline, passes, params, plan);
  } catch (error) {
    console.warn("AI geometry pass 1 failed", error instanceof Error ? error.name : "UnknownError");
    // A malformed response can be regenerated. Auth, rate limits and transport
    // failures are handled by the provider layer, not another geometry request.
    if (!(error instanceof SyntaxError)) return null;
    invalidReason = "The response was empty or invalid JSON. Return one complete JSON object.";
  }

  if (options.singlePass || (best && !best.issues.length)) return best;

  // Second pass: hand the model its own output plus the concrete defects.
  try {
    const critique = best ? buildCritique(best) : invalidReason;
    passes++;
    const repaired = await request<RawGeometry>(
      `${GEOMETRY_RULES}

You are fixing geometry you already produced. Return the COMPLETE corrected parts list,
not a patch. Keep the requested silhouette, dimensions, materials and intentional spacing.
Fix only the reported validation issues. Remove redundant parts when necessary.
Part count and primitive variety are not quality targets.`,
      `${user}

${best ? `Your current model has ${best.parts.length} parts (${best.primitives} rendered instances).` : "The first response failed schema validation. Rebuild the requested object with valid primitives."}
Problems to fix:
${critique}

${best ? `Current parts:\n${JSON.stringify(best.parts.map(compactPart))}` : "Every part needs a supported shape, numeric position and positive size."}

Return the corrected JSON object now.`
    );
    const second = toResult(repaired, baseline, passes, params, plan);
    if (second && (!best || second.issues.length < best.issues.length)) return second;
  } catch (error) {
    console.warn("AI geometry repair pass failed", error instanceof Error ? error.name : "UnknownError");
  }

  return best ? {...best, passes} : null;
}

function buildCritique(result: AIGeometryResult): string {
  return result.issues.map((issue) => `- ${issue}`).join("\n");
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
    ...(item.metalness !== undefined ? { metalness: item.metalness } : {}),
    ...(item.roughness !== undefined ? { roughness: item.roughness } : {}),
  };
}

function invalidGeometryReason(raw: RawGeometry): string | null {
  if (!raw || typeof raw !== "object") return "Expected a JSON object with a parts array.";
  // A missing shape/size must not silently become a unit box. This boundary is
  // deliberately stricter than the legacy saved-concept normalizer.
  const vector = (value: unknown, positive = false, limit=400): boolean => Array.isArray(value) && value.length === 3 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= limit && (!positive || n >= 0.01));
  if (!Array.isArray(raw.parts) || !raw.parts.length || raw.parts.length > MAX_PARTS) return `parts must contain 1-${MAX_PARTS} entries.`;
  for (const [index, part] of raw.parts.entries()) {
    const path = `parts[${index}]`;
    if (!part || typeof part !== "object") return `${path} must be an object.`;
    if (!isSupportedPrimitive(part.shape)) return `${path}.shape must be a supported primitive.`;
    if (!vector(part.size, true)) return `${path}.size must have three finite dimensions between 0.01 and 400 metres.`;
    if (!vector(part.position)) return `${path}.position must have three finite coordinates within +/-400 metres.`;
    if (part.rotation !== undefined && !vector(part.rotation, false, Math.PI * 4)) return `${path}.rotation must have three bounded angles in radians.`;
    if (part.repeat !== undefined && (!part.repeat || !Number.isInteger(part.repeat.count) || part.repeat.count < 1 || part.repeat.count > 64 || !vector(part.repeat.step) ||
      (part.repeat.rotationStep !== undefined && !vector(part.repeat.rotationStep, false, Math.PI * 2)))) return `${path}.repeat needs count 1-64, a numeric step vector and optional rotationStep in radians.`;
    if (part.mirror !== undefined && !["x", "z", "xz"].includes(part.mirror)) return `${path}.mirror must be x, z or xz.`;
  }
  return null;
}

function toResult(
  raw: RawGeometry,
  baseline: ThreeDConcept,
  passes: number,
  measurements: {width?:number;height?:number;depth?:number;size?:number},
  plan: Blueprint
): AIGeometryResult | null {
  if (invalidGeometryReason(raw)) return null;

  // Baseline dimensions are estimates, not measurements. Do not shrink the AI
  // model to them or merge separate requested objects by bounding-box proximity.
  const repaired = validateAndRepair(raw.parts, { preserveLayout: true });
  if (!repaired.parts.length) return null;
  const actual = dimensionsOf(repaired.parts);
  for(const part of repaired.parts){
    if(part.repeat && part.repeat.count>1 && !part.repeat.step.some(Boolean) && !part.repeat.rotationStep?.some(Boolean)){
      repaired.issues.push(`Деталь ${part.id}: повторения полностью совпадают. Задайте отдельные позиции для запрошенного числа деталей.`);
    }
  }
  for (const axis of ["width", "height", "depth"] as const) {
    const expected = measurements[axis];
    if (expected && Math.abs(actual[axis] - expected) > Math.max(.005, expected * .01)) {
      repaired.issues.push(`Габарит ${axis}: задано ${expected} м, получено ${actual[axis]} м. Исправьте общий размер, сохранив состав объекта.`);
    }
  }
  const longest = Math.max(actual.width, actual.height, actual.depth);
  if (measurements.size && Math.abs(longest - measurements.size) > Math.max(.005, measurements.size * .01)) {
    repaired.issues.push(`Наибольший габарит: задано ${measurements.size} м, получено ${longest} м. Исправьте общий размер, сохранив состав объекта.`);
  }

  // A component the user named and the model lacks is a concrete defect for
  // the repair pass — found by part names, so it never re-ranks the geometry.
  for (const label of missingNamed(plan, repaired.parts)) {
    repaired.issues.push(`Нет запрошенного элемента: ${label}. Добавьте его отдельными деталями с понятным названием.`);
  }

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
 * Kinds whose geometry comes from a dedicated builder rather than the AI.
 * Bridges are built to road rules (lanes, sidewalks, railings, 4.5 m under
 * every cable), checked by scripts/gen-check.ts; AI-drawn bridges came out
 * without a usable road and with parts in odd places, and since valid AI
 * output always ships, users never saw the builder's bridge.
 */
export function builderOwnsGeometry(plan: Blueprint): boolean {
  // Only when the bridge is the object itself: "дом у моста" is a house.
  return Boolean(plan.bridge) && BRIDGE_HEAD.test(plan.prompt);
}

/** "мост", "мостик", "виадук", "эстакаду", "bridge" — not "моста", "мосту". */
const BRIDGE_HEAD = /(?:^|[^а-яё])(?:мост|мостик|мосты|виадук|путепровод|эстакад[ау])(?![а-яё])|\bbridges?\b/i;

/**
 * Choose between AI-authored geometry and the parametric baseline.
 * Validated AI output takes priority. Complexity scores cannot determine which
 * geometry matches the prompt; the baseline is only a labelled failure fallback.
 */
export function pickBetterGeometry(
  baseline: ThreeDConcept,
  ai: AIGeometryResult | null,
  plan?: Blueprint
): {
  concept: ThreeDConcept;
  source: "ai" | "procedural";
  aiScore: number;
  baseScore: number;
  /** Diagnostics for the geometry that ships, when the plan is known. */
  match?: MatchReport;
} {
  const baseScore = scoreParts(baseline.parts);
  if (!ai) {
    return {
      concept: baseline,
      source: "procedural",
      aiScore: 0,
      baseScore,
      ...(plan ? { match: matchParts(plan, baseline.parts) } : {}),
    };
  }

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
    ...(ai.match ? { match: ai.match } : plan ? { match: matchParts(plan, ai.parts) } : {}),
  };
}
