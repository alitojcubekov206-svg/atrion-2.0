/**
 * Voice parser check.
 *
 * Every phrase below is something a user actually says. The parser must claim
 * it locally — anything that falls through to "chat" would go to the network
 * instead of editing the scene, which is exactly the failure this guards.
 *
 *   npx tsx scripts/voice-test.ts
 */
import { parseVoiceCommand, type VoiceCommand } from "@/frontend/voice-commands";

type Case = [phrase: string, expected: VoiceCommand["kind"]];

const CASES: Case[] = [
  // add
  ["добавь куб", "add"],
  ["добавь сферу", "add"],
  ["добавь цилиндр", "add"],
  ["поставь конус", "add"],
  ["создай пирамиду", "add"],
  ["вставь трубу", "add"],
  ["добавь деталь", "add"],
  ["нарисуй кольцо", "add"],
  ["add box", "add"],

  // delete
  ["удали", "delete"],
  ["удали крышу", "delete"],
  ["удали выбранную деталь", "delete"],
  ["убери окно", "delete"],
  ["сотри эту деталь", "delete"],
  ["удалить колесо", "delete"],
  ["убрать шпиль", "delete"],
  ["delete", "delete"],

  // selection and copies
  ["выбери крышу", "select"],
  ["выдели дверь", "select"],
  ["дублируй", "duplicate"],
  ["скопируй деталь", "duplicate"],

  // colour
  ["покрась в синий", "color"],
  ["сделай красным", "color"],
  ["цвет зелёный", "color"],

  // size
  ["увеличь", "scale"],
  ["увеличь на 30", "scale"],
  ["сделай больше", "scale"],
  ["уменьши на 20", "scale"],

  // move and rotate
  ["подними вверх", "move"],
  ["опусти вниз", "move"],
  ["сдвинь влево", "move"],
  ["подвинь вправо на 2", "move"],
  ["поверни на 90", "rotate"],
  ["разверни", "rotate"],

  // history and view
  ["отмени", "undo"],
  ["шаг назад", "undo"],
  ["повтори", "redo"],
  ["разбери", "explode"],
  ["собери", "assemble"],
  ["вид сверху", "view"],
  ["покажи спереди", "view"],
  ["сбоку", "view"],

  // tools and output
  ["включи привязку", "snap"],
  ["измерь расстояние", "measure"],
  ["скачай GLB", "export"],
  ["сохрани в STL", "export"],
  ["экспорт obj", "export"],
  ["начни заново", "reset"],
  ["помощь", "help"],

  // generation
  ["построй двухэтажный дом с гаражом", "generate"],
  ["сделай красный спорткар", "generate"],

  // free-form falls through to the model on purpose
  ["а почему тут так сделано", "chat"],
];

let failed = 0;
const numbers: [string, number | undefined][] = [];

for (const [phrase, expected] of CASES) {
  const command = parseVoiceCommand(phrase);
  const ok = command.kind === expected;
  if (!ok) failed += 1;
  const detail =
    command.kind === "add"
      ? ` → ${command.shape}`
      : command.kind === "delete"
        ? ` → цель: ${command.target ?? "выбранная"}`
        : command.kind === "select"
          ? ` → ${command.target}`
          : command.kind === "color"
            ? ` → ${command.label}`
            : command.kind === "scale"
              ? ` → ×${command.factor.toFixed(2)}`
              : command.kind === "move"
                ? ` → ${command.axis} ${command.delta}`
                : command.kind === "rotate"
                  ? ` → ${command.label}`
                  : "";
  console.log(
    `${ok ? "ok  " : "FAIL"}  ${phrase.padEnd(34)} ${String(command.kind).padEnd(10)}${detail}` +
      (ok ? "" : `   (ожидалось: ${expected})`)
  );
}

// The spoken amounts have to survive too — "увеличь на 30" is 30%, not 25%.
const scaled = parseVoiceCommand("увеличь на 30");
if (scaled.kind === "scale") numbers.push(["увеличь на 30", scaled.factor]);
const moved = parseVoiceCommand("подними вверх на 2");
if (moved.kind === "move") numbers.push(["подними вверх на 2", moved.delta]);
const turned = parseVoiceCommand("поверни на 45");
if (turned.kind === "rotate") numbers.push(["поверни на 45", Math.round((turned.radians * 180) / Math.PI)]);

console.log("\n──────── числа в командах ────────");
for (const [phrase, value] of numbers) console.log(`${phrase.padEnd(24)} → ${value}`);

console.log(`\n${CASES.length - failed}/${CASES.length} команд распознано`);
if (failed > 0) process.exitCode = 1;
