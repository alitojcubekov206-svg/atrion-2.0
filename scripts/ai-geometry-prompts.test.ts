import test from "node:test";
import assert from "node:assert/strict";
import { generateAIGeometry, type JsonRequester } from "../src/backend/gen/ai-geometry";
import { buildFromPrompt, detectCategory } from "../src/backend/procedural-3d";

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
