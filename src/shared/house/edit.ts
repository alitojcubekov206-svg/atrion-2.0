import type {LocalModelResult} from "../design/result";
import {check} from "../design/validation";
import {applyActions,placeObject} from "../interior/engine";
import {parseScene,validateLayout} from "../interior/scene";
import type {HouseRoomInterior} from "./furnishing";
import {houseFurnitureParts} from "./furnishing";
import {dimensionsOf,structureFromGroups} from "../geometry";

/** Preserve every other room and rebuild the furniture proxies used in JSON and quantities. */
export function editHouseRoom(result: LocalModelResult, floorId: string, roomId: string, actions: Record<string,unknown>[]): LocalModelResult {
  check(result.document && result.interiors, "Дом с интерьером не найден");
  const room=result.interiors.find(r=>r.floorId===floorId&&r.roomId===roomId);check(room,"Комната не найдена");
  const scene=applyActions(room.scene,{actions});
  const interiors=result.interiors.map(r=>r===room?{...r,scene}:r);
  return rebuild(result,interiors);
}
function rebuild(result:LocalModelResult,interiors:HouseRoomInterior[]):LocalModelResult {
  const parts=[...result.concept.parts.filter(p=>p.role!=="furniture"),...houseFurnitureParts(interiors)];
  const count=interiors.reduce((n,r)=>n+r.scene.objects.length,0);
  return {...result,interiors,recognized:result.recognized.map(s=>/^\d+ предметов внутри$/.test(s)?`${count} предметов внутри`:s),
    concept:{...result.concept,parts,dimensions:dimensionsOf(parts),structure:structureFromGroups(parts)}};
}

/** Transfer a whole catalog item between rooms/floors, retaining its identity, scale and material. */
export function transferHouseObject(result:LocalModelResult,objectId:string,floorId:string,roomId:string):LocalModelResult {
  check(result.document&&result.interiors,"Дом с интерьером не найден");
  const source=result.interiors.find(r=>r.scene.objects.some(o=>o.id===objectId)),target=result.interiors.find(r=>r.floorId===floorId&&r.roomId===roomId);
  check(source&&target,"Комната или предмет не найдены");
  const object=source.scene.objects.find(o=>o.id===objectId)!;check(!object.locked,"Предмет закреплён");
  if(source===target)return result;
  const moved=placeObject(target.scene,structuredClone(object));
  const sourceScene=applyActions(source.scene,{actions:[{type:"REMOVE_OBJECT",objectId}]}),targetScene=parseScene({...target.scene,objects:[...target.scene.objects,moved]});
  validateLayout(targetScene);
  return rebuild(result,result.interiors.map(r=>r===source?{...r,scene:sourceScene}:r===target?{...r,scene:targetScene}:r));
}
