import test from "node:test";
import assert from "node:assert/strict";
import {Box3, Group, Vector3} from "three";
import {parseComposition, compositionParts, compositionIssues, settleComposition, type Composition} from "../src/shared/design/composition";
import {composeWithLocalAI, compositionResult, localDesignEndpoint} from "../src/backend/design/local-ai";
import {buildComposition} from "../src/frontend/composition-model";
import {disposeDetailed} from "../src/shared/interior/detailed";

const scene: Composition = {title: "Рабочее место на подиуме", question: "", options: [], assumptions: [], limitations: [], nodes: [
  {name: "Подиум", shape: "cylinder", p: [0, .1, 0], s: [3, .2, 3], r: [0, 0, 0], color: "#ac9474"},
  {name: "Стол", shape: "desk_work", p: [0, .575, 0], s: [1.2, .75, .6], r: [0, 90, 0], color: "#eeeeee"},
]};
const reply = (c: unknown, finish = "stop") => new Response(JSON.stringify({choices: [{finish_reason: finish, message: {content: JSON.stringify(c)}}]}));

test("composition validates arbitrary primitive/catalog scenes without classifying the prompt", () => {
  assert.deepEqual(parseComposition(scene), scene);
  for (const patch of [{s: [1, -1, 1]}, {p: [Infinity, 0, 0]}, {shape: "script"}, {color: "url(file)"}, {r: [0, 9999, 0]}]) {
    assert.throws(() => parseComposition({...scene, nodes: [{...scene.nodes[0], ...patch}]}));
  }
  assert.throws(() => parseComposition({...scene, nodes: Array(97).fill(scene.nodes[0])}));
  assert.throws(() => parseComposition({...scene, nodes: []}));
  assert.throws(() => parseComposition({...scene, question: "Какой размер?"}));
  assert.throws(() => parseComposition({...scene, action: "clarify"}));
  assert.equal(parseComposition({...scene, title: "", nodes: [], action: "clarify", question: "Сколько комнат?"}).title, "Уточнение");
});

test("catalog geometry matches center-based bounds after rotation, with no accidental scaling", () => {
  const model = buildComposition(compositionResult(scene));
  const desk = model.children.find(n => n instanceof Group && n.name === "Стол")!;
  const box = new Box3().setFromObject(desk), center = box.getCenter(new Vector3()), size = box.getSize(new Vector3());
  assert(Math.abs(center.y - .575) < .001); assert(Math.abs(box.min.y - .2) < .001);
  assert(Math.abs(size.x - .6) < .001); assert(Math.abs(size.z - 1.2) < .001);
  assert.deepEqual(compositionParts(scene)[1].rotation, [0, Math.PI / 2, 0]);
  disposeDetailed(model);
});

test("floating or overlapping furniture is corrected without another AI call; unsupported cases stay visible", async () => {
  const floating = {...scene, nodes: [{...scene.nodes[1], p: [0, 2, 0] as [number, number, number]}]};
  assert(compositionIssues(floating).some(i => i.includes("висит")));
  assert.deepEqual(compositionIssues(scene), []);
  let calls = 0;
  const result = await composeWithLocalAI({prompt: "стол на подиуме"}, {endpoint: "http://127.0.0.1:8081", transport: async () => reply(++calls === 1 ? floating : scene)});
  assert.equal(calls, 1);assert.equal(result.kind, "model");assert.deepEqual((result as any).missing, []);
  assert(compositionResult(floating).missing.length > 0);
});

test("placement pass keeps objects, colors, dimensions and left/right relation while clearing overlaps", () => {
  const c = {...scene, nodes: [
    {name: "Кресло 1", shape: "armchair_soft", p: [-.6, .9, .5], s: [.92, .9, .88], r: [0, 0, 0], color: "#00FF00"},
    {name: "Стол", shape: "table_coffee", p: [0, .6, .5], s: [1.05, .4, .6], r: [0, 0, 0], color: "#ffffff"},
    {name: "Кресло 2", shape: "armchair_soft", p: [.6, .9, .5], s: [.92, .9, .88], r: [0, 0, 0], color: "#00FF00"},
  ]} as Composition;
  const settled = settleComposition(c);
  assert.deepEqual(compositionIssues(settled), []);
  assert(settled.nodes[0].p[0] < settled.nodes[1].p[0] && settled.nodes[1].p[0] < settled.nodes[2].p[0]);
  assert.equal(c.nodes[0].p[1], .9, "input must not be mutated");
  assert.deepEqual(settled.nodes.map(({p, ...rest}) => rest), c.nodes.map(({p, ...rest}) => rest));
  assert.deepEqual(settleComposition(scene).nodes, scene.nodes, "podium support is preserved");
});

test("AI carries semantic questions, answers and previous composition; no template routes", async () => {
  const ask = {...scene, nodes: [], question: "Для скольких человек рабочее место?", options: ["Для одного", "Для двоих"]};
  const first = await composeWithLocalAI({prompt: "футуристическое рабочее место"}, {endpoint: "http://127.0.0.1:8081", transport: async () => reply(ask)});
  assert.equal(first.kind, "clarification");
  let sent: any;
  const result = await composeWithLocalAI({prompt: "добавь подиум", previous: scene, answers: [{questionId: "ai-1", question: ask.question, answer: "Для одного"}]}, {
    endpoint: "http://127.0.0.1:8081", transport: async (url, init) => {assert.equal(url, "http://127.0.0.1:8081/v1/chat/completions");sent = JSON.parse(String(init?.body));return reply(scene);},
  });
  const user = JSON.parse(sent.messages[1].content);
  assert.deepEqual(user.previous, scene);assert.equal(user.dialogue[0].answer, "Для одного");
  assert.equal(result.kind, "model");assert.equal((result as any).source, "local-ai");
});

test("offline, truncated and invalid replies never become a successful template fallback", async () => {
  for (const response of [() => new Response("{}", {status: 503}), () => reply(scene, "length"), () => reply({...scene, nodes: []})]) {
    await assert.rejects(() => composeWithLocalAI({prompt: "модель"}, {endpoint: "http://127.0.0.1:8081", transport: async () => response()}));
  }
  assert.equal((await composeWithLocalAI({prompt: "модель"}, {endpoint: "http://127.0.0.1:8081", transport: async () => reply(scene)})).kind, "model");
});

test("local config excludes remote hosts, credentials, path and URL injection", () => {
  for (const url of ["https://example.com", "http://127.0.0.1.evil.com", "http://127.0.0.1/path", "http://secret@127.0.0.1", "http://127.0.0.1?url=evil"]) assert.throws(() => localDesignEndpoint({LOCAL_DESIGN_AI_URL: url}));
  assert.equal(localDesignEndpoint({LOCAL_DESIGN_AI_URL: "http://127.0.0.1:8081"}), "http://127.0.0.1:8081");
});

test("CPU requests are serialized and aborted request releases the slot", async () => {
  let release!: () => void;
  const held = new Promise<void>(r => {release = r;});
  const first = composeWithLocalAI({prompt: "модель"}, {endpoint: "http://127.0.0.1:8081", transport: async () => {await held;return reply(scene);}});
  await assert.rejects(() => composeWithLocalAI({prompt: "модель"}, {endpoint: "http://127.0.0.1:8081"}), /уже обрабатывает/);
  release(); await first;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => composeWithLocalAI({prompt: "модель"}, {signal: controller.signal, endpoint: "http://127.0.0.1:8081", transport: async () => {throw new Error("aborted");}}), /остановлена/);
});
