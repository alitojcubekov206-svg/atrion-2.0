import type {HouseDocument} from "./document";
export type HouseFootprint = "rectangular" | "l-shaped";
export type PlanRect = {x: number; z: number; width: number; depth: number};
export type Boundary = {axis: "x" | "z"; line: number; start: number; end: number; side: "north" | "south" | "east" | "west"};

export function footprintRects(doc: Pick<HouseDocument,"width"|"depth"|"footprint">): PlanRect[] {
  return doc.footprint === "l-shaped" ? [{x:0,z:0,width:doc.width*.55,depth:doc.depth},
    {x:doc.width*.55,z:0,width:doc.width*.45,depth:doc.depth*.55}] : [{x:0,z:0,width:doc.width,depth:doc.depth}];
}
export function footprintBoundary(doc: Pick<HouseDocument,"width"|"depth"|"footprint">): Boundary[] {
  const {width:w,depth:d}=doc;
  if(doc.footprint!=="l-shaped")return [{axis:"x",line:0,start:0,end:w,side:"north"},{axis:"x",line:d,start:0,end:w,side:"south"},
    {axis:"z",line:0,start:0,end:d,side:"west"},{axis:"z",line:w,start:0,end:d,side:"east"}];
  return [{axis:"x",line:0,start:0,end:w,side:"north"},{axis:"z",line:w,start:0,end:d*.55,side:"east"},
    {axis:"x",line:d*.55,start:w*.55,end:w,side:"south"},{axis:"z",line:w*.55,start:d*.55,end:d,side:"east"},
    {axis:"x",line:d,start:0,end:w*.55,side:"south"},{axis:"z",line:0,start:0,end:d,side:"west"}];
}
export function exteriorRoomSides(doc:HouseDocument,room:PlanRect) {
  return footprintBoundary(doc).filter(e=>{
    const line=e.axis==="x"?room.z+(e.side==="south"?room.depth:0):room.x+(e.side==="east"?room.width:0);
    const start=e.axis==="x"?room.x:room.z,end=start+(e.axis==="x"?room.width:room.depth);
    return Math.abs(line-e.line)<1e-6&&start>=e.start-1e-6&&end<=e.end+1e-6;
  }).map(e=>({side:e.side,length:e.axis==="x"?room.width:room.depth}));
}
