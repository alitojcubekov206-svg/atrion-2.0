import test from "node:test";
import assert from "node:assert/strict";
import { parseRig2D, evaluateRig2D } from "../src/backend/design/rig2d";
import { parseRig3D, evaluateRig3D } from "../src/backend/design/rig3d";
import { parseHouse, buildHouse } from "../src/backend/design/house";
import { parseDesignDocument, evaluateDesign } from "../src/backend/design/documents";
import { readDesignBody, MAX_DESIGN_BODY_BYTES } from "../src/backend/design/body";
import { DesignError } from "../src/backend/design/validation";
import { createDesignStore } from "../src/backend/design/store";

const transform2 = (x=0,y=0,rotation=0) => ({position:[x,y],rotation,scale:[1,1]});
const transform3 = (x=0,y=0,z=0,angle=0) => ({position:[x,y,z],rotation:[0,0,angle]});
function rig2() {
  return {kind:"rig2d",schemaVersion:1,canvas:{width:400,height:400},
    assets:[{id:"hand",uri:"https://example.invalid/hand.png",mime:"image/png",width:20,height:40}],
    layers:[{id:"handLayer",assetId:"hand",zIndex:0,visible:true,pivot:[10,20],transform:transform2()}],
    bones:[{id:"root",parentId:null,length:100,bind:transform2()}, {id:"child",parentId:"root",length:100,bind:transform2(100)}],
    attachments:[{layerId:"handLayer",boneId:"child",offset:transform2(100)}],
    clips:[{id:"wave",duration:1,loop:false,tracks:[{boneId:"root",rotationMode:"shortest",keys:[
      {time:0,transform:transform2(),interpolation:"linear"}, {time:1,transform:transform2(0,0,Math.PI/2),interpolation:"linear"}
    ]}]}]};
}
function rig3() {
  return {kind:"rig3d",schemaVersion:1,units:"m",
    bones:[{id:"root",parentId:null,length:1,bind:transform3()}, {id:"child",parentId:"root",length:1,bind:transform3(0,1)}],
    parts:[{id:"hand",name:"Hand",shape:"box",color:"#ffffff",size:[0.2,0.4,0.2],position:[0,2,0],rotation:[0,0,0]}],
    bindings:[{partId:"hand",boneId:"child"}]};
}
function house() {
  return {kind:"house",schemaVersion:1,units:"m",width:12,depth:9,floorHeight:3,wallThickness:0.2,wallColor:"#c8c4bc",roof:"flat",
    floors:[{id:"ground",rooms:[{id:"left",name:"Living",x:0,z:0,width:6,depth:9},{id:"right",name:"Bedroom",x:6,z:0,width:6,depth:9}],
      openings:[{id:"entry",roomId:"left",side:"north",kind:"door",offset:1,width:1,bottom:0,height:2.1}]}]};
}
function near(actual: number,expected: number) {assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);}
function invalid(value: unknown) {assert.throws(() => parseDesignDocument(value),DesignError);}

test("2D parent FK and layer pivot follow a quarter turn analytically",() => {
  const input=rig2(),document=parseRig2D(input);
  const result=evaluateRig2D(document,{pose:{root:transform2(0,0,Math.PI/2)}});
  const child=result.bones.find((bone) => bone.id==="child")!;
  near(child.head[0],0);near(child.head[1],100);near(child.tail[0],0);near(child.tail[1],200);
  const m=result.layers[0].matrix;
  near(m[0]*10+m[2]*20+m[4],0);near(m[1]*10+m[3]*20+m[5],200);
  assert.deepEqual(input,rig2(),"evaluation must not mutate bind data");
});
test("2D sampling, clamping and reset are independent of playback frame rate",() => {
  const document=parseRig2D(rig2());
  const midpoint=evaluateRig2D(document,{clipId:"wave",time:0.5});
  near(midpoint.bones[0].matrix[0],Math.SQRT1_2);
  near(evaluateRig2D(document,{clipId:"wave",time:10}).bones[0].matrix[0],0);
  near(evaluateRig2D(document).bones[0].matrix[0],1);
});
test("2D shortest angles and explicit full turns have different midpoint poses",() => {
  const document=parseRig2D(rig2());
  const track=document.clips[0].tracks[0];
  track.keys[1].transform.rotation=2*Math.PI;
  near(evaluateRig2D(document,{clipId:"wave",time:0.5}).bones[0].matrix[0],1);
  track.rotationMode="unwrapped";
  near(evaluateRig2D(document,{clipId:"wave",time:0.5}).bones[0].matrix[0],-1);
});
test("2D step sampling, loop boundary and unordered bones",() => {
  const document=parseRig2D(rig2());
  document.bones.reverse();
  document.clips[0].loop=true;
  document.clips[0].tracks[0].keys[0].interpolation="step";
  near(evaluateRig2D(document,{clipId:"wave",time:0.99}).bones[0].matrix[0],1);
  near(evaluateRig2D(document,{clipId:"wave",time:1}).bones[0].matrix[0],1);
});
test("2D preserves exact affine shear without decomposing it",() => {
  const document=parseRig2D(rig2());
  document.bones[0].bind.scale=[2,1];document.bones[1].bind.rotation=Math.PI/4;
  const m=evaluateRig2D(document).bones[1].matrix;
  near(m[0]*m[2]+m[1]*m[3],-1.5);
});
test("2D rejects cycles, missing references and duplicate IDs",() => {
  const cycle=rig2();cycle.bones[0].parentId="child" as unknown as null;invalid(cycle);
  const missing=rig2();missing.bones[1].parentId="absent";invalid(missing);
  const duplicate=rig2();duplicate.bones[1].id="root";invalid(duplicate);
  const layer=rig2();layer.layers[0].assetId="absent";invalid(layer);
});
test("2D rejects duplicate bindings, duplicate key times and non-finite transforms",() => {
  const attachment=rig2();attachment.attachments.push(attachment.attachments[0]);invalid(attachment);
  const times=rig2();times.clips[0].tracks[0].keys[1].time=0;invalid(times);
  const nan=rig2();nan.bones[0].bind.rotation=NaN;invalid(nan);
});
test("2D forbids transient/active asset references and invalid dimensions",() => {
  for(const uri of ["blob:https://example.com/a","data:image/svg+xml,x","not a URL","https://user:password@example.com/a"]) {
    const doc=rig2();doc.assets[0].uri=uri;invalid(doc);
  }
  const document=rig2();document.assets[0].width=0;invalid(document);
});
test("2D unknown clip and unknown pose are rejected",() => {
  const document=parseRig2D(rig2());
  assert.throws(() => evaluateRig2D(document,{clipId:"missing"}),DesignError);
  assert.throws(() => evaluateRig2D(document,{pose:{missing:transform2()}}),DesignError);
});
test("2D matrices reject compound scales outside numeric bounds",() => {
  const document=parseRig2D(rig2());
  document.bones=[];
  for(let i=0;i<10;i++) document.bones.push({id:`b${i}`,parentId:i?`b${i-1}`:null,length:1,bind:{position:[0,0],rotation:0,scale:[100,100]}});
  document.layers=[];document.attachments=[];
  assert.throws(() => evaluateRig2D(document),DesignError);
});
test("3D rigid parent delta rotates bound geometry once",() => {
  const document=parseRig3D(rig3());
  const bind=evaluateRig3D(document),posed=evaluateRig3D(document,{root:transform3(0,0,0,Math.PI/2)});
  near(bind.parts[0].position[1],2);near(posed.parts[0].position[0],-2);near(posed.parts[0].position[1],0);
  assert.deepEqual(posed.parts[0].size,document.parts[0].size);
  assert.deepEqual(evaluateRig3D(document),bind);
});
test("3D expands repeats and mirrors before binding without mutating the source",() => {
  const document=parseRig3D(rig3());
  document.parts[0].repeat={count:2,step:[1,0,0]};document.parts[0].mirror="x";
  const snapshot=structuredClone(document),bind=evaluateRig3D(document),posed=evaluateRig3D(document,{root:transform3(0,0,0,Math.PI/2)});
  assert.equal(bind.parts.length,4);assert.equal(new Set(bind.parts.map((part)=>part.id)).size,4);
  for(let i=0;i<4;i++) {near(posed.parts[i].position[0],-bind.parts[i].position[1]);near(posed.parts[i].position[1],bind.parts[i].position[0]);}
  assert.deepEqual(document,snapshot);assert.equal(posed.mode,"rigid");
});
test("3D validates meshes, bindings, hierarchy and instance limits",() => {
  const bad=rig3();bad.bindings[0].partId="missing";invalid(bad);
  const cyclic=rig3();cyclic.bones[0].parentId="child" as unknown as null;invalid(cyclic);
  const mesh={...rig3(),parts:[{...rig3().parts[0],shape:"mesh",mesh:{position:[1,2,3]}}]};invalid(mesh);
  const oversized=parseRig3D(rig3());
  oversized.parts=Array.from({length:20},(_,i)=>({...oversized.parts[0],id:`p${i}`,repeat:{count:64,step:[1,0,0]},mirror:"xz"}));
  invalid(oversized);
});
test("3D mesh vertices stay local while pose transforms the part",() => {
  const document=parseRig3D({...rig3(),parts:[{...rig3().parts[0],shape:"mesh",mesh:{position:[0,0,0,0.1,0,0,0,0.1,0]}}]});
  const result=evaluateRig3D(document,{root:transform3(0,0,0,Math.PI/2)});
  assert.deepEqual(result.parts[0].mesh,document.parts[0].mesh);
  near(result.parts[0].position[0],-2);
});
test("House preserves footprint and has a real empty doorway",() => {
  const document=parseHouse(house()),result=buildHouse(document);
  assert.equal(result.floors[0].rooms.length,2);
  assert.deepEqual(document.floors[0].rooms,house().floors[0].rooms);
  // Centre of the entrance in world coordinates lies in no wall bounding box.
  const point=[1.5-12/2,1,0.1-9/2];
  assert.equal(result.parts.filter((part)=>part.role==="wall" && point.every((coordinate,axis)=>Math.abs(coordinate-part.position[axis])<part.size[axis]/2-EPSILON)).length,0);
  // A point next to the entrance is inside a wall.
  assert.ok(result.parts.some((part)=>part.role==="wall" && [0.5-6,1,0.1-4.5].every((coordinate,axis)=>Math.abs(coordinate-part.position[axis])<part.size[axis]/2)));
});
const EPSILON=1e-7;
test("House adjacent rooms share one wall, not duplicate coincident geometry",() => {
  const result=buildHouse(parseHouse(house()));
  const partition=result.parts.filter((part)=>part.role==="wall" && part.position[0]===0 && part.size[0]===0.2);
  assert.equal(partition.length,1);near(partition[0].size[2],9);
});
test("House rejects overlapping rooms and dangling/out-of-wall openings",() => {
  const overlap=house();overlap.floors[0].rooms[1].x=5;invalid(overlap);
  const outside=house();outside.floors[0].rooms[0].width=13;invalid(outside);
  const missing=house();missing.floors[0].openings[0].roomId="absent";invalid(missing);
  const door=house();door.floors[0].openings[0].offset=5.9;invalid(door);
  const holes=house();holes.floors[0].openings.push({...holes.floors[0].openings[0],id:"another"});invalid(holes);
});

test("House decimal coordinates do not duplicate a shared wall",() => {
  const input=house();input.floors[0].rooms[0].width=3.3;
  input.floors[0].rooms[1].x=1.1+2.2;input.floors[0].rooms[1].width=12-3.3;
  const result=buildHouse(parseHouse(input));
  const partition=result.parts.filter((part)=>part.role==="wall" && Math.abs(part.position[0]-(3.3-6))<1e-7 && part.size[0]===0.2);
  assert.equal(partition.length,1);
});
test("House gable roof and multiple floors remain conceptual with explicit limitations",() => {
  const document=parseHouse(house());document.roof="gable";
  document.floors.push({...structuredClone(document.floors[0]),id:"upper"});
  const result=buildHouse(document);
  assert.equal(result.parts.at(-1)?.shape,"prism");near(result.floors[1].elevation,3.2);
  assert.ok(result.warnings.some((warning)=>warning.includes("лестницы отсутствуют")));
  assert.ok(result.parts.every((part)=>part.size.every((n)=>n>0 && Number.isFinite(n))));
});
test("All design kinds have a canonical JSON round trip and deterministic evaluation",() => {
  for(const input of [rig2(),rig3(),house()]) {
    const doc=parseDesignDocument(input),restored=parseDesignDocument(JSON.parse(JSON.stringify(doc)));
    assert.deepEqual(restored,doc);assert.deepEqual(evaluateDesign(restored),evaluateDesign(doc));
  }
});
test("Unsupported kind/version never silently downgrades",() => {
  invalid({...rig2(),schemaVersion:2});invalid({...rig2(),kind:"spine"});invalid(null);invalid([]);
});

test("HTTP body parser accepts split UTF-8 and rejects malformed JSON/root arrays", async () => {
  const bytes=new TextEncoder().encode(JSON.stringify({name:"Рука"}));
  const stream=new ReadableStream<Uint8Array>({start(controller) {
    for(const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  }});
  const request=new Request("https://example.invalid",{method:"POST",body:stream,duplex:"half"} as RequestInit);
  assert.deepEqual(await readDesignBody(request),{name:"Рука"});
  for(const raw of ["{", "[]", "null"]) await assert.rejects(readDesignBody(new Request("https://example.invalid",{method:"POST",body:raw})),DesignError);
  await assert.rejects(readDesignBody(new Request("https://example.invalid",{method:"POST",body:Uint8Array.of(0xff)})),DesignError);
});
test("HTTP body limit applies to streamed bodies and declared length", async () => {
  const stream=new ReadableStream<Uint8Array>({start(controller) {
    controller.enqueue(new Uint8Array(MAX_DESIGN_BODY_BYTES));
    controller.enqueue(Uint8Array.of(1));controller.close();
  }});
  const request=new Request("https://example.invalid",{method:"POST",body:stream,duplex:"half"} as RequestInit);
  await assert.rejects(readDesignBody(request),(error:unknown) => error instanceof DesignError && error.status===413);
  const declared=new Request("https://example.invalid",{method:"POST",body:"{}",headers:{"content-length":String(MAX_DESIGN_BODY_BYTES+1)}});
  await assert.rejects(readDesignBody(declared),(error:unknown) => error instanceof DesignError && error.status===413);
});

test("Persistence scopes reads/writes to the owner and rejects stale revisions", async (t) => {
  const db={designDocument:{findMany:async()=>[],findFirst:async()=>null,updateMany:async()=>({count:0}),deleteMany:async()=>({count:0})},$transaction:async()=>undefined};
  const {listDesignDocuments,readDesignDocument,replaceDesignDocument,deleteDesignDocument}=createDesignStore(db as unknown as Parameters<typeof createDesignStore>[0]);
  const calls: Record<string,unknown>[]=[];
  let exists=false;
  t.mock.method(db.designDocument,"findMany",async (query: Record<string,unknown>) => {calls.push(query);return [];});
  t.mock.method(db.designDocument,"findFirst",async (query: Record<string,unknown>) => {
    calls.push(query);return exists ? {kind:"rig2d",id:"saved"} : null;
  });
  t.mock.method(db.designDocument,"updateMany",async (query: Record<string,unknown>) => {calls.push(query);return {count:0};});
  t.mock.method(db.designDocument,"deleteMany",async (query: Record<string,unknown>) => {calls.push(query);return {count:0};});
  t.mock.method(db,"$transaction",async (callback: (client:typeof db)=>Promise<unknown>) => callback(db));
  const status=(expected:number)=>(error:unknown)=>error instanceof DesignError && error.status===expected;
  try {
    await listDesignDocuments("owner","rig2d",20,0);
    await assert.rejects(readDesignDocument("other","saved"),status(404));
    await assert.rejects(replaceDesignDocument("other","saved",1,"Name",parseRig2D(rig2())),status(404));
    await assert.rejects(deleteDesignDocument("other","saved",1),status(404));
    exists=true;
    await assert.rejects(replaceDesignDocument("owner","saved",1,"Name",parseRig2D(rig2())),status(409));
    await assert.rejects(deleteDesignDocument("owner","saved",1),status(409));
    await assert.rejects(replaceDesignDocument("owner","saved",1,"Name",parseHouse(house())),status(400));
    for(const query of calls) assert.ok((query.where as Record<string,unknown>).userId,"every operation must filter by owner");
    const write=calls.find((query)=>"data" in query)!;
    assert.deepEqual(write.where,{id:"saved",userId:"owner",revision:1});
    assert.equal((write.data as {revision:{increment:number}}).revision.increment,1);
  } finally {t.mock.restoreAll();}
});
test("Persistence creates only after locking the user and enforcing storage cap", async (t) => {
  const db={designDocument:{count:async()=>0,create:async()=>({})},$transaction:async()=>undefined,$queryRaw:async()=>[]};
  const {createDesignDocument}=createDesignStore(db as unknown as Parameters<typeof createDesignStore>[0]);
  const sequence:string[]=[];
  let count=100;
  t.mock.method(db,"$transaction",async (callback:(client:typeof db)=>Promise<unknown>)=>callback(db));
  t.mock.method(db,"$queryRaw",async (sql:TemplateStringsArray,userId:string)=>{
    assert.ok(sql.join("?").includes('FOR UPDATE'));assert.equal(userId,"owner");sequence.push("lock");return [{id:userId}];
  });
  t.mock.method(db.designDocument,"count",async ()=>{sequence.push("count");return count;});
  t.mock.method(db.designDocument,"create",async (query:{data:{userId:string;data:unknown}})=>{
    sequence.push("create");assert.equal(query.data.userId,"owner");assert.deepEqual(query.data.data,parseRig2D(rig2()));return {id:"saved",revision:1};
  });
  try {
    await assert.rejects(createDesignDocument("owner","Name",parseRig2D(rig2())),(error:unknown)=>error instanceof DesignError && error.status===403);
    assert.deepEqual(sequence,["lock","count"]);sequence.length=0;count=99;
    await createDesignDocument("owner","Name",parseRig2D(rig2()));assert.deepEqual(sequence,["lock","count","create"]);
  } finally {t.mock.restoreAll();}
});
