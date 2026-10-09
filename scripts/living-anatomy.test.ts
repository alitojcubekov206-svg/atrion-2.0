import test from "node:test";
import assert from "node:assert/strict";
import {Box3,AnimationMixer,Vector3} from "three";
import {buildFromPrompt} from "../src/backend/procedural-3d";
import {buildConceptScene} from "../src/frontend/export-3d";
import {disposeDetailed} from "../src/shared/interior/detailed";
import {attachLivingMotion} from "../src/shared/living/motion";
import {partsBounds} from "../src/shared/geometry";
import {animalSpecies} from "../src/backend/gen/living-anatomy";

test("adult anatomy has a readable head, tapered torso and connected paired limbs at the requested height",()=>{
  const model=buildFromPrompt("Создай человека ростом 1.8 метра"),head=model.parts.find(p=>p.name==="Голова")!;
  assert(head.size[1]/model.dimensions.height>.11&&head.size[1]/model.dimensions.height<.16);
  assert(Math.abs(model.dimensions.height-1.8)<.01);assert.equal(model.parts.filter(p=>p.name==="Бедро").length,2);
  assert.equal(model.parts.filter(p=>p.name==="Плечо").length,2);assert(model.parts.find(p=>p.name==="Туловище")!.mesh);
  assert(!model.parts.some(p=>p.name==="Морда"));assert.equal(model.parts.filter(p=>p.name==="Ухо").length,2);
  for(const p of model.parts.filter(p=>p.mesh)) {
    const mesh=p.mesh!,vertices=mesh.position.length/3;assert(mesh.position.every(Number.isFinite));assert(mesh.index!.every(i=>i>=0&&i<vertices));
    // Every closed loft has a positive signed volume and no zero-area triangles.
    let volume=0;for(let i=0;i<mesh.index!.length;i+=3){const points=mesh.index!.slice(i,i+3).map(id=>new Vector3().fromArray(mesh.position,id*3));const a=points[0],b=points[1],c=points[2];assert(b.clone().sub(a).cross(c.clone().sub(a)).length()>1e-10);volume+=a.dot(b.clone().cross(c))/6;}assert(volume>0,p.name);
    for(let axis=0;axis<3;axis++){const v=mesh.position.filter((_,i)=>i%3===axis);assert(Math.abs(Math.max(...v)+Math.min(...v))<1e-8);assert(Math.abs(Math.max(...v)-Math.min(...v)-p.size[axis])<1e-8);}
  }
  const root=buildConceptScene(model);try{assert(Math.abs(new Box3().setFromObject(root).min.y)<.002);}finally{disposeDetailed(root);}
});
test("cat, dog, horse and rabbit have distinct silhouettes and species-specific facial/foot anatomy",()=>{
  const cat=buildFromPrompt("Кот"),dog=buildFromPrompt("Собака"),horse=buildFromPrompt("Лошадь"),rabbit=buildFromPrompt("Кролик");
  assert.equal(cat.category,"animal");assert(cat.parts.some(p=>p.name==="Ус"));assert(!dog.parts.some(p=>p.name==="Ус"));
  assert(horse.parts.some(p=>p.name==="Копыто"));assert(!cat.parts.some(p=>p.name==="Копыто"));
  const rabbitEar=rabbit.parts.find(p=>p.name==="Ухо")!,catEar=cat.parts.find(p=>p.name==="Ухо")!;
  assert(rabbitEar.size[1]/rabbit.dimensions.height>catEar.size[1]/cat.dimensions.height*1.4);
  assert(horse.dimensions.height>dog.dimensions.height*2);assert(dog.parts.find(p=>p.name==="Морда")!.size[2]>cat.parts.find(p=>p.name==="Морда")!.size[2]);
  for(const model of [cat,dog,horse,rabbit]) {
    assert.equal(model.parts.filter(p=>p.name==="Бедро").length,4);
    const body=partsBounds(model.parts.filter(p=>p.name==="Туловище"));
    for(const thigh of model.parts.filter(p=>p.name==="Бедро"))assert(partsBounds([thigh]).max[1]>body.min[1]+model.dimensions.height*.1,"Thigh must enter the torso, not end below it");
    for(const p of model.parts.filter(p=>p.mesh))for(let axis=0;axis<3;axis++){const v=p.mesh!.position.filter((_,i)=>i%3===axis);assert(Math.abs(Math.max(...v)-Math.min(...v)-p.size[axis])<1e-8);}
  }
  assert(cat.parts.filter(p=>p.name==="Ус").every(p=>p.size[1]<.004),"Whiskers must not turn into 1 cm plates");
  assert.equal(animalSpecies("коттедж, который стоит"),"generic");
  assert(!buildFromPrompt("Кот без хвоста").parts.some(p=>p.group==="Хвост"));
  assert(!buildFromPrompt("Человек без волос").parts.some(p=>p.group==="Волосы"));
});
test("articulated walk bends knees, preserves rest placement and loops across multiple actors",()=>{
  for(const prompt of ["Человек","Кот","Лошадь","Два человека"]){
    const model=buildFromPrompt(prompt),root=buildConceptScene(model),before=new Box3().setFromObject(root),clips=attachLivingMotion(root,model),mixer=new AnimationMixer(root);
    try {
      const after=new Box3().setFromObject(root);assert(before.min.distanceTo(after.min)<1e-6&&before.max.distanceTo(after.max)<1e-6);
      const knees: typeof root[]=[];root.traverse(o=>{if(o.name.startsWith("Atrion_knee"))knees.push(o as typeof root);});assert(knees.length>=2);
      mixer.clipAction(clips[1]).play();mixer.setTime(.3);assert(knees.some(k=>Math.abs(k.quaternion.x)>.05));
      mixer.setTime(clips[1].duration);assert(knees.every(k=>Math.abs(k.quaternion.x)<1e-5));
      assert(Math.abs(partsBounds(model.parts).min[1])<.002);
    }finally{mixer.stopAllAction();mixer.uncacheRoot(root);disposeDetailed(root);}
  }
});
