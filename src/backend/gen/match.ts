/**
 * Does the model match the prompt?
 *
 * `scoreParts` only measures whether the geometry is tidy — connected, varied,
 * detailed. A humanoid robot vacuum scores just as well as a real one. This
 * module asks the other question: are the things the prompt named actually
 * there, and is the object roughly the size it should be? It works on part
 * names, roles and groups, so it can judge AI-authored and parametric
 * geometry by the same rule.
 */
import type { ModelPart } from "@/shared/types";
import { partsBounds, round3 } from "@/shared/geometry";
import { scoreParts } from "@/backend/gen/validate";
import type { Blueprint, ObjectKind } from "@/backend/gen/blueprint";

type Feature = {
  key: string;
  /** Russian label for the UI and the generation log. */
  label: string;
  /** English label for the AI brief. */
  en: string;
  /** The blueprint asks for it. */
  has: (bp: Blueprint) => boolean;
  /** Words in the prompt that ask for it outright. */
  named: RegExp;
  /** How a part that implements it tends to be called. */
  parts: RegExp;
  roles?: string[];
  /** An emissive part counts (lights). */
  emissive?: boolean;
  /** Kinds where it is expected even unnamed — a car without wheels is not a car. */
  core?: ObjectKind[];
};

const FEATURES: Feature[] = [
  { key: "wheels", label: "колёса", en: "wheels", has: (b) => b.wheels > 0, named: /колёс|колес|wheel/i, parts: /колес|колёс|wheel|шин|покрышк|tyre|tire|\brim\b/i, roles: ["wheel"], core: ["vehicle"] },
  { key: "tracks", label: "гусеницы", en: "caterpillar tracks", has: (b) => b.tracks, named: /гусениц|\btracks?\b/i, parts: /гусениц|трак|каток|track/i, core: ["vehicle"] },
  { key: "legs", label: "ноги", en: "legs", has: (b) => b.legs > 0, named: /ног[аиу]|лап[аыу]|\blegs?\b|паук|spider/i, parts: /ног|лап|бедр|голен|стоп|колен|\blegs?\b|paw|foot|feet|thigh|shin|knee/i, roles: ["limb", "foot"], core: ["character", "animal", "robot"] },
  { key: "furnitureLegs", label: "ножки", en: "legs", has: (b) => b.furnitureLegs > 0, named: /ножк|ног/i, parts: /ножк|нога|ноги|опор|\blegs?\b|foot|feet/i, core: ["furniture"] },
  { key: "head", label: "голова", en: "a head", has: (b) => b.head > 0, named: /голов|\bhead\b/i, parts: /голов|\bhead|морд|лиц|\bface|череп|skull|шлем|helmet/i, roles: ["head"], core: ["character", "animal", "robot"] },
  { key: "arms", label: "руки", en: "arms", has: (b) => b.arms > 0, named: /рук[аиу]|\barms?\b|манипулятор|щупальц/i, parts: /рук|\barm|плеч|предплеч|кист|\bhand|манипул|щупал|forearm|shoulder/i, core: ["character", "robot"] },
  { key: "wings", label: "крылья", en: "wings", has: (b) => b.wings > 0 && b.wingKind !== "rotor", named: /крыл(?!ьц)|wing/i, parts: /крыл(?!ьц)|wing/i, core: ["aircraft"] },
  { key: "tail", label: "хвост", en: "a tail", has: (b) => b.tail > 0, named: /хвост|\btail/i, parts: /хвост|\btail/i, core: ["animal"] },
  { key: "horns", label: "рога", en: "horns", has: (b) => b.horns > 0, named: /рог[аиу]|horn|бивн/i, parts: /рог|horn|бивн|tusk/i },
  { key: "hair", label: "волосы", en: "hair", has: (b) => b.hair > 0, named: /волос|причёск|причес|\bhair|косичк|хвостик/i, parts: /волос|\bhair|прядь|чёлк|челк|кос[аы]|strand|braid|bang|причёск/i },
  { key: "blade", label: "клинок", en: "a sword or blade", has: (b) => b.blade, named: /меч|нож|клинок|лезви|сабл|катан|топор|blade|sword|knife|axe/i, parts: /меч|клинок|лезви|blade|sword|сабл|катан|топор|axe|knife|нож|гард|guard/i, core: ["weapon"] },
  { key: "roof", label: "крыша", en: "a roof", has: (b) => b.roof !== "none", named: /крыш|кровл|\broof|купол|dome/i, parts: /крыш|кровл|\broof|скат|конёк|конек|купол|dome|кровля/i, roles: ["roof"], core: ["building"] },
  { key: "windows", label: "окна", en: "windows", has: (b) => b.windows > 0, named: /окн[оаеы]|окон|window|остеклен|витраж/i, parts: /окн|окон|window|стекл|glass|glazing|витраж|остекл|windshield/i, roles: ["window"], core: ["building"] },
  { key: "doors", label: "двери", en: "doors", has: (b) => b.doors > 0, named: /двер|\bdoors?\b|ворот/i, parts: /двер|\bdoor|вход|entrance|ворот|gate|створк|фасад двер|люк/i, roles: ["door"], core: ["building"] },
  { key: "chimneys", label: "труба", en: "a chimney", has: (b) => b.chimneys > 0, named: /дымоход|труб|chimney|камин/i, parts: /труб|дымох|chimney/i },
  { key: "columns", label: "колонны", en: "columns", has: (b) => b.columns > 0, named: /колонн|column|pillar|портик|пилон/i, parts: /колонн|column|pillar|пилон|пилястр/i },
  { key: "arches", label: "арки", en: "arches", has: (b) => b.arches > 0, named: /арк[аиу]|arch|аркад/i, parts: /арк|arch/i },
  { key: "balconies", label: "балкон", en: "balconies", has: (b) => b.balconies > 0, named: /балкон|balcony|лоджи/i, parts: /балкон|balcony|лоджи/i },
  { key: "terrace", label: "терраса", en: "a terrace or porch", has: (b) => b.terrace, named: /террас|веранд|terrace|veranda|крыльц|porch|patio/i, parts: /террас|веранд|terrace|veranda|deck|настил|крыльц|porch/i },
  { key: "garage", label: "гараж", en: "a garage", has: (b) => b.garage, named: /гараж|garage|карпорт/i, parts: /гараж|garage|карпорт|ворота/i },
  { key: "towers", label: "башня", en: "a tower", has: (b) => b.towers > 0, named: /башн|tower/i, parts: /башн|tower|turret/i },
  { key: "spire", label: "шпиль", en: "a spire", has: (b) => b.spire, named: /шпил|spire/i, parts: /шпил|spire|пинакл/i },
  { key: "dome", label: "купол", en: "a dome", has: (b) => b.dome, named: /купол|dome/i, parts: /купол|dome/i },
  { key: "fence", label: "забор", en: "a fence", has: (b) => b.fence, named: /забор|оград|fence/i, parts: /забор|оград|fence|штакет/i },
  { key: "solar", label: "солнечные панели", en: "solar panels", has: (b) => b.solar > 0, named: /солнечн|solar/i, parts: /солнечн|solar|панел/i },
  { key: "tabletop", label: "столешница", en: "a table top", has: (b) => b.tabletop, named: /стол|table|desk/i, parts: /столешн|tabletop|table ?top|\btop\b|плита|стол|\btable|\bdesk/i, core: ["furniture"] },
  { key: "seat", label: "сиденье", en: "a seat", has: (b) => b.seat, named: /сиден|seat|стул|кресл|диван|chair|sofa/i, parts: /сиден|\bseat|подушк|cushion|стул|кресл|диван|chair|sofa/i, core: ["furniture"] },
  { key: "backrest", label: "спинка", en: "a backrest", has: (b) => b.backrest && !b.mattress, named: /спинк|backrest/i, parts: /спинк|\bback|изголов/i, core: ["furniture"] },
  { key: "mattress", label: "матрас", en: "a mattress", has: (b) => b.mattress, named: /кроват|матрас|\bbed\b|mattress/i, parts: /матрас|mattress|одеял|blanket|кроват/i, core: ["furniture"] },
  { key: "shelves", label: "полки", en: "shelves", has: (b) => b.shelves > 0, named: /полк|shelf|shelves/i, parts: /полк|shelf|shelves/i },
  { key: "drawers", label: "ящики", en: "drawers", has: (b) => b.drawers > 0, named: /ящик|drawer/i, parts: /ящик|drawer/i },
  { key: "screens", label: "экран", en: "a screen", has: (b) => b.screens > 0, named: /экран|дисплей|screen|display|монитор/i, parts: /экран|дисплей|монитор|screen|display|матриц|дверца со стеклом/i, core: ["device"] },
  { key: "keyboard", label: "клавиатура", en: "a keyboard", has: (b) => b.keyboard, named: /клавиатур|keyboard|ноутбук|laptop/i, parts: /клавиат|клавиш|keyboard|\bkeys?\b|тачпад|touchpad/i, core: ["device"] },
  { key: "lights", label: "свет", en: "lights", has: (b) => b.lights > 0, named: /ламп|свет|фонар|прожектор|фар[аыу]|\blight|\blamp|\bled\b|неон|подсветк/i, parts: /ламп|свет|фонар|прожектор|фар|light|lamp|bulb|плафон|абажур|shade/i, roles: ["light"], emissive: true, core: ["lighting"] },
  { key: "spout", label: "носик", en: "a spout", has: (b) => b.spout, named: /носик|чайник|кофейник|spout|kettle|teapot/i, parts: /носик|spout/i, core: ["container"] },
  { key: "handles", label: "ручка", en: "a handle", has: (b) => b.handles > 0, named: /ручк|handle|рукоят/i, parts: /ручк|handle|рукоят|\bgrip/i },
  { key: "propellers", label: "винты", en: "propellers or rotors", has: (b) => b.propellers > 0, named: /винт|пропеллер|propeller|лопаст|ротор|дрон|коптер|вертол|drone|helicopter/i, parts: /винт|лопаст|пропел|ротор|propeller|rotor|blade/i },
  { key: "antennas", label: "антенна", en: "an antenna", has: (b) => b.antennas > 0, named: /антенн|antenna/i, parts: /антенн|antenna/i },
  { key: "cannon", label: "орудие", en: "a cannon and turret", has: (b) => b.cannon, named: /пушк|орудие|cannon|танк|tank|турел/i, parts: /ствол|пушк|орудие|barrel|cannon|\bgun|башн|turret/i },
  { key: "mast", label: "мачта", en: "a mast and sail", has: (b) => b.mast, named: /мачт|парус|\bsail|\bmast/i, parts: /мачт|парус|\bmast|\bsail/i },
  { key: "hull", label: "корпус лодки", en: "a hull", has: (b) => b.hull, named: /корабл|лодк|яхт|катер|boat|ship/i, parts: /корпус|днище|\bhull|борт|палуб|deck/i, core: ["watercraft"] },
  { key: "slots", label: "слоты", en: "bread slots", has: (b) => b.slots > 0, named: /тостер|toaster/i, parts: /слот|прорез|\bslot/i },
  { key: "trailer", label: "прицеп", en: "a trailer", has: (b) => b.trailer, named: /прицеп|trailer/i, parts: /прицеп|trailer/i },
];

const FURNISHING_PARTS: Record<string, RegExp> = {
  кровать: /кроват|\bbed\b|матрас|mattress/i,
  стол: /стол|table|desk/i,
  "журнальный столик": /стол|table/i,
  стул: /стул|chair/i,
  кресло: /кресл|armchair|chair/i,
  диван: /диван|sofa|couch/i,
  шкаф: /шкаф|wardrobe|cabinet|стеллаж/i,
  "кухонный гарнитур": /гарнитур|counter|столешн|кухн|cabinet|тумб/i,
};

export type Expectation = {
  key: string;
  label: string;
  en: string;
  /** The user asked for it in so many words — weighs more than a kind default. */
  named: boolean;
};

/** What a correct model of this prompt has to contain. */
export function expectationsFor(bp: Blueprint): Expectation[] {
  const text = bp.prompt.toLowerCase();
  const out: Expectation[] = [];
  for (const feature of FEATURES) {
    if (!feature.has(bp)) continue;
    const named = feature.named.test(text);
    if (named || feature.core?.includes(bp.kind)) {
      out.push({ key: feature.key, label: feature.label, en: feature.en, named });
    }
  }
  for (const word of bp.furnishings) {
    out.push({ key: `furnishing:${word}`, label: word, en: `a ${word} (furniture piece)`, named: text.includes(word.slice(0, 4)) });
  }
  return out;
}

function haystack(part: ModelPart): string {
  return `${part.id} ${part.name} ${part.group ?? ""} ${part.material}`.toLowerCase();
}

function satisfied(expectation: Expectation, parts: ModelPart[]): boolean {
  if (expectation.key.startsWith("furnishing:")) {
    const pattern = FURNISHING_PARTS[expectation.key.slice("furnishing:".length)];
    return pattern ? parts.some((item) => pattern.test(haystack(item))) : true;
  }
  const feature = FEATURES.find((item) => item.key === expectation.key);
  if (!feature) return true;
  return parts.some(
    (item) =>
      feature.parts.test(haystack(item)) ||
      (feature.roles?.includes(item.role ?? "") ?? false) ||
      (feature.emissive === true && (item.emissive ?? 0) >= 0.4)
  );
}

/** Labels of the components the user named outright that no part provides. */
export function missingNamed(bp: Blueprint, parts: ModelPart[]): string[] {
  return expectationsFor(bp)
    .filter((item) => item.named && !satisfied(item, parts))
    .map((item) => item.label);
}

/** 1 inside ±tolerance, falling to 0 at a factor of `zeroAt` off. */
function ratioFit(actual: number, target: number, tolerance: number, zeroAt: number): number {
  if (!(actual > 0) || !(target > 0)) return 0.5;
  const off = Math.abs(Math.log(actual / target));
  const ok = Math.log(tolerance);
  const zero = Math.log(zeroAt);
  if (off <= ok) return 1;
  return Math.max(0, 1 - (off - ok) / (zero - ok));
}

export type MatchReport = {
  /** 0–1: share of the requested features the parts actually contain, weighted. */
  coverage: number;
  /** 0–1: how close the overall size and height are to the plan. */
  sizeFit: number;
  /** 0–1: coverage and size together. */
  match: number;
  /** 0–1: the existing structure score (connected, varied, detailed). */
  structure: number;
  /** 0–1: what the generator optimises — structure and match together. */
  quality: number;
  missing: string[];
  expected: number;
};

/**
 * Judge parts against the blueprint. Size is checked on the largest dimension
 * and the height, not every axis: wings, tails and porches legitimately widen
 * an object beyond its body.
 */
export function matchParts(bp: Blueprint, parts: ModelPart[]): MatchReport {
  const expectations = expectationsFor(bp);
  let weight = 0;
  let hit = 0;
  const missing: string[] = [];
  for (const expectation of expectations) {
    const w = expectation.named ? 1.5 : 1;
    weight += w;
    if (satisfied(expectation, parts)) hit += w;
    else missing.push(expectation.label);
  }
  const coverage = weight ? hit / weight : 1;

  const { min, max } = partsBounds(parts);
  const dims = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const explicit = bp.explicitAxes.width || bp.explicitAxes.length || bp.explicitAxes.height;
  const tolerance = explicit ? 1.2 : 1.4;
  const targetMax = Math.max(bp.width, bp.length, bp.height) * Math.max(1, bp.copies);
  const sizeFit =
    (ratioFit(Math.max(...dims), targetMax, tolerance, 3) + ratioFit(dims[1], bp.height, tolerance, 3)) / 2;

  const structure = parts.length ? scoreParts(parts, { clusters: bp.copies }) : 0;
  const match = coverage * 0.7 + sizeFit * 0.3;
  return {
    coverage: round3(coverage),
    sizeFit: round3(sizeFit),
    match: round3(match),
    structure,
    quality: round3(structure * 0.45 + match * 0.55),
    missing,
    expected: expectations.length,
  };
}
