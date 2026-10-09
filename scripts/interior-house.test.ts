import test from "node:test";
import assert from "node:assert/strict";
import {Box3,Vector3,Mesh} from "three";
import {buildBriefModel} from "../src/backend/design/brief-model";
import {resolveDesignBrief} from "../src/backend/design/brief";
import {layoutIssues,parseScene} from "../src/shared/interior/scene";
import {buildFurnishedHouse} from "../src/frontend/house-model";
import {disposeDetailed} from "../src/shared/interior/detailed";
import {detailedGlb} from "../src/backend/interior/detailed-glb";
import type {ReadyBrief} from "../src/shared/design/brief";

function make(prompt="Дом, 2 этажа, 12×9 м, две спальни, кухня-гостиная, санузел и прихожая") {
  const brief=resolveDesignBrief(prompt);assert.equal(brief.kind,"ready");return buildBriefModel(brief as ReadyBrief);
}
test("every named house room has usable furniture on its own floor",()=>{
  const result=make();assert.equal(result.interiors!.length,5);
  for(const r of result.interiors!) {
    assert(r.scene.objects.length>0,r.name);assert.deepEqual(layoutIssues(parseScene(r.scene)),[],r.name);
    const ids=r.scene.objects.map(o=>o.assetId);
    if(/Спальня/.test(r.name))assert(ids.includes("bed_double")&&ids.includes("wardrobe_double"));
    if(/Кухня/.test(r.name))for(const id of ["kitchen_run","fridge_tall","sofa_compact"])assert(ids.includes(id),id);
    if(/Санузел/.test(r.name))for(const id of ["shower_square","toilet_compact","vanity_sink"])assert(ids.includes(id),id);
    const fi=result.document!.floors.findIndex(f=>f.id===r.floorId);
    assert.equal(r.origin[1],fi*3+.22);
  }
  const allIds=result.concept.parts.map(p=>p.id);assert.equal(new Set(allIds).size,allIds.length);
});
test("internal door gaps are reserved in both adjacent room interiors",()=>{
  const result=make();
  for(const floor of result.document!.floors)for(const opening of floor.openings.filter(o=>o.kind==="door"&&o.id!=="entry")) {
    const rooms=result.interiors!.filter(r=>r.floorId===floor.id&&r.scene.openings.some(o=>o.id===opening.id));
    assert.equal(rooms.length,2,`${floor.id}/${opening.id}`);
  }
});
test("unfurnished requests stay empty and styles affect the proposed interiors",()=>{
  const empty=make("Дом, один этаж, 12×9 м, спальня и кухня, без мебели");
  assert(empty.interiors!.every(r=>r.scene.objects.length===0));assert(!empty.concept.parts.some(p=>p.role==="furniture"));
  const loft=make("Дом, один этаж, 12×9 м, спальня и кухня. Стиль лофт");
  assert(loft.interiors!.every(r=>r.scene.style==="loft"));
});
test("room-specific requests keep counts and colours without leaking into neighbouring rooms",()=>{
  const result=make("Дом, один этаж, 12×9 м. Спальня с двумя тумбами, без шкафа. Гостиная с красным диваном.");
  const bedroom=result.interiors!.find(r=>r.purpose==="Спальня")!,living=result.interiors!.find(r=>r.purpose==="Гостиная")!;
  assert(!bedroom.scene.objects.some(o=>o.assetId==="sofa_compact"||o.assetId==="wardrobe_double"));
  assert.equal(bedroom.scene.objects.filter(o=>o.assetId==="decor_cube").length,2);
  assert(living.scene.objects.some(o=>o.assetId==="sofa_compact"&&o.color==="#b94339"));
  assert(!living.scene.objects.some(o=>o.assetId==="bed_double"));
});
test("unnamed rooms receive a disclosed purpose, cramped rooms report omitted furnishings",()=>{
  const generic=make("Дом, один этаж, 12×9 м, 3 комнаты");
  assert(generic.interiors!.every(r=>r.scene.objects.length>0));assert(generic.missing.some(x=>/Назначение не задано/.test(x)));
  const cramped=make("Дом, один этаж, 3×3 м, спальня и санузел");
  assert(cramped.missing.length>0);assert(cramped.missing.some(x=>/не размещена|Не поместился/.test(x)));
});
test("detailed furniture remains within collision bounds and the selected floor omits roof and other floors",()=>{
  const result=make(),root=buildFurnishedHouse(result,{floor:1});
  let furniture=0;root.traverse(n=>{if(n.userData.objectId){furniture++;const owner=result.interiors!.flatMap(r=>r.scene.objects.map(o=>({r,o}))).find(x=>x.o.id===n.userData.objectId)!;
    const bounds=new Box3().setFromObject(n);assert(bounds.min.y>=.219);assert(bounds.max.y<3);
    assert(bounds.min.x>=owner.r.origin[0]-.001);assert(bounds.max.x<=owner.r.origin[0]+owner.r.scene.width+.001);
    assert(bounds.min.z>=owner.r.origin[2]-.001);assert(bounds.max.z<=owner.r.origin[2]+owner.r.scene.length+.001);
  }if(n instanceof Mesh)assert.notEqual(n.userData.role,"roof");});
  assert.equal(furniture,result.interiors!.filter(r=>r.floorId==="floor_2").reduce((n,r)=>n+r.scene.objects.length,0));
  assert(new Box3().setFromObject(root).getSize(new Vector3()).y<3);disposeDetailed(root);
});
test("full house GLB includes detailed furniture, windows and all floors",async()=>{
  const result=make(),root=buildFurnishedHouse(result);
  const glb=Buffer.from(await detailedGlb(root));const n=glb.readUInt32LE(12),json=JSON.parse(glb.subarray(20,20+n).toString());
  assert.equal(glb.readUInt32LE(8),glb.length);
  assert(json.meshes.length>result.concept.parts.filter(p=>p.role!=="furniture").length+100);
  assert(json.images.length>0);assert(json.materials.some((m:{alphaMode?:string})=>m.alphaMode==="BLEND"));
  for(const view of json.bufferViews)assert(view.byteOffset+view.byteLength<=json.buffers[0].byteLength);
  disposeDetailed(root);
});
