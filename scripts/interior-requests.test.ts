import test from "node:test";
import assert from "node:assert/strict";
import {designPromptTarget} from "../src/shared/interior/request";
import {generateLocalModel} from "../src/backend/design/local-model";
import {prepareInteriorScene} from "../src/backend/interior/request";
import {newScene, layoutIssues} from "../src/shared/interior/scene";
import {designWithPlanner, localPlan, applyActions} from "../src/shared/interior/engine";
import {POST as preview} from "../src/app/api/playground/design/route";

test("one entry point routes the subject, including short prompts and furniture lists", () => {
  for (const p of ["дом", "Дом с двумя спальнями", "Красный спорткар", "кот", "Стул", "Робот-паук", "Кухня с холодильником"]) assert.equal(designPromptTarget(p), "model", p);
  for (const p of ["Спальня", "Спальня 4×5 м с кроватью и шкафом", "Гостиная в доме", "кровать, шкаф и два светильника", "Living room with sofa"]) assert.equal(designPromptTarget(p), "interior", p);
});

test("short model prompts produce corresponding geometry; unknown subjects are not random models", () => {
  const house = generateLocalModel("Дом", "fixture");
  assert(house.concept.parts.some(p => p.role === "wall"));
  const car = generateLocalModel("Красный спорткар", "fixture");
  assert(car.concept.parts.some(p => /колес|колёс|wheel/i.test(p.name)));
  assert(!car.concept.parts.some(p => p.role === "wall"));
  assert(generateLocalModel("Кот", "fixture").concept.parts.some(p => /хвост/i.test(p.name)));
  assert.throws(() => generateLocalModel("абракадабра", "fixture"), /Не распознан основной объект/);
  assert.throws(() => generateLocalModel(""));
});

test("preview API is dev-only and accepts the screenshot request without a database", async () => {
  const env = process.env as Record<string, string | undefined>, old = env.NODE_ENV;
  try {
    env.NODE_ENV = "production";
    assert.equal((await preview(new Request("http://localhost/api/playground/design", {method: "POST", body: "invalid"}))).status, 404);
    env.NODE_ENV = "development";
    const response = await preview(new Request("http://localhost/api/playground/design", {method: "POST", body: JSON.stringify({prompt: "дом"})}));
    assert.equal(response.status, 200); assert.equal((await response.json()).question.id, "rooms");
    const completed = await preview(new Request("http://localhost/api/playground/design", {method: "POST", body: JSON.stringify({prompt: "дом", answers: [{questionId: "rooms", answer: "3 комнаты, один этаж, 12×9 м"}]})}));
    assert.equal(completed.status, 200); assert.equal((await completed.json()).document.floors[0].rooms.length, 3);
    const unknown = await preview(new Request("http://localhost/api/playground/design", {method: "POST", body: JSON.stringify({prompt: "абракадабра"})}));
    assert.equal(unknown.status, 200); assert.equal((await unknown.json()).question.id, "subject");
  } finally {if (old === undefined) delete env.NODE_ENV; else env.NODE_ENV = old;}
});

test("room dimensions apply in preview without turning measurements into furniture counts", async () => {
  const original = newScene(5.6, 5.2, 2.9), copy = structuredClone(original);
  const base = prepareInteriorScene(original, "Спальня 4×5 метров с кроватью и шкафом", false);
  const {scene} = await designWithPlanner(base, "Спальня 4×5 метров с кроватью и шкафом", false, 0);
  assert.equal(scene.width, 4); assert.equal(scene.length, 5); assert.equal(scene.roomType, "bedroom");
  assert.equal(scene.objects.length, 2); assert.deepEqual(layoutIssues(scene), []); assert.deepEqual(original, copy);
});

test("bare room names get defaults and an explicit empty room stays empty", async () => {
  const bedroom = await designWithPlanner(newScene(), "Спальня", false, 0);
  assert.deepEqual(bedroom.scene.objects.map(o => o.assetId).sort(), ["bed_double", "wardrobe_double"]);
  assert.equal((await designWithPlanner(newScene(), "Пустая спальня", false, 0)).scene.objects.length, 0);
});

test("catalog commands preserve exact furniture types, counts and per-item colors", () => {
  const plan = localPlan("Гостиная: красный диван, синий пуф, обеденный стол и два белых стула", newScene(8, 8), false);
  const added = plan.actions.filter(a => a.type === "ADD_OBJECT");
  assert.deepEqual(added.map(a => a.assetId), ["sofa_compact", "ottoman_round", "table_dining", "chair_simple", "chair_simple"]);
  assert.equal(added[0].color, "#b94339"); assert.equal(added[1].color, "#3d6599"); assert.equal(added[3].color, "#ffffff");
  const exclusions = localPlan("Гостиная с диваном, без стола и стульев", newScene(), false);
  assert.deepEqual(exclusions.actions.filter(a => a.type === "ADD_OBJECT").map(a => a.assetId), ["sofa_compact"]);
});

test("editing an armchair does not affect a chair sharing its category", async () => {
  const {scene} = await designWithPlanner(newScene(7, 7), "кресло и стул", false, 0);
  const chair = scene.objects.find(o => o.assetId === "chair_simple")!;
  const colored = applyActions(scene, localPlan("Сделай кресло зелёным", scene, true));
  assert.deepEqual(colored.objects.find(o => o.id === chair.id), chair);
  assert.equal(colored.objects.find(o => o.assetId === "armchair_soft")!.color, "#5b7d58");
  const removed = applyActions(scene, localPlan("Убери кресло", scene, true));
  assert.deepEqual(removed.objects, [chair]);
  assert.throws(() => localPlan("Убери кресло и добавь телепорт", scene, true), /Не распознана часть/);
});

test("wall/floor colors and explicit rotation do not create extra furniture", async () => {
  const {scene} = await designWithPlanner(newScene(7, 7), "стул", false, 0);
  const actions = localPlan("Поверни стул на 90 градусов, сделай стены бежевыми и пол коричневым", scene, true);
  const result = applyActions(scene, actions);
  assert.equal(result.objects.length, 1); assert.equal(result.objects[0].rotation.y, Math.PI / 2);
  assert.equal(result.wallColor, "#d5c5a7"); assert.equal(result.floorColor, "#795c43");
});
