import "next/dist/server/node-environment-baseline";
import test, {beforeEach, afterEach} from "node:test";
import assert from "node:assert/strict";
import {db} from "../src/backend/db";
import {changeScene, undoRedo, owned, enqueue, failJob, renameProject} from "../src/backend/interior/repository";
import {newScene} from "../src/shared/interior/scene";

// Repository boundary fixture. This exercises state transitions, not PostgreSQL locking.
type Row = Record<string, any>;
let project: Row, user: Row, versions: Row[], jobs: Row[], serial: number;
const original = db.$transaction;
const mutate = (row: Row, data: Row) => {for (const [key, v] of Object.entries(data)) row[key] = v && typeof v === "object" && "increment" in v ? row[key] + v.increment : v && typeof v === "object" && "decrement" in v ? row[key] - v.decrement : structuredClone(v); return structuredClone(row);};
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => value instanceof Date ? row[key]?.getTime() === value.getTime() : value && typeof value === "object" ?
    "in" in value ? value.in.includes(row[key]) : "gt" in value ? row[key] > value.gt : "gte" in value ? row[key] >= value.gte : false : row[key] === value);
}
let tx: any;
beforeEach(() => {
  project = {id: "project_fixture", userId: "owner", name: "Fixture", scene: newScene(), revision: 0, currentVersionId: null, redoIds: [], style: "modern", roomType: "bedroom", status: "draft"};
  user = {id: "owner", plan: "free", planExpiresAt: null, aiCallsToday: 0, aiCallsDate: null, threeDGenerations: 0};
  versions = []; jobs = []; serial = 0;
  tx = {
    $queryRaw: async () => [],
    designProject: {findFirst: async ({where}: Row) => matches(project, where) ? structuredClone(project) : null,
      update: async ({data}: Row) => mutate(project, data)},
    designVersion: {create: async ({data}: Row) => {const version = {id: `v_${++serial}`, ...structuredClone(data)}; versions.push(version); return version;},
      findFirst: async ({where}: Row) => versions.find(v => matches(v, where)) ?? null},
    designJob: {count: async ({where}: Row) => jobs.filter(j => matches(j, where)).length,
      create: async ({data}: Row) => {const job = {id: `job_${++serial}`, status: "queued", refunded: false, ...structuredClone(data)}; jobs.push(job); return structuredClone(job);},
      findUnique: async ({where}: Row) => {const j = jobs.find(j => matches(j, where)); return j ? {...j, project: {...project}} : null;},
      updateMany: async ({where, data}: Row) => {const found = jobs.filter(j => matches(j, where)); found.forEach(j => mutate(j, data)); return {count: found.length};}},
    user: {findUniqueOrThrow: async () => structuredClone(user), update: async ({data}: Row) => mutate(user, data),
      updateMany: async ({where, data}: Row) => {if (!matches(user, where)) return {count: 0}; mutate(user, data); return {count: 1};}},
  };
  (db as any).$transaction = async (fn: (value: any) => Promise<any>) => {
    const saved = structuredClone({project, user, versions, jobs});
    try {return await fn(tx);} catch (e) {({project, user, versions, jobs} = saved); throw e;}
  };
});
afterEach(() => {(db as any).$transaction = original;});
test("owner is checked before edits, and stale revisions cannot overwrite scenes", async () => {
  await assert.rejects(() => owned(project.id, "other", tx), /не найден/);
  await changeScene(project.id, "owner", 0, s => ({...s, wallColor: "#ffffff"}));
  assert.equal(project.revision, 1);
  await assert.rejects(() => changeScene(project.id, "owner", 0, s => ({...s, wallColor: "#000000"})), /уже изменён/);
  assert.equal(project.scene.wallColor, "#ffffff"); assert.equal(versions.length, 1);
});
test("undo redo retain versions and a new branch clears redo without deleting history", async () => {
  await changeScene(project.id, "owner", 0, s => ({...s, style: "loft", wallColor: "#123456"}));
  await undoRedo(project.id, "owner", 1, false);
  assert.equal(project.style, "modern"); assert.equal(project.currentVersionId, null);
  await undoRedo(project.id, "owner", 2, true);
  assert.equal(project.style, "loft"); assert.equal(project.scene.wallColor, "#123456");
  await undoRedo(project.id, "owner", 3, false);
  await changeScene(project.id, "owner", 4, s => ({...s, wallColor: "#abcdef"}));
  assert.deepEqual(project.redoIds, []); assert.equal(versions.length, 2);
  await assert.rejects(() => undoRedo(project.id, "owner", 5, true), /Нет изменений/);
});
test("jobs reserve variant quota durably and failure refunds exactly once", async () => {
  const job = await enqueue(project.id, "owner", 0, {prompt: "стол", variants: 3, editing: false});
  assert.equal(user.threeDGenerations, 3); assert.equal(user.aiCallsToday, 1);
  await assert.rejects(() => enqueue(project.id, "owner", 0, {prompt: "стол", variants: 3, editing: false}), /текущей генерации/);
  await assert.rejects(() => renameProject(project.id, "owner", 0, "Changed during generation"), /текущей генерации/);
  assert.equal(project.revision, 0); assert.equal(project.name, "Fixture");
  await failJob(job.id, "fixture failure"); await failJob(job.id, "fixture failure");
  assert.equal(user.threeDGenerations, 0); assert.equal(user.aiCallsToday, 0); assert.equal(jobs[0].status, "failed");
});
test("high historical usage is allowed and yesterday's failure does not refund today", async () => {
  user.threeDGenerations = 5000;
  const highUsage = await enqueue(project.id, "owner", 0, {prompt: "стол", variants: 2, editing: false});
  assert.equal(jobs.length, 1); assert.equal(user.threeDGenerations, 5002);
  await failJob(highUsage.id, "fixture failure");
  user.threeDGenerations = 0;
  const job = await enqueue(project.id, "owner", 0, {prompt: "стол", variants: 1, editing: false});
  user.aiCallsDate = new Date(job.quotaDay.getTime() + 86400000); user.aiCallsToday = 2;
  await failJob(job.id, "fixture failure"); assert.equal(user.aiCallsToday, 2); assert.equal(user.threeDGenerations, 0);
});
