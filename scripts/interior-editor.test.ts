import test from "node:test";
import assert from "node:assert/strict";
import {Group,Mesh} from "three";
import {syncInteriorObjects} from "../src/frontend/interior-render-sync";
import {templateScene} from "../src/shared/interior/templates";
import {removeModelPart} from "../src/shared/design/edit-model";
import {generateLocalModel} from "../src/backend/design/local-model";
import {modelProcurement} from "../src/shared/procurement";
import {modelFromPlan,emptyPlan} from "../src/shared/house/from-plan";
import {editHouseRoom} from "../src/shared/house/edit";
import {parsePhotoPlan} from "../src/backend/design/photo-plan";
import {readPlanBytes} from "../src/backend/interior/plan-upload";
import {disposeDetailed} from "../src/shared/interior/detailed";

test("moving furniture preserves geometry and updates the exact world position",()=>{
  const root=new Group(),object=templateScene("living").objects[0];
  syncInteriorObjects(root,[{object,offset:[2,.22,3]}]);
  const holder=root.children[0],meshes:Mesh[]=[];holder.traverse(n=>{if(n instanceof Mesh)meshes.push(n);});
  const geometry=meshes.map(n=>n.geometry),material=meshes.map(n=>n.material);
  syncInteriorObjects(root,[{object:{...object,position:{x:4,y:0,z:5}},offset:[2,.22,3]}]);
  assert.equal(root.children[0],holder);assert.deepEqual(holder.position.toArray(),[6,.22,8]);
  assert.deepEqual(meshes.map(n=>n.geometry),geometry);assert.deepEqual(meshes.map(n=>n.material),material);
  let disposed=false;geometry[0].addEventListener("dispose",()=>{disposed=true;});
  syncInteriorObjects(root,[]);assert.equal(root.children.length,0);assert.equal(disposed,true);
});
test("deleting one furniture item does not dispose another item's materials",()=>{
  const root=new Group(),base=templateScene("living").objects[0],other={...base,id:"other"};
  syncInteriorObjects(root,[base,other].map(object=>({object,offset:[0,0,0]})));
  let disposed=false;root.children[1].traverse(n=>{if(n instanceof Mesh)n.geometry.addEventListener("dispose",()=>{disposed=true;});});
  syncInteriorObjects(root,[{object:other,offset:[0,0,0]}]);assert.equal(disposed,false);assert.equal(root.children.length,1);disposeDetailed(root);
});
test("deleting a model part updates geometry, quantities and leaves history input intact",()=>{
  const result=generateLocalModel("Создай ракету"),id=result.concept.parts[0].id;
  const next=removeModelPart(result,id);assert.equal(next.concept.parts.length,result.concept.parts.length-1);
  assert(!next.concept.parts.some(p=>p.id===id));assert(result.concept.parts.some(p=>p.id===id));
  assert(modelProcurement(next).items.reduce((n,i)=>n+i.quantity,0)<modelProcurement(result).items.reduce((n,i)=>n+i.quantity,0));
  assert.throws(()=>removeModelPart(result,"missing"));
});
function fixture(){const doc=emptyPlan();doc.width=8;doc.depth=6;doc.floors[0].rooms=[{id:"left",name:"Кабинет",x:0,z:0,width:4,depth:6},{id:"right",name:"Спальня",x:4,z:0,width:4,depth:6}];doc.floors[0].openings=[
  {id:"entry",roomId:"left",side:"south",kind:"door",offset:1,width:.9,bottom:0,height:2.1},
  {id:"between",roomId:"left",side:"east",kind:"door",offset:2,width:.9,bottom:0,height:2.1},
  {id:"glass",roomId:"right",side:"north",kind:"window",offset:1,width:1.2,bottom:.9,height:1.2}];return doc;}
test("a reviewed plan preserves room coordinates, real doors and windows in 3D",()=>{
  const doc=fixture(),result=modelFromPlan(doc);assert.deepEqual(result.document,doc);
  assert.equal(result.interiors?.length,2);assert(result.interiors?.every(r=>r.scene.objects.length===0));
  assert(result.concept.parts.some(p=>p.role==="door"));assert(result.concept.parts.some(p=>p.role==="window"));
  assert.equal(modelProcurement(result).items.filter(i=>i.name==="Дверной блок").reduce((n,i)=>n+i.quantity,0),2);
  assert.equal(modelProcurement(result).items.filter(i=>i.name==="Оконный блок").reduce((n,i)=>n+i.quantity,0),1);
});
test("add, move, remove and undo snapshots keep plan procurement consistent",()=>{
  const result=modelFromPlan(fixture()),room=result.interiors![0];
  const added=editHouseRoom(result,room.floorId,room.roomId,[{type:"ADD_OBJECT",id:"chair",assetId:"chair_simple"}]);
  const chair=added.interiors![0].scene.objects[0];
  const moved=editHouseRoom(added,room.floorId,room.roomId,[{type:"MOVE_OBJECT",objectId:"chair",position:{...chair.position,x:chair.position.x+.01}}]);
  assert.deepEqual(modelProcurement(moved),modelProcurement(added));
  const removed=editHouseRoom(moved,room.floorId,room.roomId,[{type:"REMOVE_OBJECT",objectId:"chair"}]);
  assert.deepEqual(modelProcurement(removed),modelProcurement(result));assert.equal(added.interiors![0].scene.objects.length,1);
});
test("unknown image dimensions or overlapping rooms never become a made-up template",()=>{
  const doc=fixture();assert.throws(()=>parsePhotoPlan({...doc,width:null}));doc.floors[0].rooms[1].x=3;
  assert.throws(()=>parsePhotoPlan(doc));assert.throws(()=>modelFromPlan(doc));
});
test("plan upload enforces direct-request stream limits without Content-Length",async()=>{
  const bytes=new Uint8Array(32);bytes.set([137,80,78,71,13,10,26,10]);
  const req=new Request("https://atrion.test/api/design/plan",{method:"POST",headers:{"Content-Type":"image/png"},body:bytes});
  await assert.rejects(()=>readPlanBytes(req,16),/размера/);
});
