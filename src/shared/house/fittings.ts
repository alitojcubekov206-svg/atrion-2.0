import type {HouseDocument} from "./document";
import type {ModelPart} from "../types";
import {exteriorRoomSides} from "./footprint";

/** Frames, glazing and door leaves fit the real wall openings. */
export function houseFittings(doc: HouseDocument): ModelPart[] {
  const parts:ModelPart[]=[];
  for(const [fi,floor] of doc.floors.entries()) for(const o of floor.openings) {
    const room=floor.rooms.find(r=>r.id===o.roomId)!;
    const horizontal=o.side==="north"||o.side==="south";
    let line=horizontal?room.z+(o.side==="south"?room.depth:0):room.x+(o.side==="east"?room.width:0);
    const outside=exteriorRoomSides(doc,room).some(e=>e.side===o.side);
    if(outside)line+=(["north","west"].includes(o.side)?1:-1)*doc.wallThickness/2;
    const center=(horizontal?room.x:room.z)+o.offset+o.width/2;
    const base=fi*(doc.floorHeight+.2)+.2+o.bottom;
    const box=(name:string,x:number,y:number,w:number,h:number,d:number,color:string,role:string,opacity=1,normalOffset=0)=>parts.push({
      id:`${floor.id}_${o.id}_trim_${parts.length}`,name,role,group:floor.id,shape:"box",rotation:[0,0,0],quantity:1,material:role==="window"?"Стекло":"Рама",
      position:horizontal?[x-doc.width/2,base+y,line+normalOffset-doc.depth/2]:[line+normalOffset-doc.width/2,base+y,x-doc.depth/2],size:horizontal?[w,h,d]:[d,h,w],color,opacity,roughness:role==="window"?.12:.5,metalness:role==="door-hardware"?.8:role==="window"?.2:.08});
    const trim=.065, frame=doc.architecture?.frameColor??"#ded8cc";
    for(const side of [-1,1])box(o.kind==="window"?"Рама окна":"Дверной наличник",center+side*(o.width/2-trim/2),o.height/2,trim,o.height,.14,frame,"opening-frame");
    box("Верх проёма",center,o.height-trim/2,o.width,trim,.14,frame,"opening-frame");
    if(o.kind==="window") {
      box("Подоконник",center,.015,o.width,.03,.22,"#e4ded1","opening-frame");
      box("Переплёт окна",center,o.height/2,.045,o.height,.1,frame,"opening-frame");
      if(doc.architecture?.style==="classic")box("Горизонтальный переплёт",center,o.height*.6,o.width,.04,.1,frame,"opening-frame");
      box("Стекло окна",center,o.height/2,o.width-.1,o.height-.1,.025,"#80a8b6","window",.6);
    } else {
      box(outside?"Входная дверь":"Межкомнатная дверь",center,o.height/2,o.width-2*trim,o.height-trim,.055,doc.architecture?.doorColor??"#80583c","door");
      // Raised panels and handles are visible from either side of the closed leaf.
      for(const sign of [-1,1]) {
        box("Филёнка двери",center,o.height*.63,o.width-.24,o.height*.48,.012,doc.architecture?.doorColor??"#80583c","door-detail",1,sign*.034);
        box("Ручка двери",center+o.width/2-.18,1.02,.14,.035,.055,"#b5b6b5","door-hardware",1,sign*.055);
        box("Накладка замка",center+o.width/2-.2,.96,.03,.12,.02,"#b5b6b5","door-hardware",1,sign*.04);
      }
    }
  }
  return parts;
}
