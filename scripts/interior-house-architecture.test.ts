import test from "node:test";
import assert from "node:assert/strict";
import {resolveDesignBrief} from "../src/backend/design/brief";
import {buildBriefModel} from "../src/backend/design/brief-model";
import {buildHouse,parseHouse,type HouseDocument} from "../src/shared/house/document";
import {checkGeneratedHouse} from "../src/backend/design/house-generation";
import {modelProcurement} from "../src/shared/procurement";
import {buildFurnishedHouse} from "../src/frontend/house-model";
import {disposeDetailed} from "../src/shared/interior/detailed";
import {Box3,Vector3,Mesh} from "three";
import {layoutIssues} from "../src/shared/interior/scene";
import {exteriorRoomSides,footprintRects} from "../src/shared/house/footprint";

const program="12×9 м, 3 этажа, прихожая, кухня, гостиная, кабинет, две спальни, два санузла, детская";
function model(prompt: string, variant="") {
  const brief=resolveDesignBrief(prompt);assert.equal(brief.kind,"ready");if(brief.kind!=="ready")throw Error("ready");
  return buildBriefModel(brief,variant);
}
function exterior(doc:HouseDocument,floor:HouseDocument["floors"][number],o:HouseDocument["floors"][number]["openings"][number]) {
  const r=floor.rooms.find(r=>r.id===o.roomId)!;
  return o.side==="north"?r.z===0:o.side==="south"?Math.abs(r.z+r.depth-doc.depth)<1e-6:o.side==="west"?r.x===0:Math.abs(r.x+r.width-doc.width)<1e-6;
}
test("three-storey house has one real entrance, internal doors and visible windows on every facade",()=>{
  const result=model(`Дом ${program}, скандинавский стиль`),doc=parseHouse(result.document);
  assert.deepEqual(checkGeneratedHouse(doc),[]);
  const entries=doc.floors.flatMap((f,i)=>f.openings.filter(o=>o.kind==="door"&&exterior(doc,f,o)).map(o=>({i,o})));
  assert.equal(entries.length,1);assert.equal(entries[0].i,0);
  for(const f of doc.floors)for(const side of ["north","south","west","east"])
    assert(f.openings.some(o=>o.kind==="window"&&o.side===side&&exterior(doc,f,o)),`${f.id}/${side}`);
  const openings=doc.floors.flatMap(f=>f.openings);
  assert.equal(result.concept.parts.filter(p=>p.role==="door").length,openings.filter(o=>o.kind==="door").length);
  assert.equal(result.concept.parts.filter(p=>p.role==="window").length,openings.filter(o=>o.kind==="window").length);
  assert(result.concept.parts.some(p=>p.name==="Входная площадка"));
  for(const r of result.interiors!)assert.deepEqual(layoutIssues(r.scene),[],r.name);
});
test("window glass occupies real wall apertures and frame/door identifiers never collide",()=>{
  const result=model(`Современный дом ${program}, панорамные окна`),doc=result.document!,wallParts=buildHouse(doc).parts.filter(p=>p.role==="wall");
  for(const [fi,f] of doc.floors.entries())for(const o of f.openings) {
    const r=f.rooms.find(r=>r.id===o.roomId)!,horizontal=o.side==="north"||o.side==="south";
    const c=(horizontal?r.x:r.z)+o.offset+o.width/2;
    let line=horizontal?r.z+(o.side==="south"?r.depth:0):r.x+(o.side==="east"?r.width:0);
    const span=horizontal?doc.depth:doc.width;
    if(line===0)line=doc.wallThickness/2;else if(Math.abs(line-span)<1e-6)line=span-doc.wallThickness/2;
    const y=fi*(doc.floorHeight+.2)+o.bottom+o.height/2;
    const point=horizontal?[c-doc.width/2,y,line-doc.depth/2]:[line-doc.width/2,y,c-doc.depth/2];
    assert(!wallParts.some(p=>point.every((n,i)=>Math.abs(n-p.position[i])<p.size[i]/2-1e-6)),o.id);
  }
  const ids=result.concept.parts.map(p=>p.id);assert.equal(new Set(ids).size,ids.length);
});
test("all five requested roofs produce different geometry and preserve the room program",()=>{
  const roofs=[['плоская','flat'],['двускатная','gable'],['вальмовая','hip'],['односкатная','shed'],['мансардная','mansard']] as const;
  const fingerprints=new Set<string>();
  for(const [name,kind] of roofs) {
    const result=model(`Дом ${program}, ${name} крыша`),doc=result.document!;
    assert.equal(doc.roof,kind);assert.equal(doc.floors.flatMap(f=>f.rooms).length,9);assert.deepEqual(checkGeneratedHouse(doc),[]);
    const roof=result.concept.parts.filter(p=>p.role==="roof");fingerprints.add(JSON.stringify(roof.map(p=>[p.shape,p.size,p.mesh?.position])));
    for(const p of result.concept.parts)assert(p.size.every(n=>n>0&&Number.isFinite(n)));
    for(const p of roof.filter(p=>p.mesh)) {
      const v=p.mesh!.position;let upward=false;
      for(let i=0;i<v.length;i+=9){const ux=v[i+3]-v[i],uz=v[i+5]-v[i+2],vx=v[i+6]-v[i],vz=v[i+8]-v[i+2];if(uz*vx-ux*vz>0)upward=true;}
      assert(upward,"roof must have outward/upward faces");
    }
  }
  assert.equal(fingerprints.size,5);
});
test("style, glazing and scoped colours affect geometry without changing explicit requirements",()=>{
  const modern=model(`Белый современный дом ${program}, плоская крыша, панорамные окна, красная крыша, зелёная дверь`);
  assert.equal(modern.document!.wallColor,"#eeeae2");assert.equal(modern.document!.architecture!.roofColor,"#c1462f");assert.equal(modern.document!.architecture!.doorColor,"#3f8a5b");
  const chalet=model(`Деревянный дом ${program}, двускатная крыша, маленькие окна`);
  assert.equal(chalet.document!.architecture!.style,"chalet");
  assert(chalet.concept.parts.some(p=>p.name==="Шов деревянной обшивки"));
  assert(modern.document!.floors[0].openings.filter(o=>o.kind==="window").some(o=>o.width>2&&o.height>2));
  assert(chalet.document!.floors.flatMap(f=>f.openings).filter(o=>o.kind==="window").every(o=>o.width<=.8&&o.height<=1));
});
test("fresh variations change unspecified architecture but retain explicit roof, size, rooms and colours",()=>{
  const automatic=new Set<string>();
  for(let i=0;i<12;i++){
    const result=model(`Дом ${program}`,`variant-${i}`);automatic.add(result.document!.architecture!.style);
    assert.equal(result.document!.width,12);assert.equal(result.document!.floors.length,3);
    const explicit=model(`Белый современный дом ${program}, вальмовая крыша`,String(i));
    assert.equal(explicit.document!.roof,"hip");assert.equal(explicit.document!.architecture!.style,"modern");assert.equal(explicit.document!.wallColor,"#eeeae2");
  }
  assert(automatic.size>=2);
});
test("window dimensions do not overwrite the house footprint; later roof and facade answers win",()=>{
  const result=model("Дом, окна 1.8×1.6 м, 12×9 м, один этаж, спальня и гостиная, двускатная крыша");
  assert.equal(result.document!.width,12);assert.equal(result.document!.depth,9);
  assert(result.document!.floors[0].openings.filter(o=>o.kind==="window").some(o=>o.width===1.8&&o.height===1.6));
  const brief=resolveDesignBrief(`Белый дом ${program}, двускатная крыша`,[{questionId:"roof",answer:"Вальмовая крыша, синий фасад"}]);
  assert.equal(brief.kind,"ready");if(brief.kind!=="ready")throw Error("ready");
  const changed=buildBriefModel(brief,"another");assert.equal(changed.document!.roof,"hip");assert.equal(changed.document!.wallColor,"#2f5fb0");
});
test("procurement counts entire door/window blocks once and cutaways omit upper roof and entrance canopy",()=>{
  const result=model(`Классический дом ${program}, мансардная крыша`),doc=result.document!,list=modelProcurement(result).items;
  for(const [kind,name] of [["window","Оконный блок"],["door","Дверной блок"]]) {
    assert.equal(list.filter(i=>i.name===name).reduce((n,i)=>n+i.quantity,0),doc.floors.flatMap(f=>f.openings).filter(o=>o.kind===kind).length);
  }
  assert(!list.some(i=>/Филёнка|Переплёт|Шов |Рама окна|Ручка двери/.test(i.name)));
  const floor=buildFurnishedHouse(result,{floor:0});
  const structure=new Box3();floor.traverse(n=>{if(n instanceof Mesh&&n.userData.role)structure.union(new Box3().setFromObject(n));});
  assert(structure.getSize(new Vector3()).y<1.3);disposeDetailed(floor);
});
test("L-shaped house changes the actual footprint, floors, windows and roof without dropping rooms",()=>{
  const result=model(`Г-образный современный дом ${program}, плоская крыша, панорамные окна`),doc=parseHouse(result.document);
  assert.equal(doc.footprint,"l-shaped");assert.deepEqual(checkGeneratedHouse(doc),[]);
  const expectedArea=footprintRects(doc).reduce((n,r)=>n+r.width*r.depth,0);
  for(const f of doc.floors){
    assert(Math.abs(f.rooms.reduce((n,r)=>n+r.width*r.depth,0)-expectedArea)<1e-6);
    assert(f.openings.some(o=>o.kind==="window"&&exteriorRoomSides(doc,f.rooms.find(r=>r.id===o.roomId)!).some(s=>s.side===o.side)));
  }
  assert.equal(doc.floors.flatMap(f=>f.rooms).length,9);
  // The cut-out corner is genuinely empty at every floor and above the eaves.
  const point=[doc.width*.9-doc.width/2,doc.depth*.9-doc.depth/2];
  assert(!result.concept.parts.filter(p=>["foundation","roof"].includes(p.role??"")).some(p=>Math.abs(point[0]-p.position[0])<p.size[0]/2&&Math.abs(point[1]-p.position[2])<p.size[2]/2));
  for(const r of result.interiors!)assert.deepEqual(layoutIssues(r.scene),[],r.name);
  const invalid=structuredClone(doc);invalid.floors[0].rooms[0]={...invalid.floors[0].rooms[0],x:doc.width*.7,z:doc.depth*.7,width:2,depth:2};assert.throws(()=>parseHouse(invalid));
  const few=resolveDesignBrief("Г-образный дом 12×9 м, два этажа, две комнаты");assert.equal(few.kind,"clarification");
});
