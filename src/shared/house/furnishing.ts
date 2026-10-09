import type {HouseDocument} from "./document";
import type {HouseBrief} from "../design/brief";
import type {InteriorScene, Opening, SceneObject} from "../interior/scene";
import {layoutIssues} from "../interior/scene";
import {placeObject, localPlan} from "../interior/engine";
import {STYLES, findAsset, type InteriorStyle} from "../interior/catalog";
import {assetParts} from "../interior/geometry";
import type {ModelPart} from "../types";

export type HouseRoomInterior = {floorId: string; roomId: string; name: string; purpose: string;
  origin: [number,number,number]; scene: InteriorScene; warnings: string[]};
type Room = HouseDocument["floors"][number]["rooms"][number];
type Floor = HouseDocument["floors"][number];
const TYPES: [RegExp,string,string[]][] = [
  [/кухн.*гостин|kitchen.*living/i,"Кухня-гостиная",["kitchen_run","fridge_tall","sofa_compact","table_dining","chair_simple","chair_simple","table_coffee","plant_pot"]],
  [/спальн|bedroom/i,"Спальня",["bed_double","wardrobe_double","decor_cube","decor_cube","lamp_floor","plant_pot"]],
  [/детск/i,"Детская",["bed_single","desk_work","chair_simple","wardrobe_double","bookcase_open"]],
  [/гостин|living/i,"Гостиная",["sofa_compact","armchair_soft","table_coffee","bookcase_open","lamp_floor","plant_pot"]],
  [/кухн|kitchen/i,"Кухня",["kitchen_run","fridge_tall","table_dining","chair_simple","chair_simple"]],
  [/сануз|ванн|bath/i,"Санузел",["shower_square","toilet_compact","vanity_sink"]],
  [/кабинет|office/i,"Кабинет",["desk_work","chair_simple","bookcase_open","armchair_soft","lamp_floor"]],
  [/прихож|коридор|hall|corridor/i,"Прихожая",["cabinet_low","bench_soft","plant_pot"]],
  [/столов|dining/i,"Столовая",["table_dining","chair_simple","chair_simple","chair_simple","chair_simple","cabinet_low"]],
  [/гардероб|кладов|pantry/i,"Хранение",["wardrobe_double","bookcase_open"]],
];
export function houseStyle(description: string): InteriorStyle {
  const terms: [RegExp,InteriorStyle][] = [[/неокласс/i,"neoclassic"],[/классичес|classic/i,"classic"],[/лофт|loft/i,"loft"],[/сканди|scandi/i,"scandinavian"],[/минимал|minimal/i,"minimalism"],[/джапанди|japandi/i,"japandi"],[/индустри|industrial/i,"industrial"],[/хай.?тек|high.tech/i,"high-tech"]];
  return terms.find(([rx]) => rx.test(description))?.[1] ?? "scandinavian";
}

/** A shared doorway is reserved on BOTH sides, even when the document stores it once. */
export function roomOpenings(doc: HouseDocument, floor: Floor, room: Room, inset: number): Opening[] {
  const result: Opening[] = [], eps=1e-5;
  for (const o of floor.openings) {
    const source=floor.rooms.find(r=>r.id===o.roomId)!;
    const horizontal=o.side==="north"||o.side==="south";
    const line=horizontal?source.z+(o.side==="south"?source.depth:0):source.x+(o.side==="east"?source.width:0);
    const start=(horizontal?source.x:source.z)+o.offset;
    const side=horizontal ? Math.abs(line-room.z)<eps?"north":Math.abs(line-room.z-room.depth)<eps?"south":null
      :Math.abs(line-room.x)<eps?"west":Math.abs(line-room.x-room.width)<eps?"east":null;
    const offset=start-(horizontal?room.x:room.z)-inset, span=(horizontal?room.width:room.depth)-2*inset;
    if(side && offset>=-eps && offset+o.width<=span+eps) result.push({id:o.id,wall:side,kind:o.kind,offset:Math.max(0,offset),width:o.width,bottom:o.bottom,height:o.height});
  }
  return result;
}
function relativePlacement(scene: InteriorScene, item: SceneObject): SceneObject | undefined {
  const anchor=scene.objects.find(o=>item.assetId==="table_coffee"?o.assetId==="sofa_compact":item.assetId==="decor_cube"?o.assetId.startsWith("bed_"):item.assetId==="chair_simple"?["desk_work","table_dining"].includes(o.assetId):false);
  if(!anchor)return;
  const a=findAsset(anchor.assetId),b=findAsset(item.assetId),c=Math.cos(anchor.rotation.y),s=Math.sin(anchor.rotation.y);
  const positions=item.assetId==="decor_cube"?[[-(a.width+b.width)/2-.08,-(a.depth-b.depth)/2+.15,0],[(a.width+b.width)/2+.08,-(a.depth-b.depth)/2+.15,0]]
    :[[0,(a.depth+b.depth)/2+.15,Math.PI],[0,-(a.depth+b.depth)/2-.15,0],[(a.width+b.width)/2+.15,0,Math.PI/2],[-(a.width+b.width)/2-.15,0,-Math.PI/2]];
  for(const [x,z,angle] of positions){
    const candidate={...item,position:{x:anchor.position.x+x*c+z*s,y:0,z:anchor.position.z-x*s+z*c},rotation:{x:0,y:anchor.rotation.y+(item.assetId==="table_coffee"?0:angle),z:0}};
    if(!layoutIssues({...scene,objects:[...scene.objects,candidate]}).length)return candidate;
  }
}
function zonedPlacement(scene: InteriorScene, item: SceneObject): SceneObject | undefined {
  const a=findAsset(item.assetId),w=scene.width,d=scene.length;
  const poses:Record<string,number[][]>={
    kitchen_run:[[w/2,a.depth/2+.08,0]],
    fridge_tall:[[w/2+1.2+a.width/2+.1,a.depth/2+.08,0],[w/2-1.2-a.width/2-.1,a.depth/2+.08,0]],
    bed_double:[[w/2,a.depth/2+.08,0]],bed_single:[[w/2,a.depth/2+.08,0]],
    sofa_compact:[[w/2,d*.7,Math.PI]],armchair_soft:[[w*.22,d*.55,Math.PI/2]],
    table_dining:[[w*.68,d*.37,0]],
    wardrobe_double:[[a.depth/2+.08,d*.76,Math.PI/2],[w-a.depth/2-.08,d*.76,-Math.PI/2]],
  };
  for(const [x,z,angle] of poses[item.assetId]??[]) {
    const candidate={...item,position:{x,y:0,z},rotation:{x:0,y:angle,z:0}};
    if(!layoutIssues({...scene,objects:[...scene.objects,candidate]}).length)return candidate;
  }
}
function roomRequests(description: string, purpose: string): string[] {
  const matches=[...description.matchAll(/кухн[а-яё]*\s*[-–]\s*гостин[а-яё]*|спальн[а-яё]*|детск[а-яё]*|гостин[а-яё]*|кухн[а-яё]*|сануз[а-яё]*|ванн[а-яё]*|кабинет[а-яё]*|прихож[а-яё]*|столов[а-яё]*|гардеробн[а-яё]*|кладов[а-яё]*|bedroom|living\s*room|kitchen|bathroom|office/gi)];
  return matches.flatMap((m,i)=>TYPES.find(([rx])=>rx.test(m[0]))?.[1]===purpose?[description.slice(m.index,matches[i+1]?.index??description.length).split(/[.;\n]/)[0]]:[]);
}
export function furnishHouse(doc: HouseDocument, brief: HouseBrief) {
  const rooms:HouseRoomInterior[]=[],parts:ModelPart[]=[],warnings:string[]=[];
  const style=houseStyle(brief.description??""), palette=STYLES[style], inset=doc.wallThickness+.025;
  for(const [fi,floor] of doc.floors.entries()) for(const [ri,room] of floor.rooms.entries()) {
    const type=TYPES.find(([rx])=>rx.test(room.name));
    const purpose=type?.[1]??(fi===0&&ri===0?"Гостиная":"Спальня");
    const defaults=type?.[2]??TYPES.find(([,name])=>name===purpose)![2];
    const roomWarnings:string[]=[],width=room.width-2*inset,length=room.depth-2*inset;
    const origin:[number,number,number]=[room.x+inset-doc.width/2,fi*(doc.floorHeight+.2)+.22,room.z+inset-doc.depth/2];
    const openings=roomOpenings(doc,floor,room,inset);
    if(width<2||length<2||width>30||length>30||!openings.some(o=>o.kind==="door")) {
      if(brief.furnished!==false)warnings.push(`${room.name} (этаж ${fi+1}): обстановка не размещена — полезный размер должен быть 2–30 м и нужен доступный дверной проход.`);
      continue;
    }
    const scene:InteriorScene={schemaVersion:1,units:"m",width,length,height:doc.floorHeight,roomType:purpose,style,wallColor:palette.wall,floorColor:/Санузел|Кухня$/.test(purpose)?"#b9c2bd":palette.floor,objects:[],openings,lights:[]};
    let inventory=brief.furnished===false?[]:[...defaults];
    if(!type&&brief.furnished!==false)roomWarnings.push(`Назначение не задано: предложена ${purpose.toLowerCase()}.`);
    // Room-specific explicit furniture requests supplement defaults, keeping counts and colours.
    const overrides=new Map<string,{count:number;color?:string}>();
    if(brief.furnished!==false&&type) for(const clause of roomRequests(brief.description??"",purpose)) {
      if(!/кроват|диван|шкаф|стол|стул|кресл|торшер|тумб|растени/i.test(clause))continue;
      const exclusions: [RegExp,string][] = [[/без\s+шкаф/i,"wardrobe_double"],[/без\s+кроват/i,"bed_double"],[/без\s+диван/i,"sofa_compact"],[/без\s+кресл/i,"armchair_soft"],[/без\s+(?:торшер|светильник)/i,"lamp_floor"],[/без\s+растени/i,"plant_pot"],[/без\s+тумб/i,"decor_cube"]];
      for(const [rx,id] of exclusions)if(rx.test(clause))overrides.set(id,{count:0});
      try {
        const planned=localPlan(clause,scene,false);
        const actions=planned.actions.filter(a=>a.type==="ADD_OBJECT"),current=new Map<string,{count:number;color?:string}>();
        for(const a of actions){const id=String(a.assetId),entry=current.get(id)??{count:0};entry.count++;if(a.color)entry.color=String(a.color);current.set(id,entry);}
        for(const [id,entry] of current)overrides.set(id,entry);
      } catch {roomWarnings.push("Часть пожеланий к мебели не распознана; показан предложенный набор.");}
    }
    for(const [id,entry] of overrides)inventory=[...inventory.filter(a=>a!==id),...Array.from({length:entry.count},()=>id)];
    for(const [index,assetId] of inventory.entries()) {
      const item:SceneObject={id:`${floor.id}_${room.id}_item_${index}`,assetId,position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},color:overrides.get(assetId)?.color??palette.accent,locked:false};
      try {scene.objects.push(relativePlacement(scene,item)??zonedPlacement(scene,item)??placeObject(scene,item));}
      catch {roomWarnings.push(`Не поместился предмет «${findAsset(assetId).name}» с проходом.`);}
    }
    const entry={floorId:floor.id,roomId:room.id,name:room.name,purpose,origin,scene,warnings:roomWarnings};rooms.push(entry);
    warnings.push(...roomWarnings.map(w=>`${room.name} (этаж ${fi+1}): ${w}`));
    const tile:ModelPart={id:`${floor.id}_${room.id}_finish`,name:`Пол · ${room.name}`,group:floor.id,role:"floor-finish",shape:"box",size:[width,.02,length],position:[origin[0]+width/2,origin[1]-.01,origin[2]+length/2],rotation:[0,0,0],color:scene.floorColor,roughness:.75,material:"Пол",quantity:1};parts.push(tile);
    for(const o of scene.objects) {
      const c=Math.cos(o.rotation.y),s=Math.sin(o.rotation.y);
      for(const p of assetParts(o.assetId,o.color)){const [x,y,z]=p.position;parts.push({...p,id:`${o.id}_${p.id}`,group:floor.id,role:"furniture",parentId:o.id,
        position:[origin[0]+o.position.x+x*c+z*s,origin[1]+y,origin[2]+o.position.z-x*s+z*c],rotation:[0,o.rotation.y,0]});}
    }
  }
  return {rooms,parts,warnings};
}
