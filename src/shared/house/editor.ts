import { buildHouse, parseHouse, type HouseDocument } from "./document";
import { partsBounds } from "../geometry";
import type { ThreeDConcept } from "../types";

/** Explicit parametric starting point, not an AI interpretation of the whole brief. */
export function createHouse(width=12, depth=9): HouseDocument {
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

export function splitRoom(document:HouseDocument,floorId:string,roomId:string,axis:"x"|"z",newId:string):HouseDocument {
  const next=structuredClone(document),floor=next.floors.find(f=>f.id===floorId),room=floor?.rooms.find(r=>r.id===roomId);
  if(!floor||!room)throw new Error("Комната не найдена");
  if(floor.openings.some(o=>o.roomId===roomId))throw new Error("Перед разделением удалите проёмы выбранной комнаты; отмена восстановит их.");
  const dimension=axis==="x"?"width":"depth",size=room[dimension]/2;
  room[dimension]=size;
  floor.rooms.push({...room,id:newId,name:`${room.name} · 2`,[axis]:room[axis]+size});
  return parseHouse(next);
}

export function houseConcept(document:HouseDocument, floorId?:string, hideRoof=false):ThreeDConcept {
  const built=buildHouse(document),parts=built.parts.filter(p=>(!floorId||p.group===floorId||p.group==="roof")&&(!hideRoof||p.group!=="roof"));
  const bounds=partsBounds(parts);
  return {name:"Проект дома",description:"План и 3D из одного документа",units:"m",parts,
    dimensions:{width:bounds.max[0]-bounds.min[0],height:bounds.max[1]-bounds.min[1],depth:bounds.max[2]-bounds.min[2]},
    materials:[],equipment:[],requirements:[],assemblySteps:[],advantages:[],disadvantages:[],risks:[],engineeringNotes:built.warnings,
    costEstimate:{currency:"",minimum:0,maximum:0,breakdown:[],note:"Не рассчитывается"},disclaimer:built.warnings.join(" ")};
}
