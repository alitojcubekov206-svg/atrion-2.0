import test from "node:test";
import assert from "node:assert/strict";
import {AnimationMixer,Box3,Mesh,Vector3} from "three";
import {generateLocalModel} from "../src/backend/design/local-model";
import {resolveDesignBrief} from "../src/backend/design/brief";
import {buildBriefModel} from "../src/backend/design/brief-model";
import type {ReadyBrief} from "../src/shared/design/brief";
import {designPromptTarget} from "../src/shared/interior/request";
import {newScene,layoutIssues} from "../src/shared/interior/scene";
import {designWithPlanner} from "../src/shared/interior/engine";
import {editHouseRoom,transferHouseObject} from "../src/shared/house/edit";
import {editModelPart} from "../src/shared/design/edit-model";
import {buildConceptScene} from "../src/frontend/export-3d";
import {attachLivingMotion} from "../src/shared/living/motion";
import {disposeDetailed} from "../src/shared/interior/detailed";
import {modelProcurement} from "../src/shared/procurement";
import {compositionResult} from "../src/backend/design/local-ai";
import {buildComposition} from "../src/frontend/composition-model";

test("office prompts create a furnished interior and explicit building prompts remain models",async()=>{
  for(const prompt of ["Создай офис","Office","Интерьер офиса"]) {
    assert.equal(designPromptTarget(prompt),"interior");assert.equal(resolveDesignBrief(prompt).kind,"ready");
    const {scene}=await designWithPlanner(newScene(),prompt,false,0);
    assert.equal(scene.roomType,"office");assert.deepEqual(scene.objects.map(o=>o.assetId).sort(),["bookcase_open","chair_simple","desk_work","plant_pot"]);
    assert.deepEqual(layoutIssues(scene),[]);
  }
  assert.equal(designPromptTarget("Создай офисное здание"),"model");
  assert.equal((await designWithPlanner(newScene(),"Пустой офис",false,0)).scene.objects.length,0);
});

test("editing a repeated room ID changes only its floor, rebuilds quantities, and rejects invalid/locked moves atomically",()=>{
  const brief=resolveDesignBrief("Дом, 2 этажа, 12×9 м, две спальни, кухня, санузел и прихожая") as ReadyBrief;
  const original=buildBriefModel(brief),copy=structuredClone(original),room=original.interiors![3],item=room.scene.objects[0];
  assert(original.interiors!.some(r=>r!==room&&r.roomId===room.roomId));
  const recolored=editHouseRoom(original,room.floorId,room.roomId,[{type:"CHANGE_MATERIAL",objectId:item.id,color:"#ff0000"}]);
  assert.equal(recolored.interiors!.find(r=>r.floorId===room.floorId&&r.roomId===room.roomId)!.scene.objects[0].color,"#ff0000");
  assert(original.interiors!.filter(r=>r!==room).every(r=>recolored.interiors!.includes(r)));
  assert(recolored.concept.parts.filter(p=>p.parentId===item.id).some(p=>p.color==="#ff0000"));
  assert.throws(()=>editHouseRoom(original,room.floorId,room.roomId,[{type:"MOVE_OBJECT",objectId:item.id,position:{x:100,y:0,z:100}}]));
  const locked=editHouseRoom(original,room.floorId,room.roomId,[{type:"LOCK_OBJECT",objectId:item.id,locked:true}]);
  assert.throws(()=>editHouseRoom(locked,room.floorId,room.roomId,[{type:"MOVE_OBJECT",objectId:item.id,position:item.position}]),/закреплён/);
  const deleted=editHouseRoom(original,room.floorId,room.roomId,[{type:"REMOVE_OBJECT",objectId:item.id}]);
  assert(!deleted.concept.parts.some(p=>p.parentId===item.id));
  const count=(r:typeof original)=>modelProcurement(r).items.filter(i=>i.material==="Уточнить у поставщика").reduce((n,i)=>n+i.quantity,0);
  assert.equal(count(original)-count(deleted),1);assert.deepEqual(original,copy);
  const plantRoom=original.interiors!.find(r=>r.scene.objects.some(o=>o.assetId==="plant_pot"))!,plant=plantRoom.scene.objects.find(o=>o.assetId==="plant_pot")!,target=original.interiors!.find(r=>r!==plantRoom&&r.floorId!==plantRoom.floorId)!;
  const transferred=transferHouseObject(original,plant.id,target.floorId,target.roomId),newOwner=transferred.interiors!.find(r=>r.floorId===target.floorId&&r.roomId===target.roomId)!;
  assert(newOwner.scene.objects.some(o=>o.id===plant.id));assert(!transferred.interiors!.find(r=>r.floorId===plantRoom.floorId&&r.roomId===plantRoom.roomId)!.scene.objects.some(o=>o.id===plant.id));
  assert.equal(transferred.interiors!.flatMap(r=>r.scene.objects).filter(o=>o.id===plant.id).length,1);
  assert.equal(count(original),count(transferred));assert.deepEqual(layoutIssues(newOwner.scene),[]);
  assert(transferred.concept.parts.filter(p=>p.parentId===plant.id).every(p=>p.group===target.floorId));
});

test("model and detailed composition edits update geometry without accepting non-finite transforms",()=>{
  const model=generateLocalModel("Создай человека"),id=model.concept.parts[0].id;
  const next=editModelPart(model,id,{position:[1,2,3]});assert.deepEqual(next.concept.parts[0].position,[1,2,3]);
  assert.throws(()=>editModelPart(model,id,{position:[NaN,2,3]}));assert.throws(()=>editModelPart(model,id,{size:[0,1,1]}));
  const composed=compositionResult({title:"Стол",question:"",options:[],assumptions:[],limitations:[],nodes:[{name:"Стол",shape:"desk_work",p:[0,.38,0],s:[1.3,.76,.6],r:[0,0,0],color:"#ac9474"}]});
  const moved=editModelPart(composed,"node_0",{position:[2,.38,3],rotation:[0,Math.PI/2,0]}),root=buildComposition(moved);
  try {const b=new Box3().setFromObject(root),center=b.getCenter(new Vector3());assert(Math.abs(center.x-2)<.01&&Math.abs(center.z-3)<.01);assert.equal(moved.composition!.nodes[0].r[1],90);}
  finally {disposeDetailed(root);}
});

test("person and animal joint loops preserve rest geometry, move limbs and return to the start",()=>{
  for(const prompt of ["Создай человека, который идёт","Кот, который идёт","Собака бежит"]) {
    assert.equal(resolveDesignBrief(prompt).kind,"ready");
    const {concept}=generateLocalModel(prompt),root=buildConceptScene(concept),before=new Box3().setFromObject(root);
    try {
      if(/человек/.test(prompt)) {assert.equal(concept.category,"character");assert(concept.parts.some(p=>p.group==="Руки"));assert(!concept.parts.some(p=>p.group==="Хвост"));}
      else assert.equal(concept.category,"animal");
      assert.equal(concept.motion,"walk");const clips=attachLivingMotion(root,concept);
      assert.deepEqual(clips.map(c=>c.name),["Idle","Walk"]);assert(clips[1].tracks.some(t=>/quaternion$/.test(t.name)));
      const after=new Box3().setFromObject(root);assert(before.min.distanceTo(after.min)<1e-6&&before.max.distanceTo(after.max)<1e-6);
      assert.equal(attachLivingMotion(root,concept),clips);
      let limb:Mesh|undefined;root.traverse(o=>{if(o instanceof Mesh&&o.name.startsWith("Стопа"))limb=o;});assert(limb);
      const start=limb.getWorldPosition(new Vector3()),mixer=new AnimationMixer(root);mixer.clipAction(clips[1]).play();mixer.setTime(.3);root.updateMatrixWorld(true);
      assert(start.distanceTo(limb.getWorldPosition(new Vector3()))>.01,prompt);
      mixer.setTime(clips[1].duration);root.updateMatrixWorld(true);assert(start.distanceTo(limb.getWorldPosition(new Vector3()))<1e-5);
      mixer.stopAllAction();mixer.uncacheRoot(root);
    } finally {disposeDetailed(root);}
  }
  const house=generateLocalModel("Дом"),root=buildConceptScene(house.concept);try{assert.deepEqual(attachLivingMotion(root,house.concept),[]);}finally{disposeDetailed(root);}
  assert.equal(generateLocalModel("Коттедж, который стоит у дороги").concept.category,"building");
  assert.equal(generateLocalModel("Создай людей").concept.category,"character");
  const pair=generateLocalModel("Два человека идут"),group=buildConceptScene(pair.concept),clips=attachLivingMotion(group,pair.concept),mixer=new AnimationMixer(group);
  assert.equal(pair.concept.motion,"walk");
  try {mixer.clipAction(clips[1]).play();mixer.setTime(.3);assert.equal(group.children.filter(o=>/^Atrion_c/.test(o.name)).length,2);for(const actor of group.children.filter(o=>/^Atrion_c/.test(o.name))){const legs: number[]=[];actor.traverse(o=>{if(o.name.startsWith("Atrion_leg"))legs.push(o.quaternion.x);});assert.equal(legs.length,2);assert(legs[0]*legs[1]<0);}}
  finally{mixer.stopAllAction();mixer.uncacheRoot(group);disposeDetailed(group);}
});
