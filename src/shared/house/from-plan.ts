import {buildHouse,parseHouse,type HouseDocument} from "./document";
import {houseFittings} from "./fittings";
import {furnishHouse} from "./furnishing";
import {dimensionsOf,structureFromGroups} from "../geometry";
import type {LocalModelResult} from "../design/result";

/** Keep reviewed coordinates and openings; never replace an uploaded layout with a template. */
export function modelFromPlan(input:unknown):LocalModelResult {
  const document=parseHouse(input),geometry=buildHouse(document);
  const interior=furnishHouse(document,{width:document.width,depth:document.depth,floors:document.floors.length,
    rooms:document.floors.flatMap(f=>f.rooms.map(r=>r.name)),roof:document.roof,wallColor:document.wallColor,furnished:false});
  const parts=[...geometry.parts.map(p=>({...p,position:[p.position[0],p.position[1]+.2,p.position[2]] as [number,number,number]})),...interior.parts,...houseFittings(document)];
  return {kind:"model",source:"procedural",document,interiors:interior.rooms,recognized:["План по подтверждённым размерам",`${document.floors.flatMap(f=>f.rooms).length} помещений`],missing:[],
    notes:["Размеры и проёмы перенесены из проверенного плана. Мебель не добавлялась автоматически."],
    concept:{name:"Дом по плану",description:"Редактируемый эскиз по плану",units:"m",parts,dimensions:dimensionsOf(parts),structure:structureFromGroups(parts),
      materials:[],equipment:[],requirements:[],assemblySteps:[],costEstimate:{currency:"KGS",minimum:0,maximum:0,breakdown:[],note:"Стоимость не рассчитывалась"},
      advantages:[],disadvantages:[],risks:[],engineeringNotes:[],disclaimer:"Эскиз, не строительный проект",category:"building",source:"procedural"}};
}

export function emptyPlan():HouseDocument {
  return {kind:"house",schemaVersion:1,units:"m",width:10,depth:8,floorHeight:2.8,wallThickness:.2,wallColor:"#ddd7cb",roof:"flat",
    floors:[{id:"floor_1",rooms:[],openings:[]}]};
}
