import test from "node:test";

import assert from "node:assert/strict";

import {parseHouse,buildHouse,type HouseDocument} from "../src/shared/house/document";

import {checkGeneratedHouse,generateHouse} from "../src/backend/design/house-generation";

import {compileHouseLayout} from "../src/backend/design/house-layout";

import {primaryTextProvider,requestTextJSON,CLOUDFLARE_TEXT_MODEL} from "../src/backend/text-ai";

import {readDesignBody,MAX_DESIGN_BODY_BYTES} from "../src/backend/design/body";

import {DesignError} from "../src/shared/design/validation";

const textEnv={CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_API_TOKEN:"test-cloudflare-token"};

const EPSILON=1e-7;

function createHouse(width=12, depth=9): HouseDocument {
  return parseHouse({kind:"house",schemaVersion:1,units:"m",width,depth,wallThickness:0.2,
    floorHeight:2.8,wallColor:"#e4ddd1",roof:"gable",floors:[{id:"floor_1",rooms:[
      {id:"room_1",name:"Гостиная",x:0,z:0,width:width/2,depth},
      {id:"room_2",name:"Кухня",x:width/2,z:0,width:width/2,depth:depth/2},
      {id:"room_3",name:"Спальня",x:width/2,z:depth/2,width:width/2,depth:depth/2}],openings:[
      {id:"entrance",roomId:"room_1",side:"south",kind:"door",offset:0.4,width:0.8,bottom:0,height:2.1},
      {id:"window",roomId:"room_1",side:"west",kind:"window",offset:0.4,width:1,bottom:0.9,height:1.3},
      {id:"kitchen_door",roomId:"room_2",side:"west",kind:"door",offset:0.4,width:0.8,bottom:0,height:2.1},
      {id:"bedroom_door",roomId:"room_3",side:"west",kind:"door",offset:0.4,width:0.8,bottom:0,height:2.1}
    ]}]});
}

function house() {
  return {kind:"house",schemaVersion:1,units:"m",width:12,depth:9,floorHeight:3,wallThickness:0.2,wallColor:"#c8c4bc",roof:"flat",
    floors:[{id:"ground",rooms:[{id:"left",name:"Living",x:0,z:0,width:6,depth:9},{id:"right",name:"Bedroom",x:6,z:0,width:6,depth:9}],
      openings:[{id:"entry",roomId:"left",side:"north",kind:"door",offset:1,width:1,bottom:0,height:2.1}]}]};
}

function near(actual: number,expected: number) {assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);}

function invalid(value: unknown) {assert.throws(() => parseHouse(value),DesignError);}

test("AI partitions compile to a covered editable house with connected doorways",()=>{
  const plan={width:12,depth:9,wallThickness:.2,floorHeight:2.8,wallColor:"#ffffff",roof:"flat",floors:[{layout:{axis:"x",ratio:.3,first:{name:"Прихожая"},second:{axis:"z",ratio:.5,first:{name:"Кухня-гостиная"},second:{axis:"x",ratio:.5,first:{name:"Спальня"},second:{name:"Санузел"}}}}}]};
  const doc=compileHouseLayout(plan);assert.equal(doc.floors[0].rooms.length,4);assert.deepEqual(checkGeneratedHouse(doc),[]);
  assert.equal(doc.floors[0].openings.filter(o=>o.kind==="door").length,4);
  assert.deepEqual(parseHouse(JSON.parse(JSON.stringify(doc))),doc);
  assert.throws(()=>compileHouseLayout({...plan,floors:[{layout:{axis:"x",ratio:.01,first:{name:"Too small"},second:{name:"Room"}}}]}));
});

test("flat AI room programs preserve every named room and their area shares",()=>{
  const rooms=[{name:"Прихожая",share:10},{name:"Кухня-гостиная",share:30},{name:"Спальня",share:25},{name:"Спальня",share:25},{name:"Санузел",share:10}];
  const doc=compileHouseLayout({width:12,depth:9,wallThickness:.2,floorHeight:2.8,wallColor:"#ffffff",roof:"flat",floors:[{rooms}]});
  assert.deepEqual(doc.floors[0].rooms.map(r=>r.name),rooms.map(r=>r.name));
  assert.deepEqual(checkGeneratedHouse(doc),[]);
  doc.floors[0].rooms.forEach((room,i)=>assert(Math.abs(room.width*room.depth-108*rooms[i].share/100)<1e-6));
});

test("generated house requires continuous floor coverage, an entrance and room access",()=>{
  const doc=createHouse();assert.deepEqual(checkGeneratedHouse(doc),[]);
  const blocked=structuredClone(doc);blocked.floors[0].openings=blocked.floors[0].openings.filter(o=>o.id!=="bedroom_door");
  assert(checkGeneratedHouse(blocked).some(v=>v.includes("связаны дверями")));
  const noEntry=structuredClone(doc);noEntry.floors[0].openings=[];
  assert(checkGeneratedHouse(noEntry).some(v=>v.includes("входной двери")));
  const gap=structuredClone(doc);gap.floors[0].rooms[2].depth-=1;
  assert(checkGeneratedHouse(gap).some(v=>v.includes("контур")));
});

test("house generation validates before charging and corrects invalid layout within one reservation",async()=>{
  let reserved=0,refunded=0,calls=0;
  const deps={configured:true,reserve:async()=>{reserved++;return {ok:true as const};},refund:async()=>{refunded++;},request:async()=>{calls++;return calls===1?{rooms:["Гостиная","Спальня"],width:12,depth:9,floors:1}:calls===2?{document:{}}:{name:"Мой проект",document:createHouse()};}};
  await assert.rejects(()=>generateHouse("x",deps));assert.equal(reserved,0);
  const result=await generateHouse("Дом с гостиной и спальней",deps);
  assert.equal(reserved,1);assert.equal(refunded,0);assert.equal(calls,3);assert.equal(result.document.kind,"house");
  assert.deepEqual(parseHouse(JSON.parse(JSON.stringify(result.document))),result.document);
});

test("house failure and cancellation refund once and never return a template",async()=>{
  for(const mode of ["invalid","provider","unsupported","abort"]){
    let refunded=0,calls=0;const controller=new AbortController();
    await assert.rejects(()=>generateHouse("Дом с гостиной и спальней",{configured:true,reserve:async()=>({ok:true}),refund:async()=>{refunded++;},request:async()=>{
      calls++;if(calls===1)return {rooms:[]};
      if(mode==="provider")throw new Error("secret provider payload");
      if(mode==="unsupported")return {unsupported:true};
      if(mode==="abort")controller.abort();
      return {document:{}};
    }},controller.signal),error=>error instanceof Error&&!error.message.includes("secret"));
    assert.equal(refunded,1);
  }
});

test("house plan cannot omit requested rooms or change extracted dimensions",async()=>{
  let calls=0,refunds=0;
  await assert.rejects(()=>generateHouse("Дом со спальней и кабинетом",{configured:true,reserve:async()=>({ok:true}),refund:async()=>{refunds++;},request:async()=>{
    calls++;return calls===1?{rooms:["Спальня","Кабинет"],width:14}:{document:createHouse()};
  }}),error=>error instanceof Error&&error.message.includes("корректную планировку"));
  assert.equal(calls,3);assert.equal(refunds,1);
});

test("missing house provider and exhausted quota do not call AI or refund unreserved quota",async()=>{
  let called=0,refunded=0;
  const deps={configured:false,reserve:async()=>({ok:false as const,error:"limit",code:"LIMIT"}),refund:async()=>{refunded++;},request:async()=>{called++;}};
  await assert.rejects(()=>generateHouse("Дом с гостиной и спальней",deps));
  await assert.rejects(()=>generateHouse("Дом с гостиной и спальней",{...deps,configured:true}));
  assert.equal(called,0);assert.equal(refunded,0);
});

test("text schema uses the provider-specific official envelope",async()=>{
  const schema={type:"object",properties:{rooms:{type:"array",items:{type:"string"}}},required:["rooms"],additionalProperties:false};
  for(const provider of [primaryTextProvider(textEnv)!,primaryTextProvider({OPENAI_API_KEY:"test-key"})!]){
    const transport=(async(_url,init)=>{const format=JSON.parse(String(init?.body)).response_format;
      assert.equal(format.type,"json_schema");assert.deepEqual(provider.kind==="cloudflare"?format.json_schema:format.json_schema.schema,schema);
      return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:'{"rooms":[]}'}}]}),{headers:{"content-type":"application/json"}});
    }) as typeof fetch;
    assert.deepEqual(await requestTextJSON(provider,"JSON","Rooms",{transport,jsonSchema:schema}),{rooms:[]});
  }
});

test("text AI selects Cloudflare only without existing text credentials or by explicit selection",()=>{
  const cf=primaryTextProvider(textEnv)!;assert.equal(cf.kind,"cloudflare");assert.equal(cf.model,CLOUDFLARE_TEXT_MODEL);
  assert.equal(new URL(cf.baseURL!).hostname,"api.cloudflare.com");
  const legacy=primaryTextProvider({...textEnv,GROQ_API_KEY:"test-groq-token"})!;assert.equal(legacy.kind,"compatible");assert.equal(legacy.apiKey,"test-groq-token");
  assert.equal(primaryTextProvider({...textEnv,AI_TEXT_PROVIDER:"cloudflare",OPENAI_API_KEY:"test-openai-token",OPENAI_BASE_URL:"https://other.invalid"})!.baseURL,cf.baseURL);
  assert.equal(primaryTextProvider({...textEnv,AI_TEXT_PROVIDER:"disabled"}),null);
  assert.equal(primaryTextProvider({...textEnv,CLOUDFLARE_ACCOUNT_ID:undefined}),null);
  assert.throws(()=>primaryTextProvider({...textEnv,CLOUDFLARE_ACCOUNT_ID:"../other"}));
});

test("Cloudflare text request carries JSON mode, output budget and intended credentials",async()=>{
  let calls=0;
  const transport=(async(url,init)=>{calls++;assert.equal(String(url),`https://api.cloudflare.com/client/v4/accounts/${textEnv.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`);
    const headers=new Headers(init?.headers);assert.equal(headers.get("authorization"),"Bearer test-cloudflare-token");
    const body=JSON.parse(String(init?.body));assert.equal(body.max_tokens,1024);assert.equal(body.response_format.type,"json_object");assert.equal(body.messages[1].content,"Public test object");
    return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:'{"parts":[]}'}}]}),{headers:{"content-type":"application/json"}});
  }) as typeof fetch;
  assert.deepEqual(await requestTextJSON(primaryTextProvider(textEnv)!,"Return JSON","Public test object",{transport,maxTokens:1024}),{parts:[]});assert.equal(calls,1);
});

test("text AI rejects truncated, empty and malformed output and does not retry provider limits",async()=>{
  const config=primaryTextProvider(textEnv)!;
  for(const choice of [{finish_reason:"length",message:{content:'{"partial":true}'}},{finish_reason:"stop",message:{content:""}},{finish_reason:"stop",message:{content:"not JSON"}}]){
    await assert.rejects(requestTextJSON(config,"JSON","Test",{transport:(async()=>new Response(JSON.stringify({choices:[choice]}),{headers:{"content-type":"application/json"}})) as typeof fetch}));
  }
  let calls=0;await assert.rejects(requestTextJSON(config,"JSON","Test",{transport:(async()=>{calls++;return new Response('{"error":{"message":"busy"}}',{status:429,headers:{"content-type":"application/json"}});}) as typeof fetch}));assert.equal(calls,1);
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
