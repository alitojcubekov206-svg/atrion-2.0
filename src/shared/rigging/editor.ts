import { partsBounds } from "../geometry";
import type { ThreeDConcept } from "../types";
import { evaluateRig2D, multiply2D, matrix2D, parseRig2D, type Matrix2D, type Transform2D, type Rig2DDocument } from "./rig2d";
import { parseRig3D, evaluateRig3D, type Rig3DDocument } from "./rig3d";
import { Matrix4, Vector3, Quaternion, Euler } from "three";
import { check } from "./validation";

export type RigDocument = Rig2DDocument | Rig3DDocument;
export function parseRigDocument(input: unknown): RigDocument {
  return input && typeof input === "object" && "kind" in input && input.kind === "rig2d" ? parseRig2D(input) : parseRig3D(input);
}

export function blank2D(): Rig2DDocument {
  const bind = (position: [number,number],rotation=0) => ({position,rotation,scale:[1,1] as [number,number]});
  return {kind:"rig2d",schemaVersion:1,canvas:{width:640,height:640},assets:[],layers:[],attachments:[],
    bones:[{id:"body",parentId:null,length:140,bind:bind([0,-60],Math.PI/2)},
      {id:"head",parentId:"body",length:45,bind:bind([155,0],-Math.PI/2)},
      {id:"arm_left",parentId:"body",length:90,bind:bind([115,63],Math.PI)},
      {id:"arm_right",parentId:"body",length:90,bind:bind([115,-63],Math.PI)},
      {id:"leg_left",parentId:"body",length:110,bind:bind([0,28],Math.PI)},
      {id:"leg_right",parentId:"body",length:110,bind:bind([0,-28],Math.PI)}],
    clips:[{id:"wave",duration:2,loop:true,tracks:[{boneId:"arm_right",rotationMode:"unwrapped",keys:[
      {time:0,transform:bind([115,-63],Math.PI),interpolation:"linear"},
      {time:1,transform:bind([115,-63],Math.PI*1.5),interpolation:"linear"},
      {time:2,transform:bind([115,-63],Math.PI),interpolation:"linear"}]}]}]};
}

export function demo3D(): Rig3DDocument {
  return parseRig3D({kind:"rig3d",schemaVersion:1,units:"m",
    bones:[{id:"body",parentId:null,length:1,bind:{position:[0,0,0],rotation:[0,0,0]}},
      {id:"arm",parentId:"body",length:0.8,bind:{position:[0.6,1,0],rotation:[0,0,0]}}],
    parts:[{id:"body_part",name:"Корпус",shape:"box",position:[0,0.75,0],rotation:[0,0,0],size:[0.8,1.2,0.4],color:"#a78bfa"},
      {id:"head_part",name:"Голова",shape:"sphere",position:[0,1.6,0],rotation:[0,0,0],size:[0.5,0.5,0.5],color:"#f3d4b0"},
      {id:"arm_part",name:"Рука",shape:"capsule",position:[0.6,0.6,0],rotation:[0,0,0],size:[0.22,0.8,0.22],color:"#c4b5fd"}],
    bindings:[{partId:"body_part",boneId:"body"},{partId:"head_part",boneId:"body"},{partId:"arm_part",boneId:"arm"}]});
}

export function rigFromConcept(input: unknown): Rig3DDocument {
  if (!input || typeof input !== "object") throw new Error("Требуется JSON 3D-модели");
  const concept = input as ThreeDConcept;
  if (!Array.isArray(concept.parts)) throw new Error("В файле нет деталей модели");
  return parseRig3D({kind:"rig3d",schemaVersion:1,units:concept.units ?? "m",
    bones:[{id:"root",parentId:null,length:1,bind:{position:[0,0,0],rotation:[0,0,0]}}],
    parts:concept.parts.map((part,index)=>({...part,id:`part_${index+1}`})),bindings:[]});
}

export function posedConcept(document: Rig3DDocument): ThreeDConcept {
  const parts = evaluateRig3D(document).parts.map(({matrix:_matrix,sourcePartId:_source,...part})=>({...part,rotation:part.rotation as [number,number,number]}));
  const bounds=partsBounds(parts);
  return {name:"Риг",description:"Статическая поза жёсткого рига",units:document.units,parts,
    dimensions:{width:bounds.max[0]-bounds.min[0],height:bounds.max[1]-bounds.min[1],depth:bounds.max[2]-bounds.min[2]},
    materials:[],equipment:[],requirements:[],assemblySteps:[],advantages:[],disadvantages:[],risks:[],engineeringNotes:[],
    costEstimate:{currency:"",minimum:0,maximum:0,breakdown:[],note:"Не рассчитывается"},disclaimer:"Статическая поза без skinning"};
}

export function inverse2D(m:Matrix2D):Matrix2D {
  const det=m[0]*m[3]-m[1]*m[2];
  check(Math.abs(det)>1e-12,"Преобразование кости необратимо");
  return [m[3]/det,-m[1]/det,-m[2]/det,m[0]/det,(m[2]*m[5]-m[3]*m[4])/det,(m[1]*m[4]-m[0]*m[5])/det];
}

function transformFromMatrix(m:Matrix2D):Transform2D {
  const sx=Math.hypot(m[0],m[1]),sy=(m[0]*m[3]-m[1]*m[2])/sx;
  const transform:Transform2D={position:[m[4],m[5]],rotation:Math.atan2(m[1],m[0]),scale:[sx,sy]};
  const rebuilt=matrix2D(transform);
  check(rebuilt.every((value,index)=>Math.abs(value-m[index])<1e-6*Math.max(1,Math.abs(m[index]))),
    "Слой имеет сдвиг от неравномерного масштаба. Верните масштаб костей к равномерному перед сменой привязки.");
  return transform;
}

/** Binding changes retain the currently visible layer placement, including its pivot. */
export function bindLayer(document:Rig2DDocument,layerId:string,boneId:string|null,pose:Record<string,Transform2D>={}):Rig2DDocument {
  const next=structuredClone(document),layer=next.layers.find((item)=>item.id===layerId);
  check(layer,"Слой не найден");
  const visible=evaluateRig2D(document,{pose});
  const layerMatrix=visible.layers.find((item)=>item.id===layerId)!.matrix;
  const world=multiply2D(layerMatrix,[1,0,0,1,...layer.pivot]);
  next.attachments=next.attachments.filter((item)=>item.layerId!==layerId);
  if(boneId) {
    const bone=visible.bones.find((item)=>item.id===boneId);check(bone,"Кость не найдена");
    next.attachments.push({layerId,boneId,offset:transformFromMatrix(multiply2D(inverse2D(bone.matrix),world))});
  } else layer.transform=transformFromMatrix(world);
  return parseRig2D(next);
}

/** Materialize affected instances when rebinding so every repeated/mirrored part stays in place. */
export function bindPart(document:Rig3DDocument,partId:string,boneId:string|null,pose=document.pose):Rig3DDocument {
  const next=structuredClone(document),source=next.parts.find((part)=>part.id===partId);check(source,"Деталь не найдена");
  const visible=evaluateRig3D(document,pose),target=visible.bones.find((bone)=>bone.id===boneId);
  const deltaInverse=new Matrix4();
  if(boneId) {
    check(target,"Кость не найдена");
    const bind=evaluateRig3D(document,{}).bones.find((bone)=>bone.id===boneId)!;
    deltaInverse.fromArray(bind.matrix).multiply(new Matrix4().fromArray(target.matrix).invert());
  }
  const instances=visible.parts.filter((part)=>part.sourcePartId===partId);
  next.parts=next.parts.filter((part)=>part.id!==partId);next.bindings=next.bindings.filter((item)=>item.partId!==partId);
  for(const [index,part] of instances.entries()) {
    const matrix=new Matrix4().fromArray(part.matrix).premultiply(deltaInverse),position=new Vector3(),q=new Quaternion(),scale=new Vector3();
    matrix.decompose(position,q,scale);const rotation=new Euler().setFromQuaternion(q,"XYZ");
    let id=index===0?partId:`${partId.slice(0,45)}_instance_${index}`,suffix=0;
    while(next.parts.some((item)=>item.id===id))id=`${partId.slice(0,40)}_instance_${index}_${++suffix}`;
    const {sourcePartId:_source,matrix:_matrix,...base}=part;
    next.parts.push({...base,id,position:position.toArray(),rotation:[rotation.x,rotation.y,rotation.z]});
    if(boneId)next.bindings.push({partId:id,boneId});
  }
  return parseRig3D(next);
}

export function addBone2D(document:Rig2DDocument,id:string,parentId:string,head:[number,number],tail:[number,number]):Rig2DDocument {
  const next=structuredClone(document),parent=evaluateRig2D(document,{pose:{}}).bones.find((bone)=>bone.id===parentId);
  check(parent,"Родительская кость не найдена");const inverse=inverse2D(parent.matrix);
  const point=(p:[number,number]):[number,number]=>[inverse[0]*p[0]+inverse[2]*p[1]+inverse[4],inverse[1]*p[0]+inverse[3]*p[1]+inverse[5]];
  const start=point(head),end=point(tail),dx=end[0]-start[0],dy=end[1]-start[1];
  check(Math.hypot(dx,dy)>=5,"Расстояние между суставами должно быть не меньше 5 пикселей");
  next.bones.push({id,parentId,length:Math.hypot(dx,dy),bind:{position:start,rotation:Math.atan2(dy,dx),scale:[1,1]}});
  return parseRig2D(next);
}

/** Deleting a leaf detaches its artwork in place and removes tracks/pose atomically. */
export function removeBone(document: RigDocument, boneId: string,pose2D:Record<string,Transform2D>={},pose3D?:Rig3DDocument["pose"]): RigDocument {
  let next=structuredClone(document);
  if (next.bones.some((bone)=>bone.parentId===boneId)) throw new Error("Сначала удалите или перепривяжите дочерние кости");
  if (next.bones.length===1) throw new Error("В риге должна остаться хотя бы одна кость");
  if (next.kind==="rig2d") {
    for(const binding of next.attachments.filter((item)=>item.boneId===boneId))next=bindLayer(next,binding.layerId,null,pose2D);
    next.clips.forEach((clip)=>{clip.tracks=clip.tracks.filter((track)=>track.boneId!==boneId);});
    if(next.pose)delete next.pose[boneId];
  } else {
    for(const binding of next.bindings.filter((item)=>item.boneId===boneId))next=bindPart(next,binding.partId,null,pose3D??next.pose);
    if(next.pose)delete next.pose[boneId];
  }
  next.bones=next.bones.filter((bone)=>bone.id!==boneId) as typeof next.bones;
  return parseRigDocument(next);
}
