import type { ThreeDConcept } from "@/lib/types";
import { scoreParts } from "@/lib/gen/validate";
import {
  buildBridge,
  buildBuilding,
  buildHospital,
  buildHouse,
  buildOffice,
  buildSchool,
  buildStadium,
  buildTower,
} from "@/lib/gen/architecture";
import {
  buildAnimal,
  buildCharacter,
  buildFurniture,
  buildProduct,
  buildRoom,
  buildVehicle,
} from "@/lib/gen/objects";

export {
  buildBridge,
  buildBuilding,
  buildHospital,
  buildHouse,
  buildOffice,
  buildSchool,
  buildStadium,
  buildTower,
  buildAnimal,
  buildCharacter,
  buildFurniture,
  buildProduct,
  buildRoom,
  buildVehicle,
};

export type ConceptCategory =
  | "character"
  | "animal"
  | "vehicle"
  | "furniture"
  | "product"
  | "room"
  | "house"
  | "school"
  | "bridge"
  | "tower"
  | "office"
  | "stadium"
  | "hospital"
  | "building";

/**
 * Category detection from the user's own words.
 * Order matters: "школьница" is a character, not a school; "комната" is an
 * interior, not an office block. The most specific readings run first.
 */
/**
 * `\b` in JS regex is defined over ASCII `\w` only — it never fires around
 * Cyrillic text (a Cyrillic letter counts as a non-word char, so "space then
 * Cyrillic" has no word/non-word transition). Every whole-word Cyrillic match
 * below uses this lookaround instead; `\b` is kept only around Latin words,
 * where it works correctly.
 */
const CYR_BOUND = "a-zA-Zа-яёА-ЯЁ0-9_";
const START = `(?<![${CYR_BOUND}])`;
const END = `(?![${CYR_BOUND}])`;

const CATEGORY_RULES: [RegExp, ConceptCategory][] = [
  // People before anything that shares a stem with a building type.
  [
    new RegExp(
      `девуш|девоч|парен|мальчик|женщин|мужчин|человек|персонаж|аниме|anime|manga|waifu|\\bgirl\\b|\\bboy\\b|woman|\\bman\\b|character|humanoid|avatar|фигурк|\\bhero\\b|герой|героин|воин|рыцар|маг${END}|ниндзя|самурай|школьниц|школьник|studentk|schoolgirl|семпай|тян${END}|кун${END}|\\bnpc\\b|скин${END}|модель человек`,
      "i"
    ),
    "character",
  ],
  [
    new RegExp(
      `${START}кот${END}|кот[аеуы]${END}|кошк|котён|котен|собак|пёс${END}|пес${END}|щенок|лошад|конь${END}|птиц|попуга|орёл|орел${END}|дракон|dragon|звер|animal|волк|wolf|лис[аыу]${END}|медвед|кролик|заяц|bunny|\\bcat\\b|\\bdog\\b|\\bhorse\\b|\\bbird\\b|рыб[аку]|акул|динозавр|dinosaur|слон${END}|тигр|лев${END}|панд`,
      "i"
    ),
    "animal",
  ],
  [
    new RegExp(
      `машин|автомоб|\\bcar\\b|vehicle|спорткар|суперкар|джип|внедорожник|\\bsuv\\b|truck|грузовик|фур[аы]|автобус|\\bbus\\b|мотоцикл|мопед|\\bbike\\b|велосипед|танк${END}|поезд|вагон|трактор|самолёт|самолет|plane\\b|вертолёт|вертолет|корабл|лодк|яхт|катер|ракет[аы]|rocket`,
      "i"
    ),
    "vehicle",
  ],
  [
    new RegExp(
      `комнат|спальн|кухн|гостин|ванн|санузел|интерьер|interior|\\broom\\b|bedroom|kitchen|living.?room|кабинет|студи[яю]|квартир|офисн(ая|ую) комнат|класс${END}|аудитори`,
      "i"
    ),
    "room",
  ],
  [
    new RegExp(
      `диван|sofa|couch|кресл|стул${END}|стуль|chair|табурет|кроват|\\bbed\\b|матрас|шкаф|полк[аи]|стеллаж|shelf|комод|тумб|мебел|furniture|${START}стол${END}|стол[аеуы]${END}|столик|письменн(ый|ого) стол|обеденн(ый|ого) стол|\\bdesk\\b|\\btable\\b|парт[аы]${END}`,
      "i"
    ),
    "furniture",
  ],
  [
    new RegExp(
      `телефон|смартфон|\\bphone\\b|ноутбук|laptop|компьютер|монитор|планшет|робот|\\brobot\\b|дрон|drone|квадрокоптер|лампа|светильник|\\blamp\\b|часы${END}|наручные|гаджет|устройств|прибор|колонк|наушник|камер[аы]|игрушк|кружк|бутылк|ваз[аы]|станок|принтер|консол|геймпад|клавиатур|мыш(ь|ка)${END}|издели[ея]|предмет|прототип|деталь|корпус для`,
      "i"
    ),
    "product",
  ],
  // Buildings last — every word above already claimed its meaning.
  [new RegExp(`школ(а|у|ы|е|ой|ьн)|\\bschool\\b|лице[йя]|гимназ|образовательн|универ|институт|колледж|садик|детсад|детский сад`, "i"), "school"],
  [new RegExp(`мост${END}|моста${END}|мосты|bridge|эстакад|виадук|путепровод|переправ`, "i"), "bridge"],
  [new RegExp(`башн|tower|небоскрёб|небоскреб|skyscraper|высотк|телебашн|минарет|маяк`, "i"), "tower"],
  [new RegExp(`офис|office|бизнес.?центр|${START}бц${END}|коворкинг|штаб.?квартир`, "i"), "office"],
  [new RegExp(`стадион|stadium|арен[аыу]${END}|спорткомплекс|манеж|ипподром`, "i"), "stadium"],
  [new RegExp(`больниц|hospital|клиник|поликлиник|медцентр|госпитал|роддом`, "i"), "hospital"],
  [
    new RegExp(
      `${START}дом${END}|дом[аеуio]${END}|домик|house\\b|коттедж|вилл[аыу]|особняк|дач[аиу]|cottage|таунхаус|бунгало|изб[аыу]|шале`,
      "i"
    ),
    "house",
  ],
  [
    new RegExp(
      `завод|фабрик|factory|склад|цех${END}|ангар|магазин|молл|\\bmall\\b|${START}тц${END}|здани|строени|корпус|комплекс|павильон|музе[йя]|театр|библиотек|гостиниц|отель|hotel|вокзал|аэропорт|терминал|церкв|храм|мечет|жилкомплекс|${START}жк${END}|многоэтажк|панельк|хрущёвк|хрущевк`,
      "i"
    ),
    "building",
  ],
];

export function detectCategory(prompt: string): ConceptCategory {
  const text = prompt.toLowerCase();
  for (const [pattern, category] of CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  // Unknown wording is a physical object far more often than a building.
  return "product";
}

const BUILDERS: Record<ConceptCategory, (prompt: string) => ThreeDConcept> = {
  character: buildCharacter,
  animal: buildAnimal,
  vehicle: buildVehicle,
  furniture: buildFurniture,
  product: buildProduct,
  room: buildRoom,
  house: buildHouse,
  school: buildSchool,
  bridge: buildBridge,
  tower: buildTower,
  office: buildOffice,
  stadium: buildStadium,
  hospital: buildHospital,
  building: buildBuilding,
};

/**
 * Parametric model for a prompt. Every generator is seeded from the prompt
 * text, so the same words reproduce a model and different words change it.
 */
export function buildFromPrompt(prompt: string): ThreeDConcept {
  const category = detectCategory(prompt);
  const build = BUILDERS[category] ?? buildProduct;
  try {
    return build(prompt);
  } catch (error) {
    console.error(`Procedural build failed for category ${category}`, error);
    return buildProduct(prompt);
  }
}

/** True when the parts read as one connected object rather than a pile. */
export function isCoherentConcept(concept: ThreeDConcept): boolean {
  if (!concept.parts?.length || concept.parts.length < 4) return false;
  return scoreParts(concept.parts) >= 0.55;
}
