import {parsePromptParams,normalizeBuildingWords} from "@/backend/gen/prompt-params";
import {planFor} from "@/backend/procedural-3d";
import {designPromptTarget} from "@/shared/interior/request";
import {check, list, record, text} from "@/shared/design/validation";
import type {BriefAnswer, BriefQuestion, DesignBrief, HouseBrief} from "@/shared/design/brief";
import {houseArchitecture, houseElementColor} from "./house-architecture";
import {HOUSE_ROOFS} from "@/shared/house/architecture";

const WORDS: Record<string, number> = {один: 1, одна: 1, одно: 1, одну: 1, одной: 1, два: 2, две: 2, двух: 2, двумя: 2, три: 3, трех: 3, трёх: 3, четыре: 4, четырех: 4, четырёх: 4, пять: 5, пяти: 5, шесть: 6, шести: 6, семь: 7, восемь: 8, девять: 9, десять: 10, one: 1, two: 2, three: 3, four: 4};
const NUM = `(?:\\d+|${Object.keys(WORDS).join("|")})`;
const countOf = (s: string) => WORDS[s.toLowerCase()] ?? Number(s);
const SELF = /(?:на\s+(?:твой|ваш|свой)\s+вкус|(?:выбери|реши|подбери|придумай|решай)\s+сам|на\s+усмотрение|не\s+знаю|you\s+decide)/i;
const ROOM_TYPES: [RegExp, string][] = [
  [/кухн[а-яё-]*\s*[-–]?\s*гостин[а-яё]*|kitchen[ -]*living(?:\s+room)?/gi, "Кухня-гостиная"],
  [/спальн[а-яё]*|bedrooms?/gi, "Спальня"], [/гостин[а-яё]*|living\s*room/gi, "Гостиная"],
  [/кухн[а-яё]*|kitchens?/gi, "Кухня"], [/сануз[а-яё]*|ванн[а-яё]*|bathrooms?/gi, "Санузел"],
  [/прихож[а-яё]*|entrance\s*hall/gi, "Прихожая"], [/кабинет[а-яё]*|offices?/gi, "Кабинет"],
  [/детск[а-яё]*/gi, "Детская"], [/гардеробн[а-яё]*/gi, "Гардеробная"], [/кладов[а-яё]*|pantry/gi, "Кладовая"],
  [/коридор[а-яё]*|corridor/gi, "Коридор"], [/столов[а-яё]*|dining\s*room/gi, "Столовая"],
];
const DEFAULT_ROOMS = ["Прихожая", "Кухня-гостиная", "Спальня 1", "Спальня 2", "Санузел"];

function roomsIn(raw: string, bare = false): string[] | undefined {
  const hits: {start: number; end: number; name: string; count: number}[] = [];
  for (const [pattern, name] of ROOM_TYPES) for (const m of raw.matchAll(new RegExp(pattern))) {
    if (hits.some(h => m.index < h.end && m.index + m[0].length > h.start)) continue;
    const prefix = raw.slice(Math.max(0, m.index - 35), m.index);
    if (/(?:без|не нужно|without)\s*$/i.test(prefix)) continue;
    const n = new RegExp(`(?:^|[\\s,;])(${NUM})\\s*(?:(?:больш|маленьк|просторн|отдельн)[а-яё]+\\s+)?$`, "i").exec(prefix)?.[1];
    const count = n ? countOf(n) : 1;
    check(Number.isInteger(count) && count >= 1 && count <= 16, "Укажите от 1 до 16 помещений одного типа");
    hits.push({start: m.index, end: m.index + m[0].length, name, count});
  }
  if (hits.length) {
    const rooms = hits.sort((a,b) => a.start - b.start).flatMap(h => Array.from({length: h.count}, (_, i) => h.name + (h.count > 1 ? ` ${i + 1}` : "")));
    check(rooms.length <= 24, "Для локальной планировки укажите не более 24 помещений");
    return rooms;
  }
  const countMatch = new RegExp(`(${NUM})\\s*[- ]?(?:комнат|помещен|rooms?)`, "i").exec(raw)?.[1] ?? (bare && new RegExp(`^\\s*(${NUM})\\s*$`, "i").exec(raw)?.[1]);
  if (!countMatch) return undefined;
  const count = countOf(countMatch);
  check(Number.isInteger(count) && count >= 1 && count <= 24, "Укажите от 1 до 24 помещений");
  return Array.from({length: count}, (_, i) => `Комната ${i + 1}`);
}

export function readBriefAnswers(raw: unknown): BriefAnswer[] {
  if (raw === undefined) return [];
  return list(raw, "Ответы", 12).map(item => {
    const a = record(item, "Ответ"), questionId = text(a.questionId, "questionId", 20);
    check(["subject", "rooms", "floors", "size", "roof", "details", "furniture", "roomType"].includes(questionId), "Неизвестный вопрос");
    return {questionId, answer: text(a.answer, "Ответ", 500)};
  });
}

/** Select only missing decisions. No generation, provider or quota is used here. */
export function resolveDesignBrief(rawPrompt: unknown, rawAnswers?: unknown): DesignBrief {
  const prompt = normalizeBuildingWords(text(rawPrompt, "Описание", 1500)), answers = readBriefAnswers(rawAnswers).map(a=>({...a,answer:normalizeBuildingWords(a.answer)}));
  const source = [prompt, ...answers.map(a => a.answer)].join(". ");
  check(source.length <= 6000, "Диалог слишком длинный. Объедините требования в описании.");
  const latest = (id: string) => answers.filter(a => a.questionId === id).at(-1)?.answer;
  const understood: string[] = [], assumptions: string[] = [];
  const ask = (question: BriefQuestion): DesignBrief => ({kind: "clarification", question, answers, understood});
  // A direct answer to the subject question replaces the unrecognised noun.
  const subject = latest("subject") ?? prompt;
  const category = planFor(subject).blueprint.kind;
  const house = designPromptTarget(subject) === "model" && /(?:^|\s)(?:дом[а-яё]*|коттедж[а-яё]*|house|cottage)(?=\s|[,.;:]|$)/i.test(subject);
  if (!house && category === "product") return ask({id: "subject", text: "Что именно нужно смоделировать?", hint: "Назовите основной объект и пару его особенностей.", options: ["Дом", "Комната", "Машина", "Стул"]});
  const autoAll = SELF.test(prompt);

  if (house) {
    understood.push("Дом с внутренней планировкой");
    let rooms = roomsIn(prompt), floors: number | undefined, width: number | undefined, depth: number | undefined;
    let roof: string | undefined, wallColor: string | undefined;
    // Later explicit answers can correct earlier values and answer several questions at once.
    for (const entry of [{questionId: "prompt", answer: prompt}, ...answers]) {
      const buildingText=entry.answer.replace(/(?:окн[а-яё]*|windows?)\s*(?:размер[а-яё]*|ширин[а-яё]*)?\s*\d+(?:[.,]\d+)?\s*[×xх*]\s*\d+(?:[.,]\d+)?/gi, "");
      const p = parsePromptParams(buildingText);
      const floorNumber = new RegExp(`(${NUM})\\s*[- ]?(?:этаж|floors?|storeys?)`, "i").exec(entry.answer)?.[1]
        ?? new RegExp(`(?:этажей|этажность|floors?)\\s*[:=]?\\s*(${NUM})(?![\\d×x])`, "i").exec(entry.answer)?.[1];
      floors = floorNumber ? countOf(floorNumber) : /(?:одно|двух|тр[её]х|четыр[её]х|пяти)[ -]?этажн/i.test(entry.answer) ? p.floors : floors;
      width = p.width ?? width; depth = p.depth ?? depth;
      roof = p.roof ?? roof; wallColor = houseElementColor(entry.answer, "фасад|стен|дом|house|walls?") ?? wallColor;
      const roomList = roomsIn(entry.answer, entry.questionId === "rooms");
      if (roomList) rooms = roomList;
      if (entry.questionId === "floors" && new RegExp(`^\\s*${NUM}\\s*$`, "i").test(entry.answer)) floors = countOf(entry.answer.trim());
      if (SELF.test(entry.answer)) {
        if ((entry.questionId === "prompt" || entry.questionId === "rooms") && !rooms) {rooms = [...DEFAULT_ROOMS];assumptions.push("Предложен набор: прихожая, кухня-гостиная, две спальни, санузел");}
        if ((entry.questionId === "prompt" || entry.questionId === "floors") && floors === undefined) {floors = 1;assumptions.push("Выбран один этаж");}
        if ((entry.questionId === "prompt" || entry.questionId === "size") && (width === undefined || depth === undefined)) {width ??= 12;depth ??= 9;assumptions.push(`Выбран габарит ${width} × ${depth} м`);}
        if (entry.questionId === "roof") roof = "gable";
      }
    }
    if (rooms) understood.push(`${rooms.length} помещений: ${rooms.join(", ")}`);
    if (floors !== undefined) understood.push(`Этажей: ${floors}`);
    if (width !== undefined && depth !== undefined) understood.push(`Габариты: ${width} × ${depth} м`);
    if (!rooms || (floors !== undefined && floors >= 1 && floors <= 3 && rooms.length < floors)) return ask({id: "rooms", text: rooms ? `Для ${floors} этажей нужно хотя бы по одному помещению. Какие комнаты разместить?` : "Сколько помещений нужно в доме и какие?", hint: "Например: две спальни, гостиная, кухня, санузел. Можно указать только общее количество — помещения останутся без назначения.", options: ["2 спальни, кухня-гостиная, санузел и прихожая", "3 спальни, гостиная, кухня, 2 санузла и прихожая", "Подбери сам"]});
    if (!Number.isInteger(floors) || floors! < 1 || floors! > 3) return ask({id: "floors", text: floors === undefined ? "Сколько этажей сделать?" : "Сейчас планировка поддерживает 1–3 этажа. Сколько выбрать?", hint: "Комнаты распределим между этажами. Лестницы в этой версии не моделируются.", options: ["1 этаж", "2 этажа", "3 этажа", "Выбери сам"]});
    if (width === undefined || depth === undefined || width < 3 || depth < 3 || width > 100 || depth > 100) return ask({id: "size", text: "Какие габариты дома по ширине и длине?", hint: "Например: 12 × 9 метров. Это размер одного этажа; если ещё не решили, можно доверить выбор Atrion.", options: ["10 × 8 м", "12 × 9 м", "15 × 12 м", "Подбери сам"]});
    const footprint=/[гgl]\s*[-–]?\s*образн|l[- ]shaped|угловой\s+дом/i.test(source)?"l-shaped":"rectangular";
    if(footprint==="l-shaped"&&rooms.length<floors!*2)return ask({id:"rooms",text:"Для двух крыльев Г-образного дома нужно хотя бы два помещения на каждом этаже. Какие комнаты разместить?",hint:"Укажите полный перечень помещений для всех этажей.",options:["Прихожая, кухня-гостиная, 2 спальни, санузел и кабинет","Подбери сам"]});
    if (roof && !HOUSE_ROOFS.includes(roof as HouseBrief["roof"])) return ask({id: "roof", text: "Какую форму крыши сделать?", hint: "Купола этот построитель планировки пока не поддерживает.", options: ["Двускатная крыша", "Вальмовая крыша", "Односкатная крыша", "Мансардная крыша", "Плоская крыша"]});
    const architecture = houseArchitecture(source, width, depth);
    understood.push(`Фасад: ${architecture.architecture.style}; окна: ${architecture.architecture.windows}`);
    if (!roof) assumptions.push("Форма крыши выбрана по стилю фасада; высота этажа 2,8 м");
    const brief: HouseBrief = {width, depth, floors: floors!, rooms, roof: (roof ?? architecture.roof) as HouseBrief["roof"], wallColor: wallColor ?? architecture.wallColor,
      footprint, architecture: architecture.architecture, automaticArchitecture: !architecture.explicitStyle, automaticRoof: !roof, automaticWallColor: !wallColor,
      furnished: !/без\s+(?:всей\s+)?мебели|пустой\s+дом|unfurnished/i.test(source), description: source};
    return {kind: "ready", prompt: subject, answers, understood, assumptions, house: brief};
  }

  const effective = [subject, ...answers.filter(a => a.questionId !== "subject" && !SELF.test(a.answer)).map(a => a.answer)].join(". ");
  const interior = designPromptTarget(subject) === "interior";
  if (interior) {
    const office = /офис|кабинет|\boffice\b/i.test(effective);
    if (!/спальн|гостин|кабинет|офис|bedroom|living|office|кроват|диван|шкаф|стол|стул|кресл|пуф|пуст|без мебел|\bbed\b|sofa|desk|chair|empty/i.test(effective) && !latest("roomType") && !autoAll) return ask({id: "roomType", text: "Какое назначение комнаты?", hint: "От этого зависит набор и размещение мебели.", options: ["Спальня", "Гостиная", "Кабинет"]});
    if (!office && !/кроват|диван|шкаф|стол|стул|кресл|пуф|пуст|без мебел|bed\b|sofa|desk|chair|empty/i.test(effective) && !latest("furniture") && !autoAll) return ask({id: "furniture", text: "Какую мебель нужно разместить?", hint: "Перечислите нужные предметы и количество. Размеры возьмём из полей комнаты, если вы не указали их в тексте.", options: /спальн|bedroom/i.test(effective) ? ["Кровать и шкаф", "Кровать, шкаф и рабочий стол", "Пустая комната", "Подбери сам"] : ["Диван, кресло и журнальный стол", "Пустая комната", "Подбери сам"]});
    if (office && !/стол|стул|кресл|мебел|desk|chair|empty|пуст/i.test(effective)) assumptions.push("Предложены рабочий стол, стул, стеллаж и растение; размеры — из параметров комнаты");
    const prefix = latest("roomType") ?? "";
    return {kind: "ready", prompt: [prefix, effective].filter(Boolean).join(". "), answers, understood: ["Интерьер", ...answers.map(a => a.answer)], assumptions};
  }
  if (!latest("details") && !autoAll) {
    if (category === "animal" && !/сид|сто[ия]|леж|беж|лет|ид[её]т|идут|идущ|идти|ход[ия]т|ходьб|шага|движени|двига|sit|stand|lying|run|walk/i.test(source)) return ask({id: "details", text: "В какой позе показать животное?", hint: "Это определяет силуэт и положение лап.", options: ["Сидит", "Стоит", "Идёт", "Выбери сам"]});
    if (category === "vehicle" && !/спорт|седан|грузов|купе|автобус|внедорож|sport|truck|sedan|suv/i.test(source)) return ask({id: "details", text: "Какой тип машины нужен?", hint: "Укажите форму кузова; цвет и размеры тоже можно добавить в ответ.", options: ["Спорткар", "Седан", "Грузовик", "Выбери сам"]});
  }
  check(effective.length <= 1500, "Описание с ответами длиннее 1500 символов. Сократите его.");
  return {kind: "ready", prompt: effective, answers, understood: ["3D-модель", ...answers.map(a => a.answer)], assumptions};
}
