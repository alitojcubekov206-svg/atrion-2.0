import { Rng, hashString } from "@/lib/gen/kit";

export type RoofKind = "gable" | "hip" | "flat" | "shed" | "mansard" | "dome";
export type StyleKind =
  | "modern"
  | "classic"
  | "minimal"
  | "techno"
  | "rustic"
  | "loft"
  | "futuristic";
export type MaterialKind = "wood" | "brick" | "concrete" | "glass" | "metal" | "stone";
export type ScaleKind = "tiny" | "small" | "medium" | "large" | "huge";

export type PromptParams = {
  raw: string;
  /** Stable per-prompt seed — same text in, same model out. */
  seed: number;
  rng: Rng;
  /** Every number found in the prompt, in order. */
  numbers: number[];
  width?: number;
  depth?: number;
  height?: number;
  floors?: number;
  /** Explicit count, e.g. "4 колонны", "6 окон". */
  count?: number;
  roof?: RoofKind;
  style: StyleKind;
  material?: MaterialKind;
  /** Hex colour asked for by name. */
  color?: string;
  scale: ScaleKind;
  features: Set<string>;
  /** True when the prompt gave real dimensions rather than adjectives. */
  hasExplicitSize: boolean;
};

const COLORS: [RegExp, string][] = [
  [/красн|алый|\bred\b|багров/i, "#c1462f"],
  [/син(ий|яя|ее|его|ие)|\bblue\b|тёмно-син|темно-син/i, "#2f5fb0"],
  [/голуб|небесн|cyan|light ?blue/i, "#6fa8dc"],
  [/зелён|зелен|\bgreen\b|изумруд/i, "#3f8a5b"],
  [/жёлт|желт|\byellow\b|лимон/i, "#d9b13b"],
  [/оранж|\borange\b/i, "#d1743a"],
  [/фиолет|пурпур|\bpurple\b|сирен/i, "#6d4a9c"],
  [/розов|\bpink\b/i, "#d087a8"],
  [/чёрн|черн|\bblack\b|тёмн|темн/i, "#2a2c31"],
  [/бел(ый|ая|ое|ые|ого)|\bwhite\b|снежн/i, "#eeeae2"],
  [/сер(ый|ая|ое|ые|ого)|\bgrey\b|\bgray\b/i, "#8f9299"],
  [/коричнев|\bbrown\b|шоколад/i, "#7a543a"],
  [/беж(евый|евая)|\bbeige\b|кремов/i, "#ddceb2"],
  [/золот|\bgold\b/i, "#c9973f"],
  [/серебр|\bsilver\b/i, "#b6bcc4"],
  [/бирюз|\bteal\b|turquoise/i, "#3fa39a"],
];

const MATERIALS: [RegExp, MaterialKind][] = [
  [/кирпич|brick/i, "brick"],
  [/бетон|concrete|железобетон|монолит/i, "concrete"],
  [/стекл|glass|витраж|панорамн/i, "glass"],
  [/металл|сталь|steel|metal|алюмин/i, "metal"],
  [/камен|камня|stone|гранит|мрамор/i, "stone"],
  [/деревян|дерева|бревен|брус|wood|timber|log ?house/i, "wood"],
];

const STYLES: [RegExp, StyleKind][] = [
  [/хайтек|hi-?tech|техно|techno|киберпанк|cyber/i, "techno"],
  [/футурист|futur|sci-?fi|космическ/i, "futuristic"],
  [/минимал|minimal|лаконич/i, "minimal"],
  [/классик|классич|classic|барокко|ампир|колонн/i, "classic"],
  [/деревенск|кантри|country|rustic|шале|chalet|изба/i, "rustic"],
  [/лофт|loft|индустриальн|industrial/i, "loft"],
  [/современ|модерн|modern|скандинав|scandi/i, "modern"],
];

const ROOFS: [RegExp, RoofKind][] = [
  [/двускат|gable|щипцов/i, "gable"],
  [/четырёхскат|четырехскат|вальмов|hip ?roof|шатров/i, "hip"],
  [/плоск(ая|ой)? ?(крыш|кровл)|flat ?roof|эксплуатируем/i, "flat"],
  [/односкат|shed ?roof|наклонн(ая|ой) ?крыш/i, "shed"],
  [/мансард|mansard|мезонин/i, "mansard"],
  [/купол|dome|сферическ(ая|ой) ?крыш/i, "dome"],
];

const FEATURES: [RegExp, string][] = [
  [/гараж|garage|карпорт|навес для маш/i, "garage"],
  [/балкон|balcony|лоджи/i, "balcony"],
  [/террас|terrace|веранд|veranda|patio|патио/i, "terrace"],
  [/крыльц|porch|входн(ая|ой) группа|ступен|stairs|лестниц/i, "porch"],
  [/дымоход|труб(а|ы) на крыш|chimney|камин/i, "chimney"],
  [/мансард|чердак|attic|подкровельн/i, "attic"],
  [/бассейн|pool|джакузи/i, "pool"],
  [/забор|оград|fence|ворот|калитк/i, "fence"],
  [/сад|деревь|дерев(о|ья) вокруг|garden|газон|ландшафт|кустар/i, "garden"],
  [/панорамн|витраж|французск(ое|ие) окн|floor.?to.?ceiling/i, "panoramic"],
  [/парковк|parking|стоянк/i, "parking"],
  [/солнечн(ые|ых) панел|solar/i, "solar"],
  [/подвал|цоколь|basement|фундамент/i, "basement"],
  [/антенн|спутник|antenna|вышк/i, "antenna"],
  [/вывеск|sign|логотип|логотипом/i, "signage"],
  [/освещен|подсветк|фонар|neon|неон|lighting/i, "lighting"],
  [/колонн|column|портик|pillar/i, "columns"],
  [/арк(а|и)|arch|аркад/i, "arches"],
  [/шпил|spire|башенк|turret/i, "spire"],
  [/двор|courtyard|внутренн(ий|его) двор/i, "courtyard"],
];

/** Words that carry a size intent when no numbers are given. */
const SCALES: [RegExp, ScaleKind][] = [
  [/крошечн|миниатюрн|tiny|брелок|keychain/i, "tiny"],
  [/маленьк|небольш|компактн|мал(ый|ая)|small|мини\b|домик|избушк/i, "small"],
  [/огромн|гигантск|исполинск|huge|massive|небоскрёб|небоскреб/i, "huge"],
  [/больш(ой|ая|ое|ие)|крупн|просторн|big|large/i, "large"],
];

function normalizeNumber(raw: string): number {
  return parseFloat(raw.replace(",", "."));
}

/** All plain numbers in the prompt, e.g. "12×9 м, 4 этажа" → [12, 9, 4]. */
function extractNumbers(text: string): number[] {
  const found = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return found.map(normalizeNumber).filter((n) => Number.isFinite(n) && n > 0 && n < 100000);
}

/** Convert to metres when the prompt used cm / mm. */
function toMetres(value: number, unit: string | undefined): number {
  if (!unit) return value;
  if (/^(мм|mm)$/i.test(unit)) return value / 1000;
  if (/^(см|cm)$/i.test(unit)) return value / 100;
  if (/^(км|km)$/i.test(unit)) return value * 1000;
  return value;
}

const UNIT = "(мм|см|м|км|mm|cm|m|km)?";

export function parsePromptParams(prompt: string): PromptParams {
  const raw = prompt.trim();
  const text = raw.toLowerCase();
  const seed = hashString(raw);
  const rng = new Rng(seed);
  const numbers = extractNumbers(text);
  const features = new Set<string>();

  for (const [pattern, name] of FEATURES) {
    if (pattern.test(text)) features.add(name);
  }

  let width: number | undefined;
  let depth: number | undefined;
  let height: number | undefined;

  // "12×9", "12x9 м", "12 на 9 метров", "12*9"
  const pair = text.match(
    new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:[x×*]|на)\\s*(\\d+(?:[.,]\\d+)?)\\s*${UNIT}`, "i")
  );
  if (pair) {
    const unit = pair[3];
    width = toMetres(normalizeNumber(pair[1]), unit);
    depth = toMetres(normalizeNumber(pair[2]), unit);
  }

  const labelled = (labels: string) =>
    text.match(new RegExp(`(?:${labels})\\D{0,12}?(\\d+(?:[.,]\\d+)?)\\s*${UNIT}`, "i")) ??
    text.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${UNIT}\\s*(?:в )?(?:${labels})`, "i"));

  const widthMatch = labelled("ширин|шириной|width|по фасаду");
  if (widthMatch) width = toMetres(normalizeNumber(widthMatch[1]), widthMatch[2]);

  const depthMatch = labelled("длин|длиной|глубин|глубиной|depth|length");
  if (depthMatch) depth = toMetres(normalizeNumber(depthMatch[1]), depthMatch[2]);

  const heightMatch = labelled("высот|высотой|height|ростом|рост");
  if (heightMatch) height = toMetres(normalizeNumber(heightMatch[1]), heightMatch[2]);

  // "4 этажа", "четырёхэтажный", "2-этажный", "3 floors", "5 storey"
  let floors: number | undefined;
  const floorsMatch =
    text.match(/(\d+)\s*[-\s]?(?:этаж|эт\.|floor|storey|story|уровн)/i) ??
    text.match(/(?:этаж|floor|storey|уровн)\D{0,10}?(\d+)/i);
  if (floorsMatch) floors = Math.round(normalizeNumber(floorsMatch[1]));
  const WORD_FLOORS: [RegExp, number][] = [
    [/одноэтаж|one.?stor/i, 1],
    [/двухэтаж|двух-этаж|two.?stor/i, 2],
    [/трёхэтаж|трехэтаж|three.?stor/i, 3],
    [/четырёхэтаж|четырехэтаж|four.?stor/i, 4],
    [/пятиэтаж|five.?stor/i, 5],
    [/девятиэтаж/i, 9],
    [/шестнадцатиэтаж/i, 16],
  ];
  for (const [pattern, value] of WORD_FLOORS) {
    if (pattern.test(text)) floors = value;
  }
  if (floors !== undefined) floors = Math.max(1, Math.min(60, floors));

  // "6 окон", "4 колонны" — an explicit repetition count
  let count: number | undefined;
  const countMatch = text.match(
    /(\d+)\s*(?:окн|окон|колонн|столб|дверей|двер|секц|модул|ножк|колёс|колес|ярус)/i
  );
  if (countMatch) count = Math.max(1, Math.min(40, Math.round(normalizeNumber(countMatch[1]))));

  let color: string | undefined;
  for (const [pattern, hex] of COLORS) {
    if (pattern.test(text)) {
      color = hex;
      break;
    }
  }

  let material: MaterialKind | undefined;
  for (const [pattern, kind] of MATERIALS) {
    if (pattern.test(text)) {
      material = kind;
      break;
    }
  }

  let style: StyleKind = "modern";
  for (const [pattern, kind] of STYLES) {
    if (pattern.test(text)) {
      style = kind;
      break;
    }
  }

  let roof: RoofKind | undefined;
  for (const [pattern, kind] of ROOFS) {
    if (pattern.test(text)) {
      roof = kind;
      break;
    }
  }

  let scale: ScaleKind = "medium";
  for (const [pattern, kind] of SCALES) {
    if (pattern.test(text)) {
      scale = kind;
      break;
    }
  }

  return {
    raw,
    seed,
    rng,
    numbers,
    width,
    depth,
    height,
    floors,
    count,
    roof,
    style,
    material,
    color,
    scale,
    features,
    hasExplicitSize: Boolean(width || depth || height),
  };
}

/** Multiplier applied to default sizes when the prompt only used adjectives. */
export function scaleFactor(scale: ScaleKind): number {
  switch (scale) {
    case "tiny":
      return 0.45;
    case "small":
      return 0.72;
    case "large":
      return 1.35;
    case "huge":
      return 1.9;
    default:
      return 1;
  }
}

/** Short human title from the prompt, falling back to a category name. */
export function titleFromPrompt(prompt: string, fallback: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  if (clean.length < 3) return fallback;
  const short = clean.length <= 56 ? clean : `${clean.slice(0, 53).trimEnd()}…`;
  return short.charAt(0).toUpperCase() + short.slice(1);
}
