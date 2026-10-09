import test from "node:test";
import assert from "node:assert/strict";
import { generateAIGeometry, pickBetterGeometry, type JsonRequester } from "../src/backend/gen/ai-geometry";
import { buildFromPrompt, detectCategory } from "../src/backend/procedural-3d";
import { parsePromptParams } from "../src/backend/gen/prompt-params";

// Capture the actual provider boundary; no external AI call or account quota is used.
for(const prompt of ["создай мне ракету","самолёт длиной 12 метров","двухэтажный дом 12×9 м","деревянный стул","микроскоп"]){
  test(`geometry brief respects the requested object: ${prompt}`,async()=>{
    let calls=0;
    const request:JsonRequester=async<T>(system:string,user:string)=>{
      calls++;
      assert(user.includes(`Design this object: ${prompt}`));
      assert(user.includes("- Цвет: красный"));
      const budget=system.split("DETAIL BUDGET")[1].split("Hard limit:")[0];
      assert(!/roof|window|chassis|wheels|cushions|screens|lenses|plinth/i.test(budget),"A size class must not impose unrelated object components");
      assert(!system.includes("Put a frame and a sill on every window"));
      assert(!system.includes("frame-plus-glass window pattern"));
      assert(user.includes("request and explicit measurements take priority"));
      return {parts:[]} as T;
    };
    await generateAIGeometry({prompt,category:detectCategory(prompt),baseline:buildFromPrompt(prompt),answers:[{question:"Цвет",answer:"красный"}],request,singlePass:true});
    assert.equal(calls,1);
  });
}

const part = (id: string, position = [0, 1, 0], size = [2, 2, 2]) => ({
  id, shape: "box", position, size, color: "#123456", metalness: .8, roughness: .2,
});
async function resultFor(parts: unknown[], singlePass = false) {
  const baseline = buildFromPrompt("микроскоп");
  let calls = 0;
  const request: JsonRequester = async <T>() => { calls++; return {name: "Заданный объект", parts} as T; };
  const result = await generateAIGeometry({prompt: "куб 2 метра", baseline, category: "micro", request, singlePass});
  return {result, baseline, calls};
}

test("a valid single-part model is not replaced by a more complex template", async () => {
  const {result, baseline, calls} = await resultFor([part("cube")]);
  assert(result);
  assert.equal(calls, 1, "Simple geometry must not trigger invented decoration");
  const picked = pickBetterGeometry(baseline, result);
  assert.equal(picked.source, "ai");
  assert.equal(picked.concept.parts.length, 1);
  assert.deepEqual(picked.concept.dimensions, {width: 2, height: 2, depth: 2});
  assert.equal(picked.concept.parts[0].metalness, .8);
});

test("AI measurements and intentional gaps survive an unrelated small baseline", async () => {
  const {result} = await resultFor([part("left", [-10, 2, 0], [4, 4, 4]), part("right", [10, 2, 0], [4, 4, 4])]);
  assert(result);
  assert.deepEqual(result.parts.map(p => p.position), [[-10, 2, 0], [10, 2, 0]]);
  assert.deepEqual(result.parts.map(p => p.size), [[4, 4, 4], [4, 4, 4]]);
});

test("nearby small details and repeated geometry are not mistaken for duplicates", async () => {
  const {result} = await resultFor([
    part("body"), part("detail-a", [1, 1, 0], [.01, .02, .01]), part("detail-b", [1.005, 1, 0], [.01, .02, .01]),
    {...part("row"), repeat: {count: 3, step: [4, 0, 0]}},
  ]);
  assert(result);
  assert.equal(result.parts.length, 4);
});

test("invalid AI geometry cannot silently turn into default boxes", async () => {
  for (const invalid of [{id: "empty"}, {...part("bad"), shape: "spaceship"}, {...part("bad"), size: [0, 1, 1]}, {...part("bad"), position: [NaN, 0, 0]}]) {
    const {result, baseline} = await resultFor([invalid]);
    assert.equal(result, null);
    assert.equal(pickBetterGeometry(baseline, result).source, "procedural");
  }
});

test("repair uses concrete defects, keeps clarifications and PBR materials", async () => {
  let calls = 0;
  const request: JsonRequester = async <T>(system: string, user: string) => {
    calls++;
    if (calls === 1) return {parts: [part("body"), part("duplicate")]} as T;
    assert(!/Never return fewer|too plain|Add frames|Add another layer/.test(system + user));
    assert(user.includes("Цвет: красный"));
    assert(user.includes('"metalness":0.8'));
    assert(user.includes('"roughness":0.2'));
    return {parts: [part("body")]} as T;
  };
  const result = await generateAIGeometry({prompt: "красный куб", baseline: buildFromPrompt("куб"), category: "handheld", answers: [{question: "Цвет", answer: "красный"}], request});
  assert.equal(calls, 2);
  assert.equal(result?.parts.length, 1);
  assert.equal(result?.issues.length, 0);
});

test("explicit dimensions trigger a targeted correction rather than silent rescaling", async () => {
  let calls = 0;
  const request: JsonRequester = async <T>(_system: string, user: string) => {
    calls++;
    if (calls === 2) assert(user.includes("задано 0.75 м, получено 0.78 м"));
    return {parts: [part("table", [0, .39, 0], [1.2, calls === 1 ? .78 : .75, 1.2])]} as T;
  };
  const result = await generateAIGeometry({prompt: "стол высотой 0.75 м", baseline: buildFromPrompt("стол"), category: "furniture", request});
  assert.equal(calls, 2);
  assert.equal(result?.parts[0].size[1], .75);
  assert.equal(result?.issues.length, 0);
});

test("supported primitive aliases remain renderable", async () => {
  const {result} = await resultFor([{...part("fin"), shape: "triangle"}]);
  assert.equal(result?.parts[0].shape, "prism");
});

test("coincident repeat instances are reported instead of counting as real detail",async()=>{
  const {result}=await resultFor([{...part("fin"),repeat:{count:4,step:[0,0,0]}}],true);
  assert(result?.issues.some(issue=>issue.includes("повторения полностью совпадают")));
});

test("invalid first geometry gets one corrective attempt with the original request", async () => {
  let calls = 0;
  const prompt = "красный куб 2 метра";
  const request: JsonRequester = async <T>(_system: string, user: string) => {
    calls++;
    if (calls === 1) return {parts: [{...part("cube"), shape: "unknown"}]} as T;
    assert(user.includes(prompt));
    assert(user.includes("Цвет: красный"));
    assert(user.includes("parts[0].shape"));
    return {parts: [part("cube")]} as T;
  };
  const result = await generateAIGeometry({prompt, baseline: buildFromPrompt(prompt), category: "handheld",
    answers: [{question: "Цвет", answer: "красный"}], request});
  assert.equal(calls, 2);
  assert.equal(result?.passes, 2);
  assert.equal(result?.parts[0].id, "cube");
});

test("malformed JSON is retried once but provider failures are not geometry defects", async () => {
  for (const error of [new SyntaxError("bad JSON"), Object.assign(new Error("rate limit"), {status: 429})]) {
    let calls = 0;
    const request: JsonRequester = async <T>() => {
      calls++;
      if (calls === 1) throw error;
      return {parts: [part("cube")]} as T;
    };
    const result = await generateAIGeometry({prompt: "куб 2 метра", baseline: buildFromPrompt("куб"), category: "handheld", request});
    assert.equal(calls, error instanceof SyntaxError ? 2 : 1);
    assert.equal(Boolean(result), error instanceof SyntaxError);
  }
});

test("a size without an axis is checked against the longest rendered side", async () => {
  let calls = 0;
  const request: JsonRequester = async <T>(_system: string, user: string) => {
    calls++;
    if (calls === 2) assert(user.includes("задано 2 м, получено 3 м"));
    return {parts: [part("cube", [0, 1, 0], [calls === 1 ? 3 : 2, 2, 2])]} as T;
  };
  const result = await generateAIGeometry({prompt: "куб 2 метра", baseline: buildFromPrompt("куб"), category: "handheld", request});
  assert.equal(calls, 2);
  assert.equal(result?.parts[0].size[0], 2);
  assert.deepEqual(result?.issues, []);
});

test("labelled and paired measurements accept full unit names", () => {
  for (const prompt of ["стол высотой 75 сантиметров", "стол высотой 750 миллиметров", "table height 75 centimeters", "table height 750 millimetres"]) {
    assert.equal(parsePromptParams(prompt).height, .75, prompt);
  }
  assert.equal(parsePromptParams("мост длиной 2 километра").depth, 2000);
  assert.equal(parsePromptParams("панель 120×90 сантиметров").width, 1.2);
  assert.equal(parsePromptParams("панель 120×90 сантиметров").depth, .9);
  assert.equal(parsePromptParams("стол высотой 75 см").height, .75);
});
