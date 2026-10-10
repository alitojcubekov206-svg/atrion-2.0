import "next/dist/server/node-environment-baseline";
import test, { beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, decodeJwt } from "jose";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { ResponseCookies } from "next/dist/server/web/spec-extension/cookies";
import { db } from "../src/backend/db";
import { issueSessionToken, verifySessionToken } from "../src/backend/session-token";
import { getSessionUserId } from "../src/backend/auth";
import { consumeAiQuota } from "../src/backend/ai-quota";
import { reserveGenerationQuota } from "../src/backend/generation-quota";
import { canReturnEmailCode } from "../src/backend/email-development";
import { issueVerificationCode } from "../src/backend/verification";
import { refine3DConcept } from "../src/backend/ai";
import { readEditableConcept, localRefine, isModelRebuild } from "../src/backend/refinement";
import { dimensionsOf } from "../src/shared/geometry";
import { buildFromPrompt } from "../src/backend/procedural-3d";
import type { ModelPart, ThreeDConcept } from "../src/shared/types";
import { POST as forgotPassword } from "../src/app/api/auth/forgot-password/route";
import { GET as demoLogin } from "../src/app/api/auth/demo/route";
import { POST as resetPassword } from "../src/app/api/auth/reset-password/route";
import { PATCH as changePassword } from "../src/app/api/auth/account/route";
import { POST as generate } from "../src/app/api/3d/generate/route";
import { POST as designModel } from "../src/app/api/design/model/route";
import { POST as composeDesign } from "../src/app/api/design/compose/route";
import { POST as refine } from "../src/app/api/3d/refine/route";
import { POST as realistic } from "../src/app/api/3d/realistic/route";
import { GET as interiorGet, POST as interiorPost } from "../src/app/api/design/projects/[[...path]]/route";
import { GET as interiorJob } from "../src/app/api/jobs/[id]/route";
import {POST as designPreview} from "../src/app/api/design/preview/route";
import {POST as designExport} from "../src/app/api/design/export/route";
import {newScene} from "../src/shared/interior/scene";
import {generationPlan} from "../src/backend/generation-request";
import {POST as houseGenerate} from "../src/app/api/house/generate/route";

// A local Prisma boundary stub; no real accounts, secrets or database connections.
type Row = Record<string, any>;
let user: Row;
let savedEnv: NodeJS.ProcessEnv;
let secret: string;
const originalUserMethods = {
  findUnique: db.user.findUnique, updateMany: db.user.updateMany, update: db.user.update,
  create: db.user.create,
};
function stubUser(method: keyof typeof originalUserMethods, implementation: (...args: any[]) => Promise<any>) {
  // Prisma delegates are proxies, so node:test's descriptor-based mock.method cannot replace them.
  (db.user as any)[method] = implementation;
}
const env = process.env as Record<string, string | undefined>;
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, wanted]) => {
    if (key === "OR") return wanted.some((item: Row) => matches(row, item));
    if (wanted && typeof wanted === "object" && !(wanted instanceof Date)) {
      return Object.entries(wanted).every(([op, value]: [string, any]) => {
        if (op === "lt") return row[key] !== null && row[key] < value;
        if (op === "lte") return row[key] !== null && row[key] <= value;
        if (op === "gt") return row[key] !== null && row[key] > value;
        if (op === "not") return row[key] !== value;
        throw new Error(`Unsupported stub operator: ${op}`);
      });
    }
    return wanted instanceof Date ? row[key]?.getTime() === wanted.getTime() : row[key] === wanted;
  });
}
function update(data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) user[key] += value.increment;
    else if (value && typeof value === "object" && "decrement" in value) user[key] -= value.decrement;
    else user[key] = value;
  }
}
beforeEach(async () => {
  savedEnv = { ...process.env };
  env.NODE_ENV = "test";
  env.AI_TEXT_PROVIDER = "disabled";
  env.EMAIL_VERIFICATION_ENABLED = "false";
  env.EMAIL_DEV_RETURN_CODE = "false";
  env.BREVO_API_KEY = "fixture-only";
  env.EMAIL_FROM_ADDRESS = "fixture@example.invalid";
  secret = randomBytes(32).toString("hex");
  env.AUTH_SECRET = secret;
  user = {
    id: randomUUID(), email: "fixture@example.invalid", name: "Fixture",
    password: await bcrypt.hash("fixture-password", 4), plan: "free", planExpiresAt: null,
    emailVerified: true, aiCallsToday: 0, aiCallsDate: null, threeDGenerations: 0,
    passwordResetCode: null, passwordResetExpires: null, passwordResetSentAt: null,
    passwordResetAttempts: 0,
  };
  stubUser("findUnique", async ({ where }: { where: Row }) => matches(user, where) ? { ...user } : null);
  stubUser("updateMany", async ({ where, data }: { where: Row; data: Row }) => {
    if (!matches(user, where)) return { count: 0 };
    update(data); return { count: 1 };
  });
  stubUser("update", async ({ where, data }: { where: Row; data: Row }) => {
    assert(matches(user, where)); update(data); return { ...user };
  });
  mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected external request in test"); });
});
afterEach(() => {
  Object.assign(db.user, originalUserMethods);
  mock.restoreAll();
  mock.timers.reset();
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete env[key];
  Object.assign(env, savedEnv);
});

async function inRequest<T>(run: () => Promise<T>, token?: string) {
  const jar = new ResponseCookies(new Headers());
  jar.set("atrion_session", token ?? await issueSessionToken(user.id, user.password, secret));
  const work = { route: "/api/test", isStaticGeneration: false } as Parameters<typeof workAsyncStorage.run>[0];
  const request = { type: "request", phase: "action", cookies: jar, userspaceMutableCookies: jar } as unknown as Parameters<typeof workUnitAsyncStorage.run>[0];
  const result = await workAsyncStorage.run(work, () => workUnitAsyncStorage.run(request, run));
  return { result, token: jar.get("atrion_session")?.value };
}
function post(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, { method: "POST", headers: {
    "content-type": "application/json", "x-forwarded-for": user.id,
  }, body: JSON.stringify(body) });
}

test("direct design API generates without project tables or worker and authenticates export", async () => {
  const body = {scene: newScene(), prompt: "Современная спальня 4×5 м, кровать и шкаф, реши сам"};
  assert.equal((await inRequest(()=>designPreview(post("/api/design/preview",body)),"invalid")).result.status,401);
  assert.equal((await inRequest(()=>designExport(post("/api/design/export",{scene:newScene()})),"invalid")).result.status,401);
  user.threeDGenerations=5000;
  const {result}=await inRequest(()=>designPreview(post("/api/design/preview",body)));
  const data=await result.json(); assert.equal(result.status,200,JSON.stringify(data));
  assert.equal(data.kind,"interior"); assert.equal(data.scene.width,4); assert.equal(data.scene.length,5);
  assert.deepEqual(data.scene.objects.map((o: {assetId: string})=>o.assetId).sort(),["bed_double","wardrobe_double"]); assert(data.procurement.items.length>0);
  assert.equal(user.threeDGenerations,5001);
  const invalid=(await inRequest(()=>designExport(post("/api/design/export",{scene:{}})))).result;
  assert.equal(invalid.status,400);
  const exported=(await inRequest(()=>designExport(post("/api/design/export",{scene:data.scene})))).result;
  assert.equal(exported.status,200); assert.equal(exported.headers.get("content-type"),"model/gltf-binary");
  const bytes=new Uint8Array(await exported.arrayBuffer());
  const header=new DataView(bytes.buffer); assert.equal(header.getUint32(0,true),0x46546c67); assert.equal(header.getUint32(4,true),2); assert.equal(header.getUint32(8,true),bytes.length);
});
test("local AI composition protects auth and refunds questions and failures", async () => {
  env.LOCAL_DESIGN_AI_URL = "http://127.0.0.1:8081";
  const data = {title: "Сцена", question: "Сколько комнат?", options: ["Три", "Четыре"], assumptions: [], limitations: [], nodes: [] as unknown[]};
  let fail = false;
  const network = mock.method(globalThis, "fetch", async (url: unknown) => {
    assert.equal(url, "http://127.0.0.1:8081/v1/chat/completions");
    if (fail) return new Response("{}", {status: 503});
    return new Response(JSON.stringify({choices: [{finish_reason: "stop", message: {content: JSON.stringify(data)}}]}));
  });
  assert.equal((await inRequest(() => composeDesign(post("/api/design/compose", {prompt: "дом"})), "invalid")).result.status, 401);
  assert.equal(network.mock.callCount(), 0);
  const question = (await inRequest(() => composeDesign(post("/api/design/compose", {prompt: "дом"})))).result;
  assert.equal((await question.json()).kind, "clarification");assert.equal(user.threeDGenerations, 0);assert.equal(user.aiCallsToday, 0);
  fail = true;
  assert.equal((await inRequest(() => composeDesign(post("/api/design/compose", {prompt: "дом"})))).result.status, 503);
  assert.equal(user.threeDGenerations, 0);assert.equal(user.aiCallsToday, 0);
  fail = false; data.question = ""; data.nodes = [{name: "Тест", shape: "box", p: [0, 1, 0], s: [2, 2, 2], r: [0, 0, 0], color: "#eeeeee"}];
  assert.equal((await inRequest(() => composeDesign(post("/api/design/compose", {prompt: "куб"})))).result.status, 200);
  assert.equal(user.threeDGenerations, 1);
  user.threeDGenerations = 5000; const calls = network.mock.callCount();
  assert.equal((await inRequest(() => composeDesign(post("/api/design/compose", {prompt: "куб"})))).result.status, 200);
  assert.equal(network.mock.callCount(), calls + 1);
});

test("design model keeps authentication, free access and refunds, without external API calls", async () => {
  const network = mock.method(globalThis, "fetch", async () => {throw new Error("Unexpected external call");});
  assert.equal((await inRequest(() => designModel(post("/api/design/model", {prompt: "дом"})), "invalid")).result.status, 401);
  const clarification = (await inRequest(() => designModel(post("/api/design/model", {prompt: "дом"})))).result;
  assert.equal((await clarification.json()).question.id, "rooms");
  assert.equal(user.aiCallsToday, 0); assert.equal(user.threeDGenerations, 0);
  const failure = (await inRequest(() => designModel(post("/api/design/model", {prompt: "Дом 3×3 м, 3 этажа, 24 комнаты"})))).result;
  assert.equal(failure.status, 422);assert.equal(user.aiCallsToday, 0);assert.equal(user.threeDGenerations, 0);
  const success = (await inRequest(() => designModel(post("/api/design/model", {prompt: "Дом, реши сам"})))).result;
  assert.equal(success.status, 200); assert.equal((await success.json()).kind, "model");
  assert.equal(user.aiCallsToday, 1); assert.equal(user.threeDGenerations, 1);
  user.threeDGenerations = 5;
  const blocked = (await inRequest(() => designModel(post("/api/design/model", {prompt: "кот сидит"})))).result;
  assert.equal(blocked.status, 200); assert.equal(user.threeDGenerations, 6);
  assert.equal(network.mock.callCount(), 0);
});
test("generation applies interview dimensions, floors and roof to actual geometry, without budget leakage",async()=>{
  const prompt="Дом 8×6 м, один этаж, без гаража, без террасы, без балконов";
  const answers=[{question:"Габариты?",answer:"12×9 м"},{question:"Сколько этажей?",answer:"3"},{question:"Форма крыши?",answer:"плоская крыша"},{question:"Бюджет?",answer:"999999 м"}];
  const plan=generationPlan(prompt,answers,"test").blueprint;
  assert.equal(plan.width,12);assert.equal(plan.length,9);assert.equal(plan.floors,3);assert.equal(plan.roof,"flat");
  const response=(await inRequest(()=>generate(post("/api/3d/generate",{prompt,answers})))).result;
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));
  assert.equal(data.diagnostics.source,"procedural");assert.equal(data.diagnostics.kind,"building");
  const roofs=data.concept.parts.filter((p:ModelPart)=>p.role==="roof");
  assert(roofs.length>0);assert(roofs.every((p:ModelPart)=>p.shape!=="prism"));
  assert(data.concept.dimensions.width<20&&data.concept.dimensions.depth<20&&data.concept.dimensions.height>9);
  assert.equal(user.threeDGenerations,1);assert.equal(user.aiCallsToday,1);
});
test("generation returns bounded JSON errors for unknown subjects, malformed dialogue and oversized bodies",async()=>{
  const unknown=(await inRequest(()=>generate(post("/api/3d/generate",{prompt:"неизвестный квантобублик"})))).result;
  assert.equal(unknown.status,422);assert.equal((await unknown.json()).code,"GENERATION_SUBJECT_UNKNOWN");
  assert.equal(user.threeDGenerations,0);assert.equal(user.aiCallsToday,0);
  for(const answers of [[{question:"Размер?",answer:"x".repeat(501)}],Array.from({length:11},()=>({question:"Размер?",answer:"12 м"}))]) {
    assert.equal((await inRequest(()=>generate(post("/api/3d/generate",{prompt:"дом",answers})))).result.status,400);
  }
  const oversized=new Request("http://localhost/api/3d/generate",{method:"POST",headers:{"content-type":"application/json","content-length":String(1024*1024+1)},body:"{}"});
  assert.equal((await inRequest(()=>generate(oversized))).result.status,413);
  assert.equal(user.threeDGenerations,0);
});
test("generation APIs contain storage failures and expose a safe request ID instead of throwing",async()=>{
  const failure=Object.assign(new Error("private connection data must stay private"),{code:"P1001"});
  stubUser("updateMany",async()=>{throw failure;});
  const handlers=[generate,designModel,designPreview,composeDesign];
  for(const handler of handlers) {
    const response=(await inRequest(()=>handler(post("/api/test",{prompt:"Дом, реши сам",scene:newScene()})))).result;
    const data=await response.json();assert.equal(response.status,503,JSON.stringify(data));
    assert.equal(data.code,"GENERATION_STORAGE_UNAVAILABLE");assert.equal(data.requestId,response.headers.get("X-Request-Id"));
    assert.match(data.requestId,/^[a-f0-9-]{36}$/);assert(!JSON.stringify(data).includes("private connection"));
    assert.equal(response.headers.get("Cache-Control"),"private, no-store");
  }
  env.EMAIL_VERIFICATION_ENABLED="true";let queries=0;
  stubUser("findUnique",async()=>{if(++queries%2===0)throw failure;return {...user};});
  assert.equal((await inRequest(()=>houseGenerate(post("/api/house/generate",{prompt:"дом"})))).result.status,503);
});
function part(id = "cube", position: [number, number, number] = [0, 1, 0]): ModelPart {
  return { id, name: id, shape: "box", position, size: [2, 2, 2], rotation: [0, 0, 0],
    material: "Plastic", color: "#112233", quantity: 1 };
}
function concept(parts = [part()]): ThreeDConcept {
  return { ...buildFromPrompt("куб"), parts, dimensions: dimensionsOf(parts), structure: [] };
}
function providerReply(parts: unknown[]) {
  env.AI_TEXT_PROVIDER = "compatible";
  env.OPENAI_API_KEY = "fixture-only";
  env.OPENAI_BASE_URL = "http://localhost/provider-fixture";
  return mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ choices: [
    { finish_reason: "stop", message: { role: "assistant", content: JSON.stringify({ parts }) } },
  ] }), { headers: { "content-type": "application/json" } }));
}

test("interior routes hide foreign projects, scenes, histories and jobs", async () => {
  const projectFind = db.designProject.findFirst, jobFind = db.designJob.findFirst;
  (db.designProject as any).findFirst = async ({where}: Row) => {assert.equal(where.userId, user.id); return null;};
  (db.designJob as any).findFirst = async ({where}: Row) => {assert.equal(where.project.userId, user.id); return null;};
  try {
    for (const path of [["foreign"], ["foreign", "scene"], ["foreign", "history"]]) {
      const {result} = await inRequest(() => interiorGet(new Request("http://localhost/api/design/projects/foreign"), {params: Promise.resolve({path})}));
      assert.equal(result.status, 404); const body = await result.json(); assert.equal(body.error.code, "DESIGN_NOT_FOUND"); assert.equal(typeof body.error.requestId, "string");
    }
    const exported = await inRequest(() => interiorPost(post("/api/design/projects/foreign/export", {format: "glb", userId: "owner"}), {params: Promise.resolve({path: ["foreign", "export"]})}));
    assert.equal(exported.result.status, 404);
    const job = await inRequest(() => interiorJob(new Request("http://localhost/api/jobs/foreign"), {params: Promise.resolve({id: "foreign"})}));
    assert.equal(job.result.status, 404);
  } finally {(db.designProject as any).findFirst = projectFind; (db.designJob as any).findFirst = jobFind;}
});

test("removed demo login cannot create accounts or replace sessions, even with the legacy flag enabled", async () => {
  const created: Row[] = [];
  stubUser("create", async ({ data }: { data: Row }) => { const row = { id: randomUUID(), ...data }; created.push(row); return row; });
  const visit = () => new Request("http://localhost/api/auth/demo", { headers: { "x-forwarded-for": user.id } });
  for (const enabled of ["false", "true"]) {
    env.DEMO_LOGIN_ENABLED = enabled;
    for (const token of ["invalid", await issueSessionToken(user.id, user.password, secret)]) {
      const { result, token: issued } = await inRequest(() => demoLogin(visit()), token);
      assert.equal(result.status, 404);
      assert.deepEqual(await result.json(), { error: "Not found" });
      assert.equal(result.headers.get("location"), null);
      assert.equal(result.headers.get("set-cookie"), null);
      assert.equal(issued, token);
    }
  }
  assert.equal(created.length, 0);
});
test("production never returns recovery or verification OTPs on mail delivery failure", async () => {
  env.NODE_ENV = "production";
  env.EMAIL_DEV_RETURN_CODE = "true";
  mock.method(globalThis, "fetch", async () => new Response("{}", { status: 503 }));
  const response = await forgotPassword(post("/api/auth/forgot-password", { email: user.email }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(typeof user.passwordResetCode, "string");
  assert.equal((await issueVerificationCode(user.id, user.email)).devCode, undefined);
  for (const nodeEnv of [undefined, "test", "production"]) {
    assert.equal(canReturnEmailCode({ NODE_ENV: nodeEnv, EMAIL_DEV_RETURN_CODE: "true" }), false);
  }
  assert.equal(canReturnEmailCode({ NODE_ENV: "development", EMAIL_DEV_RETURN_CODE: "true" }), true);
});

test("sessions bind to the current credential, reject legacy/share tokens and deleted users", async () => {
  const token = await issueSessionToken(user.id, user.password, secret);
  const lookup = async () => user.password as string;
  assert.equal(await verifySessionToken(token, secret, lookup), user.id);
  assert(!JSON.stringify(decodeJwt(token)).includes(user.password));
  user.password = "different-fixture-hash";
  assert.equal(await verifySessionToken(token, secret, lookup), null);
  assert.equal(await verifySessionToken(token, secret, async () => null), null);
  const legacy = await new SignJWT({ sub: user.id }).setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h").sign(new TextEncoder().encode(secret));
  assert.equal(await verifySessionToken(legacy, secret, lookup), null);
  const share = await new SignJWT({ purpose: "project-share", sub: user.id }).setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h").sign(new TextEncoder().encode(secret));
  assert.equal(await verifySessionToken(share, secret, lookup), null);
});

test("password reset consumes the code once, revokes old sessions and issues a working replacement", async () => {
  const old = await issueSessionToken(user.id, user.password, secret);
  user.passwordResetCode = "123456";
  user.passwordResetExpires = new Date(Date.now() + 60_000);
  const body = { email: user.email, code: "123456", password: "new-fixture-password" };
  const changed = await inRequest(() => resetPassword(post("/api/auth/reset-password", body)), old);
  assert.equal(changed.result.status, 200);
  assert(await bcrypt.compare(body.password, user.password));
  assert.equal((await inRequest(getSessionUserId, old)).result, null);
  assert.equal((await inRequest(getSessionUserId, changed.token)).result, user.id);
  assert.equal((await inRequest(() => resetPassword(post("/api/auth/reset-password", body)))).result.status, 400);
});

test("changing the password rotates the current session and clears outstanding reset codes", async () => {
  const old = await issueSessionToken(user.id, user.password, secret);
  user.passwordResetCode = "123456";
  const changed = await inRequest(() => changePassword(post("/api/auth/account", {
    currentPassword: "fixture-password", newPassword: "new-fixture-password",
  })), old);
  assert.equal(changed.result.status, 200);
  assert.equal(user.passwordResetCode, null);
  assert.equal((await inRequest(getSessionUserId, old)).result, null);
  assert.equal((await inRequest(getSessionUserId, changed.token)).result, user.id);
});

test("AI refund belongs to its UTC day and is applied only once", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-07T23:59:59Z") });
  const yesterday = await consumeAiQuota(user.id);
  assert(yesterday.ok);
  mock.timers.setTime(new Date("2026-10-08T00:00:01Z").getTime());
  const today = await consumeAiQuota(user.id);
  assert(today.ok);
  await yesterday.refund();
  assert.equal(user.aiCallsToday, 1);
  await Promise.all([today.refund(), today.refund()]);
  assert.equal(user.aiCallsToday, 0);
  const next = await consumeAiQuota(user.id);
  assert(next.ok);
  await today.refund();
  assert.equal(user.aiCallsToday, 1);
});

test("parallel generation reservations allow every account and restore both counters once", async () => {
  const reservations = await Promise.all(Array.from({ length: 12 }, () => reserveGenerationQuota(user.id)));
  const accepted = reservations.filter(item => item.ok);
  assert.equal(accepted.length, 12);
  assert.equal(user.threeDGenerations, 12);
  assert.equal(user.aiCallsToday, 12);
  const first = accepted[0];
  assert(first.ok);
  await Promise.all([first.refund(), first.refund()]);
  assert.equal(user.threeDGenerations, 11);
  assert.equal(user.aiCallsToday, 11);
});

test("high AI usage is allowed and database failure releases usage accounting", async () => {
  user.aiCallsDate = new Date(new Date().toISOString().slice(0, 10));
  user.aiCallsToday = 25;
  const allowed = await reserveGenerationQuota(user.id); assert(allowed.ok); await allowed.refund();
  assert.equal(user.threeDGenerations, 0);
  stubUser("updateMany", async ({ where, data }: { where: Row; data: Row }) => {
    if (data.aiCallsToday !== undefined) throw new Error("Fixture database outage");
    if (!matches(user, where)) return { count: 0 };
    update(data); return { count: 1 };
  });
  await assert.rejects(() => reserveGenerationQuota(user.id), /Fixture database outage/);
  assert.equal(user.threeDGenerations, 0);
});

test("legacy plan and expiry never restrict free access", async () => {
  user.threeDGenerations = 5;
  user.plan = "pro";
  user.planExpiresAt = new Date(Date.now() + 60_000);
  const pro = await reserveGenerationQuota(user.id);
  assert(pro.ok);
  await pro.refund();
  assert.equal(user.threeDGenerations, 5);
  user.planExpiresAt = new Date(Date.now() - 1);
  const expired = await reserveGenerationQuota(user.id);
  assert(expired.ok);
  await expired.refund();
  assert.equal(user.threeDGenerations, 5);
});

test("short house commands generate new geometry despite historical usage", async () => {
  user.threeDGenerations = 5000;
  const office = buildFromPrompt("создай офис 8 этажей");
  assert(isModelRebuild("создай дом")); assert(!isModelRebuild("увеличь модель на 30%"));
  for (const call of [() => generate(post("/api/3d/generate", {prompt: "дом"})), () => refine(post("/api/3d/refine", {concept: office, instruction: "создай дом"}))]) {
    const {result} = await inRequest(call); assert.equal(result.status, 200);
    const data = await result.json(); assert(!/офис/i.test(data.concept.name));
    assert.notDeepEqual(data.concept.parts, office.parts); assert(data.procurement.items.length > 0);
  }
  assert.equal(user.threeDGenerations, 5002);
  assert(isModelRebuild("Школа 4 этажа ширина 60 длина 120"));
  assert(!isModelRebuild("Сделай окна шире"));
  const school = (await inRequest(() => refine(post("/api/3d/refine", {concept: office, instruction: "Школа 4 этажа ширина 60 длина 120"})))).result;
  assert.equal(school.status, 200); const schoolData = await school.json();
  assert.match(schoolData.concept.name, /школа/i); assert.notDeepEqual(schoolData.concept.parts, office.parts);
});

test("realistic jobs need a login and configuration, keep the secret server-side and refund failures", async () => {
  const start = () => realistic(post("/api/3d/realistic", {prompt: "красный дракон"}));
  assert.equal((await inRequest(start, "invalid")).result.status, 401);
  assert.equal((await inRequest(start)).result.status, 503, "not configured");

  env.MODAL_REALISTIC_URL = "https://atrion-test--web.modal.run";
  env.MODAL_REALISTIC_SECRET = "fixture-secret";
  let fail = false;
  const network = mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    assert.equal(url, "https://atrion-test--web.modal.run/jobs");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-secret");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.mode, "object", "an animal is not drawn in a human A-pose");
    return fail ? new Response("{}", {status: 500}) : new Response(JSON.stringify({id: "fc-abc123"}));
  });
  const ok = (await inRequest(start)).result;
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.equal(data.pollUrl, "https://atrion-test--web.modal.run/jobs/fc-abc123");
  assert(!JSON.stringify(data).includes("fixture-secret"), "the secret never reaches the browser");
  assert.equal(user.aiCallsToday, 1);

  fail = true;
  assert.equal((await inRequest(start)).result.status, 502);
  assert.equal(user.aiCallsToday, 1, "a failed start is refunded");
  assert.equal(network.mock.callCount(), 2);

  env.MODAL_REALISTIC_URL = "https://evil.example.com";
  assert.equal((await inRequest(start)).result.status, 503, "only *.modal.run endpoints are accepted");
});

test("asking a bridge for more lanes rebuilds the same bridge, never a car", async () => {
  // A creation verb alone used to send the rest of the sentence off as a new model.
  for (const edit of ["построй больше полос для машин", "build more lanes for cars", "построй террасу", "построй ещё одну башню"]) assert(!isModelRebuild(edit), edit);
  for (const fresh of ["нарисуй дракона", "создай красную машину", "сгенерируй абстрактную скульптуру"]) assert(isModelRebuild(fresh), fresh);

  const bridge = buildFromPrompt("вантовый мост на 4 полосы");
  const {result} = await inRequest(() => refine(post("/api/3d/refine", {concept: bridge, instruction: "построй больше полос для машин"})));
  assert.equal(result.status, 200);
  const data = await result.json();
  const names: string[] = data.concept.parts.map((p: ModelPart) => p.name);
  assert(names.includes("Проезжая часть"), "still a road bridge");
  assert(names.some(n => /пилон/i.test(n)), "same cable-stayed style");
  assert(!names.some(n => /колес|колёс/i.test(n)), "no car parts");
  assert.match(data.concept.name, /6 полос/);
  assert.equal(user.threeDGenerations, 1, "a rebuild counts as a generation");
});

test("successful local generation spends both allowances and does not log prompt text", async () => {
  const log = mock.method(console, "info", () => undefined);
  const prompt = "Деревянный стол fixture-private-marker";
  const { result } = await inRequest(() => generate(post("/api/3d/generate", { prompt })));
  assert.equal(result.status, 200);
  assert.equal(user.threeDGenerations, 1);
  assert.equal(user.aiCallsToday, 1);
  assert(!JSON.stringify(log.mock.calls).includes("fixture-private-marker"));
});

test("local scale honours percentages, updates dimensions, repeats and baked mesh vertices", async () => {
  const mesh = { ...part(), shape: "mesh" as const, mesh: {
    position: [-1, -1, -1, 1, 1, 1, -1, 1, -1], normal: [0, 1, 0, 0, 1, 0, 0, 1, 0],
  }, repeat: { count: 2, step: [4, 0, 0] as [number, number, number] } };
  const base = concept([mesh]);
  const grown = await refine3DConcept(base, "увеличь модель на 30%");
  assert.deepEqual(grown.parts[0].size, [2.6, 2.6, 2.6]);
  assert.deepEqual(grown.parts[0].repeat?.step, [5.2, 0, 0]);
  assert.equal(grown.parts[0].mesh?.position[0], -1.3);
  assert.deepEqual(grown.dimensions, dimensionsOf(grown.parts));
  const shrunk = await refine3DConcept(base, "уменьши модель на 30%");
  assert.deepEqual(shrunk.parts[0].size, [1.4, 1.4, 1.4]);
  const selected = await refine3DConcept(concept([part("a"), part("b", [10, 1, 0])]), "увеличь деталь", "a");
  assert.deepEqual(selected.parts[1], part("b", [10, 1, 0]));
  assert.deepEqual(selected.parts[0].position, [0, 1, 0]);
  assert.equal(localRefine(base, "покрась деревянный стол в синий"), null);
  assert.equal(localRefine(base, "увеличь крышу"), null);
});

test("valid AI edits of one, two or three parts preserve intentional gaps", async () => {
  for (const count of [1, 2, 3]) {
    const parts = Array.from({ length: count }, (_, index) => part(`p${index}`, [index * 10, 1, 0]));
    providerReply(parts.map(item => ({ ...item, color: "#0000ff" })));
    const result = await refine3DConcept(concept(parts), "покрась модель в синий");
    assert.equal(result.source, "ai");
    assert.equal(result.parts.length, count);
    assert(result.parts.every(item => item.color === "#0000ff"));
    assert.deepEqual(result.parts.map(item => item.position), parts.map(item => item.position));
  }
});

test("AI mesh edits preserve baked data and scale vertices and normals with the requested size", async () => {
  const mesh: ModelPart = { ...part(), shape: "mesh", mesh: {
    position: [-1, -1, -1, 1, 1, 1, -1, 1, -1],
    normal: [1, 1, 0, 1, 1, 0, 1, 1, 0],
    index: [0, 1, 2], uv: [0, 0, 1, 1, 0, 1],
  } };
  providerReply([{ id: mesh.id, size: [4, 2, 2] }]);
  const result = await refine3DConcept(concept([mesh]), "растяни деталь по ширине вдвое");
  assert.equal(result.parts[0].shape, "mesh");
  assert.deepEqual(result.parts[0].mesh?.position, [-2, -1, -1, 2, 1, 1, -2, 1, -1]);
  assert.deepEqual(result.parts[0].mesh?.uv, mesh.mesh?.uv);
  assert.deepEqual(result.parts[0].mesh?.index, mesh.mesh?.index);
  const normal = result.parts[0].mesh!.normal!;
  assert(Math.abs(Math.hypot(...normal.slice(0, 3)) - 1) < 1e-12);
  assert.equal(normal[0] / normal[1], .5);
  assert.deepEqual(result.dimensions, dimensionsOf(result.parts));
});

test("AI primitive aliases normalize to renderer shapes and unknown shapes are rejected", async () => {
  providerReply([{ ...part(), shape: "cube", color: "#0000ff" }]);
  assert.equal((await refine3DConcept(concept(), "покрась в синий")).parts[0].shape, "box");
  providerReply([{ ...part(), shape: "unsupported" }]);
  await assert.rejects(refine3DConcept(concept(), "покрась в синий"), { code: "EDIT_NOT_APPLIED" });
});

test("unsupported, invalid and unchanged edits return 422 and refund the daily quota", async () => {
  const base = concept();
  for (const output of [undefined, [{}], base.parts]) {
    if (output) providerReply(output);
    const { result } = await inRequest(() => refine(post("/api/3d/refine", {
      concept: base, instruction: "добавь балкон",
    })));
    assert.equal(result.status, 422);
    assert.equal((await result.json()).code, "EDIT_NOT_APPLIED");
    assert.equal(user.aiCallsToday, 0);
    assert.equal(user.threeDGenerations, 0);
  }
});

test("malformed refinement input is rejected before reserving quota", async () => {
  assert.equal(readEditableConcept({ parts: [null] }), null);
  for (const body of [null, { concept: concept([{ ...part(), size: [0, 1, 1] }]), instruction: "увеличь" }]) {
    const { result } = await inRequest(() => refine(post("/api/3d/refine", body)));
    assert.equal(result.status, 400);
  }
  assert.equal(user.aiCallsToday, 0);
});
