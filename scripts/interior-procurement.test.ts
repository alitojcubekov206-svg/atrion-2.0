import test from "node:test";
import assert from "node:assert/strict";
import {partsProcurement, roomProcurement, procurementCsv, modelProcurement} from "../src/shared/procurement";
import {newScene} from "../src/shared/interior/scene";
import {resolveDesignBrief} from "../src/backend/design/brief";
import {buildBriefModel} from "../src/backend/design/brief-model";
import type {ModelPart} from "../src/shared/types";
const part: ModelPart = {id: "window", name: "Окно", shape: "box", size: [1,2,.1], position: [0,1,0], rotation: [0,0,0], color: "#ffffff", material: "Стекло", quantity: 40};
test("procurement matches repeated and mirrored geometry without double counting descriptive quantity", () => {
  const value = partsProcurement([{...part, repeat: {count: 3, step: [2,0,0]}, mirror: "xz"}, {...part,id: "another"}, {...part,id: "different",size:[2,2,.1]}]);
  assert.equal(value.items.length, 2);
  assert.equal(value.items.find(i=>i.size?.[0]===1)?.quantity,13);
  assert.equal(value.items.find(i=>i.size?.[0]===2)?.quantity,1);
});
test("room procurement counts furniture as whole purchases and updates after scale/removal", () => {
  const scene = newScene(); scene.objects = [0,1].map(i=>({id:`chair_${i}`,assetId:"chair_simple",position:{x:1+i,y:0,z:1},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},color:"#ffffff",locked:false}));
  const list = roomProcurement(scene).items;
  assert.equal(list.find(i=>i.name==="Стул")?.quantity,2);
  assert.equal(list.find(i=>i.name==="Напольное покрытие")?.quantity,scene.width*scene.length);
  scene.objects[0].scale.x=2;
  assert.equal(roomProcurement(scene).items.filter(i=>i.name==="Стул").length,2);
  scene.objects=[]; assert(!roomProcurement(scene).items.some(i=>i.name==="Стул"));
});
test("house procurement uses whole furniture and CSV protects spreadsheet formulas", () => {
  const brief=resolveDesignBrief("Дом, реши сам",[]); assert.equal(brief.kind,"ready"); if(brief.kind!=="ready")throw Error("ready");
  const list=modelProcurement(buildBriefModel(brief)); assert(list.items.some(i=>i.name==="Двуспальная кровать"));
  const csv=procurementCsv({items:[{name:'=SUM(1;2) "окно"',material:"",color:"",size:null,quantity:1,unit:"шт"}],note:""});
  assert(csv.startsWith("\uFEFF")); assert(csv.includes('"\'=SUM(1;2) ""окно"""'));
});
