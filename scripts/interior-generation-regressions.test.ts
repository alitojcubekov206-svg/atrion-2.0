import test from "node:test";
import assert from "node:assert/strict";
import {planFor,buildFromPrompt} from "../src/backend/procedural-3d";
import {partsBounds} from "../src/shared/geometry";
import {newScene,parseScene} from "../src/shared/interior/scene";
import {sceneParts} from "../src/shared/interior/geometry";
import {detailedScene,disposeDetailed} from "../src/shared/interior/detailed";
import {generationPlan} from "../src/backend/generation-request";
import {designWithPlanner} from "../src/shared/interior/engine";

test("office inventory follows labelled counts and later edits preserve other furniture",async()=>{
  const scene=parseScene({...newScene(),width:6,length:5,objects:[]});
  const result=await designWithPlanner(scene,"Создай офис, минимализм, два рабочих стола, два стула и книжный стеллаж. Реши сам",false,0);
  assert.equal(result.scene.objects.filter(o=>o.assetId==="desk_work").length,2);
  assert.equal(result.scene.objects.filter(o=>o.assetId==="chair_simple").length,2);
  assert.equal(result.scene.objects.filter(o=>o.assetId==="bookcase_open").length,1);
  const edited=await designWithPlanner(result.scene,"Перекрась все стулья в чёрный",true,0);
  assert.deepEqual(edited.scene.objects.filter(o=>o.assetId!=="chair_simple"),result.scene.objects.filter(o=>o.assetId!=="chair_simple"));
  assert(edited.scene.objects.filter(o=>o.assetId==="chair_simple").every(o=>o.color==="#252529"));
});

test("a later labelled answer replaces an earlier overall size without rescaling it again",()=>{
  const blueprint=generationPlan("Кот 3 метра",[{question:"Какой высоты?",answer:"0.9 м"}]).blueprint;
  assert.equal(blueprint.height,.9);
  assert.equal(blueprint.params.size,undefined);
});

test("negation stops at a sentence boundary without splitting decimal measurements",()=>{
  const b=planFor("Дом 12.5×9.2 м без гаража. Плоская крыша с окнами.").blueprint;
  assert.equal(b.width,12.5);assert.equal(b.length,9.2);assert.equal(b.roof,"flat");assert.equal(b.garage,false);assert(b.windows>0);
  assert.equal(planFor("Дом без крыши. Гараж с дверью").blueprint.roof,"none");
});
test("launch vehicle has a full-width nose, radial stabilizers and an engine within its stated height",()=>{
  const concept=buildFromPrompt("Создай ракету высотой 30 м, ширина 4 м, длина 4 м", "rocket-check");
  const nose=concept.parts.find(p=>p.role==="nose")!,body=concept.parts.find(p=>p.role==="volume")!;
  assert(nose&&body);assert.equal(nose.shape,"cone");assert(nose.size[0]>=body.size[0]*.95);assert(concept.parts.some(p=>p.role==="engine"));
  const fins=concept.parts.filter(p=>p.role==="fin");assert.equal(fins.length,4);
  assert(fins.some(p=>p.position[0]>1)&&fins.some(p=>p.position[0]<-1)&&fins.some(p=>p.position[2]>1)&&fins.some(p=>p.position[2]<-1));
  assert(!concept.parts.some(p=>/шпиль|плавник/i.test(p.name)));
  const bounds=partsBounds(concept.parts);assert(Math.abs(bounds.max[1]-bounds.min[1]-30)<1e-6);
  const boosted=buildFromPrompt("Трёхступенчатая ракета с двумя ускорителями");
  assert.equal(boosted.parts.filter(p=>p.role==="volume").length,3);assert.equal(boosted.parts.filter(p=>p.role==="booster"&&p.shape==="cylinder").length,2);
  assert(!buildFromPrompt("Самолёт").parts.some(p=>p.role==="nose"&&p.id.startsWith("rocket_")));
});
test("room doors occupy their wall opening once and remain visible in a cutaway on all four sides",()=>{
  for(const wall of ["north","south","east","west"] as const) {
    const scene=parseScene({...newScene(),openings:[{id:"entry",kind:"door",wall,offset:.2,width:.9,bottom:0,height:2.1}]});
    const parts=sceneParts(scene),doors=parts.filter(p=>p.role==="door");assert.equal(doors.length,1);assert.equal(new Set(parts.map(p=>p.id)).size,parts.length);
    assert(parts.some(p=>p.role==="door-frame"));assert(parts.some(p=>p.role==="door-hardware"));
    const leaf=doors[0];assert(Math.min(leaf.size[0],leaf.size[2])<.05);assert(leaf.position[1]-leaf.size[1]/2>=0);
    const horizontal=wall==="north"||wall==="south",span=horizontal?scene.width:scene.length;
    assert(Math.abs(leaf.position[horizontal?0:2]-(.2+.45-span/2))<1e-8);
    const model=detailedScene(scene),rendered=model.children.filter(n=>n.userData.role==="door");
    assert.equal(rendered.length,1);assert.equal(rendered[0].userData.wallSide,wall);assert.equal(rendered[0].userData.keepInCutaway,true);
    disposeDetailed(model);
  }
});
