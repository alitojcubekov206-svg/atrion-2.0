import test from "node:test";
import assert from "node:assert/strict";
import {parsePlanAnalysis, analyzePlanImage} from "../src/backend/interior/cloudflare";
import {readPlanBytes} from "../src/backend/interior/plan-upload";
const measurement = (value: number | null, confidence: number) => ({value, confidence});
const plan = {units: "m", rooms: [{name: "Спальня", width: measurement(4, .42), length: measurement(5, .91), height: measurement(null, 0)}]};
test("uncertain dimensions stay unknown instead of becoming guessed scene dimensions", () => {
  const result = parsePlanAnalysis(plan);
  assert.equal(result.rooms[0].width.value, null); assert.equal(result.rooms[0].width.requiresConfirmation, true);
  assert.equal(result.rooms[0].length.value, 5); assert.equal(result.rooms[0].height.value, null);
  assert.equal(result.requiresConfirmation, true);
});
test("vision adapter uses only the fixed Cloudflare endpoint and validates JSON", async () => {
  let called = 0;
  const transport: typeof fetch = async (url, init) => {
    called++; assert(String(url).endsWith("/ai/run/@cf/meta/llama-3.2-11b-vision-instruct"));
    const body = JSON.parse(String(init?.body)); assert.equal(body.image, "AQID"); assert.equal(body.temperature, 0);
    return new Response(JSON.stringify({success: true, result: {response: JSON.stringify(plan)}}));
  };
  const env = {DESIGN_VISION_ENABLED: "true", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "fixture-only"};
  assert.equal((await analyzePlanImage(new Uint8Array([1,2,3]), transport, env)).rooms[0].width.value, null);
  await assert.rejects(() => analyzePlanImage(new Uint8Array([1]), transport, {...env, DESIGN_VISION_ENABLED: "false"}));
  assert.equal(called, 1);
});
test("uploads reject MIME spoofing, active SVG and oversized streamed files", async () => {
  const req = (type: string, body: string) => new Request("https://fixture.invalid", {method: "POST", headers: {"Content-Type": type}, body});
  await assert.rejects(() => readPlanBytes(req("image/png", "not a png")));
  await assert.rejects(() => readPlanBytes(req("image/svg+xml", '<svg><image href="https://example.invalid"/></svg>')));
  await assert.rejects(() => readPlanBytes(req("image/svg+xml", '<svg onload="evil()"/>')));
  const benign = await readPlanBytes(req("image/svg+xml", '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>'));
  assert.equal(benign.extension, "svg");
  const stream = new ReadableStream<Uint8Array>({start(c) {c.enqueue(new Uint8Array(15 * 1024 * 1024 + 1)); c.close();}});
  await assert.rejects(() => readPlanBytes(new Request("https://fixture.invalid", {method: "POST", headers: {"Content-Type": "image/png"}, body: stream, duplex: "half"} as RequestInit)), /лимит/);
});
