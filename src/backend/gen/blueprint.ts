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
import { parsePromptParams, type PromptParams } from "@/backend/gen/prompt-params";

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

export type Blueprint = {
  prompt: string;
  seed: number;
  rng: Rng;
  params: PromptParams;

  /** Bounding box the finished model should roughly occupy, in metres. */
  length: number;
  width: number;
  height: number;
  sizeClass: SizeClass;

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
};

/**
 * `\b` only works around ASCII, so Cyrillic whole-word matches use lookarounds.
 */
const B = "a-zA-Zа-яёА-ЯЁ0-9_";
const S = `(?<![${B}])`;
const E = `(?![${B}])`;
const w = (body: string) => new RegExp(`${S}(?:${body})`, "i");

/* ---------------- lexicon ---------------- */

const RULES: Rule[] = [
  /* --- ground contact --- */
  {
    label: "колёса",
    re: w("колёс|колес|wheel|машин|автомоб|\\bcar\\b|тачк|седан|хэтчбек|купе|кабриолет|спорткар|суперкар|болид|джип|внедорожник|\\bsuv\\b|пикап|минивэн|фургон|катафалк"),
    counter: /колёс|колес|wheel/i,
    apply: (b, n) => {
      b.wheels = n ?? Math.max(b.wheels, 4);
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
    label: "грузовик",
    re: w("грузовик|truck|фур[аы]|самосвал|тягач|бетономешал|автобус|\\bbus\\b|троллейбус|маршрутк"),
    apply: (b) => {
      b.wheels = Math.max(b.wheels, 6);
      b.length = Math.max(b.length, 9);
      b.height = Math.max(b.height, 3.2);
      b.massPlan = "elongated";
      b.bodySegments = Math.max(b.bodySegments, 2);
      b.sizeClass = "vehicle";
      b.windows = Math.max(b.windows, 6);
    },
  },
  {
    label: "мотоцикл",
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
    label: "гусеницы",
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
  { label: "пушка", re: w("танк|tank|пушк|орудие|cannon|турель|башн(я|и) танк"), apply: (b) => { b.cannon = true; } },
  {
    label: "ноги",
    re: w("ног[аиу]|ножк|\\blegs?\\b|лап[аыу]|шагающ|паук|spider|осьминог|краб"),
    counter: /ног|лап|\blegs?\b/i,
    apply: (b, n) => {
      b.legs = n ?? Math.max(b.legs, 4);
      b.legStyle = b.legStyle === "furniture" ? "furniture" : b.legStyle;
    },
  },
  { label: "лодка", re: w("корабл|лодк|яхт|катер|баркас|парусник|судн[оа]|\\bboat\\b|\\bship\\b|каяк|байдарк|плот"), apply: (b) => { b.hull = true; b.massPlan = "elongated"; b.sizeClass = "vehicle"; b.length = Math.max(b.length, 8); b.wheels = 0; b.mast = true; b.railings = true; } },
  { label: "парус", re: w("парус|\\bsail\\b|шхун|фрегат|галеон"), apply: (b) => { b.mast = true; b.hull = true; } },

  /* --- creature anatomy --- */
  {
    label: "четвероногое",
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
    label: "дракон",
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
  { label: "птица", re: w("птиц|попуга|орёл|орел|голуб|воробе|сов[аыу]|ворон|чайк|пингвин|куриц|петух|утк[аиу]|гус[ьи]|фламинго|\\bbird\\b|\\beagle\\b|\\bowl\\b"), apply: (b) => { b.legs = 2; b.legStyle = "organic"; b.wings = 2; b.wingKind = "feather"; b.head = 1; b.eyes = 2; b.muzzle = 0.7; b.tail = Math.max(b.tail, 4); b.bodyShape = "sphere"; b.height = Math.max(b.height, 0.34); b.width = Math.max(b.width, 0.2); b.length = Math.max(b.length, 0.28); b.sizeClass = "furniture"; } },
  { label: "рыба", re: w("рыб[аыуко]|акул|дельфин|кит|скат|карп|щук|форел|\\bfish\\b|\\bshark\\b"), apply: (b) => { b.hull = false; b.legs = 0; b.fins = Math.max(b.fins, 4); b.tail = Math.max(b.tail, 3); b.bodyShape = "capsule"; b.massPlan = "elongated"; b.head = 1; b.eyes = 2; b.sizeClass = "furniture"; b.height = Math.max(b.height, 0.32); b.width = Math.max(b.width, 0.18); b.length = Math.max(b.length, 0.85); } },
  { label: "змея", re: w("зме[йяию]|питон|удав|червяк|гусениц[аы] насеком|\\bsnake\\b"), apply: (b) => { b.legs = 0; b.tail = Math.max(b.tail, 14); b.bodyShape = "capsule"; b.head = 1; b.eyes = 2; b.massPlan = "elongated"; b.length = Math.max(b.length, 2.4); b.width = Math.max(b.width, 0.16); b.height = Math.max(b.height, 0.2); b.sizeClass = "furniture"; } },
  {
    label: "человек",
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
      b.sizeClass = "furniture";
      b.muzzle = 0.12;
      b.detail += 0.35;
    },
  },
  { label: "доспехи", re: w("рыцар|доспех|броня|бронир|armou?r|латы|самурай|воин|штурмовик|киборг|мех[ак]?${E}"), apply: (b) => { b.armour = true; b.detail += 0.2; } },
  { label: "робот", re: w("робот|\\brobot\\b|андроид|дроид|киборг|механоид|\\bmech\\b|терминатор"), apply: (b) => { b.head = Math.max(b.head, 1); b.eyes = Math.max(b.eyes, 2); b.legStyle = "mech"; b.arms = Math.max(b.arms, 2); b.legs = Math.max(b.legs, 2); b.antennas = Math.max(b.antennas, 1); b.lights = Math.max(b.lights, 2); b.emissiveAccent = true; b.metalness = 0.7; b.bodyShape = "box"; b.massPlan = "stacked"; b.sizeClass = "furniture"; b.height = Math.max(b.height, 1.5); b.detail += 0.3; } },
  { label: "крылья", re: w("крыл|\\bwing"), counter: /крыл|wing/i, apply: (b, n) => { b.wings = n ?? Math.max(b.wings, 2); } },
  { label: "хвост", re: w("хвост|\\btail\\b"), apply: (b) => { b.tail = Math.max(b.tail, 6); } },
  { label: "рога", re: w("рог[аиу]|horn|бивн|антлер"), counter: /рог|horn/i, apply: (b, n) => { b.horns = n ?? Math.max(b.horns, 2); } },
  { label: "шипы", re: w("шип[ыаов]|spike|колюч|гребен|гребн"), counter: /шип|spike/i, apply: (b, n) => { b.spikes = n ?? Math.max(b.spikes, 8); } },
  { label: "волосы", re: w("волос|причёск|причес|хвостик|косичк|каре|локон|hair|ponytail|twintail"), apply: (b) => { b.hair = Math.max(b.hair, 2); } },
  { label: "длинные волосы", re: w("длинн(ые|ыми|ых) волос|long hair|до пояса"), apply: (b) => { b.hair = 3; } },
  { label: "руки", re: w("рук[аиу]|\\barms?\\b|манипулятор|щупальц"), counter: /рук|\barms?\b|манипулятор|щупальц/i, apply: (b, n) => { b.arms = n ?? Math.max(b.arms, 2); b.hands = true; } },

  /* --- architecture --- */
  {
    label: "здание",
    re: w("дом|house|коттедж|вилл|особняк|дач[аиу]|изб[аыу]|шале|бунгало|таунхаус|здани|строени|корпус|павильон|школ|лице[йя]|гимназ|универ|институт|колледж|садик|детсад|больниц|hospital|клиник|поликлиник|офис|office|бизнес.?центр|коворкинг|магазин|молл|\\bmall\\b|торгов(ый|ого) центр|завод|фабрик|склад|ангар|цех|музе[йя]|театр|библиотек|гостиниц|отель|hotel|вокзал|аэропорт|терминал|церкв|храм|мечет|собор|ратуш|замок|крепост|многоэтажк|панельк|хрущёвк|хрущевк|жилой дом|жк${E}"),
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
  { label: "башня", re: w("башн|tower|небоскрёб|небоскреб|skyscraper|высотк|телебашн|минарет|маяк|колокольн|донжон"), counter: /башн|tower/i, apply: (b, n) => { b.towers = n ?? Math.max(b.towers, 1); b.massPlan = "stacked"; b.sizeClass = "landmark"; b.floors = Math.max(b.floors, 8); b.spire = true; b.height = Math.max(b.height, 34); b.width = Math.max(b.width, 13); b.length = Math.max(b.length, 13); b.windows = Math.max(b.windows, 32); } },
  { label: "мост", re: w("мост|bridge|эстакад|виадук|путепровод|переправ"), apply: (b) => { b.massPlan = "platform"; b.sizeClass = "landmark"; b.columns = Math.max(b.columns, 4); b.railings = true; b.cables = Math.max(b.cables, 12); b.length = Math.max(b.length, 60); b.width = Math.max(b.width, 9); b.height = Math.max(b.height, 14); b.roof = "none"; b.windows = 0; } },
  { label: "стадион", re: w("стадион|stadium|арен[аыу]|спорткомплекс|манеж|ипподром|амфитеатр"), apply: (b) => { b.massPlan = "shell"; b.hollow = true; b.sizeClass = "landmark"; b.columns = Math.max(b.columns, 16); b.roof = "flat"; b.length = Math.max(b.length, 90); b.width = Math.max(b.width, 70); b.height = Math.max(b.height, 22); } },
  { label: "комната", re: w("комнат|спальн|кухн|гостин|ванн|санузел|интерьер|interior|\\broom\\b|bedroom|kitchen|кабинет|квартир|студи[яю]|аудитори|класс${E}|прихож|коридор|лоджи"), apply: (b) => { b.massPlan = "shell"; b.hollow = true; b.sizeClass = "structure"; b.roof = "none"; b.windows = Math.max(b.windows, 1); b.doors = Math.max(b.doors, 1); b.height = 2.8; b.width = Math.max(b.width, 4.2); b.length = Math.max(b.length, 3.6); b.floors = 1; b.detail += 0.3; } },
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
  { label: "труба", re: w("дымоход|труб(а|ы|ой) на крыш|chimney|камин|печн(ая|ой) труб"), counter: /дымоход|труб|chimney/i, apply: (b, n) => { b.chimneys = n ?? Math.max(b.chimneys, 1); } },
  { label: "колонны", re: w("колонн|column|портик|pillar|пилон|антаблемент"), counter: /колонн|column|pillar|пилон/i, apply: (b, n) => { b.columns = n ?? Math.max(b.columns, 4); } },
  { label: "арки", re: w("арк[аиу]|arch|аркад|свод"), counter: /арк|arch/i, apply: (b, n) => { b.arches = n ?? Math.max(b.arches, 3); } },
  { label: "балкон", re: w("балкон|balcony|лоджи"), counter: /балкон|balcony/i, apply: (b, n) => { b.balconies = n ?? Math.max(b.balconies, 1); b.railings = true; } },
  { label: "терраса", re: w("террас|terrace|веранд|veranda|patio|патио|крыльц|porch|навес"), apply: (b) => { b.terrace = true; b.railings = true; b.stairs = Math.max(b.stairs, 3); } },
  { label: "лестница", re: w("лестниц|ступен|stairs|крыльц|подъём|пандус"), counter: /ступен|stairs/i, apply: (b, n) => { b.stairs = n ?? Math.max(b.stairs, 5); } },
  { label: "ограждение", re: w("перил|ограждени|railing|балюстрад|забор|оград|fence|штакетник"), apply: (b) => { b.railings = true; } },
  { label: "забор", re: w("забор|оград[аыу]|fence|частокол|штакетник"), apply: (b) => { b.fence = true; } },
  { label: "гараж", re: w("гараж|garage|карпорт|навес для маш|парковк|parking"), apply: (b) => { b.garage = true; } },
  { label: "шпиль", re: w("шпил|spire|башенк|turret|флюгер"), apply: (b) => { b.spire = true; } },
  { label: "солнечные панели", re: w("солнечн(ые|ых|ыми) панел|solar|фотоэлемент|гелиопанел"), counter: /панел|solar/i, apply: (b, n) => { b.solar = n ?? Math.max(b.solar, 4); } },

  /* --- furniture --- */
  { label: "стол", re: w("стол${E}|стол[аеуы]${E}|столик|обеденн|письменн(ый|ого) стол|\\btable\\b|\\bdesk\\b|верстак|парт[аы]${E}"), apply: (b) => { b.tabletop = true; b.furnitureLegs = Math.max(b.furnitureLegs, 4); b.legStyle = "furniture"; b.massPlan = "platform"; b.sizeClass = "furniture"; b.height = b.params.height ?? 0.75; b.width = b.params.width ?? 1.5; b.length = b.params.depth ?? 0.85; b.legs = 0; b.wheels = 0; b.detail += 0.2; } },
  { label: "стул", re: w("стул${E}|стуль|\\bchair\\b|табурет|кресл|сиден|скамейк|скамь|лавк|банкетк|пуф"), apply: (b) => { b.seat = true; b.backrest = true; b.furnitureLegs = Math.max(b.furnitureLegs, 4); b.legStyle = "furniture"; b.massPlan = "platform"; b.sizeClass = "furniture"; b.height = b.params.height ?? 0.9; b.width = b.params.width ?? 0.48; b.length = b.params.depth ?? 0.52; b.cushions = Math.max(b.cushions, 1); b.legs = 0; } },
  { label: "кресло", re: w("кресл|\\barmchair\\b|шезлонг"), apply: (b) => { b.armrests = true; b.cushions = Math.max(b.cushions, 2); b.width = b.params.width ?? 0.78; b.length = b.params.depth ?? 0.8; } },
  { label: "диван", re: w("диван|sofa|couch|тахт|канап"), apply: (b) => { b.seat = true; b.backrest = true; b.armrests = true; b.cushions = Math.max(b.cushions, 3); b.pillows = Math.max(b.pillows, 2); b.furnitureLegs = Math.max(b.furnitureLegs, 4); b.legStyle = "furniture"; b.massPlan = "platform"; b.sizeClass = "furniture"; b.height = b.params.height ?? 0.85; b.width = b.params.width ?? 2.1; b.length = b.params.depth ?? 0.9; b.legs = 0; } },
  { label: "кровать", re: w("кроват|\\bbed\\b|матрас|топчан|нар[ыа]${E}|двуспальн|односпальн"), apply: (b) => { b.mattress = true; b.pillows = Math.max(b.pillows, 2); b.backrest = true; b.furnitureLegs = Math.max(b.furnitureLegs, 4); b.legStyle = "furniture"; b.massPlan = "platform"; b.sizeClass = "furniture"; b.height = b.params.height ?? 0.72; b.width = b.params.width ?? 1.6; b.length = b.params.depth ?? 2.05; b.legs = 0; } },
  { label: "шкаф", re: w("шкаф|wardrobe|стеллаж|комод|тумб|буфет|сервант|пенал|витрин"), apply: (b) => { b.shelves = Math.max(b.shelves, 4); b.doors = Math.max(b.doors, 2); b.handles = Math.max(b.handles, 2); b.massPlan = "stacked"; b.sizeClass = "furniture"; b.height = b.params.height ?? 2.05; b.width = b.params.width ?? 1.2; b.length = b.params.depth ?? 0.58; b.legs = 0; b.hollow = false; } },
  { label: "полки", re: w("полк[аиу]|shelf|shelves|книжн(ый|ая)|библиотечн"), counter: /полк|shelf|shelves/i, apply: (b, n) => { b.shelves = n ?? Math.max(b.shelves, 4); } },
  { label: "ящики", re: w("ящик|drawer|выдвижн"), counter: /ящик|drawer/i, apply: (b, n) => { b.drawers = n ?? Math.max(b.drawers, 3); b.handles = Math.max(b.handles, 3); } },
  { label: "подушки", re: w("подушк|pillow|cushion"), counter: /подушк|pillow|cushion/i, apply: (b, n) => { b.pillows = n ?? Math.max(b.pillows, 2); } },

  /* --- devices --- */
  { label: "экран", re: w("экран|дисплей|screen|display|монитор|телевизор|\\btv\\b|планшет|tablet"), counter: /экран|дисплей|screen|монитор/i, apply: (b, n) => { b.screens = n ?? Math.max(b.screens, 1); b.emissiveAccent = true; b.sizeClass = b.sizeClass === "structure" ? b.sizeClass : "handheld"; } },
  { label: "ноутбук", re: w("ноутбук|laptop|макбук|нетбук"), apply: (b) => { b.screens = Math.max(b.screens, 1); b.keyboard = true; b.massPlan = "platform"; b.sizeClass = "handheld"; b.width = 0.36; b.length = 0.25; b.height = 0.24; b.vents = Math.max(b.vents, 2); b.detail += 0.3; } },
  { label: "телефон", re: w("телефон|смартфон|\\bphone\\b|айфон|iphone|мобильн"), apply: (b) => { b.screens = Math.max(b.screens, 1); b.lenses = Math.max(b.lenses, 2); b.buttons = Math.max(b.buttons, 2); b.sizeClass = "handheld"; b.width = 0.075; b.length = 0.009; b.height = 0.155; b.massPlan = "platform"; b.detail += 0.3; } },
  { label: "компьютер", re: w("компьютер|системн(ый|ого) блок|\\bpc\\b|сервер|консол|playstation|xbox|приставк"), apply: (b) => { b.vents = Math.max(b.vents, 3); b.buttons = Math.max(b.buttons, 2); b.lights = Math.max(b.lights, 1); b.sizeClass = "handheld"; b.massPlan = "stacked"; b.height = Math.max(b.height, 0.42); b.detail += 0.3; } },
  { label: "клавиатура", re: w("клавиатур|keyboard|клавиш"), apply: (b) => { b.keyboard = true; b.sizeClass = "handheld"; } },
  { label: "кнопки", re: w("кнопк|button|тумблер|переключател|регулятор"), counter: /кнопк|button/i, apply: (b, n) => { b.buttons = n ?? Math.max(b.buttons, 4); } },
  { label: "лампа", re: w("лампа|светильник|\\blamp\\b|торшер|люстр|бра${E}|фонар|прожектор|ночник"), apply: (b) => { b.lights = Math.max(b.lights, 1); b.emissiveAccent = true; b.massPlan = "radial"; b.sizeClass = "handheld"; b.height = b.params.height ?? 0.48; b.detail += 0.25; } },
  { label: "камера", re: w("камер[аыу]|camera|объектив|фотоаппарат|вебк"), counter: /камер|camera|объектив/i, apply: (b, n) => { b.lenses = n ?? Math.max(b.lenses, 1); } },
  { label: "антенна", re: w("антенн|antenna|спутников(ая|ую) тарелк|вышк[аиу]|радар"), counter: /антенн|antenna/i, apply: (b, n) => { b.antennas = n ?? Math.max(b.antennas, 1); } },
  { label: "динамик", re: w("колонк|динамик|speaker|сабвуфер|наушник|аудиосистем"), counter: /колонк|динамик|speaker/i, apply: (b, n) => { b.speakers = n ?? Math.max(b.speakers, 1); b.vents = Math.max(b.vents, 1); b.sizeClass = "handheld"; } },
  { label: "дрон", re: w("дрон|drone|квадрокоптер|коптер|вертолёт|вертолет|helicopter"), apply: (b) => { b.propellers = Math.max(b.propellers, 4); b.skids = true; b.lenses = Math.max(b.lenses, 1); b.lights = Math.max(b.lights, 2); b.massPlan = "radial"; b.sizeClass = "handheld"; b.height = Math.max(b.height, 0.2); b.length = Math.max(b.length, 0.5); b.width = Math.max(b.width, 0.5); } },
  { label: "самолёт", re: w("самолёт|самолет|plane|авиалайн|истребител|бомбардир|планёр|планер"), apply: (b) => { b.wings = Math.max(b.wings, 2); b.wingKind = "fixed"; b.massPlan = "elongated"; b.bodyShape = "capsule"; b.sizeClass = "vehicle"; b.length = Math.max(b.length, 12); b.height = Math.max(b.height, 3.4); b.wheels = Math.max(b.wheels, 3); b.wheelSize = 0.12; b.tail = 0; b.fins = Math.max(b.fins, 1); } },
  { label: "ракета", re: w("ракет|rocket|шаттл|носител|баллистич"), apply: (b) => { b.massPlan = "stacked"; b.bodyShape = "cylinder"; b.spire = true; b.fins = Math.max(b.fins, 4); b.sizeClass = "landmark"; b.height = Math.max(b.height, 22); b.length = Math.max(b.length, 3); b.width = Math.max(b.width, 3); b.legs = 0; b.wheels = 0; } },
  { label: "винт", re: w("винт${E}|пропеллер|propeller|лопаст|ротор|вентилятор|мельниц"), counter: /винт|пропеллер|propeller|лопаст/i, apply: (b, n) => { b.propellers = n ?? Math.max(b.propellers, 1); } },
  { label: "ручка", re: w("ручк[аиу]|handle|рукоят|грип|штурвал|руль"), counter: /ручк|handle|рукоят/i, apply: (b, n) => { b.handles = n ?? Math.max(b.handles, 1); } },
  { label: "носик", re: w("носик|спout|чайник|заварник|лейк|кофейник|кувшин"), apply: (b) => { b.spout = true; b.lid = true; b.handles = Math.max(b.handles, 1); b.bodyShape = "cylinder"; b.massPlan = "radial"; b.sizeClass = "handheld"; b.height = b.params.height ?? 0.22; } },
  { label: "крышка", re: w("крышк|\\blid\\b|колпач"), apply: (b) => { b.lid = true; } },
  { label: "сосуд", re: w("кружк|чашк|стакан|бутылк|ваз[аыу]|банк[аиу]|горшок|бокал|термос|фляг"), apply: (b) => { b.bodyShape = "cylinder"; b.hollow = true; b.massPlan = "radial"; b.sizeClass = "handheld"; b.height = b.params.height ?? 0.16; b.width = 0.09; b.length = 0.09; b.handles = Math.max(b.handles, 1); b.legs = 0; b.wheels = 0; } },
  { label: "часы", re: w("час[ыов]${E}|watch|clock|будильник|хронограф"), apply: (b) => { b.bodyShape = "cylinder"; b.massPlan = "radial"; b.sizeClass = "handheld"; b.screens = Math.max(b.screens, 1); b.buttons = Math.max(b.buttons, 2); b.height = b.params.height ?? 0.11; b.width = b.params.width ?? 0.042; b.length = b.params.depth ?? 0.014; } },
  { label: "вентиляция", re: w("вентиляц|решётк|решетк|grille|радиатор|гриль|жалюзи|перфорац"), counter: /решётк|решетк|grille/i, apply: (b, n) => { b.vents = n ?? Math.max(b.vents, 2); } },
  { label: "провода", re: w("провод|кабел|шнур|cable|трос|ванты"), counter: /провод|кабел|cable|трос|ванты/i, apply: (b, n) => { b.cables = n ?? Math.max(b.cables, 2); } },
  { label: "фары", re: w("фар[аыу]|подсветк|неон|neon|светодиод|\\bled\\b|иллюминац|стоп.?сигнал"), counter: /фар|светодиод/i, apply: (b, n) => { b.lights = n ?? Math.max(b.lights, 2); b.emissiveAccent = true; } },
  { label: "лезвие", re: w("меч${E}|нож${E}|клинок|лезви|сабл|катан|топор|коса${E}|blade|sword"), apply: (b) => { b.handles = Math.max(b.handles, 1); b.detail += 0.2; } },

  /* --- surface qualities --- */
  { label: "стекло", re: w("стекл|glass|прозрачн|акрил"), apply: (b) => { b.glassy = true; b.roughness = 0.1; } },
  { label: "металл", re: w("металл|сталь|steel|metal|алюмин|хром|титан|латун|бронз|медн|железн"), apply: (b) => { b.metalness = 0.78; b.roughness = 0.3; } },
  { label: "дерево", re: w("деревян|дерева|бревен|брус|wood|timber|дубов|соснов|фанер"), apply: (b) => { b.metalness = 0.02; b.roughness = 0.78; } },
  { label: "камень", re: w("камен|камня|stone|гранит|мрамор|базальт|булыжн"), apply: (b) => { b.metalness = 0.05; b.roughness = 0.85; } },
  { label: "бетон", re: w("бетон|concrete|железобетон|монолит|панельн"), apply: (b) => { b.metalness = 0.03; b.roughness = 0.9; } },
  { label: "кирпич", re: w("кирпич|brick|клинкер"), apply: (b) => { b.metalness = 0.02; b.roughness = 0.92; b.detail += 0.15; } },
  { label: "детализация", re: w("детализ|детальн|проработ|подробн|реалистичн|высокополигон|hi.?poly|детали${E}"), apply: (b) => { b.detail += 0.5; } },
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

    // 0 means "not decided yet" — the size class fills in whatever the prompt
    // and the lexicon left alone, one axis at a time.
    length: 0,
    width: 0,
    height: 0,
    sizeClass: "furniture",

    massPlan: "stacked",
    bodyShape: "box",
    bodySegments: 1,
    taper: 0,
    baseHeight: 0,
    hollow: false,

    wheels: 0,
    wheelSize: 0.34,
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

/**
 * Read the prompt into a Blueprint. Rules are additive: every match layers
 * another feature onto the same object, which is what lets an unseen
 * combination of words produce an unseen model.
 */
export function planFromPrompt(prompt: string): Blueprint {
  const blueprint = baseBlueprint(prompt);
  const text = prompt.toLowerCase();
  const { rng, params } = blueprint;

  for (const rule of RULES) {
    if (!rule.re.test(text)) continue;
    blueprint.matched.push(rule.label);
    rule.apply(blueprint, rule.counter ? countFor(text, rule.counter) : undefined);
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

  for (const [pattern, apply] of PROPORTIONS) {
    if (pattern.test(text)) apply(blueprint);
  }

  // Numbers in the prompt always win over anything inferred.
  // "ширина" is the side-to-side extent (x), "длина/глубина" runs front-to-back (z).
  if (params.width) blueprint.width = params.width;
  if (params.depth) blueprint.length = params.depth;
  if (params.height) blueprint.height = params.height;
  if (params.floors) {
    blueprint.floors = params.floors;
    blueprint.massPlan = "stacked";
    if (!params.height) blueprint.height = Math.max(3.2, params.floors * 3.3);
    if (blueprint.roof === "none") blueprint.roof = params.floors > 5 ? "flat" : "gable";
    if (!blueprint.windows) blueprint.windows = params.floors * 4;

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
  if (params.roof) blueprint.roof = params.roof;
  if (params.color) blueprint.primary = params.color;

  const adjectiveScale = {
    tiny: 0.4,
    small: 0.7,
    medium: 1,
    large: 1.4,
    huge: 2.1,
  }[params.scale];
  // An explicit storey count is a size statement — "небоскрёб 40 этажей" must
  // not then be multiplied again by the "huge" adjective hiding in the noun.
  if (!params.hasExplicitSize && !params.floors && adjectiveScale !== 1) {
    blueprint.length *= adjectiveScale;
    blueprint.width *= adjectiveScale;
    blueprint.height *= adjectiveScale;
  }

  // Free-standing variation so two prompts in the same family still differ.
  blueprint.length = rng.vary(blueprint.length, 0.08);
  blueprint.width = rng.vary(blueprint.width, 0.08);
  blueprint.height = rng.vary(blueprint.height, 0.08);
  blueprint.detail = Math.max(0.5, Math.min(2.2, blueprint.detail + rng.float(-0.05, 0.15)));

  if (params.count && blueprint.windows) {
    blueprint.windows = params.count;
    blueprint.windowsExplicit = true;
  }
  if (params.material === "glass") blueprint.glassy = true;
  if (params.material === "metal") blueprint.metalness = 0.78;

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

  return [
    `план=${blueprint.massPlan}`,
    `форма=${blueprint.bodyShape}`,
    `класс=${blueprint.sizeClass}`,
    `габарит=${blueprint.length.toFixed(2)}×${blueprint.width.toFixed(2)}×${blueprint.height.toFixed(2)}`,
    `детализация=${blueprint.detail.toFixed(2)}`,
    features.length ? `узлы: ${features.join(", ")}` : "узлы: базовый объём",
  ].join(" · ");
}
