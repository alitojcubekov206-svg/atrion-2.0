/**
 * Voice → action.
 *
 * Every editing command a user actually says is recognised and executed on the
 * client, synchronously, against the scene state. Nothing here waits on a
 * network call, so "добавь куб" and "удали крышу" cannot hang — the AI is only
 * consulted for wording this parser does not claim.
 *
 * A note on word boundaries: JavaScript's `\b` is defined over ASCII `\w`, so
 * it never fires next to Cyrillic — `/^удали\b/` does not match "удали крышу".
 * Every whole-word match below uses the lookaround pair instead. Getting this
 * wrong is silent: the command simply falls through to the model.
 */
import type { PartShape } from "@/shared/types";

export type DrawingViewName = "perspective" | "top" | "front" | "side";
export type CadToolName = "select" | "translate" | "rotate" | "scale";

export type VoiceCommand =
  | { kind: "add"; shape: PartShape; label: string }
  | { kind: "delete"; target?: string }
  | { kind: "duplicate" }
  | { kind: "select"; target: string }
  | { kind: "color"; color: string; label: string }
  | { kind: "scale"; factor: number }
  | { kind: "move"; axis: "x" | "y" | "z"; delta: number; label: string }
  | { kind: "rotate"; axis: "x" | "y" | "z"; radians: number; label: string }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "explode" }
  | { kind: "assemble" }
  | { kind: "view"; view: DrawingViewName; label: string }
  | { kind: "tool"; tool: CadToolName; label: string }
  | { kind: "snap"; on: boolean }
  | { kind: "export"; format: "glb" | "stl" | "obj" | "ply" | "usdz" }
  | { kind: "measure" }
  | { kind: "reset" }
  | { kind: "generate"; prompt: string }
  | { kind: "help" }
  | { kind: "chat"; text: string };

/** Letters that count as "inside a word" for both alphabets. */
const WORD = "a-zA-Zа-яёА-ЯЁ0-9_";
const END = `(?![${WORD}])`;
const START = `(?<![${WORD}])`;

/** Whole-word match that works for Cyrillic as well as Latin. */
function word(body: string, flags = "i"): RegExp {
  return new RegExp(`${START}(?:${body})${END}`, flags);
}

/** Prefix match: the phrase starts with one of these stems. */
function starts(body: string): RegExp {
  return new RegExp(`^\\s*(?:${body})`, "i");
}

const SHAPES: [RegExp, PartShape, string][] = [
  [word("куб|кубик|кубика|кубов|cube|коробк\[а-яёА-ЯЁa-zA-Z]*|ящик\[а-яёА-ЯЁa-zA-Z]*|блок\[а-яёА-ЯЁa-zA-Z]*|box|параллелепипед\[а-яёА-ЯЁa-zA-Z]*"), "box", "куб"],
  [word("шар|шарик|сфер\[а-яёА-ЯЁa-zA-Z]*|sphere|ball"), "sphere", "сферу"],
  [word("цилиндр\[а-яёА-ЯЁa-zA-Z]*|cylinder|валик|столбик"), "cylinder", "цилиндр"],
  [word("труб\[а-яёА-ЯЁa-zA-Z]*|tube|полый цилиндр"), "tube", "трубу"],
  [word("конус\[а-яёА-ЯЁa-zA-Z]*|cone"), "cone", "конус"],
  [word("пирамид\[а-яёА-ЯЁa-zA-Z]*|pyramid"), "pyramid", "пирамиду"],
  [word("призм\[а-яёА-ЯЁa-zA-Z]*|prism"), "prism", "призму"],
  [word("клин\[а-яёА-ЯЁa-zA-Z]*|wedge|пандус\[а-яёА-ЯЁa-zA-Z]*|рампу"), "wedge", "клин"],
  [word("тор|бублик|кольц\[а-яёА-ЯЁa-zA-Z]*|torus|ring"), "torus", "тор"],
  [word("капсул\[а-яёА-ЯЁa-zA-Z]*|capsule|таблетк\[а-яёА-ЯЁa-zA-Z]*"), "capsule", "капсулу"],
  [word("плоскост\[а-яёА-ЯЁa-zA-Z]*|панель|панел\[а-яёА-ЯЁa-zA-Z]*|пластин\[а-яёА-ЯЁa-zA-Z]*|плит\[а-яёА-ЯЁa-zA-Z]*|plane|slab"), "plane", "панель"],
];

const COLORS: [RegExp, string, string][] = [
  [word("красн\[а-яёА-ЯЁa-zA-Z]*|red"), "#c1462f", "красный"],
  [word("син\[а-яёА-ЯЁa-zA-Z]*|blue"), "#2f5fb0", "синий"],
  [word("голуб\[а-яёА-ЯЁa-zA-Z]*|cyan"), "#6fa8dc", "голубой"],
  [word("зелён\[а-яёА-ЯЁa-zA-Z]*|зелен\[а-яёА-ЯЁa-zA-Z]*|green"), "#3f8a5b", "зелёный"],
  [word("жёлт\[а-яёА-ЯЁa-zA-Z]*|желт\[а-яёА-ЯЁa-zA-Z]*|yellow"), "#d9b13b", "жёлтый"],
  [word("оранжев\[а-яёА-ЯЁa-zA-Z]*|orange"), "#d1743a", "оранжевый"],
  [word("фиолетов\[а-яёА-ЯЁa-zA-Z]*|пурпурн\[а-яёА-ЯЁa-zA-Z]*|purple|сиренев\[а-яёА-ЯЁa-zA-Z]*"), "#6d4a9c", "фиолетовый"],
  [word("розов\[а-яёА-ЯЁa-zA-Z]*|pink"), "#d087a8", "розовый"],
  [word("чёрн\[а-яёА-ЯЁa-zA-Z]*|черн\[а-яёА-ЯЁa-zA-Z]*|black"), "#2a2c31", "чёрный"],
  [word("бел\[а-яёА-ЯЁa-zA-Z]*|white"), "#eeeae2", "белый"],
  [word("сер\[а-яёА-ЯЁa-zA-Z]*|grey|gray"), "#8f9299", "серый"],
  [word("коричнев\[а-яёА-ЯЁa-zA-Z]*|brown"), "#7a543a", "коричневый"],
  [word("золот\[а-яёА-ЯЁa-zA-Z]*|gold"), "#c9973f", "золотой"],
  [word("серебр\[а-яёА-ЯЁa-zA-Z]*|silver"), "#b6bcc4", "серебряный"],
];

const NUMBER_WORDS: [RegExp, number][] = [
  [word("один|одну|одно|одна"), 1],
  [word("два|две|двух"), 2],
  [word("три|трёх|трех"), 3],
  [word("четыре|четырёх|четырех"), 4],
  [word("пять|пяти"), 5],
  [word("шесть|шести"), 6],
  [word("семь|семи"), 7],
  [word("восемь|восьми"), 8],
  [word("девять|девяти"), 9],
  [word("десять|десяти"), 10],
  [word("двадцать|двадцати"), 20],
  [word("тридцать|тридцати"), 30],
  [word("сорок|сорока"), 40],
  [word("пятьдесят|пятидесяти"), 50],
  [word("девяносто"), 90],
  [word("сто"), 100],
];

/** Adjectives that mean "edit what is here", not "build me a new thing". */
const EDIT_WORDS = word(
  "красн\[а-яёА-ЯЁa-zA-Z]*|син\[а-яёА-ЯЁa-zA-Z]*|голуб\[а-яёА-ЯЁa-zA-Z]*|зелён\[а-яёА-ЯЁa-zA-Z]*|зелен\[а-яёА-ЯЁa-zA-Z]*|жёлт\[а-яёА-ЯЁa-zA-Z]*|желт\[а-яёА-ЯЁa-zA-Z]*|оранжев\[а-яёА-ЯЁa-zA-Z]*|" +
    "фиолетов\[а-яёА-ЯЁa-zA-Z]*|розов\[а-яёА-ЯЁa-zA-Z]*|чёрн\[а-яёА-ЯЁa-zA-Z]*|черн\[а-яёА-ЯЁa-zA-Z]*|бел\[а-яёА-ЯЁa-zA-Z]*|сер\[а-яёА-ЯЁa-zA-Z]*|коричнев\[а-яёА-ЯЁa-zA-Z]*|золот\[а-яёА-ЯЁa-zA-Z]*|серебр\[а-яёА-ЯЁa-zA-Z]*|" +
    "больше|меньше|крупнее|мельче|выше|ниже|шире|уже|вверх|вниз|влево|вправо|" +
    "красным|синим|зелёным|зеленым|белым|чёрным|черным"
);

/** Verbs that always attach a part to the existing model. */
const ADD_VERBS = starts(
  "добавь|добавить|добав|поставь|поставить|постав|вставь|вставить|прикрепи|прилепи|" +
    "add|insert|put|attach"
);

/** Verbs that build something new — unless a primitive is named. */
const BUILD_VERBS = starts(
  "построй|построить|построй.?ка|сделай|сделать|смоделируй|сгенерируй|создай|создать|" +
    "нарисуй|нарисовать|build|make|generate|create|model"
);

const DELETE_VERBS = word(
  "удали|удалить|удалите|убери|убрать|уберите|сотри|стереть|снеси|снести|delete|remove"
);

const SELECT_VERBS = word("выбери|выбрать|выберите|выдели|выделить|выделите|select|pick");

function firstNumber(text: string): number | undefined {
  const digits = text.match(/(\d+(?:[.,]\d+)?)/);
  if (digits) {
    const value = parseFloat(digits[1].replace(",", "."));
    if (Number.isFinite(value)) return value;
  }
  for (const [pattern, value] of NUMBER_WORDS) {
    if (pattern.test(text)) return value;
  }
  return undefined;
}

/** Everything after the verb, cleaned up — used as the part name to look for. */
function tailAfter(text: string, verb: RegExp): string {
  const match = text.match(verb);
  if (!match || match.index === undefined) return "";
  return text
    .slice(match.index + match[0].length)
    .replace(/^[\s,–—:-]+/, "")
    .replace(word("пожалуйста|плиз|давай|ка|же", "gi"), "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFiller(text: string): string {
  return text
    .replace(word("эту|этот|это|эти|выбранн\[а-яёА-ЯЁa-zA-Z]*|деталь|детали|часть|объект|элемент|мне|нам", "gi"), "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchShape(text: string): [PartShape, string] | null {
  for (const [pattern, shape, label] of SHAPES) {
    if (pattern.test(text)) return [shape, label];
  }
  return null;
}

/**
 * Parse one utterance.
 *
 * Order matters. Destructive and structural verbs are claimed before the
 * generic "make me a …" reading, and "сделай красным" stays an edit while
 * "сделай красный спорткар" becomes a new model.
 */
export function parseVoiceCommand(raw: string): VoiceCommand {
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (word("помощь|команды|help|подсказк\[а-яёА-ЯЁa-zA-Z]*").test(lower) || /что ты умеешь/i.test(lower)) {
    return { kind: "help" };
  }

  // --- history ---
  if (word("отмени|отменить|undo").test(lower) || /шаг назад|верни как было/i.test(lower)) {
    return { kind: "undo" };
  }
  if (word("повтори|повторить|redo").test(lower) || /верни обратно|верни вперёд/i.test(lower)) {
    return { kind: "redo" };
  }

  // --- presentation ---
  if (word("разбери|разобрать|разложи|разъедини|explode").test(lower) || /на части/i.test(lower)) {
    return { kind: "explode" };
  }
  if (word("собери|собрать|сложи|assemble").test(lower)) return { kind: "assemble" };
  if (/сверху|вид сверху|план сверху/i.test(lower) || word("top").test(lower))
    return { kind: "view", view: "top", label: "вид сверху" };
  if (/спереди|вид спереди|фронт/i.test(lower) || word("front").test(lower))
    return { kind: "view", view: "front", label: "вид спереди" };
  if (/сбоку|вид сбоку|профиль/i.test(lower) || word("side").test(lower))
    return { kind: "view", view: "side", label: "вид сбоку" };
  if (/перспектив|объёмн|объемн|орбит|обычный вид/i.test(lower) || word("orbit|3d").test(lower))
    return { kind: "view", view: "perspective", label: "объёмный вид" };

  // --- CAD tools ---
  if (/режим перемещ|инструмент перемещ|включи перемещ|move tool/i.test(lower))
    return { kind: "tool", tool: "translate", label: "перемещение" };
  if (/режим поворот|инструмент поворот|включи поворот|rotate tool/i.test(lower))
    return { kind: "tool", tool: "rotate", label: "поворот" };
  if (/режим масштаб|инструмент масштаб|включи масштаб|scale tool/i.test(lower))
    return { kind: "tool", tool: "scale", label: "масштаб" };
  if (/режим выбор|инструмент выбор|select tool/i.test(lower))
    return { kind: "tool", tool: "select", label: "выбор" };
  if (/привязк[а-яёА-ЯЁa-zA-Z]*\s*(вкл|включ)|включи привязк|snap on/i.test(lower)) return { kind: "snap", on: true };
  if (/привязк[а-яёА-ЯЁa-zA-Z]*\s*(выкл|откл)|выключи привязк|snap off/i.test(lower))
    return { kind: "snap", on: false };
  if (word("измерь|измерить|измерение|линейка|measure").test(lower) || /расстояни[а-яёА-ЯЁa-zA-Z]*|дистанци[а-яёА-ЯЁa-zA-Z]*/i.test(lower))
    return { kind: "measure" };

  // --- export ---
  if (word("скачай|скачать|экспорт|экспортируй|сохрани|сохранить|выгрузи|download|export").test(lower)) {
    if (/stl/i.test(lower)) return { kind: "export", format: "stl" };
    if (/obj/i.test(lower)) return { kind: "export", format: "obj" };
    if (/ply/i.test(lower)) return { kind: "export", format: "ply" };
    if (/usdz/i.test(lower)) return { kind: "export", format: "usdz" };
    return { kind: "export", format: "glb" };
  }

  if (/начни заново|начать заново|новая модель|new model/i.test(lower) || word("очисти|сбрось|заново").test(lower)) {
    return { kind: "reset" };
  }

  // --- destructive, before anything that could read as "make" ---
  if (DELETE_VERBS.test(lower)) {
    const target = stripFiller(tailAfter(lower, DELETE_VERBS));
    return { kind: "delete", ...(target.length >= 2 ? { target } : {}) };
  }

  if (word("дублируй|дублировать|скопируй|копировать|дубликат|копию|duplicate|copy").test(lower)) {
    return { kind: "duplicate" };
  }

  // --- add: always attaches to the current model ---
  if (ADD_VERBS.test(lower)) {
    const shape = matchShape(lower);
    return shape
      ? { kind: "add", shape: shape[0], label: shape[1] }
      : { kind: "add", shape: "box", label: "деталь" };
  }

  // --- build: a named primitive still means "add one", otherwise a new model ---
  if (BUILD_VERBS.test(lower)) {
    const shape = matchShape(lower);
    if (shape) return { kind: "add", shape: shape[0], label: shape[1] };

    const tail = stripFiller(tailAfter(lower, BUILD_VERBS));
    const words = tail.split(/\s+/).filter(Boolean);
    const editish = words.length <= 1 && EDIT_WORDS.test(tail);
    if (tail.length >= 3 && !editish) return { kind: "generate", prompt: tail };
  }

  // --- selection ---
  if (SELECT_VERBS.test(lower)) {
    const target = stripFiller(tailAfter(lower, SELECT_VERBS));
    if (target.length >= 2) return { kind: "select", target };
  }

  // --- colour ---
  if (word("цвет|покрась|покрасить|перекрась|colou?r|paint").test(lower) || EDIT_WORDS.test(lower)) {
    for (const [pattern, color, label] of COLORS) {
      if (pattern.test(lower)) return { kind: "color", color, label };
    }
  }

  // --- size ---
  if (word("увеличь|увеличить|больше|крупнее|bigger|larger").test(lower)) {
    const percent = firstNumber(lower);
    const factor = percent && percent > 1 && percent <= 500 ? 1 + percent / 100 : 1.25;
    return { kind: "scale", factor };
  }
  if (word("уменьши|уменьшить|меньше|мельче|smaller").test(lower)) {
    const percent = firstNumber(lower);
    const factor = percent && percent > 1 && percent <= 95 ? 1 - percent / 100 : 0.8;
    return { kind: "scale", factor };
  }

  // --- move ---
  const direction: [RegExp, "x" | "y" | "z", number, string][] = [
    [word("вверх|выше|подними|поднять|up"), "y", 1, "вверх"],
    [word("вниз|ниже|опусти|опустить|down"), "y", -1, "вниз"],
    [word("влево|левее|left"), "x", -1, "влево"],
    [word("вправо|правее|right"), "x", 1, "вправо"],
    [word("вперёд|вперед|ближе|forward"), "z", 1, "вперёд"],
    [word("назад|дальше|back"), "z", -1, "назад"],
  ];
  const moveVerb = word("двигай|подвинь|подвинуть|сдвинь|сдвинуть|перемести|переместить|подними|опусти|move|shift");
  if (moveVerb.test(lower) || direction.some(([pattern]) => pattern.test(lower))) {
    for (const [pattern, axis, sign, label] of direction) {
      if (!pattern.test(lower)) continue;
      const amount = firstNumber(lower);
      const step = amount && amount > 0 && amount < 1000 ? amount : 0.2;
      return { kind: "move", axis, delta: sign * step, label };
    }
  }

  // --- rotate ---
  if (word("поверни|повернуть|разверни|развернуть|крутани|rotate|turn").test(lower)) {
    const degrees = firstNumber(lower) ?? 90;
    const radians = (Math.min(360, Math.max(1, degrees)) * Math.PI) / 180;
    if (/по x|вокруг x|наклони/i.test(lower))
      return { kind: "rotate", axis: "x", radians, label: `на ${degrees}° по X` };
    if (/по z|вокруг z|набок/i.test(lower))
      return { kind: "rotate", axis: "z", radians, label: `на ${degrees}° по Z` };
    return { kind: "rotate", axis: "y", radians, label: `на ${degrees}°` };
  }

  return { kind: "chat", text };
}

/** What the assistant says back once a command has been executed. */
export function describeCommand(command: VoiceCommand): string {
  switch (command.kind) {
    case "add":
      return `Добавил ${command.label}.`;
    case "delete":
      return command.target ? `Удалил: ${command.target}.` : "Удалил выбранную деталь.";
    case "duplicate":
      return "Сделал копию.";
    case "select":
      return `Выбрал: ${command.target}.`;
    case "color":
      return `Перекрасил в ${command.label}.`;
    case "scale":
      return command.factor > 1 ? "Увеличил." : "Уменьшил.";
    case "move":
      return `Сдвинул ${command.label}.`;
    case "rotate":
      return `Повернул ${command.label}.`;
    case "undo":
      return "Отменил.";
    case "redo":
      return "Вернул.";
    case "explode":
      return "Разбираю на части.";
    case "assemble":
      return "Собираю.";
    case "view":
      return `Включил ${command.label}.`;
    case "tool":
      return `Инструмент: ${command.label}.`;
    case "snap":
      return command.on ? "Привязка включена." : "Привязка выключена.";
    case "export":
      return `Готовлю ${command.format.toUpperCase()}.`;
    case "measure":
      return "Режим измерения: кликни по двум деталям.";
    case "reset":
      return "Начинаем заново.";
    case "generate":
      return "Строю модель.";
    case "help":
      return "Скажи: добавь куб, удали крышу, покрась в синий, увеличь на 30, поверни на 90, разбери, скачай GLB.";
    case "chat":
    default:
      return "Секунду…";
  }
}

export const VOICE_EXAMPLES = [
  "добавь куб",
  "удали крышу",
  "покрась в синий",
  "увеличь на 30",
  "поверни на 90",
  "подними вверх",
  "разбери",
  "скачай GLB",
];
