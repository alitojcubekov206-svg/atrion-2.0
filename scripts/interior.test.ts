import test from "node:test";
import assert from "node:assert/strict";
import {newScene, parseScene, layoutIssues} from "../src/shared/interior/scene";
import {applyActions, designWithPlanner, localPlan} from "../src/backend/interior/engine";
import {sceneParts, assetParts} from "../src/shared/interior/geometry";
import {ASSETS} from "../src/shared/interior/catalog";
import {boxesGlb} from "../src/backend/interior/glb";
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js";
import {Box3} from "three";

test("acceptance bedroom has exact requested inventory and valid circulation", async () => {
  const {scene} = await designWithPlanner(newScene(), "Кровать, шкаф, стол, два светильника и растение", false, 0);
  assert.deepEqual(scene.objects.map(o => o.assetId).sort(), ["bed_double", "wardrobe_double", "desk_work", "lamp_floor", "lamp_floor", "plant_pot"].sort());
  assert.deepEqual(layoutIssues(scene), []);
  assert.equal(scene.width, 4); assert.equal(scene.length, 5);
  const bed = scene.objects.find(o => o.assetId === "bed_double")!;
  const edited = applyActions(scene, localPlan("Убери стол и поставь диван", scene, true));
  assert(!edited.objects.some(o => o.assetId === "desk_work"));
  assert(edited.objects.some(o => o.assetId === "sofa_compact"));
  assert.deepEqual(edited.objects.find(o => o.id === bed.id), bed);
});
test("colliding edits, unknown assets and locked-object edits are atomic failures", async () => {
  const {scene} = await designWithPlanner(newScene(), "кровать и шкаф", false, 0);
  const original = structuredClone(scene), [a, b] = scene.objects;
  assert.throws(() => applyActions(scene, {actions: [{type: "MOVE_OBJECT", objectId: b.id, position: a.position}]}));
  assert.throws(() => applyActions(scene, {actions: [{type: "ADD_OBJECT", id: "new", assetId: "invented"}]}));
  assert.deepEqual(scene, original);
  scene.objects[0].locked = true;
  assert.throws(() => applyActions(scene, {actions: [{type: "REMOVE_OBJECT", objectId: a.id}]}), /закреплён/);
});
test("invalid scene dimensions, overlapping openings and absent entrance fail validation", () => {
  assert.throws(() => parseScene({...newScene(), width: NaN}));
  assert.throws(() => parseScene({...newScene(), openings: []}));
  const s = newScene(); s.openings.push({...s.openings[0], id: "door_2"}); assert.throws(() => parseScene(s));
});
test("rendered walls have an actual door gap and windows", () => {
  const s = newScene(), p = sceneParts(s), door = s.openings[0];
  const x = door.offset + door.width / 2 - s.width / 2, z = s.length / 2 + .06;
  assert(!p.filter(p => p.role === "wall").some(p => Math.abs(p.position[0] - x) < p.size[0] / 2 && Math.abs(p.position[2] - z) < p.size[2] / 2 && Math.abs(p.position[1] - 1) < p.size[1] / 2));
  assert(p.some(p => p.role === "window"));
});
test("AI unknown action is corrected without granting direct mutation", async () => {
  let calls = 0; const scene = newScene();
  const result = await designWithPlanner(scene, "Добавь стол", true, 0, async () => ++calls === 1 ? {actions: [{type: "SQL", query: "drop"}]} : {actions: [{type: "ADD_OBJECT", id: "desk", assetId: "desk_work"}]});
  assert.equal(calls, 2); assert.equal(result.scene.objects.length, 1); assert.equal(scene.objects.length, 0);
});

test("AI cannot silently omit explicitly requested furniture", async () => {
  let calls = 0;
  const result = await designWithPlanner(newScene(), "стол и два светильника", false, 0, async (_system, input) => {
    calls++;
    if (calls === 2) assert.match(JSON.parse(input).correction, /lamp/);
    return {actions: [{type: "ADD_OBJECT", id: "desk", assetId: "desk_work"}, ...(calls === 1 ? [] : [1, 2].map(i => ({type: "ADD_OBJECT", id: `lamp_${i}`, assetId: "lamp_floor"})))]};
  });
  assert.equal(calls, 2); assert.equal(result.scene.objects.length, 3);
  await assert.rejects(() => designWithPlanner(newScene(), "кровать", false, 0, async () => ({actions: [{type: "CHANGE_WALL_MATERIAL", color: "#ffffff"}]})), /Количество bed/);
});

test("local styles and lighting commands preserve furniture while applying requested changes", async () => {
  const {scene} = await designWithPlanner(newScene(), "стол", false, 0);
  const edited = applyActions(scene, localPlan("Сделай интерьер в стиле джапанди и больше тёплого освещения", scene, true));
  assert.equal(edited.style, "japandi");
  assert.equal(edited.objects[0].id, scene.objects[0].id);
  assert.deepEqual(edited.objects[0].position, scene.objects[0].position);
  assert(edited.lights.every(l => l.color === "#ffdfb0"));
});

test("catalog geometry fits its declared collision dimensions and loads from GLB", async () => {
  for (const a of ASSETS) {
    const bytes = boxesGlb(assetParts(a.id));
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer, "");
    const bounds = new Box3().setFromObject(gltf.scene);
    assert(bounds.min.x >= -a.width / 2 - .001 && bounds.max.x <= a.width / 2 + .001, a.id + " width");
    assert(bounds.min.z >= -a.depth / 2 - .001 && bounds.max.z <= a.depth / 2 + .001, a.id + " depth");
    assert(bounds.min.y >= -.001 && bounds.max.y <= a.height + .001, a.id + " height");
  }
});

test("variants preserve requested counts and every layout remains accessible", async () => {
  const positions = [];
  for (let i = 0; i < 3; i++) {
    const {scene} = await designWithPlanner(newScene(), "Кровать, шкаф, стол, два светильника и растение", false, i);
    assert.equal(scene.objects.length, 6); assert.deepEqual(layoutIssues(scene), []);
    positions.push(JSON.stringify(scene.objects.map(o => o.position)));
  }
  assert.equal(new Set(positions).size, 3);
});

test("blocking the entrance or leaving the room is rejected", async () => {
  const {scene} = await designWithPlanner(newScene(), "стол", false, 0), objectId = scene.objects[0].id;
  for (const position of [{x: .6, y: 0, z: 4.6}, {x: -1, y: 0, z: 2}]) assert.throws(() => applyActions(scene, {actions: [{type: "MOVE_OBJECT", objectId, position}]}));
});
