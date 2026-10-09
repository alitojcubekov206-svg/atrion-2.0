import type {HouseDocument} from "./document";
import type {ModelPart} from "../types";

/** Window glazing and frames are fitted to the actual openings; doorways stay open. */
export function houseFittings(doc: HouseDocument): ModelPart[] {
  const parts:ModelPart[]=[];
  for(const [fi,floor] of doc.floors.entries()) for(const o of floor.openings) {
    const room=floor.rooms.find(r=>r.id===o.roomId)!;
    const horizontal=o.side==="north"||o.side==="south";
    let line=horizontal?room.z+(o.side==="south"?room.depth:0):room.x+(o.side==="east"?room.width:0);
    const span=horizontal?doc.depth:doc.width;
    if(Math.abs(line)<1e-5)line=doc.wallThickness/2;else if(Math.abs(line-span)<1e-5)line=span-doc.wallThickness/2;
    const center=(horizontal?room.x:room.z)+o.offset+o.width/2;
    const base=fi*(doc.floorHeight+.2)+.2+o.bottom;
    const box=(name:string,x:number,y:number,w:number,h:number,d:number,color:string,role:string,opacity=1)=>parts.push({
      id:`${floor.id}_${o.id}_trim_${parts.length}`,name,role,group:floor.id,shape:"box",rotation:[0,0,0],quantity:1,material:role==="window"?"Стекло":"Рама",
      position:horizontal?[x-doc.width/2,base+y,line-doc.depth/2]:[line-doc.width/2,base+y,x-doc.depth/2],size:horizontal?[w,h,d]:[d,h,w],color,opacity,roughness:role==="window"?.1:.5});
    const trim=.045;
    for(const side of [-1,1])box(o.kind==="window"?"Рама окна":"Дверной наличник",center+side*(o.width/2-trim/2),o.height/2,trim,o.height,.12,"#ded8cc","opening-frame");
    box("Верх проёма",center,o.height-trim/2,o.width,trim,.12,"#ded8cc","opening-frame");
    if(o.kind==="window") {
      box("Подоконник",center,.015,o.width,.03,.22,"#e4ded1","opening-frame");
      box("Переплёт окна",center,o.height/2,.035,o.height,.08,"#ded8cc","opening-frame");
      box("Стекло окна",center,o.height/2,o.width-.07,o.height-.07,.015,"#bed6dd","window",.22);
    }
  }
  return parts;
}
