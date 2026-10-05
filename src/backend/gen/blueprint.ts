/**
 * Text → Blueprint.
 *
 * There are no per-object templates here. A prompt is read word by word and
 * each word nudges a single numeric description of the thing being built: how
 * the mass is shaped, what it stands on, what grows out of it, what is mounted
 * on its surfaces. One universal builder then renders that description, so
 * "дракон с крыльями", "робот-паук на 8 ногах" and "дом с башней и гаражом"
 * all take the same code path and still come out different.
 *
 * A word that is not in the lexicon still changes the result: everything left
 * unspecified is drawn from an RNG seeded by the prompt itself.
 */
import { Rng, hashString } from "@/shared/geometry";
import {
  colorIn,
  materialIn,
  parsePromptParams,
  scaleOf,
  type PromptParams,
} from "@/backend/gen/prompt-params";

export type MassPlan =
  /** Volumes stacked upward — buildings, towers, robots. */
  | "stacked"
  /** One long volume — vehicles, animals, boats. */
  | "elongated"
  /** A slab with things standing on it — tables, decks, boards. */
  | "platform"
  /** Volumes around a centre — lamps, drones, fans. */
  | "radial"
  /** A hollow shell — rooms, cases, cups. */
  | "shell";

export type RoofKind = "none" | "gable" | "hip" | "flat" | "shed" | "mansard" | "dome";
export type LegStyle = "organic" | "mech" | "furniture";
export type EarKind = "none" | "round" | "pointed" | "long" | "fin";
export type SizeClass = "micro" | "handheld" | "furniture" | "vehicle" | "structure" | "landmark";

/**
 * What the object *is*, as opposed to how big it is. The size class only sets
 * default dimensions; the kind drives the AI brief, the clarifying interview
 * and the prompt-match check. "product" means nothing more specific was read.
 */
export type ObjectKind =
  | "building"
  | "room"
  | "landmark"
  | "vehicle"
  | "aircraft"
  | "watercraft"
  | "character"
  | "animal"
  | "robot"
  | "furniture"
  | "appliance"
  | "device"
  | "lighting"
  | "container"
  | "weapon"
  | "product";

export type Blueprint = {
  prompt: string;
  seed: number;
  rng: Rng;
  params: PromptParams;

  kind: ObjectKind;
  /** Bounding box the finished model should roughly occupy, in metres. */
  length: number;
  width: number;
  height: number;
  sizeClass: SizeClass;
  /** Axes the prompt gave as numbers — these are never jittered or overridden. */
  explicitAxes: { width: boolean; length: boolean; height: boolean };

  massPlan: MassPlan;
  /** Main volume primitive. */
  bodyShape: "box" | "capsule" | "cylinder" | "sphere" | "prism";
  /** How many volumes the main mass is split into along its long axis. */
  bodySegments: number;
  /** 0 = prismatic, 1 = strongly narrowing toward one end. */
  taper: number;
  /** Fraction of the height taken by the base/undercarriage volume. */
  baseHeight: number;
  hollow: boolean;

  wheels: number;
  wheelSize: number;
  /** A towed box on its own axles behind the main body. */
  trailer: boolean;
  tracks: boolean;
  legs: number;
  legStyle: LegStyle;
  legLength: number;
  hull: boolean;
  skids: boolean;

  head: number;
  headSize: number;
  neck: number;
  eyes: number;
  ears: EarKind;
  muzzle: number;
  horns: number;
  mane: boolean;
  arms: number;
  hands: boolean;
  wings: number;
  wingKind: "feather" | "membrane" | "fixed" | "rotor";
  tail: number;
  tailSpikes: boolean;
  spikes: number;
  fins: number;
  hair: number;
  clothed: boolean;
  armour: boolean;

  floors: number;
  windows: number;
  /** True when the prompt named a count, e.g. "6 окон". */
  windowsExplicit: boolean;
  windowStyle: "punched" | "ribbon" | "curtain";
  doors: number;
  roof: RoofKind;
  roofOverhang: number;
  chimneys: number;
  columns: number;
  arches: number;
  balconies: number;
  terrace: boolean;
  stairs: number;
  railings: boolean;
  fence: boolean;
  dome: boolean;
  spire: boolean;
  towers: number;
  garage: boolean;

  screens: number;
  keyboard: boolean;
  buttons: number;
  lenses: number;
  antennas: number;
  vents: number;
  handles: number;
  spout: boolean;
  lid: boolean;
  propellers: number;
  cables: number;
  lights: number;
  speakers: number;
  cannon: boolean;
  mast: boolean;
  solar: number;
  /** A sword or knife: held in the hand when there are arms, else the object itself. */
  blade: boolean;
  /** Bread slots on the top face (toasters). */
  slots: number;
  /** Desk-lamp style jointed arm instead of a straight stem. */
  lampArm: boolean;

  seat: boolean;
  backrest: boolean;
  armrests: boolean;
  mattress: boolean;
  shelves: number;
  drawers: number;
  tabletop: boolean;
  furnitureLegs: number;
  cushions: number;
  pillows: number;

  /** Extra copies of the whole object arranged in a row, e.g. "три стула". */
  copies: number;
  /** Pieces a room is furnished with, each built as its own object. */
  furnishings: string[];

  primary: string;
  secondary: string;
  accent: string;
  trim: string;
  metalness: number;
  roughness: number;
  glassy: boolean;
  emissiveAccent: boolean;
  /** Multiplier on how much fine detail the builder adds. */
  detail: number;
  /** Words the lexicon recognised — surfaced in the generation log. */
  matched: string[];
};

type Mutate = (blueprint: Blueprint, count: number | undefined) => void;

type Rule = {
  /** Words that trigger the rule. */
  re: RegExp;
  /** Unit names that carry a count for this rule, e.g. "8 ног". */
  counter?: RegExp;
  apply: Mutate;
  label: string;
  /**
   * Set on rules that name a whole object. Only the head noun of the prompt
   * gets to decide what the object is — "офисный стол" is a table, not an office.
   */
  kind?: ObjectKind;
  /**
   * What the rule contributes when it names an add-on ("дом с башней").
   * Rules with a `kind` and no `attach` contribute nothing as add-ons: a whole
   * second object cannot be grafted onto the first.
   */
  attach?: Mutate;
  /** Material/finish words. As add-ons they describe a part, not the whole. */
  surface?: boolean;
  /** Furniture a room gets furnished with instead of turning into that piece. */
  furnishing?: string;
};

/**
 * `\b` only works around ASCII, so Cyrillic whole-word matches use lookarounds.
 */
const B = "a-zA-Zа-яёА-ЯЁ0-9_";
const S = `(?<![${B}])`;
const E = `(?![${B}])`;
const w = (body: string) => new RegExp(`${S}(?:${body})`, "i");

/* ---------------- lexicon ---------------- */

const BIG_WHEELS = /(больш|огромн|крупн)\S*\s+(колёс|колес)|(big|large|huge) wheels/i;

const RULES: Rule[] = [
  /* --- ground contact --- */
  {
    label: "колёса", kind: "vehicle", attach: (b, n) => { b.wheels = n ?? Math.max(b.wheels, 4); if (BIG_WHEELS.test(b.params.raw)) b.wheelSize = 0.45; },
    re: w("колёс|колес|wheel|машин|автомоб|\\bcar\\b|тачк|седан|хэтчбек|купе|кабриолет|спорткар|суперкар|болид|джип|внедорожник|\\bsuv\\b|пикап|минивэн|фургон|катафалк"),
    counter: /колёс|колес|wheel/i,
    apply: (b, n) => {
      b.wheels = n ?? Math.max(b.wheels, 4);
      if (BIG_WHEELS.test(b.params.raw)) b.wheelSize = 0.45;
      b.massPlan = "elongated";
      b.bodyShape = "box";
      b.sizeClass = "vehicle";
      b.lights = Math.max(b.lights, 2);
      b.windows = Math.max(b.windows, 3);
      b.windowStyle = "ribbon";
      b.doors = Math.max(b.doors, 2);
      b.handles = Math.max(b.handles, 2);
      b.detail += 0.25;
    },
  },
  {
    label: "грузовик", kind: "vehicle",
    re: w("грузовик|truck|фур[аы]|самосвал|тягач|бетономешал|автобус|\\bbus\\b|троллейбус|маршрутк"),
    apply: (b) => {
      b.wheels = Math.max(b.wheels, 6);
      b.length = Math.max(b.length, 9);
      b.height = Math.max(b.height, 3.2);
      b.massPlan = "elongated";
      b.bodySegments = Math.max(b.bodySegments, 2);
      b.sizeClass = "vehicle";
      b.windows = Math.max(b.windows, 6);
      b.doors = Math.max(b.doors, 2);
      b.lights = Math.max(b.lights, 2);
    },
  },
  {
    label: "мотоцикл", kind: "vehicle",
    re: w("мотоцикл|мопед|скутер|\\bbike\\b|велосипед|байк"),
    apply: (b) => {
      b.wheels = 2;
      b.wheelSize = 0.55;
      b.length = 2;
      b.width = 0.75;
      b.height = 1.2;
      b.massPlan = "elongated";
      b.sizeClass = "vehicle";
      b.handles = Math.max(b.handles, 1);
      b.lights = Math.max(b.lights, 1);
      b.windows = 0;
      b.doors = 0;
    },
  },
  {
    label: "гусеницы", kind: "vehicle", attach: (b) => { b.tracks = true; },
    re: w("танк|tank|гусениц|бульдозер|экскаватор|трактор|вездеход|бронетранспорт|\\bбтр\\b|\\bбмп\\b"),
    apply: (b) => {
      b.tracks = true;
      b.wheels = 0;
      b.massPlan = "elongated";
      b.sizeClass = "vehicle";
      b.length = Math.max(b.length, 6.5);
      b.width = Math.max(b.width, 3.2);
      b.armour = true;
      b.detail += 0.3;
    },
  },
  { label: "прицеп", re: w("прицеп|полуприцеп|trailer|фургон сзади"), apply: (b) => { b.trailer = true; b.wheels = Math.max(b.wheels, 4); } },
  { label: "пушка", re: w("танк|tank|пушк|орудие|cannon|турель|башн(я|и) танк"), apply: (b) => { b.cannon = true; } },
  {
    label: "ноги",
    re: w("ног[аиу]|ножк|\\blegs?\\b|лап[аыу]|шагающ|паук|spider|осьминог|краб"),
    counter: /ног|лап|ножк|\blegs?\b/i,
    apply: (b, n) => {
      // "стол на трёх ножках" — furniture legs, not a creature's.
      if (b.kind === "furniture" || b.legStyle === "furniture") {
        b.furnitureLegs = n ?? Math.max(b.furnitureLegs, 4);
        return;
      }
      b.legs = n ?? Math.max(b.legs, 4);
    },
  },
  { label: "лодка", kind: "watercraft", re: w("корабл|лодк|яхт|катер|баркас|парусник|судн[оа]|\\bboat\\b|\\bship\\b|каяк|байдарк|плот"), apply: (b) => { b.hull = true; b.massPlan = "elongated"; b.sizeClass = "vehicle"; b.length = Math.max(b.length, 8); b.wheels = 0; b.mast = true; b.railings = true; } },
  { label: "парус", re: w("парус|\\bsail\\b|шхун|фрегат|галеон"), apply: (b) => { b.mast = true; b.hull = true; } },

  /* --- creature anatomy --- */
  {
    label: "четвероногое", kind: "animal",
    re: w("кот|кошк|котён|котен|собак|пёс|пес|щенок|волк|wolf|лис[аыу]|медвед|тигр|лев|леопард|panther|пантер|лошад|конь|пони|осёл|осел|корова|бык|коз[аыл]|овц|баран|свин|кабан|олен|лось|зебр|жираф|слон|носорог|бегемот|верблюд|кролик|заяц|bunny|крыс|мыш[ьи]|хомяк|белк|енот|барсук|панд|коал|кенгур|\\bcat\\b|\\bdog\\b|\\bhorse\\b|\\bbear\\b|\\blion\\b|\\bwolf\\b|животн|зверь|зверя|animal|динозавр|dinosaur|ящер|варан|крокодил"),
    apply: (b) => {
      b.legs = Math.max(b.legs, 4);
      b.legStyle = "organic";
      b.head = 1;
      b.eyes = 2;
      b.ears = b.ears === "none" ? "round" : b.ears;
      b.muzzle = Math.max(b.muzzle, 0.5);
      b.tail = Math.max(b.tail, 5);
      b.massPlan = "elongated";
      b.bodyShape = "capsule";
      b.sizeClass = "furniture";
      b.height = Math.max(b.height, 0.7);
      b.length = Math.max(b.length, 0.95);
      b.width = Math.max(b.width, 0.34);
      b.detail += 0.2;
    },
  },
  { label: "кошачьи уши", re: w("кот|кошк|котён|котен|лис[аыу]|\\bcat\\b|\\bfox\\b|волк|wolf"), apply: (b) => { b.ears = "pointed"; b.muzzle = 0.35; b.tail = Math.max(b.tail, 7); } },
  { label: "длинные уши", re: w("кролик|заяц|bunny|осёл|осел|слон"), apply: (b) => { b.ears = "long"; } },
  { label: "грива", re: w("лев|лошад|конь|пони|\\blion\\b|\\bhorse\\b"), apply: (b) => { b.mane = true; b.legLength = 0.55; b.muzzle = 0.8; b.tail = Math.max(b.tail, 8); } },
  { label: "хобот", re: w("слон|elephant|мамонт"), apply: (b) => { b.muzzle = 1.4; b.ears = "long"; b.legLength = 0.5; b.horns = Math.max(b.horns, 2); } },
  {
    label: "дракон", kind: "animal",
    re: w("дракон|dragon|виверн|wyvern|змей горыныч|грифон"),
    apply: (b) => {
      b.legs = Math.max(b.legs, 4);
      b.legStyle = "organic";
      b.head = 1;
      b.neck = Math.max(b.neck, 1.1);
      b.wings = Math.max(b.wings, 2);
      b.wingKind = "membrane";
      b.horns = Math.max(b.horns, 2);
      b.tail = Math.max(b.tail, 10);
      b.tailSpikes = true;
      b.spikes = Math.max(b.spikes, 9);
      b.muzzle = 1.1;
      b.eyes = 2;
      b.bodyShape = "capsule";
      b.massPlan = "elongated";
      b.length = Math.max(b.length, 4.2);
      b.width = Math.max(b.width, 1.1);
      b.height = Math.max(b.height, 2.2);
      b.detail += 0.4;
    },
  },
  { label: "птица", kind: "animal", re: w("птиц|попуга|орёл|орел|голуб|воробе|сов[аыу]|ворон|чайк|пингвин|куриц|петух|утк[аиу]|гус[ьи]|фламинго|\\bbird\\b|\\beagle\\b|\\bowl\\b"), apply: (b) => { b.legs = 2; b.legStyle = "organic"; b.wings = 2; b.wingKind = "feather"; b.head = 1; b.eyes = 2; b.muzzle = 0.7; b.tail = Math.max(b.tail, 4); b.bodyShape = "sphere"; b.height = Math.max(b.height, 0.34); b.width = Math.max(b.width, 0.2); b.length = Math.max(b.length, 0.28); b.sizeClass = "furniture"; } },
  { label: "рыба", kind: "animal", re: w("рыб[аыуко]|акул|дельфин|кит|скат|карп|щук|форел|\\bfish\\b|\\bshark\\b"), apply: (b) => { b.hull = false; b.legs = 0; b.fins = Math.max(b.fins, 4); b.tail = Math.max(b.tail, 3); b.bodyShape = "capsule"; b.massPlan = "elongated"; b.head = 1; b.eyes = 2; b.sizeClass = "furniture"; b.height = Math.max(b.height, 0.32); b.width = Math.max(b.width, 0.18); b.length = Math.max(b.length, 0.85); } },
  { label: "змея", kind: "animal", re: w("зме[йяию]|питон|удав|червяк|гусениц[аы] насеком|\\bsnake\\b"), apply: (b) => { b.legs = 0; b.tail = Math.max(b.tail, 14); b.bodyShape = "capsule"; b.head = 1; b.eyes = 2; b.massPlan = "elongated"; b.length = Math.max(b.length, 2.4); b.width = Math.max(b.width, 0.16); b.height = Math.max(b.height, 0.2); b.sizeClass = "furniture"; } },
  {
    label: "человек", kind: "character",
    re: w("человек|людь|персонаж|character|девуш|девоч|парен|мальчик|женщин|мужчин|аниме|anime|manga|waifu|\\bgirl\\b|\\bboy\\b|woman|\\bman\\b|герой|героин|воин|рыцар|ниндзя|самурай|солдат|школьниц|школьник|студент|врач|повар|танцор|спортсмен|avatar|humanoid|фигурк|статуэтк"),
    apply: (b) => {
      b.legs = 2;
      b.legStyle = "organic";
      b.arms = 2;
      b.hands = true;
      b.head = 1;
      b.eyes = 2;
      b.hair = Math.max(b.hair, 1);
      b.clothed = true;
      b.massPlan = "stacked";
      b.bodyShape = "capsule";
      b.height = b.params.height ?? Math.max(b.height, 1.72);
      b.width = b.params.width ?? Math.max(b.width, b.height * 0.28);
      b.length = b.params.depth ?? Math.max(b.length, b.height * 0.17);
      b.sizeClass = "furniture";
      b.muzzle = 0.12;
      b.detail += 0.35;
    },
  },
  { label: "доспехи", re: w(`рыцар|доспех|броня|бронир|armou?r|латы|самурай|воин|штурмовик|киборг|мех[ак]?${E}`), apply: (b) => { b.armour = true; b.detail += 0.2; } },
  { label: "робот", kind: "robot", re: w("робот|\\brobot\\b|андроид|дроид|киборг|механоид|\\bmech\\b|терминатор"), apply: (b) => { b.head = Math.max(b.head, 1); b.eyes = Math.max(b.eyes, 2); b.legStyle = "mech"; b.arms = Math.max(b.arms, 2); b.legs = Math.max(b.legs, 2); b.antennas = Math.max(b.antennas, 1); b.lights = Math.max(b.lights, 2); b.emissiveAccent = true; b.metalness = 0.7; b.bodyShape = "box"; b.massPlan = "stacked"; b.sizeClass = "furniture"; b.height = Math.max(b.height, 1.5); b.width = Math.max(b.width, b.height * 0.42); b.length = Math.max(b.length, b.height * 0.28); b.detail += 0.3; } },
  { label: "крылья", re: w("крыл(?!ьц)|\\bwing"), counter: /крыл(?!ьц)|wing/i, apply: (b, n) => { b.wings = n ?? Math.max(b.wings, 2); } },
  { label: "хвост", re: w("хвост|\\btail\\b"), apply: (b) => { b.tail = Math.max(b.tail, 6); } },
  { label: "рога", re: w("рог[аиу]|horn|бивн|антлер"), counter: /рог|horn/i, apply: (b, n) => { b.horns = n ?? Math.max(b.horns, 2); } },
  { label: "шипы", re: w("шип[ыаов]|spike|колюч|гребен|гребн"), counter: /шип|spike/i, apply: (b, n) => { b.spikes = n ?? Math.max(b.spikes, 8); } },
  { label: "волосы", re: w("волос|причёск|причес|хвостик|косичк|каре|локон|hair|ponytail|twintail"), apply: (b) => { b.hair = Math.max(b.hair, 2); } },
  { label: "длинные волосы", re: w("длинн(ые|ыми|ых) волос|long hair|до пояса"), apply: (b) => { b.hair = 3; } },
  { label: "руки", re: w("рук[аиу]|\\barms?\\b|манипулятор|щупальц"), counter: /рук|\barms?\b|манипулятор|щупальц/i, apply: (b, n) => { b.arms = n ?? Math.max(b.arms, 2); b.hands = true; } },

  /* --- architecture --- */
  {
    label: "здание", kind: "building",
    re: w(`дом|house|коттедж|вилл|особняк|дач[аиу]|изб[аыу]|шале|бунгало|таунхаус|здани|строени|корпус|павильон|школ|лице[йя]|гимназ|универ|институт|колледж|садик|детсад|больниц|hospital|клиник|поликлиник|офис|office|бизнес.?центр|коворкинг|магазин|молл|\\bmall\\b|торгов(ый|ого) центр|завод|фабрик|склад|ангар|цех|музе[йя]|театр|библиотек|гостиниц|отель|hotel|вокзал|аэропорт|терминал|церкв|храм|мечет|собор|ратуш|замок|крепост|многоэтажк|панельк|хрущёвк|хрущевк|жилой дом|жк${E}`),
    apply: (b) => {
      b.massPlan = "stacked";
      b.bodyShape = "box";
      b.sizeClass = "structure";
      b.floors = Math.max(b.floors, 1);
      b.windows = Math.max(b.windows, 6);
      b.doors = Math.max(b.doors, 1);
      b.roof = b.roof === "none" ? "gable" : b.roof;
      b.stairs = Math.max(b.stairs, 3);
      b.width = Math.max(b.width, 11);
      b.length = Math.max(b.length, 9);
      b.detail += 0.3;
      b.legs = 0;
      b.wheels = 0;
    },
  },
  { label: "башня", kind: "landmark", attach: (b, n) => { b.towers = n ?? Math.max(b.towers, 1); b.spire = true; }, re: w("башн|tower|небоскрёб|небоскреб|skyscraper|высотк|телебашн|минарет|маяк|колокольн|донжон"), counter: /башн|tower/i, apply: (b, n) => { b.towers = n ?? Math.max(b.towers, 1); b.massPlan = "stacked"; b.sizeClass = "landmark"; b.floors = Math.max(b.floors, 8); b.spire = true; b.height = Math.max(b.height, 34); b.width = Math.max(b.width, 13); b.length = Math.max(b.length, 13); b.windows = Math.max(b.windows, 32); } },
  { label: "мост", kind: "landmark", re: w("мост|bridge|эстакад|виадук|путепровод|переправ"), apply: (b) => { b.massPlan = "platform"; b.sizeClass = "landmark"; b.columns = Math.max(b.columns, 4); b.railings = true; b.cables = Math.max(b.cables, 12); b.length = Math.max(b.length, 60); b.width = Math.max(b.width, 9); b.height = Math.max(b.height, 14); b.roof = "none"; b.windows = 0; } },
  { label: "стадион", kind: "landmark", re: w("стадион|stadium|арен[аыу]|спорткомплекс|манеж|ипподром|амфитеатр"), apply: (b) => { b.massPlan = "shell"; b.hollow = true; b.sizeClass = "landmark"; b.columns = Math.max(b.columns, 16); b.roof = "flat"; b.length = Math.max(b.length, 90); b.width = Math.max(b.width, 70); b.height = Math.max(b.height, 22); } },
  { label: "комната", kind: "room", re: w(`комнат|спальн|кухн|гостин|ванн|санузел|интерьер|interior|\\broom\\b|bedroom|kitchen|кабинет|квартир|студи[яю]|аудитори|класс${E}|прихож|коридор|лоджи`), apply: (b) => { b.massPlan = "shell"; b.hollow = true; b.sizeClass = "structure"; b.roof = "none"; b.windows = Math.max(b.windows, 1); b.doors = Math.max(b.doors, 1); b.height = 2.8; b.width = Math.max(b.width, 4.2); b.length = Math.max(b.length, 3.6); b.floors = 1; b.detail += 0.3; } },
  { label: "этажи", re: w("этаж|floor|storey|story|уровн|ярус"), counter: /этаж|floor|storey|story|уровн|ярус/i, apply: (b, n) => { if (n) { b.floors = n; b.massPlan = "stacked"; } } },
  { label: "окна", re: w("окн[оаеы]|окон|window|остеклен|витраж|панорамн"), counter: /окн|окон|window/i, apply: (b, n) => { b.windows = n ?? Math.max(b.windows, 6); if (n) b.windowsExplicit = true; } },
  { label: "панорамное остекление", re: w("панорамн|витраж|floor.?to.?ceiling|стеклянн(ый|ая|ое) фасад|curtain wall"), apply: (b) => { b.windowStyle = "curtain"; b.glassy = true; } },
  { label: "ленточное остекление", re: w("ленточн(ое|ым) остеклен|ribbon window|полос(а|ы) окон"), apply: (b) => { b.windowStyle = "ribbon"; } },
  { label: "дверь", re: w("двер[ьиями]|\\bdoor\\b|вход|калитк|ворот"), counter: /двер|\bdoor\b|ворот/i, apply: (b, n) => { b.doors = n ?? Math.max(b.doors, 1); } },
  { label: "двускатная крыша", re: w("двускат|gable|щипцов"), apply: (b) => { b.roof = "gable"; } },
  { label: "вальмовая крыша", re: w("четырёхскат|четырехскат|вальмов|hip ?roof|шатров"), apply: (b) => { b.roof = "hip"; } },
  { label: "плоская крыша", re: w("плоск(ая|ой) ?(крыш|кровл)|flat ?roof|эксплуатируем(ая|ой) кровл"), apply: (b) => { b.roof = "flat"; } },
  { label: "односкатная крыша", re: w("односкат|shed ?roof|наклонн(ая|ой) крыш"), apply: (b) => { b.roof = "shed"; } },
  { label: "мансарда", re: w("мансард|mansard|мезонин|чердак|attic"), apply: (b) => { b.roof = "mansard"; } },
  { label: "купол", re: w("купол|dome|сферическ(ая|ой) крыш|планетари"), apply: (b) => { b.roof = "dome"; b.dome = true; } },
  { label: "труба", re: w("дымоход|труб(а|ы|ой|ами)?(?![а-яё])|chimney|камин|печн(ая|ой) труб"), counter: /дымоход|труб|chimney/i, apply: (b, n) => { if (["building", "landmark", "watercraft", "room"].includes(b.kind) || /дымоход|chimney|камин|на крыш|печн/i.test(b.params.raw)) b.chimneys = n ?? Math.max(b.chimneys, 1); } },
  { label: "колонны", re: w("колонн|column|портик|pillar|пилон|антаблемент"), counter: /колонн|column|pillar|пилон/i, apply: (b, n) => { b.columns = n ?? Math.max(b.columns, 4); } },
  { label: "арки", re: w("арк[аиу]|арок|arch|аркад|свод"), counter: /арк|арок|arch/i, apply: (b, n) => { b.arches = n ?? Math.max(b.arches, 3); } },
  { label: "балкон", re: w("балкон|balcony|лоджи"), counter: /балкон|balcony/i, apply: (b, n) => { b.balconies = n ?? Math.max(b.balconies, 1); b.railings = true; } },
  { label: "терраса", re: w("террас|terrace|веранд|veranda|patio|патио|крыльц|porch|навес"), apply: (b) => { b.terrace = true; b.railings = true; b.stairs = Math.max(b.stairs, 3); } },
  { label: "лестница", re: w("лестниц|ступен|stairs|крыльц|подъём|пандус"), counter: /ступен|stairs/i, apply: (b, n) => { b.stairs = n ?? Math.max(b.stairs, 5); } },
  { label: "ограждение", re: w("перил|ограждени|railing|балюстрад|забор|оград|fence|штакетник"), apply: (b) => { b.railings = true; } },
  { label: "забор", re: w("забор|оград[аыу]|fence|частокол|штакетник"), apply: (b) => { b.fence = true; } },
  { label: "гараж", re: w("гараж|garage|карпорт|навес для маш|парковк|parking"), apply: (b) => { b.garage = true; } },
  { label: "шпиль", re: w("шпил|spire|башенк|turret|флюгер"), apply: (b) => { b.spire = true; } },
  { label: "солнечные панели", re: w("солнечн(ые|ых|ыми) панел|solar|фотоэлемент|гелиопанел"), counter: /панел|solar/i, apply: (b, n) => { b.solar = n ?? Math.max(b.solar, 4); } },

  /* --- furniture --- */
  { label: "стол", kind: "furniture", furnishing: "стол", re: w(`стол(а|е|у|ы|ом|ами|ов|ах)?${E}|столик|обеденн|письменн(ый|ого) стол|\\btable\\b|\\bdesk\\b|верстак|парт[аы]${E}`), apply: (b) => { b.tabletop = true; b.furnitureLegs = Math.max(b.furnitureLegs, 4); b.legStyle = "furniture"; b.massPlan = "platform"; b.sizeClass = "furniture"; const seats = seatCount(b.params.raw); const coffee = /журнальн|кофейн|coffee table/i.test(b.params.raw); b.height = b.params.height ?? (coffee ? 0.45 : 0.75); b.width = b.params.width ?? (seats ? Math.max(0.8, Math.ceil(seats / 2) * 0.6) : coffee ? 1.0 : 1.5); b.length = b.params.depth ?? (coffee ? 0.55 : seats && seats >= 6 ? 0.95 : 0.85); b.legs = 0; b.wheels = 0; b.detail += 0.2; } },
  { label: "стул", kind: "furniture", furnishing: "стул", re: w(`стул(а|е|у|ом|ья|ьев|ьям|ьями)?${E}|стуль|\\bchair\\b|табурет|кресл|сиден|скамейк|скамь|лавк|банкетк|пуф`), apply: (b) => { b.seat = true; b.backrest = true; b.furnitureLegs = Math.max(b.furnitureLegs, 4); b.legStyle = "furniture"; b.massPlan = "platform"; b.sizeClass = "furniture"; b.height = b.params.height ?? 0.9; b.width = b.params.width ?? 0.48; b.length = b.params.depth ?? 0.52; b.cushions = Math.max(b.cushions, 1); b.legs = 0; } },
  { label: "кресло", kind: "furniture", furnishing: "кресло", re: w("кресл|\\barmchair\\b|шезлонг"), apply: (b) => { b.armrests = true; b.cushions = Math.max(b.cushions, 2); b.width = b.params.width ?? 0.78; b.length = b.params.depth ?? 0.8; } },
  { label: "диван", kind: "furniture", furnishing: "диван", re: w("диван|sofa|couch|тахт|канап"), apply: (b) => { b.seat = true; b.backrest = true; b.armrests = true; b.cushions = Math.max(b.cushions, 3); b.pillows = Math.max(b.pillows, 2); b.furnitureLegs = Math.max(b.furnitureLegs, 4); b.legStyle = "furniture"; b.massPlan = "platform"; b.sizeClass = "furniture"; const seats = seatCount(b.params.raw) ?? 3; b.cushions = Math.max(1, Math.min(5, seats)); b.height = b.params.height ?? 0.85; b.width = b.params.width ?? seats * 0.62 + 0.36; b.length = b.params.depth ?? 0.9; b.legs = 0; } },
  { label: "кровать", kind: "furniture", furnishing: "кровать", re: w(`кроват|\\bbed\\b|матрас|топчан|нар[ыа]${E}|двуспальн|односпальн`), apply: (b) => { b.mattress = true; b.pillows = Math.max(b.pillows, 2); b.backrest = true; b.furnitureLegs = Math.max(b.furnitureLegs, 4); b.legStyle = "furniture"; b.massPlan = "platform"; b.sizeClass = "furniture"; b.height = b.params.height ?? 0.72; b.width = b.params.width ?? 1.6; b.length = b.params.depth ?? 2.05; b.legs = 0; } },
  { label: "шкаф", kind: "furniture", furnishing: "шкаф", re: w("шкаф|wardrobe|стеллаж|комод|тумб|буфет|сервант|пенал|витрин"), apply: (b) => { b.shelves = Math.max(b.shelves, 4); b.doors = Math.max(b.doors, 2); b.handles = Math.max(b.handles, 2); b.massPlan = "stacked"; b.sizeClass = "furniture"; b.height = b.params.height ?? 2.05; b.width = b.params.width ?? 1.2; b.length = b.params.depth ?? 0.58; b.legs = 0; b.hollow = false; } },
  { label: "кухонный гарнитур", kind: "furniture", furnishing: "кухонный гарнитур", re: w("гарнитур|кухонн(ый|ые) (шкаф|модул)|kitchen (unit|cabinet)|столешниц"), apply: (b) => { b.drawers = Math.max(b.drawers, 3); b.doors = Math.max(b.doors, 2); b.handles = Math.max(b.handles, 2); b.massPlan = "stacked"; b.bodySegments = 1; b.sizeClass = "furniture"; b.height = b.params.height ?? 0.9; b.width = b.params.width ?? 2.4; b.length = b.params.depth ?? 0.6; b.legs = 0; } },
  { label: "полки", re: w("полк[аиу]|shelf|shelves|книжн(ый|ая)|библиотечн"), counter: /полк|shelf|shelves/i, apply: (b, n) => { b.shelves = n ?? Math.max(b.shelves, 4); } },
  { label: "ящики", re: w("ящик|drawer|выдвижн"), counter: /ящик|drawer/i, apply: (b, n) => { b.drawers = n ?? Math.max(b.drawers, 3); b.handles = Math.max(b.handles, 3); } },
  { label: "подушки", re: w("подушк|pillow|cushion"), counter: /подушк|pillow|cushion/i, apply: (b, n) => { b.pillows = n ?? Math.max(b.pillows, 2); } },

  /* --- devices --- */
  { label: "экран", kind: "device", attach: (b, n) => { b.screens = n ?? Math.max(b.screens, 1); b.emissiveAccent = true; }, re: w("экран|дисплей|screen|display|монитор|телевизор|\\btv\\b|планшет|tablet"), counter: /экран|дисплей|screen|монитор/i, apply: (b, n) => { b.screens = n ?? Math.max(b.screens, 1); b.emissiveAccent = true; b.sizeClass = b.sizeClass === "structure" ? b.sizeClass : "handheld"; } },
  { label: "ноутбук", kind: "device", re: w("ноутбук|laptop|макбук|нетбук"), apply: (b) => { b.screens = Math.max(b.screens, 1); b.keyboard = true; b.massPlan = "platform"; b.sizeClass = "handheld"; b.width = 0.36; b.length = 0.25; b.height = 0.24; b.vents = Math.max(b.vents, 2); b.detail += 0.3; } },
  { label: "телефон", kind: "device", re: w("телефон|смартфон|\\bphone\\b|айфон|iphone|мобильн"), apply: (b) => { b.screens = Math.max(b.screens, 1); b.lenses = Math.max(b.lenses, 2); b.buttons = Math.max(b.buttons, 2); b.sizeClass = "handheld"; b.width = 0.075; b.length = 0.009; b.height = 0.155; b.massPlan = "platform"; b.detail += 0.3; } },
  { label: "компьютер", kind: "device", re: w("компьютер|системн(ый|ого) блок|\\bpc\\b|сервер|консол|playstation|xbox|приставк"), apply: (b) => { b.vents = Math.max(b.vents, 3); b.buttons = Math.max(b.buttons, 2); b.lights = Math.max(b.lights, 1); b.sizeClass = "handheld"; b.massPlan = "stacked"; b.height = Math.max(b.height, 0.42); b.detail += 0.3; } },
  { label: "клавиатура", kind: "device", attach: (b) => { b.keyboard = true; }, re: w("клавиатур|keyboard|клавиш"), apply: (b) => { b.keyboard = true; b.sizeClass = "handheld"; } },
  { label: "кнопки", re: w("кнопк|button|тумблер|переключател|регулятор"), counter: /кнопк|button/i, apply: (b, n) => { b.buttons = n ?? Math.max(b.buttons, 4); } },
  { label: "лампа", kind: "lighting", attach: (b) => { b.lights = Math.max(b.lights + 1, 2); b.emissiveAccent = true; }, re: w(`лампа|светильник|\\blamp\\b|торшер|люстр|бра${E}|фонар|прожектор|ночник`), apply: (b) => { b.lights = Math.max(b.lights, 1); b.emissiveAccent = true; b.massPlan = "radial"; b.sizeClass = "handheld"; b.lampArm = /настольн|гибк|шарнир|desk|flexible/i.test(b.params.raw); b.height = b.params.height ?? (/торшер|напольн|floor lamp/i.test(b.params.raw) ? 1.6 : 0.48); b.width = b.params.width ?? (b.height > 1 ? 0.4 : 0.2); b.length = b.params.depth ?? b.width; b.detail += 0.25; } },
  { label: "камера", re: w("камер[аыу]|camera|объектив|фотоаппарат|вебк"), counter: /камер|camera|объектив/i, apply: (b, n) => { b.lenses = n ?? Math.max(b.lenses, 1); } },
  { label: "антенна", re: w("антенн|antenna|спутников(ая|ую) тарелк|вышк[аиу]|радар"), counter: /антенн|antenna/i, apply: (b, n) => { b.antennas = n ?? Math.max(b.antennas, 1); } },
  { label: "динамик", kind: "device", attach: (b, n) => { b.speakers = n ?? Math.max(b.speakers, 1); }, re: w("колонк|динамик|speaker|сабвуфер|наушник|аудиосистем"), counter: /колонк|динамик|speaker/i, apply: (b, n) => { b.speakers = n ?? Math.max(b.speakers, 1); b.vents = Math.max(b.vents, 1); b.sizeClass = "handheld"; } },
  { label: "дрон", kind: "aircraft", attach: (b, n) => { b.propellers = n ?? Math.max(b.propellers, 4); }, re: w("дрон|drone|квадрокоптер|коптер|вертолёт|вертолет|helicopter"), apply: (b) => { b.propellers = Math.max(b.propellers, 4); b.skids = true; b.lenses = Math.max(b.lenses, 1); b.lights = Math.max(b.lights, 2); b.massPlan = "radial"; b.sizeClass = "handheld"; b.height = Math.max(b.height, 0.2); b.length = Math.max(b.length, 0.5); b.width = Math.max(b.width, 0.5); } },
  { label: "самолёт", kind: "aircraft", re: w("самолёт|самолет|plane|авиалайн|истребител|бомбардир|планёр|планер"), apply: (b) => { b.wings = Math.max(b.wings, 2); b.wingKind = "fixed"; b.massPlan = "elongated"; b.bodyShape = "capsule"; b.sizeClass = "vehicle"; b.length = Math.max(b.length, 12); b.height = Math.max(b.height, 3.4); b.wheels = Math.max(b.wheels, 3); b.wheelSize = 0.12; b.tail = 0; b.fins = Math.max(b.fins, 1); } },
  { label: "ракета", kind: "aircraft", re: w("ракет|rocket|шаттл|носител|баллистич"), apply: (b) => { b.massPlan = "stacked"; b.bodyShape = "cylinder"; b.spire = true; b.fins = Math.max(b.fins, 4); b.sizeClass = "landmark"; b.height = Math.max(b.height, 22); b.length = Math.max(b.length, 3); b.width = Math.max(b.width, 3); b.legs = 0; b.wheels = 0; } },
  { label: "винт", re: w(`винт${E}|пропеллер|propeller|лопаст|ротор|вентилятор|мельниц`), counter: /винт|пропеллер|propeller|лопаст/i, apply: (b, n) => { b.propellers = n ?? Math.max(b.propellers, 1); } },
  { label: "ручка", re: w("ручк[аиу]|handle|рукоят|грип|штурвал|руль"), counter: /ручк|handle|рукоят/i, apply: (b, n) => { b.handles = n ?? Math.max(b.handles, 1); } },
  { label: "носик", kind: "container", attach: (b) => { b.spout = true; }, re: w("носик|spout|чайник|kettle|teapot|заварник|лейк|кофейник|кувшин"), apply: (b) => { b.spout = true; b.lid = true; b.handles = Math.max(b.handles, 1); b.bodyShape = "cylinder"; b.massPlan = "radial"; b.sizeClass = "handheld"; b.height = b.params.height ?? 0.22; } },
  { label: "крышка", re: w("крышк|\\blid\\b|колпач"), apply: (b) => { b.lid = true; } },
  { label: "сосуд", kind: "container", re: w("кружк|чашк|стакан|бутылк|ваз[аыу]|банк[аиу]|горшок|бокал|термос|фляг"), apply: (b) => { b.bodyShape = "cylinder"; b.hollow = true; b.massPlan = "radial"; b.sizeClass = "handheld"; b.height = b.params.height ?? 0.16; b.width = 0.09; b.length = 0.09; b.handles = Math.max(b.handles, 1); b.legs = 0; b.wheels = 0; } },
  { label: "часы", kind: "device", re: w(`час[ыов]${E}|watch|clock|будильник|хронограф`), apply: (b) => { b.bodyShape = "cylinder"; b.massPlan = "radial"; b.sizeClass = "handheld"; b.screens = Math.max(b.screens, 1); b.buttons = Math.max(b.buttons, 2); b.height = b.params.height ?? 0.11; b.width = b.params.width ?? 0.042; b.length = b.params.depth ?? 0.014; } },
  { label: "вентиляция", re: w("вентиляц|решётк|решетк|grille|радиатор|гриль|жалюзи|перфорац"), counter: /решётк|решетк|grille/i, apply: (b, n) => { b.vents = n ?? Math.max(b.vents, 2); } },
  { label: "провода", re: w("провод|кабел|шнур|cable|трос|ванты"), counter: /провод|кабел|cable|трос|ванты/i, apply: (b, n) => { b.cables = n ?? Math.max(b.cables, 2); } },
  { label: "фары", re: w("фар[аыу]|подсветк|неон|neon|светодиод|\\bled\\b|иллюминац|стоп.?сигнал"), counter: /фар|светодиод/i, apply: (b, n) => { b.lights = n ?? Math.max(b.lights, 2); b.emissiveAccent = true; } },
  { label: "лезвие", kind: "weapon", attach: (b) => { b.blade = true; }, re: w(`меч(ом|а|и)?${E}|нож(ом|а|и)?${E}|кинжал|клинок|лезви|сабл|катан|топор|коса${E}|blade|sword|knife|dagger`), apply: (b) => { b.blade = true; b.sizeClass = "handheld"; b.massPlan = "stacked"; const knife = /нож|knife|кинжал|dagger/i.test(b.params.raw); b.height = b.params.height ?? (knife ? 0.3 : /топор|axe/i.test(b.params.raw) ? 0.75 : 1.05); b.width = b.params.width ?? b.height * 0.2; b.length = b.params.depth ?? b.height * 0.05; b.metalness = 0.8; b.roughness = 0.25; b.detail += 0.2; } },

  /* --- household appliances --- */
  // Listed after the robot rule on purpose: "робот-пылесос" is a disc, not a humanoid.
  {
    label: "пылесос",
    kind: "appliance",
    re: w("пылесос|vacuum|roomba"),
    apply: (b) => {
      const robot = /робот|robot|roomba/i.test(b.params.raw);
      Object.assign(b, { legs: 0, arms: 0, hands: false, head: 0, eyes: 0, antennas: 0, legStyle: "organic" });
      b.massPlan = "stacked";
      b.bodySegments = 1;
      b.sizeClass = "handheld";
      b.emissiveAccent = true;
      if (robot) {
        b.bodyShape = "cylinder";
        b.width = 0.34;
        b.length = 0.34;
        b.height = 0.09;
        b.buttons = Math.max(b.buttons, 2);
        b.lights = Math.max(b.lights, 1);
        b.lid = true;
      } else {
        b.bodyShape = "capsule";
        b.width = 0.3;
        b.length = 0.42;
        b.height = 0.3;
        b.handles = Math.max(b.handles, 1);
        b.cables = Math.max(b.cables, 1);
        b.buttons = Math.max(b.buttons, 1);
      }
    },
  },
  { label: "тостер", kind: "appliance", re: w("тостер|toaster"), apply: (b) => { b.massPlan = "stacked"; b.bodyShape = "box"; b.bodySegments = 1; b.sizeClass = "handheld"; b.width = 0.28; b.length = 0.17; b.height = 0.2; b.slots = Math.max(b.slots, 2); b.buttons = Math.max(b.buttons, 1); b.metalness = Math.max(b.metalness, 0.6); b.roughness = 0.3; } },
  { label: "холодильник", kind: "appliance", re: w("холодильник|fridge|refrigerator|морозильн"), apply: (b) => { b.massPlan = "stacked"; b.bodyShape = "box"; b.bodySegments = 1; b.sizeClass = "furniture"; b.width = 0.6; b.length = 0.65; b.height = 1.8; b.doors = Math.max(b.doors, 2); b.handles = Math.max(b.handles, 2); } },
  { label: "микроволновка", kind: "appliance", re: w("микроволнов|microwave|свч"), apply: (b) => { b.massPlan = "stacked"; b.bodyShape = "box"; b.bodySegments = 1; b.sizeClass = "handheld"; b.width = 0.48; b.length = 0.36; b.height = 0.28; b.screens = Math.max(b.screens, 1); b.buttons = Math.max(b.buttons, 4); b.handles = Math.max(b.handles, 1); } },
  { label: "стиральная машина", kind: "appliance", re: w("стиральн\\S* машин|washing machine|стиралк"), apply: (b) => { b.wheels = 0; b.windows = 0; b.doors = 0; b.massPlan = "stacked"; b.bodyShape = "box"; b.bodySegments = 1; b.sizeClass = "furniture"; b.width = 0.6; b.length = 0.6; b.height = 0.85; b.lenses = Math.max(b.lenses, 1); b.buttons = Math.max(b.buttons, 3); } },
  { label: "кофемашина", kind: "appliance", re: w("кофемашин|кофеварк|coffee machine|эспрессо"), apply: (b) => { b.wheels = 0; b.massPlan = "stacked"; b.bodyShape = "box"; b.bodySegments = 1; b.sizeClass = "handheld"; b.width = 0.3; b.length = 0.4; b.height = 0.38; b.buttons = Math.max(b.buttons, 3); b.spout = true; b.lights = Math.max(b.lights, 1); b.metalness = Math.max(b.metalness, 0.5); } },
  { label: "кондиционер", kind: "appliance", re: w("кондиционер|сплит.?систем|air conditioner"), apply: (b) => { b.massPlan = "stacked"; b.bodyShape = "box"; b.bodySegments = 1; b.sizeClass = "handheld"; b.width = 0.85; b.length = 0.22; b.height = 0.29; b.vents = Math.max(b.vents, 2); b.lights = Math.max(b.lights, 1); } },

  /* --- surface qualities --- */
  { label: "стекло", surface: true, re: w("стекл|glass|прозрачн|акрил|хрустал|crystal"), apply: (b) => { b.glassy = true; b.roughness = 0.1; } },
  { label: "металл", surface: true, re: w("металл|сталь|steel|metal|алюмин|хром|титан|латун|бронз|медн|железн"), apply: (b) => { b.metalness = 0.78; b.roughness = 0.3; } },
  { label: "дерево", surface: true, re: w("деревян|дерева|бревен|брус|wood|timber|дубов|соснов|фанер"), apply: (b) => { b.metalness = 0.02; b.roughness = 0.78; } },
  { label: "камень", surface: true, re: w("камен|камня|stone|гранит|мрамор|базальт|булыжн"), apply: (b) => { b.metalness = 0.05; b.roughness = 0.85; } },
  { label: "бетон", surface: true, re: w("бетон|concrete|железобетон|монолит|панельн"), apply: (b) => { b.metalness = 0.03; b.roughness = 0.9; } },
  { label: "кирпич", surface: true, re: w("кирпич|brick|клинкер"), apply: (b) => { b.metalness = 0.02; b.roughness = 0.92; b.detail += 0.15; } },
  { label: "детализация", re: w(`детализ|детальн|проработ|подробн|реалистичн|высокополигон|hi.?poly|детали${E}`), apply: (b) => { b.detail += 0.5; } },
  { label: "минимализм", re: w("минимал|minimal|лаконич|простой|простая|схематич|low.?poly"), apply: (b) => { b.detail -= 0.25; } },
];

/* ---------------- proportion words ---------------- */

const PROPORTIONS: [RegExp, (b: Blueprint) => void][] = [
  [w("высок|вытянут|тонк(ий|ая)|стройн|узк|tall|slim|башенн"), (b) => { b.height *= 1.45; b.width *= 0.82; b.length *= 0.82; }],
  [w("низк|приземист|плоск|сплюснут|тонкий профиль|flat|low"), (b) => { b.height *= 0.62; b.width *= 1.12; b.length *= 1.12; }],
  [w("широк|массивн|толст|мощн|коренаст|wide|bulky"), (b) => { b.width *= 1.35; b.length *= 1.2; }],
  [w("длинн|вытянут(ый|ая) вдоль|удлинён|удлинен|long"), (b) => { b.length *= 1.45; }],
  [w("кругл|округл|сферич|шарообраз|round|spherical"), (b) => { b.bodyShape = "sphere"; }],
  [w("квадратн|кубическ|прямоугольн|коробч|boxy|cubic"), (b) => { b.bodyShape = "box"; }],
  [w("цилиндр|трубчат|бочк|cylindrical"), (b) => { b.bodyShape = "cylinder"; }],
  [w("обтекаем|аэродинам|каплевидн|streamlin"), (b) => { b.bodyShape = "capsule"; b.taper = 0.45; }],
  [w("остроконечн|конус|заострён|заострен|клиновидн"), (b) => { b.taper = 0.7; }],
];

/* ---------------- palettes ---------------- */

const PALETTES: { primary: string; secondary: string; accent: string; trim: string }[] = [
  { primary: "#d8cdb8", secondary: "#b3a68c", accent: "#8c5b3f", trim: "#4a4740" },
  { primary: "#b9c2cb", secondary: "#8d97a3", accent: "#3f6fa8", trim: "#31353b" },
  { primary: "#c8b9a6", secondary: "#a08b72", accent: "#7a5c34", trim: "#3b352d" },
  { primary: "#cfd4d8", secondary: "#9aa3ad", accent: "#c1462f", trim: "#2a2c31" },
  { primary: "#a8b3a4", secondary: "#7f8a7c", accent: "#3f8a5b", trim: "#2f342f" },
  { primary: "#dad3c6", secondary: "#b0a695", accent: "#6d4a9c", trim: "#39343f" },
  { primary: "#e2ded6", secondary: "#bab5aa", accent: "#c9973f", trim: "#413c33" },
  { primary: "#98a2ac", secondary: "#767f89", accent: "#3fa39a", trim: "#282d33" },
];

const SIZE_DEFAULTS: Record<SizeClass, { length: number; width: number; height: number }> = {
  micro: { length: 0.05, width: 0.05, height: 0.05 },
  handheld: { length: 0.28, width: 0.2, height: 0.3 },
  furniture: { length: 1.2, width: 0.8, height: 1.1 },
  vehicle: { length: 4.4, width: 1.85, height: 1.45 },
  structure: { length: 12, width: 9, height: 7 },
  landmark: { length: 40, width: 30, height: 40 },
};

function baseBlueprint(prompt: string): Blueprint {
  const params = parsePromptParams(prompt);
  const rng = new Rng(hashString(`${prompt}::blueprint`));
  const palette = PALETTES[hashString(prompt) % PALETTES.length];

  return {
    prompt,
    seed: params.seed,
    rng,
    params,

    kind: "product",
    // 0 means "not decided yet" — the size class fills in whatever the prompt
    // and the lexicon left alone, one axis at a time.
    length: 0,
    width: 0,
    height: 0,
    sizeClass: "furniture",
    explicitAxes: {
      width: params.width !== undefined,
      length: params.depth !== undefined,
      height: params.height !== undefined,
    },

    massPlan: "stacked",
    bodyShape: "box",
    bodySegments: 1,
    taper: 0,
    baseHeight: 0,
    hollow: false,

    wheels: 0,
    wheelSize: 0.34,
    trailer: false,
    tracks: false,
    legs: 0,
    legStyle: "organic",
    legLength: 0.42,
    hull: false,
    skids: false,

    head: 0,
    headSize: 0.24,
    neck: 0,
    eyes: 0,
    ears: "none",
    muzzle: 0,
    horns: 0,
    mane: false,
    arms: 0,
    hands: false,
    wings: 0,
    wingKind: "membrane",
    tail: 0,
    tailSpikes: false,
    spikes: 0,
    fins: 0,
    hair: 0,
    clothed: false,
    armour: false,

    floors: 0,
    windows: 0,
    windowsExplicit: false,
    windowStyle: "punched",
    doors: 0,
    roof: "none",
    roofOverhang: 0.35,
    chimneys: 0,
    columns: 0,
    arches: 0,
    balconies: 0,
    terrace: false,
    stairs: 0,
    railings: false,
    fence: false,
    dome: false,
    spire: false,
    towers: 0,
    garage: false,

    screens: 0,
    keyboard: false,
    buttons: 0,
    lenses: 0,
    antennas: 0,
    vents: 0,
    handles: 0,
    spout: false,
    lid: false,
    propellers: 0,
    cables: 0,
    lights: 0,
    speakers: 0,
    cannon: false,
    mast: false,
    solar: 0,
    blade: false,
    slots: 0,
    lampArm: false,

    seat: false,
    backrest: false,
    armrests: false,
    mattress: false,
    shelves: 0,
    drawers: 0,
    tabletop: false,
    furnitureLegs: 0,
    cushions: 0,
    pillows: 0,

    copies: 1,
    furnishings: [],

    primary: palette.primary,
    secondary: palette.secondary,
    accent: palette.accent,
    trim: palette.trim,
    metalness: 0.12,
    roughness: 0.62,
    glassy: false,
    emissiveAccent: false,
    detail: 1,
    matched: [],
  };
}

/** "8 ног", "ног 8", "восемь ног" → 8 for the unit the rule cares about. */
function countFor(text: string, counter: RegExp): number | undefined {
  const unit = counter.source;
  const WORDS: [RegExp, number][] = [
    [/\bодн(а|о|ой|им)?\b|\bодин\b/, 1],
    [/\bдв(а|е|ух|умя)\b/, 2],
    [/\bтр(и|ёх|ех|емя)\b/, 3],
    [/\bчетыр(е|ёх|ех)\b/, 4],
    [/\bпят(ь|и|ью)\b/, 5],
    [/\bшест(ь|и|ью)\b/, 6],
    [/\bсем(ь|и|ью)\b/, 7],
    [/\bвосьм(и|ью)\b|\bвосемь\b/, 8],
    [/\bдевят(ь|и|ью)\b/, 9],
    [/\bдесят(ь|и|ью)\b/, 10],
  ];

  const numeric =
    text.match(new RegExp(`(\\d+)\\s*[-\\s]?(?:${unit})`, "i")) ??
    text.match(new RegExp(`(?:${unit})\\D{0,8}?(\\d+)`, "i"));
  if (numeric) {
    const value = Math.round(Number(numeric[1]));
    if (Number.isFinite(value) && value > 0 && value <= 64) return value;
  }

  for (const [pattern, value] of WORDS) {
    const combined = new RegExp(`${pattern.source}\\s*[-\\s]?(?:${unit})`, "i");
    if (combined.test(text)) return value;
  }
  return undefined;
}

/* ---------------- reading the sentence ---------------- */

/** "стол на 6 человек" must not grow a person out of the word "человек". */
function normalizeCounts(text: string): string {
  return text.replace(/(\d+)\s*(?:человек\S*|персон\S*|гост(?:ей|я)\S*|people|persons?|guests?)/gi, "$1 персон");
}

const SEAT_WORDS: [RegExp, number][] = [
  [/одноместн/i, 1],
  [/двухместн|двуместн/i, 2],
  [/трёхместн|трехместн/i, 3],
  [/четырёхместн|четырехместн/i, 4],
  [/пятиместн/i, 5],
  [/шестиместн/i, 6],
];

/** "на 6 персон", "трёхместный", "for 4 people" → seats. */
export function seatCount(raw: string): number | undefined {
  const text = normalizeCounts(raw.toLowerCase());
  const numeric = text.match(/(\d+)\s*(?:персон|мест|seat)/i);
  if (numeric) {
    const value = Number(numeric[1]);
    if (value > 0 && value <= 24) return value;
  }
  for (const [pattern, value] of SEAT_WORDS) if (pattern.test(text)) return value;
  return undefined;
}

type SegmentMode = "attach" | "negate" | "material";
type Segment = { text: string; mode: SegmentMode };

/**
 * Split off everything that hangs on a preposition. "Робот-паук на 8 ногах с
 * прожектором" is a robot; legs and a searchlight are things it *has*. A
 * preposition straight after a number is a dimension ("6 на 5 м"), not a split.
 */
function splitPrompt(text: string): { subject: string; segments: Segment[] } {
  const separator =
    /(?<!\d\s?)\s(со|с|на|во|в|для|из|без|without|with|on|in|for|made of)\s/gi;
  const marks: { index: number; end: number; word: string }[] = [];
  for (const match of text.matchAll(separator)) {
    marks.push({ index: match.index ?? 0, end: (match.index ?? 0) + match[0].length, word: match[1] });
  }
  if (!marks.length) return { subject: text, segments: [] };

  const segments: Segment[] = marks.map((mark, i) => {
    const word = mark.word.toLowerCase();
    return {
      text: text.slice(mark.end, marks[i + 1]?.index ?? text.length),
      mode: word === "без" || word === "without" ? "negate" : word === "из" || word === "made of" ? "material" : "attach",
    };
  });
  return { subject: text.slice(0, marks[0].index), segments };
}

/** Fields that say what the object is and how big — add-ons never touch these. */
const IDENTITY = new Set<string>([
  "kind",
  "massPlan",
  "sizeClass",
  "bodyShape",
  "bodySegments",
  "taper",
  "baseHeight",
  "hollow",
  "length",
  "width",
  "height",
  "floors",
  "copies",
  "legStyle",
  "primary",
  "secondary",
  "accent",
  "trim",
  "metalness",
  "roughness",
  "matched",
  "furnishings",
]);

/** String fields an add-on may set: "с панорамными окнами", "с двускатной крышей". */
const ADDON_STRINGS = new Set<string>(["roof", "wingKind", "ears", "windowStyle"]);

/** Countable features — what "без X" switches off. */
const COUNT_KEYS = [
  "wheels", "legs", "arms", "head", "eyes", "horns", "wings", "tail", "spikes", "fins", "hair",
  "windows", "doors", "chimneys", "columns", "arches", "balconies", "stairs", "towers",
  "screens", "buttons", "lenses", "antennas", "vents", "handles", "propellers", "cables",
  "lights", "speakers", "solar", "shelves", "drawers", "furnitureLegs", "cushions", "pillows", "slots",
] as const;

type Hit = { rule: Rule; start: number; end: number };

function hitsIn(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const rule of RULES) {
    const match = rule.re.exec(text);
    if (match) hits.push({ rule, start: match.index, end: match.index + match[0].length });
  }
  return hits;
}

function addFurnishing(b: Blueprint, rule: Rule, text: string) {
  if (!rule.furnishing) return;
  // "кресло" also trips the chair rule; only a real chair word adds a chair.
  if (rule.furnishing === "стул" && !/стул|chair|табурет|скам|лавк/i.test(text)) return;
  if (!b.furnishings.includes(rule.furnishing)) b.furnishings.push(rule.furnishing);
  b.matched.push(`мебель: ${rule.furnishing}`);
}

/**
 * The main noun phrase decides what the object is. Of the words that name a
 * whole object, the head noun wins — the one that ends last, and of two ending
 * together the longer ("стиральная машина" over "машина"). "Офисный стол" is
 * therefore a table and "робот-пылесос" a vacuum, not a humanoid.
 */
function applySubject(b: Blueprint, text: string, fullText: string) {
  const hits = hitsIn(text);
  const kinded = hits.filter((hit) => hit.rule.kind);

  let head: Hit[] = kinded.filter((hit) => hit.rule.kind === "room");
  if (!head.length && kinded.length) {
    const best = kinded.reduce((a, hit) =>
      hit.end > a.end || (hit.end === a.end && hit.end - hit.start > a.end - a.start) ? hit : a
    );
    head = kinded.filter((hit) => hit.start === best.start && hit.end === best.end);
  }
  if (head.length) {
    b.kind = head[head.length - 1].rule.kind as ObjectKind;
    const copies = countBefore(text.slice(0, head[0].start));
    // "4 колеса" counts wheels, not cars: skip when the head word is the rule's own unit.
    const headWord = text.slice(head[0].start, head[0].end);
    const countsParts = head[0].rule.counter?.test(headWord) ?? false;
    if (copies && !countsParts && b.kind !== "room" && b.kind !== "landmark") b.copies = copies;
  }

  for (const hit of hits) {
    const { rule } = hit;
    if (rule.kind && !head.includes(hit)) {
      if (b.kind === "room") addFurnishing(b, rule, text);
      continue;
    }
    const count = rule.counter ? countFor(text, rule.counter) ?? countFor(fullText, rule.counter) : undefined;
    b.matched.push(rule.label);
    rule.apply(b, count);
  }
}

const COPY_WORDS: [RegExp, number][] = [
  [/(^|\s)(два|две|пара|two|pair of)\s*$/, 2],
  [/(^|\s)(три|three)\s*$/, 3],
  [/(^|\s)(четыре|four)\s*$/, 4],
  [/(^|\s)(пять|five)\s*$/, 5],
  [/(^|\s)(шесть|six)\s*$/, 6],
];

/** "три стула", "2 кресла" — a count standing right before the head noun (one adjective allowed). */
function countBefore(prefix: string): number | undefined {
  const trimmed = prefix.trim().replace(/\s+\S+(ых|их|ые|ие|ой|ый|ий|ая|яя)$/i, "");
  const digit = trimmed.match(/(^|\s)(\d+)$/);
  if (digit) {
    const value = Number(digit[2]);
    return value >= 2 && value <= 8 ? value : undefined;
  }
  for (const [pattern, value] of COPY_WORDS) if (pattern.test(trimmed)) return value;
  return undefined;
}

function setField(b: Blueprint, key: string, value: unknown) {
  (b as unknown as Record<string, unknown>)[key] = value;
}

/** Layer an add-on onto the object without letting it redefine the object. */
function mergeAddon(b: Blueprint, rule: Rule, count: number | undefined) {
  const trial: Blueprint = { ...b, matched: [], furnishings: [...b.furnishings] };
  rule.apply(trial, count);
  const before = b as unknown as Record<string, unknown>;
  const after = trial as unknown as Record<string, unknown>;

  for (const key of Object.keys(after)) {
    if (IDENTITY.has(key) || before[key] === after[key]) continue;
    const was = before[key];
    const now = after[key];
    if (typeof now === "number" && typeof was === "number") {
      if (key === "detail") b.detail += Math.max(0, now - was);
      else setField(b, key, count !== undefined && now === count ? now : Math.max(was, now));
    } else if (typeof now === "boolean") {
      if (now) setField(b, key, true);
    } else if (typeof now === "string" && ADDON_STRINGS.has(key)) {
      setField(b, key, now);
    }
  }
}

/** "без окон", "without wheels": switch off every feature the rule would add. */
function negateRule(b: Blueprint, rule: Rule, negated: Set<string>) {
  const zeroed = { ...b, matched: [], furnishings: [] } as unknown as Record<string, unknown>;
  for (const key of COUNT_KEYS) zeroed[key] = 0;
  for (const [key, value] of Object.entries(zeroed)) if (value === true) zeroed[key] = false;
  rule.apply(zeroed as unknown as Blueprint, undefined);

  for (const key of COUNT_KEYS) {
    if (zeroed[key]) {
      setField(b, key, 0);
      negated.add(key);
    }
  }
  for (const [key, value] of Object.entries(zeroed)) {
    if (value === true && typeof (b as unknown as Record<string, unknown>)[key] === "boolean" && !IDENTITY.has(key)) {
      setField(b, key, false);
      negated.add(key);
    }
  }
  b.matched.push(`без: ${rule.label}`);
}

function applySegment(b: Blueprint, segment: Segment, fullText: string, negated: Set<string>) {
  if (segment.mode === "negate" && /крыш|кровл|roof/i.test(segment.text)) {
    b.roof = "none";
    negated.add("roof");
  }

  for (const rule of RULES) {
    if (!rule.re.test(segment.text)) continue;
    const count = rule.counter
      ? countFor(segment.text, rule.counter) ?? countFor(fullText, rule.counter)
      : undefined;

    if (segment.mode === "negate") {
      negateRule(b, rule, negated);
    } else if (rule.surface) {
      // "дом из кирпича" is a brick house; "дом с металлической крышей" is not metal.
      if (segment.mode === "material") {
        rule.apply(b, count);
        b.matched.push(rule.label);
      }
    } else if (b.kind === "room" && rule.furnishing) {
      addFurnishing(b, rule, segment.text);
    } else if (rule.attach) {
      rule.attach(b, count);
      b.matched.push(`+${rule.label}`);
    } else if (!rule.kind) {
      mergeAddon(b, rule, count);
      b.matched.push(`+${rule.label}`);
    }
  }
}

/** What a room gets when the prompt named none. */
const ROOM_DEFAULTS: [RegExp, string[]][] = [
  [/спальн|bedroom/i, ["кровать", "шкаф"]],
  [/кухн|kitchen/i, ["кухонный гарнитур", "стол"]],
  [/гостин|living/i, ["диван", "журнальный столик"]],
  [/кабинет|study|office/i, ["стол", "стул", "шкаф"]],
  [/ванн|санузел|bath/i, []],
];

/**
 * Read the prompt into a Blueprint. Rules are additive: every match layers
 * another feature onto the same object, which is what lets an unseen
 * combination of words produce an unseen model.
 */
export function planFromPrompt(prompt: string): Blueprint {
  const blueprint = baseBlueprint(prompt);
  const text = normalizeCounts(prompt.toLowerCase());
  const { subject, segments } = splitPrompt(text);
  const { rng, params } = blueprint;
  const negated = new Set<string>();

  applySubject(blueprint, subject, text);
  for (const segment of segments) {
    // Nothing in the main phrase said what this is — let the rest decide.
    if (blueprint.kind === "product" && segment.mode === "attach") applySubject(blueprint, segment.text, text);
    else applySegment(blueprint, segment, text, negated);
  }

  if (blueprint.kind === "room" && !blueprint.furnishings.length) {
    const defaults = ROOM_DEFAULTS.find(([pattern]) => pattern.test(subject))?.[1] ?? ["стол", "стул"];
    blueprint.furnishings.push(...defaults);
  }

  // Nothing recognised: build a plausible object out of the prompt's own hash so
  // two unknown phrases still differ from each other.
  if (!blueprint.matched.length) {
    blueprint.sizeClass = rng.pick(["handheld", "furniture"] as const);
    blueprint.bodyShape = rng.pick(["box", "cylinder", "capsule", "sphere"] as const);
    blueprint.massPlan = rng.pick(["stacked", "elongated", "platform", "radial"] as const);
    blueprint.bodySegments = rng.int(2, 4);
    blueprint.buttons = rng.int(0, 4);
    blueprint.vents = rng.int(0, 2);
    blueprint.handles = rng.int(0, 2);
    blueprint.lights = rng.int(0, 2);
    blueprint.furnitureLegs = rng.chance(0.4) ? 4 : 0;
    blueprint.matched.push("свободная форма по тексту");
  }

  // Size class fills in every axis the wording did not pin down. Doing this per
  // axis matters: "дом на колёсах" sets a plan and a footprint but no height.
  const defaults = SIZE_DEFAULTS[blueprint.sizeClass];
  if (!blueprint.length) blueprint.length = defaults.length;
  if (!blueprint.width) blueprint.width = defaults.width;
  if (!blueprint.height) blueprint.height = defaults.height;

  // Shape and size adjectives describe the main object only: "с длинными
  // волосами" does not stretch the girl, "с большими колёсами" does not grow the car.
  for (const [pattern, apply] of PROPORTIONS) {
    if (pattern.test(subject)) apply(blueprint);
  }

  const adjectiveScale = {
    tiny: 0.4,
    small: 0.7,
    medium: 1,
    large: 1.4,
    huge: 2.1,
  }[scaleOf(subject)];
  // An explicit storey count is a size statement — "небоскрёб 40 этажей" must
  // not then be multiplied again by the "huge" adjective hiding in the noun.
  if (!params.hasExplicitSize && !params.floors && adjectiveScale !== 1) {
    blueprint.length *= adjectiveScale;
    blueprint.width *= adjectiveScale;
    blueprint.height *= adjectiveScale;
  }

  // Free-standing variation so two prompts in the same family still differ —
  // applied before the prompt's own numbers so those land exactly.
  blueprint.length = rng.vary(blueprint.length, 0.08);
  blueprint.width = rng.vary(blueprint.width, 0.08);
  blueprint.height = rng.vary(blueprint.height, 0.08);
  blueprint.detail = Math.max(0.5, Math.min(2.2, blueprint.detail + rng.float(-0.05, 0.15)));

  // Numbers in the prompt always win over anything inferred.
  // "ширина" is the side-to-side extent (x), "длина/глубина" runs front-to-back (z).
  if (params.width) blueprint.width = params.width;
  if (params.depth) blueprint.length = params.depth;
  if (params.height) blueprint.height = params.height;
  if (params.floors) {
    blueprint.floors = params.floors;
    blueprint.massPlan = "stacked";
    if (!params.height) blueprint.height = Math.max(3.2, params.floors * 3.3);
    if (blueprint.roof === "none" && !negated.has("roof")) {
      blueprint.roof = params.floors > 5 ? "flat" : "gable";
    }
    if (!blueprint.windows && !negated.has("windows")) blueprint.windows = params.floors * 4;

    // A tall block needs a footprint to stand on. Without this a 20-storey
    // house came out 9 × 10 m — a pencil rather than a building.
    if (params.floors >= 5) {
      if (!params.width) {
        blueprint.width = Math.max(blueprint.width, Math.min(60, 13 + params.floors * 0.55));
      }
      if (!params.depth) {
        blueprint.length = Math.max(blueprint.length, Math.min(45, 11 + params.floors * 0.35));
      }
    }
  }
  if (params.roof && !negated.has("roof")) blueprint.roof = params.roof;

  // A colour named in the main phrase paints the object; one named on an
  // add-on ("с красной крышей") only becomes the accent.
  const subjectColor = colorIn(subject);
  if (subjectColor) blueprint.primary = subjectColor;
  else if (params.color) blueprint.accent = params.color;

  if (params.material === "glass" && materialIn(subject) === "glass") blueprint.glassy = true;
  if (params.material === "metal" && materialIn(subject) === "metal") blueprint.metalness = 0.78;

  // A 200 x 150 m plan at 7 m tall is a pancake. When neither a height nor a
  // storey count was given, let the footprint set a believable one.
  if (
    !params.height &&
    !params.floors &&
    (blueprint.sizeClass === "structure" || blueprint.sizeClass === "landmark")
  ) {
    const footprint = Math.sqrt(blueprint.width * blueprint.length);
    blueprint.height = Math.max(blueprint.height, Math.min(26, footprint * 0.09));
  }

  blueprint.length = Math.max(0.02, blueprint.length);
  blueprint.width = Math.max(0.02, blueprint.width);
  blueprint.height = Math.max(0.02, blueprint.height);

  return blueprint;
}

/** One-line summary of what the prompt turned into — the ТЗ 4.1 debug log. */
export function describeBlueprint(blueprint: Blueprint): string {
  const features: string[] = [];
  const add = (label: string, value: number | boolean | string) => {
    if (!value) return;
    features.push(typeof value === "number" && value > 1 ? `${label}×${value}` : label);
  };

  add("колёса", blueprint.wheels);
  add("гусеницы", blueprint.tracks);
  add("ноги", blueprint.legs);
  add("руки", blueprint.arms);
  add("голова", blueprint.head);
  add("крылья", blueprint.wings);
  add("хвост", blueprint.tail);
  add("рога", blueprint.horns);
  add("шипы", blueprint.spikes);
  add("этажи", blueprint.floors);
  add("окна", blueprint.windows);
  add("двери", blueprint.doors);
  add("крыша", blueprint.roof === "none" ? "" : blueprint.roof);
  add("колонны", blueprint.columns);
  add("экраны", blueprint.screens);
  add("кнопки", blueprint.buttons);
  add("винты", blueprint.propellers);
  add("полки", blueprint.shelves);
  add("ящики", blueprint.drawers);
  add("столешница", blueprint.tabletop);
  add("сиденье", blueprint.seat);
  add("спинка", blueprint.backrest);
  add("матрас", blueprint.mattress);
  add("ножки", blueprint.furnitureLegs);
  add("свет", blueprint.lights);
  add("носик", blueprint.spout);
  add("клинок", blueprint.blade);
  add("слоты", blueprint.slots);
  add("башни", blueprint.towers);
  add("купол", blueprint.dome);
  add("шпиль", blueprint.spire);
  add("гараж", blueprint.garage);
  add("терраса", blueprint.terrace);
  if (blueprint.furnishings.length) features.push(`мебель: ${blueprint.furnishings.join(" + ")}`);

  return [
    `тип=${blueprint.kind}`,
    `план=${blueprint.massPlan}`,
    `форма=${blueprint.bodyShape}`,
    `класс=${blueprint.sizeClass}`,
    `габарит=${blueprint.length.toFixed(2)}×${blueprint.width.toFixed(2)}×${blueprint.height.toFixed(2)}`,
    `детализация=${blueprint.detail.toFixed(2)}`,
    features.length ? `узлы: ${features.join(", ")}` : "узлы: базовый объём",
  ].join(" · ");
}
