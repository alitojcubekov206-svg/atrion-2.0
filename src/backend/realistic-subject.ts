import { planFor } from "./procedural-3d";
import { animalSpecies } from "./gen/living-anatomy";
import { colorIn, materialIn } from "./gen/prompt-params";
import type { Blueprint } from "./gen/blueprint";

/**
 * The picture model reads English only. A Russian prompt reaching it draws
 * something random — a bridge came back as a statue's face — so the realistic
 * mode never sends Cyrillic: the AI's rewrite is used only when it is English,
 * otherwise the description is built here from what the parser understood.
 */
const CYRILLIC = /[а-яё]/i;

const COLOR_NAMES: Record<string, string> = {
  "#c1462f": "red", "#2f5fb0": "blue", "#6fa8dc": "light blue", "#3f8a5b": "green", "#d9b13b": "yellow",
  "#d1743a": "orange", "#6d4a9c": "purple", "#d087a8": "pink", "#2a2c31": "black", "#eeeae2": "white",
  "#8f9299": "grey", "#7a543a": "brown", "#ddceb2": "beige", "#c9973f": "golden", "#b6bcc4": "silver", "#3fa39a": "teal",
};
const MATERIAL_NAMES = { wood: "wooden", brick: "brick", concrete: "concrete", glass: "glass", metal: "metal", stone: "stone" } as const;

/** First matching pattern names the subject. */
const pick = (text: string, table: [RegExp, string][], fallback: string) => table.find(([re]) => re.test(text))?.[1] ?? fallback;

const BUILDINGS: [RegExp, string][] = [
  [/торгов|\bтц\b|супермаркет|гипермаркет|магазин|mall|store/i, "shopping mall"], [/школ|лице|гимназ|колледж|университет|school/i, "school building"],
  [/больниц|клиник|hospital/i, "hospital building"], [/офис|бизнес|office/i, "office building"], [/гостиниц|отел|hotel/i, "hotel"],
  [/завод|фабрик|цех|склад|ангар|factory|warehouse/i, "warehouse"], [/мечет|mosque/i, "mosque"], [/церк|храм|собор|church|temple|cathedral/i, "church"],
  [/музе|театр|библиотек|museum|theatre/i, "museum"], [/вокзал|аэропорт|station|airport/i, "station building"], [/садик|детсад/i, "kindergarten"],
  [/небоскр|skyscraper/i, "skyscraper"], [/этажк|панельк|жилой дом|жк|apartment/i, "apartment block"], [/вилл|villa/i, "villa"],
  [/коттедж|cottage/i, "cottage"], [/особняк|mansion/i, "mansion"],
];
const FURNITURE: [RegExp, string][] = [
  [/кресл|armchair/i, "armchair"], [/диван|sofa|couch/i, "sofa"], [/кроват|\bbed\b/i, "bed"], [/стул|табурет|chair|stool/i, "chair"],
  [/стол|table|desk/i, "table"], [/шкаф|wardrobe|cabinet/i, "wardrobe"], [/пианино|рояль|piano/i, "piano"], [/гарнитур/i, "kitchen cabinets"],
];
const DEVICES: [RegExp, string][] = [
  [/гитар|guitar/i, "acoustic guitar"], [/ноутбук|laptop/i, "laptop"], [/телефон|смартфон|phone/i, "smartphone"], [/клавиатур|keyboard/i, "keyboard"],
  [/монитор|экран|телевизор|monitor|tv/i, "monitor"], [/компьютер|computer/i, "desktop computer"], [/динамик|колонк|speaker/i, "speaker"], [/часы|clock|watch/i, "clock"],
];
const APPLIANCES: [RegExp, string][] = [
  [/тостер|toaster/i, "toaster"], [/холодильник|fridge|refrigerator/i, "refrigerator"], [/микроволн|microwave/i, "microwave oven"],
  [/стиральн|washing/i, "washing machine"], [/кофемашин|coffee/i, "coffee machine"], [/кондиционер|air condition/i, "air conditioner"],
  [/пылесос|vacuum/i, "robot vacuum"],
];
const ANIMALS: Record<string, string> = { cat: "cat", dog: "dog", horse: "horse", rabbit: "rabbit", bear: "bear", elephant: "elephant", dragon: "dragon" };

function noun(bp: Blueprint, text: string): string | null {
  switch (bp.kind) {
    case "building":
      if (bp.form === "castle") return "medieval castle";
      if (bp.form === "yurt") return "yurt";
      if (bp.storefront) return "shopping mall";
      return pick(text, BUILDINGS, bp.floors > 1 ? `${bp.floors}-storey house` : "house");
    case "landmark":
      if (bp.bridge) {
        const type = { beam: "girder bridge", cable: "cable-stayed bridge", suspension: "suspension bridge", arch: "arch bridge", foot: "pedestrian footbridge" }[bp.bridge];
        return `${type}${bp.lanes ? ` with ${bp.lanes} traffic lanes` : ""}${bp.water ? " over a river" : ""}`;
      }
      if (bp.form === "pyramid") return "pyramid";
      return pick(text, [[/стадион|stadium/i, "stadium"], [/небоскр|skyscraper/i, "skyscraper"], [/маяк|lighthouse/i, "lighthouse"]], "tower");
    case "vehicle":
      if (bp.tracks) return "tank";
      return pick(text, [[/поезд|локомотив|train/i, "train"], [/мотоцикл|байк|motorcycle/i, "motorcycle"], [/велосипед|bicycle|bike/i, "bicycle"],
        [/автобус|\bbus\b/i, "bus"], [/грузовик|фура|truck/i, "truck"]],
        { sedan: "sedan car", hatchback: "hatchback car", suv: "SUV", sports: "sports car", pickup: "pickup truck" }[bp.carStyle ?? "sedan"]);
    case "aircraft":
      if (bp.form === "helicopter") return "helicopter";
      if (bp.form === "saucer") return "flying saucer";
      if (bp.form === "spaceship") return "spaceship";
      return pick(text, [[/ракет|rocket/i, "rocket"], [/дрон|квадрокоптер|drone/i, "quadcopter drone"]], "airplane");
    case "watercraft":
      return pick(text, [[/подводн|submarine/i, "submarine"], [/яхт|yacht/i, "yacht"], [/корабл|лайнер|ship/i, "ship"]], "boat");
    case "animal": {
      const species = animalSpecies(text);
      if (species !== "generic") return ANIMALS[species];
      return pick(text, [[/птиц|попуга|орёл|орел|bird/i, "bird"], [/рыб|акул|fish|shark/i, "fish"], [/зме|snake/i, "snake"], [/динозавр|dinosaur/i, "dinosaur"],
        [/лев|lion/i, "lion"], [/тигр|tiger/i, "tiger"], [/жираф|giraffe/i, "giraffe"]], "animal");
    }
    case "character":
      return pick(text, [[/рыцар|knight/i, "knight in armour"], [/девоч|девуш|женщ|girl|woman/i, "woman"], [/мальч|boy/i, "boy"], [/космонавт|астронавт|astronaut/i, "astronaut"]], "man");
    case "robot": return "robot";
    case "plant": return pick(text, [[/цвет|роз|flower|rose/i, "flower in a pot"], [/кактус|cactus/i, "cactus"], [/дерев|ель|ёлк|дуб|tree/i, "tree"]], "potted plant");
    case "furniture": return pick(text, FURNITURE, "piece of furniture");
    case "lighting": return pick(text, [[/торшер|floor lamp/i, "floor lamp"], [/люстр|chandelier/i, "chandelier"]], "table lamp");
    case "device": return pick(text, DEVICES, "gadget");
    case "appliance": return pick(text, APPLIANCES, "home appliance");
    case "container": return pick(text, [[/чайник|kettle|teapot/i, "teapot"], [/кружк|чашк|mug|cup/i, "mug"], [/ваз|vase/i, "vase"], [/бутыл|bottle/i, "bottle"]], "vessel");
    case "weapon": return pick(text, [[/топор|axe/i, "axe"], [/нож|knife/i, "knife"], [/щит|shield/i, "shield"]], "sword");
    default: return null;
  }
}

/** An English description of the request built without AI, or null for a subject the parser does not know. */
export function localImageSubject(prompt: string): string | null {
  const bp = planFor(prompt).blueprint, text = prompt.toLowerCase();
  const subject = noun(bp, text);
  if (!subject) return null;
  const color = colorIn(text), material = materialIn(text);
  const words = [color && COLOR_NAMES[color], material && MATERIAL_NAMES[material], subject].filter(Boolean).join(" ");
  const extras = bp.kind === "building" ? [
    bp.roofColor && COLOR_NAMES[bp.roofColor] && /крыш|кровл|roof/i.test(text) ? `a ${COLOR_NAMES[bp.roofColor]} roof` : "",
    /гараж|garage/i.test(text) ? "a garage" : "", /террас|terrace/i.test(text) ? "a terrace" : "",
    /балкон|balcon/i.test(text) ? "balconies" : "", /бассейн|pool/i.test(text) ? "a swimming pool" : "",
  ].filter(Boolean) : [];
  return `a ${words}${extras.length ? ` with ${extras.join(" and ")}` : ""}`;
}

/**
 * The 3D model follows the picture, so the picture must show one whole thing.
 * Buildings and bridges drawn at full size came out as a street view, and a
 * scale model still grew roads and cars around it: it is now one tabletop model
 * on white. Animals came out as a head-and-chest portrait, which turned into a
 * bust: they are now drawn whole.
 */
export function framedImageSubject(prompt: string, english: string): string {
  const kind = planFor(prompt).blueprint.kind;
  const subject = /^(a|an|the)\s/i.test(english) ? english : `a ${english}`;
  if (kind === "building" || kind === "landmark" || kind === "room") {
    return `a detailed tabletop scale model of ${subject}, a single isolated model on a plain white background, isometric view, studio product photo`;
  }
  if (kind === "animal") return `${subject}, full body, the whole animal from head to tail in frame, side three-quarter view`;
  return subject;
}

/** What the picture model gets: the AI rewrite when it is English, else the local description; null when neither exists. */
export function imageSubjectFrom(prompt: string, rewritten: string): string | null {
  const english = rewritten.trim() && !CYRILLIC.test(rewritten) ? rewritten.trim() : localImageSubject(prompt);
  return english ? framedImageSubject(prompt, english).slice(0, 600) : null;
}
