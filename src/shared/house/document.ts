import type { ModelPart } from "../types";
import { check, choice, id, list, number, record, text, unique, version } from "../design/validation";

type Room = { id: string; name: string; x: number; z: number; width: number; depth: number };
type Opening = { id: string; roomId: string; side: "north" | "south" | "east" | "west";
  kind: "door" | "window"; offset: number; width: number; bottom: number; height: number };
export type HouseDocument = { kind: "house"; schemaVersion: 1; units: "m"; width: number; depth: number;
  wallThickness: number; floorHeight: number; wallColor: string; roof: "flat" | "gable";
  floors: { id: string; rooms: Room[]; openings: Opening[] }[] };
type Edge = { axis: "x" | "z"; line: number; start: number; end: number };
function roomEdge(room: Room, side: Opening["side"]): Edge {
  if (side === "north" || side === "south") return { axis:"x", line:room.z+(side === "south" ? room.depth : 0),start:room.x,end:room.x+room.width };
  return { axis:"z",line:room.x+(side === "east" ? room.width : 0),start:room.z,end:room.z+room.depth };
}
const EPS = 1e-7;

export function parseHouse(input: unknown): HouseDocument {
  const value = record(input,"document");
  version(value,"house");
  check(value.units === "m","Дом использует метры");
  const width = number(value.width,"width",3,100), depth = number(value.depth,"depth",3,100);
  const floorHeight = number(value.floorHeight,"floorHeight",2.2,6);
  const wallThickness = number(value.wallThickness,"wallThickness",0.05,0.6);
  const wallColor = text(value.wallColor,"wallColor");
  check(/^#[0-9a-f]{6}$/i.test(wallColor),"wallColor: ожидается #RRGGBB");
  const floors = list(value.floors,"floors",3,1).map((inputFloor) => {
    const floor = record(inputFloor,"floor");
    const rooms = list(floor.rooms,"rooms",32,1).map((inputRoom) => {
      const room = record(inputRoom,"room");
      const result = { id:id(room.id,"room.id"),name:text(room.name,"room.name"), x:number(room.x,"x",0,width),
        z:number(room.z,"z",0,depth),width:number(room.width,"room.width",1,width),depth:number(room.depth,"room.depth",1,depth) };
      check(result.x+result.width <= width+EPS && result.z+result.depth <= depth+EPS,"Комната выходит за границы этажа");
      return result;
    });
    const roomMap = unique(rooms,"rooms");
    for (let i=0;i<rooms.length;i++) for (let j=i+1;j<rooms.length;j++) {
      const a=rooms[i],b=rooms[j];
      check(!(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>EPS && Math.min(a.z+a.depth,b.z+b.depth)-Math.max(a.z,b.z)>EPS),"Комнаты пересекаются");
    }
    const openings = list(floor.openings,"openings",128).map((inputOpening) => {
      const opening = record(inputOpening,"opening");
      const roomId = id(opening.roomId,"roomId"), room = roomMap.get(roomId);
      check(room,"Неизвестная комната проёма");
      const side = choice(opening.side,["north","south","east","west"] as const,"side");
      const result = { id:id(opening.id,"opening.id"),roomId,side, kind:choice(opening.kind,["door","window"] as const,"kind"),
        offset:number(opening.offset,"offset",0,100),width:number(opening.width,"opening.width",0.4,10),
        bottom:number(opening.bottom,"bottom",0,floorHeight),height:number(opening.height,"height",0.4,floorHeight) };
      check(result.offset >= wallThickness && result.offset+result.width <= roomEdge(room,side).end-roomEdge(room,side).start-wallThickness+EPS,"Проём не помещается в стену с отступами");
      check(result.bottom+result.height <= floorHeight-0.1+EPS,"Проём выходит за высоту стены");
      check(result.kind !== "door" || result.bottom === 0,"Дверь должна начинаться от пола");
      return result;
    });
    unique(openings,"openings");
    const holes = openings.map((opening) => ({ ...roomEdge(roomMap.get(opening.roomId)!,opening.side), opening,
      from:roomEdge(roomMap.get(opening.roomId)!,opening.side).start+opening.offset }));
    for (let i=0;i<holes.length;i++) for (let j=i+1;j<holes.length;j++) {
      const a=holes[i],b=holes[j];
      const overlap = a.axis===b.axis && Math.abs(a.line-b.line)<EPS &&
        Math.min(a.from+a.opening.width,b.from+b.opening.width)-Math.max(a.from,b.from)>EPS &&
        Math.min(a.opening.bottom+a.opening.height,b.opening.bottom+b.opening.height)-Math.max(a.opening.bottom,b.opening.bottom)>EPS;
      check(!overlap,"Проёмы пересекаются");
    }
    return { id:id(floor.id,"floor.id"), rooms, openings };
  });
  unique(floors,"floors");
  return { kind:"house",schemaVersion:1,units:"m",width,depth,wallThickness,floorHeight,wallColor,
    roof:choice(value.roof,["flat","gable"] as const,"roof"),floors };
}

/** Build real wall gaps; a door is not a painted rectangle over a solid wall. */
export function buildHouse(document: HouseDocument) {
  const parts: ModelPart[] = [];
  let serial = 0;
  function box(name: string, group: string, position: [number,number,number], size: [number,number,number], color: string, role: string) {
    if (size.some((n) => n <= EPS)) return;
    parts.push({ id:`house_${serial++}`,name,group,position,size,color,shape:"box",rotation:[0,0,0],material:"Эскизный материал",role,quantity:1 });
    check(parts.length <= 12000,"Слишком сложная геометрия дома");
  }
  document.floors.forEach((floor,index) => {
    const y = index*(document.floorHeight+0.2);
    box("Перекрытие",floor.id,[0,y-0.1,0],[document.width,0.2,document.depth],"#b7aea3","foundation");
    const roomMap = new Map(floor.rooms.map((room) => [room.id,room]));
    const edges: Edge[] = [
      {axis:"x",line:0,start:0,end:document.width},{axis:"x",line:document.depth,start:0,end:document.width},
      {axis:"z",line:0,start:0,end:document.depth},{axis:"z",line:document.width,start:0,end:document.depth},
      ...floor.rooms.flatMap((room) => (["north","south","east","west"] as const).map((side) => roomEdge(room,side)))
    ];
    const holes = floor.openings.map((opening) => {
      const edge = roomEdge(roomMap.get(opening.roomId)!,opening.side);
      return { ...edge,from:edge.start+opening.offset,to:edge.start+opening.offset+opening.width,opening };
    });
    const planes: { axis: Edge["axis"]; line: number; edges: Edge[] }[] = [];
    for (const edge of edges) {
      // Decimal room coordinates may describe one boundary with slightly different floats.
      let plane = planes.find((item) => item.axis===edge.axis && Math.abs(item.line-edge.line)<EPS);
      if (!plane) {plane={axis:edge.axis,line:edge.line,edges:[]};planes.push(plane);}
      plane.edges.push(edge);
    }
    for (const plane of planes) {
      const openings = holes.filter((hole) => hole.axis===plane.axis && Math.abs(hole.line-plane.line)<EPS);
      const cuts = [...new Set([...plane.edges.flatMap((edge) => [edge.start,edge.end]),...openings.flatMap((hole) => [hole.from,hole.to])])].sort((a,b) => a-b);
      const limit = plane.axis==="x" ? document.depth : document.width;
      const line = Math.abs(plane.line)<EPS ? document.wallThickness/2 : Math.abs(plane.line-limit)<EPS ? limit-document.wallThickness/2 : plane.line;
      for (let i=1;i<cuts.length;i++) {
        const start=cuts[i-1],end=cuts[i],mid=(start+end)/2;
        if (!plane.edges.some((edge) => mid>=edge.start && mid<=edge.end)) continue;
        const active = openings.filter((hole) => mid>hole.from && mid<hole.to);
        const verticalCuts = [...new Set([0,document.floorHeight,...active.flatMap((hole) => [hole.opening.bottom,hole.opening.bottom+hole.opening.height])])].sort((a,b) => a-b);
        for (let j=1;j<verticalCuts.length;j++) {
          const low=verticalCuts[j-1],high=verticalCuts[j],middle=(low+high)/2;
          if (active.some((hole) => middle>hole.opening.bottom && middle<hole.opening.bottom+hole.opening.height)) continue;
          const position: [number,number,number] = plane.axis==="x" ? [mid-document.width/2,y+(low+high)/2,line-document.depth/2] : [line-document.width/2,y+(low+high)/2,mid-document.depth/2];
          const size: [number,number,number] = plane.axis==="x" ? [end-start,high-low,document.wallThickness] : [document.wallThickness,high-low,end-start];
          box("Стена",floor.id,position,size,document.wallColor,"wall");
        }
      }
    }
  });
  const roofY = document.floors.length*(document.floorHeight+0.2)-0.2;
  box("Крыша","roof",[0,roofY+0.1,0],[document.width+0.4,0.2,document.depth+0.4],"#676d7c","roof");
  if (document.roof === "gable") {
    const roof = parts[parts.length-1];
    roof.shape="prism"; roof.size[1]=Math.min(3,document.width*0.2); roof.position[1]=roofY+roof.size[1]/2;
  }
  return { units:"m",parts, floors:document.floors.map((floor,index) => ({id:floor.id,elevation:index*(document.floorHeight+0.2),rooms:floor.rooms})),
    warnings:["Концептуальный эскиз без инженерных расчётов. Проёмы открытые; стекло, дверные полотна и инженерные сети не моделируются.",
      ...(document.floors.length>1 ? ["Межэтажный доступ пока не моделируется: лестницы отсутствуют."] : [])] };
}
