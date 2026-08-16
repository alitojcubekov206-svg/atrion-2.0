/**
 * Voice → action.
 *
 * Every editing command a user actually says is recognised and executed on the
 * client, synchronously, against the scene state. Nothing here waits on a
 * network call, so "добавь куб" and "удали крышу" cannot hang — the AI is only
 * consulted for wording this parser does not claim.
 */
import type { PartShape } from "@/lib/types";

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
  | { kind: "export"; format: "glb" | "stl" | "obj" }
  | { kind: "measure" }
  | { kind: "reset" }
  | { kind: "generate"; prompt: string }
  | { kind: "help" }
  | { kind: "chat"; text: string };

const SHAPES: [RegExp, PartShape, string][] = [
  [/\bкуб(ик|а|ов)?\b|\bcube\b|коробк|ящик|блок|\bbox\b|параллелепипед/i, "box", "куб"],
  [/шар(ик)?|сфер|\bsphere\b|\bball\b/i, "sphere", "сферу"],
  [/цилиндр|\bcylinder\b|валик|столбик/i, "cylinder", "цилиндр"],
  [/труб|\btube\b|кольцевую трубу|полый цилиндр/i, "tube", "трубу"],
  [/конус|\bcone\b/i, "cone", "конус"],
  [/пирамид|\bpyramid\b/i, "pyramid", "пирамиду"],
  [/призм|\bprism\b|двускат/i, "prism", "призму"],
  [/клин|\bwedge\b|пандус|рампу/i, "wedge", "клин"],
  [/тор\b|бублик|кольцо|\btorus\b|\bring\b/i, "torus", "тор"],
  [/капсул|\bcapsule\b|таблетк/i, "capsule", "капсулу"],
  [/плоскост|панель|пластин|плит|\bplane\b|\bslab\b/i, "plane", "панель"],
];

const COLORS: [RegExp, string, string][] = [
  [/красн|\bred\b/i, "#c1462f", "красный"],
  [/син(ий|им|ем|его)|\bblue\b/i, "#2f5fb0", "синий"],
  [/голуб|cyan/i, "#6fa8dc", "голубой"],
  [/зелён|зелен|\bgreen\b/i, "#3f8a5b", "зелёный"],
  [/жёлт|желт|\byellow\b/i, "#d9b13b", "жёлтый"],
  [/оранж|\borange\b/i, "#d1743a", "оранжевый"],
  [/фиолет|пурпур|\bpurple\b|сирен/i, "#6d4a9c", "фиолетовый"],
  [/розов|\bpink\b/i, "#d087a8", "розовый"],
  [/чёрн|черн|\bblack\b/i, "#2a2c31", "чёрный"],
  [/бел(ый|ым|ого|ая)|\bwhite\b/i, "#eeeae2", "белый"],
  [/сер(ый|ым|ого|ая)|\bgrey\b|\bgray\b/i, "#8f9299", "серый"],
  [/коричнев|\bbrown\b/i, "#7a543a", "коричневый"],
  [/золот|\bgold\b/i, "#c9973f", "золотой"],
  [/серебр|\bsilver\b/i, "#b6bcc4", "серебряный"],
];

const NUMBER_WORDS: [RegExp, number][] = [
  [/\bодин\b|\bодну\b|\bодно\b/i, 1],
  [/\bдва\b|\bдве\b/i, 2],
  [/\bтри\b/i, 3],
  [/\bчетыре\b/i, 4],
  [/\bпять\b/i, 5],
  [/\bдесять\b/i, 10],
  [/\bдвадцать\b/i, 20],
  [/\bтридцать\b/i, 30],
  [/\bсорок\b/i, 40],
  [/\bпятьдесят\b/i, 50],
  [/\bдевяносто\b/i, 90],
  [/\bсто\b/i, 100],
];

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
function tailAfter(text: string, verb: RegExp): string | undefined {
  const match = text.match(verb);
  if (!match || match.index === undefined) return undefined;
  const tail = text
    .slice(match.index + match[0].length)
    .replace(/^[\s,–—-]+/, "")
    .replace(/\b(пожалуйста|плиз|давай|же|ка)\b/gi, "")
    .trim();
  return tail.length >= 2 ? tail : undefined;
}

/**
 * Parse one utterance.
 *
 * Order matters: the destructive and structural verbs are claimed before the
 * generic "make me a …" reading, so "удали куб" deletes rather than adds.
 */
export function parseVoiceCommand(raw: string): VoiceCommand {
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (/^(помощь|что ты умеешь|команды|help|подскажи команды)/i.test(lower)) {
    return { kind: "help" };
  }

  // --- history ---
  if (/отмен|назад|undo|верни как было|шаг назад/i.test(lower)) return { kind: "undo" };
  if (/повтор|верни обратно|redo|вперёд|вперед/i.test(lower)) return { kind: "redo" };

  // --- view / presentation ---
  if (/разбер|разложи|разъедин|explod|на части/i.test(lower)) return { kind: "explode" };
  if (/собери|сложи|assembl|обратно вместе/i.test(lower)) return { kind: "assemble" };
  if (/сверху|вид сверху|\btop\b|план\b/i.test(lower))
    return { kind: "view", view: "top", label: "вид сверху" };
  if (/спереди|вид спереди|фронт|\bfront\b/i.test(lower))
    return { kind: "view", view: "front", label: "вид спереди" };
  if (/сбоку|вид сбоку|профиль|\bside\b/i.test(lower))
    return { kind: "view", view: "side", label: "вид сбоку" };
  if (/объёмн|объемн|перспектив|орбит|\borbit\b|обычный вид|３d|\b3d\b/i.test(lower))
    return { kind: "view", view: "perspective", label: "объёмный вид" };

  // --- CAD tools ---
  if (/режим перемещ|инструмент перемещ|включи перемещ|move tool/i.test(lower))
    return { kind: "tool", tool: "translate", label: "перемещение" };
  if (/режим поворот|инструмент поворот|включи поворот|rotate tool/i.test(lower))
    return { kind: "tool", tool: "rotate", label: "поворот" };
  if (/режим масштаб|инструмент масштаб|включи масштаб|scale tool/i.test(lower))
    return { kind: "tool", tool: "scale", label: "масштаб" };
  if (/режим выбор|инструмент выбор|отмени инструмент|select tool/i.test(lower))
    return { kind: "tool", tool: "select", label: "выбор" };
  if (/привязк.*(включ|вкл)|включи привязк|snap on/i.test(lower)) return { kind: "snap", on: true };
  if (/привязк.*(выключ|откл)|выключи привязк|snap off/i.test(lower))
    return { kind: "snap", on: false };
  if (/измер|расстояни|дистанц|линейк|measure/i.test(lower)) return { kind: "measure" };

  // --- export ---
  if (/скачай|экспорт|сохрани|выгрузи|download|export/i.test(lower)) {
    if (/stl/i.test(lower)) return { kind: "export", format: "stl" };
    if (/obj/i.test(lower)) return { kind: "export", format: "obj" };
    return { kind: "export", format: "glb" };
  }

  // --- destructive ---
  if (/^(удали|убери|сотри|удалить|убрать|снеси|delete|remove)\b/i.test(lower) || /\b(удали|убери|сотри)\b/i.test(lower)) {
    const target = tailAfter(lower, /\b(удали|убери|сотри|удалить|убрать|снеси|delete|remove)\b/i);
    const cleaned = target
      ?.replace(/^(эту|этот|это|эти|выбранн\w+|деталь|детали|часть|объект|элемент)\s*/i, "")
      .trim();
    return { kind: "delete", target: cleaned || undefined };
  }

  if (/дублируй|скопируй|копию|дубликат|duplicate|copy/i.test(lower)) return { kind: "duplicate" };

  if (/начни заново|очисти|сбрось|новая модель|new model|заново/i.test(lower)) {
    return { kind: "reset" };
  }

  // --- add ---
  if (/^(добав|постав|создай|вставь|прикрепи|нарисуй|add|insert|put)/i.test(lower) || /\bдобавь\b/i.test(lower)) {
    for (const [pattern, shape, label] of SHAPES) {
      if (pattern.test(lower)) return { kind: "add", shape, label };
    }
    // "добавь балкон" — a named thing with no primitive word: still add a block,
    // the user can reshape it, and nothing hangs waiting for a model.
    return { kind: "add", shape: "box", label: "деталь" };
  }

  // --- selection ---
  if (/^(выбери|выдели|выберите|select)\b/i.test(lower)) {
    const target = tailAfter(lower, /\b(выбери|выдели|выберите|select)\b/i);
    if (target) return { kind: "select", target };
  }

  // --- colour ---
  if (/цвет|покрась|перекрась|сделай .*(красн|син|зелён|зелен|жёлт|желт|чёрн|черн|бел|сер)|colou?r|paint/i.test(lower)) {
    for (const [pattern, color, label] of COLORS) {
      if (pattern.test(lower)) return { kind: "color", color, label };
    }
  }

  // --- size ---
  if (/увелич|больше|крупнее|bigger|larger|scale up/i.test(lower)) {
    const percent = firstNumber(lower);
    const factor = percent && percent > 1 && percent <= 500 ? 1 + percent / 100 : 1.25;
    return { kind: "scale", factor };
  }
  if (/уменьш|меньше|мельче|smaller|scale down/i.test(lower)) {
    const percent = firstNumber(lower);
    const factor = percent && percent > 1 && percent <= 95 ? 1 - percent / 100 : 0.8;
    return { kind: "scale", factor };
  }

  // --- move ---
  const moveVerb = /двигай|подвинь|сдвинь|перемести|подними|опусти|move|shift/i;
  if (moveVerb.test(lower)) {
    const amount = firstNumber(lower);
    const step = amount && amount > 0 && amount < 1000 ? amount : 0.2;
    if (/вверх|выше|подними|\bup\b/i.test(lower))
      return { kind: "move", axis: "y", delta: step, label: "вверх" };
    if (/вниз|ниже|опусти|\bdown\b/i.test(lower))
      return { kind: "move", axis: "y", delta: -step, label: "вниз" };
    if (/влево|левее|\bleft\b/i.test(lower))
      return { kind: "move", axis: "x", delta: -step, label: "влево" };
    if (/вправо|правее|\bright\b/i.test(lower))
      return { kind: "move", axis: "x", delta: step, label: "вправо" };
    if (/вперёд|вперед|ближе|\bforward\b/i.test(lower))
      return { kind: "move", axis: "z", delta: step, label: "вперёд" };
    if (/назад|дальше|\bback\b/i.test(lower))
      return { kind: "move", axis: "z", delta: -step, label: "назад" };
  }

  // --- rotate ---
  if (/поверни|разверни|крутани|rotate|turn/i.test(lower)) {
    const degrees = firstNumber(lower) ?? 90;
    const radians = (Math.min(360, Math.max(1, degrees)) * Math.PI) / 180;
    if (/по x|вокруг x|наклони/i.test(lower))
      return { kind: "rotate", axis: "x", radians, label: `на ${degrees}° по X` };
    if (/по z|вокруг z|набок/i.test(lower))
      return { kind: "rotate", axis: "z", radians, label: `на ${degrees}° по Z` };
    return { kind: "rotate", axis: "y", radians, label: `на ${degrees}°` };
  }

  // --- build something new ---
  const generate = lower.match(
    /^(?:построй|сделай|смоделируй|сгенерируй|создай модель|build|make|generate)\b\s*(.+)$/i
  );
  if (generate && generate[1].trim().length >= 3) {
    return { kind: "generate", prompt: generate[1].trim() };
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
  "удали выбранную деталь",
  "покрась в синий",
  "увеличь на 30",
  "поверни на 90",
  "подними вверх",
  "разбери",
  "скачай GLB",
];
