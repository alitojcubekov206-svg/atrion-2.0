import test from "node:test";
import assert from "node:assert/strict";
import {resolveDesignBrief} from "../src/backend/design/brief";
import {buildBriefModel} from "../src/backend/design/brief-model";
import {checkGeneratedHouse} from "../src/backend/design/house-generation";
import {parseHouse} from "../src/shared/house/document";
import type {BriefAnswer, DesignBrief, ReadyBrief} from "../src/shared/design/brief";

const answer = (questionId: string, answer: string): BriefAnswer => ({questionId, answer});
function ready(value: DesignBrief): ReadyBrief {assert.equal(value.kind, "ready"); return value as ReadyBrief;}
function question(value: DesignBrief) {assert.equal(value.kind, "clarification");return value.kind === "clarification" ? value.question.id : "";}

test("bare house asks progressively and remembers prior answers", () => {
  assert.equal(question(resolveDesignBrief("дом")), "rooms");
  const rooms = answer("rooms", "2 спальни, кухня-гостиная, санузел и прихожая");
  assert.equal(question(resolveDesignBrief("дом", [rooms])), "floors");
  const floors = answer("floors", "2");
  assert.equal(question(resolveDesignBrief("дом", [rooms, floors])), "size");
  const brief = ready(resolveDesignBrief("дом", [rooms, floors, answer("size", "12 на 9 метров")]));
  assert.equal(brief.house!.rooms.length, 5);assert.equal(brief.house!.floors, 2);
  assert.equal(brief.house!.width, 12);assert.equal(brief.house!.depth, 9);
});

test("fully specified brief skips the questionnaire and one reply can fill several fields", () => {
  const prompt = "Одноэтажный дом 12×9 м с двумя спальнями, кухней-гостиной, санузлом и прихожей";
  const a = ready(resolveDesignBrief(prompt));
  const b = ready(resolveDesignBrief("дом", [answer("rooms", prompt)]));
  assert.deepEqual({...a.house,description:undefined}, {...b.house,description:undefined});assert.equal(a.house!.rooms.length, 5);
  assert.equal(question(resolveDesignBrief("Дом 12×9 м, два этажа")), "rooms");
  assert.equal(question(resolveDesignBrief("Дом 12×9 м, три комнаты")), "floors");
});

test("delegated choices are explicit and never overwrite provided requirements", () => {
  const brief = ready(resolveDesignBrief("Дом, 2 этажа, 15×12 м, остальное реши сам"));
  assert.equal(brief.house!.floors, 2); assert.equal(brief.house!.width, 15); assert.equal(brief.house!.depth, 12);
  assert.equal(brief.house!.rooms.length, 5);assert(brief.assumptions.some(a => /Предложен набор/.test(a)));
  const scoped = resolveDesignBrief("дом", [answer("rooms", "Подбери сам")]);
  assert.equal(question(scoped), "floors");
});

test("invalid answers remain a question and corrected values win", () => {
  const start = "Дом, 3 комнаты, 12×9 м";
  assert.equal(question(resolveDesignBrief(start, [answer("floors", "не уверен") ])), "floors");
  assert.equal(question(resolveDesignBrief(start, [answer("floors", "4 этажа") ])), "floors");
  const fixed = ready(resolveDesignBrief(start, [answer("floors", "4 этажа"), answer("floors", "2 этажа")]));
  assert.equal(fixed.house!.floors, 2);
  assert.throws(() => resolveDesignBrief("дом", [{questionId: "SQL", answer: "x"}]));
});

test("room count and dimensions produce actual validated interior partitions", () => {
  const result = buildBriefModel(ready(resolveDesignBrief("Дом 12×9 м, 2 этажа, 2 спальни, гостиная, кухня, санузел и прихожая")));
  const doc = parseHouse(result.document);
  assert.equal(doc.floors.length, 2);assert.equal(doc.floors.flatMap(f => f.rooms).length, 6);
  assert.equal(doc.floors.flatMap(f => f.rooms).filter(r => /Спальня/.test(r.name)).length, 2);
  assert.deepEqual(checkGeneratedHouse(doc), []);
  assert(result.concept.parts.some(p => p.role === "wall" && Math.abs(p.position[0]) < 5 && Math.abs(p.position[2]) < 3));
  assert(doc.floors.every(f => f.openings.some(o => o.kind === "door")));
  assert(result.concept.parts.every(p => p.position.every(Number.isFinite) && p.size.every(n => n > 0)));
});

test("changing requested room count changes the generated layout, not only the description", () => {
  const make = (n: number) => buildBriefModel(ready(resolveDesignBrief(`Дом, один этаж, 12×9 м, ${n} комнаты`)));
  const a = make(3), b = make(4);
  assert.equal(a.document!.floors[0].rooms.length, 3); assert.equal(b.document!.floors[0].rooms.length, 4);
  assert.notDeepEqual(a.concept.parts.filter(p => p.role === "wall"), b.concept.parts.filter(p => p.role === "wall"));
});

test("questions adapt to rooms and other objects without repeating explicit detail", () => {
  assert.equal(question(resolveDesignBrief("Спальня")), "furniture");
  assert.equal(resolveDesignBrief("Спальня 4×5 м с кроватью и шкафом").kind, "ready");
  assert.equal(question(resolveDesignBrief("Кот")), "details");
  assert.equal(resolveDesignBrief("Кот сидит").kind, "ready");
  assert.match(ready(resolveDesignBrief("Кот", [answer("details", "Сидит")])).prompt, /Сидит/);
  assert.equal(question(resolveDesignBrief("абракадабра")), "subject");
  assert.equal(question(resolveDesignBrief("абракадабра", [answer("subject", "Дом")])), "rooms");
});
