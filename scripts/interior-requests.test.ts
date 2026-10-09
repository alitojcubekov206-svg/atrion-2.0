import test from "node:test";
import assert from "node:assert/strict";
import {designPromptTarget} from "../src/shared/interior/request";
import {generateLocalModel} from "../src/backend/design/local-model";
import {prepareInteriorScene} from "../src/backend/interior/request";
import {newScene, layoutIssues} from "../src/shared/interior/scene";
import {designWithPlanner, localPlan, applyActions} from "../src/shared/interior/engine";
import {POST as preview} from "../src/app/api/playground/design/route";

test("one entry point routes the subject, including short prompts and furniture lists", () => {
  for (const p of ["дом", "Дом с двумя спальнями", "Красный спорткар", "кот", "Стул", "Робот-паук", "кухонный стол", "детская кроватка"]) assert.equal(designPromptTarget(p), "model", p);
  // Kitchens, bathrooms, kids' rooms, dining rooms and halls are rooms; they used to become single objects.
  for (const p of ["Спальня", "Спальня 4×5 м с кроватью и шкафом", "Гостиная в доме", "кровать, шкаф и два светильника", "Living room with sofa", "Кухня с холодильником", "ванная комната", "санузел с душем", "детская", "столовая", "прихожая"]) assert.equal(designPromptTarget(p), "interior", p);
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

test("default decision phrases preserve room furniture without hiding unsupported requests", async () => {
  for (const decision of ["реши сам", "Подбери сам", "на твой вкус", "you decide"]) {
    const {scene} = await designWithPlanner(newScene(), `Спальня 4×5 м, ${decision}`, false, 0);
    assert.deepEqual(scene.objects.map(o => o.assetId).sort(), ["bed_double", "wardrobe_double"]);
  }
  assert.throws(() => localPlan("Спальня, реши сам, добавь телепорт", newScene(), false), /Не распознана часть/);
  assert.throws(() => localPlan("реши сам", newScene(), true), /Не удалось распознать команду/);
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

test("FORMA's room set: kitchens, bathrooms, kids' rooms, rugs, TVs, essentials and exclusions", () => {
  const items = (prompt: string) => applyActions(newScene(5, 6), localPlan(prompt, newScene(5, 6), false)).objects.map(o => o.assetId).sort();
  assert.deepEqual(items("кухня"), ["chair_simple", "chair_simple", "fridge_tall", "kitchen_run", "table_dining"]);
  assert.deepEqual(items("ванная комната"), ["shower_square", "toilet_compact", "vanity_sink"]);
  assert(items("детская комната с кроватью").includes("bed_single"), "a child's bed is a single bed");
  assert.deepEqual(items("гостиная с телевизором, ковром и растением"), ["plant_pot", "rug_floor", "sofa_compact", "tv_stand"]);
  assert.deepEqual(items("уютная спальня с двумя тумбами"), ["bed_double", "decor_cube", "decor_cube"], "a bedroom keeps its bed");
  assert.deepEqual(items("спальня без кровати с двумя креслами"), ["armchair_soft", "armchair_soft"], "«без» is not undone by a later «с»");
  assert(items("кабинет с книжным шкафом").includes("bookcase_open") && !items("кабинет с книжным шкафом").includes("wardrobe_double"));
  assert.equal(items("столовая с обеденным столом и шестью стульями").filter(id => id === "chair_simple").length, 6);
  // A rug lies under the seating: it never collides and stays near the middle.
  const living = applyActions(newScene(5, 6), localPlan("гостиная с диваном, ковром и двумя креслами", newScene(5, 6), false));
  const rug = living.objects.find(o => o.assetId === "rug_floor")!;
  assert(Math.hypot(rug.position.x - 2.5, rug.position.z - 3) < 1.2, "rug near the centre");
  // The TV stands across from the sofa, facing it, not in a row beside it.
  const room = applyActions(newScene(5, 6), localPlan("гостиная", newScene(5, 6), false));
  const sofa = room.objects.find(o => o.assetId === "sofa_compact")!, tv = room.objects.find(o => o.assetId === "tv_stand")!;
  const dx = sofa.position.x - tv.position.x, dz = sofa.position.z - tv.position.z;
  assert((Math.sin(tv.rotation.y) * dx + Math.cos(tv.rotation.y) * dz) / Math.hypot(dx, dz) > .7, "TV faces the sofa");
});
