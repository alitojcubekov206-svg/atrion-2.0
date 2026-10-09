import type {HouseDocument} from "./document";
import type {ModelPart} from "../types";
import {footprintBoundary} from "./footprint";

/** Exterior details never cover openings or change the usable room footprint. */
export function houseFacade(doc: HouseDocument, walls: ModelPart[]): ModelPart[] {
  const parts: ModelPart[] = [], style = doc.architecture?.style ?? "scandinavian";
  const add = (name: string, group: string, role: string, position: ModelPart["position"], size: ModelPart["size"], color: string, material: string) => {
    parts.push({id:`facade_${parts.length}`,name,group,role,shape:"box",position,size,rotation:[0,0,0],color,material,quantity:1});
  };
  const height = doc.floors.length*(doc.floorHeight+.2), trim = doc.architecture?.frameColor ?? "#434a4c";
  const boundary=footprintBoundary(doc);
  for(const [fi,floor] of doc.floors.entries()) {
    const y=fi*(doc.floorHeight+.2)+.12;
    // Floor-edge bands occupy the slab, never the door or glass opening.
    for(const e of boundary) {
      const line=e.line+(["north","west"].includes(e.side)?-1:1)*.025;
      add("Цоколь / пояс фасада",floor.id,"facade",e.axis==="x"?[(e.start+e.end)/2-doc.width/2,y,line-doc.depth/2]:[line-doc.width/2,y,(e.start+e.end)/2-doc.depth/2],e.axis==="x"?[e.end-e.start,.16,.05]:[.05,.16,e.end-e.start],style==="classic"?"#d0c4af":"#525759","Отделка цоколя");
    }
  }
  if(style==="chalet"||style==="brick")for(const wall of walls.filter(p=>p.role==="wall")) {
    const alongX=wall.size[2]===doc.wallThickness,coordinate=(alongX?wall.position[2]:wall.position[0])+(alongX?doc.depth:doc.width)/2;
    const center=(alongX?wall.position[0]:wall.position[2])+(alongX?doc.width:doc.depth)/2;
    const edge=boundary.find(e=>e.axis===(alongX?"x":"z")&&Math.abs(coordinate-e.line-(["north","west"].includes(e.side)?1:-1)*doc.wallThickness/2)<1e-5&&center>e.start&&center<e.end);
    if(!edge)continue;
    const bottom=wall.position[1]-wall.size[1]/2, top=bottom+wall.size[1], step=style==="chalet"?.22:.25;
    for(let y=Math.ceil(bottom/step)*step+.005;y<top-.01;y+=step) {
      const p=[...wall.position] as ModelPart["position"]; p[1]=y;p[alongX?2:0]=edge.line-(alongX?doc.depth:doc.width)/2+(["north","west"].includes(edge.side)?-1:1)*.006;
      add(style==="chalet"?"Шов деревянной обшивки":"Шов кирпичной кладки",wall.group!,"facade",p,alongX?[wall.size[0],.012,.012]:[.012,.012,wall.size[2]],style==="chalet"?"#987653":"#d5b59b",style==="chalet"?"Деревянная обшивка":"Кирпичная облицовка");
    }
  }
  if(style==="classic"||style==="chalet")for(const e of boundary)for(const end of [e.start,e.end]){
    const x=e.axis==="x"?end:e.line,z=e.axis==="x"?e.line:end;
    const position:ModelPart["position"]=[x-doc.width/2,height/2,z-doc.depth/2];
    if(!parts.some(p=>p.name==="Угловая отделка"&&p.position[0]===position[0]&&p.position[2]===position[2]))
      add("Угловая отделка","facade","facade",position,[.23,height,.23],style==="classic"?"#f0e8d8":"#735137",style==="classic"?"Фасадный декор":"Дерево");
  }
  if(doc.roof==="flat")for(const e of boundary) {
    const line=e.line+(["north","west"].includes(e.side)?-1:1)*.12;
    add("Парапет","roof","roof",e.axis==="x"?[(e.start+e.end)/2-doc.width/2,height+.3,line-doc.depth/2]:[line-doc.width/2,height+.3,(e.start+e.end)/2-doc.depth/2],e.axis==="x"?[e.end-e.start+.3,.4,.16]:[.16,.4,e.end-e.start+.3],doc.wallColor,"Фасадная отделка");
  }
  const floor=doc.floors[0],entry=floor.openings.find(o=>o.id==="entry"&&o.kind==="door");
  if(entry&&doc.architecture?.porch!==false) {
    const r=floor.rooms.find(r=>r.id===entry.roomId)!,horizontal=entry.side==="north"||entry.side==="south";
    const sign=entry.side==="north"||entry.side==="west"?-1:1, center=(horizontal?r.x-doc.width/2:r.z-doc.depth/2)+entry.offset+entry.width/2;
    const wall=horizontal?r.z+(entry.side==="south"?r.depth:0)-doc.depth/2:r.x+(entry.side==="east"?r.width:0)-doc.width/2,span=2.3,reach=1.3;
    const pose=(y:number,out:number):ModelPart["position"]=>horizontal?[center,y,wall+sign*out]:[wall+sign*out,y,center];
    const size=(w:number,h:number,d:number):ModelPart["size"]=>horizontal?[w,h,d]:[d,h,w];
    add("Входная площадка",floor.id,"porch",pose(.1,reach/2),size(span,.2,reach),"#aaa699","Камень");
    add("Ступень входа",floor.id,"porch",pose(.05,reach+.18),size(span,.1,.36),"#aaa699","Камень");
    add("Навес над входом",floor.id,"porch",pose(2.6,reach/2),size(span+.25,.14,reach+.25),trim,"Кровля навеса");
    if(style==="classic"||style==="chalet")for(const side of [-1,1]){
      const p=pose(1.38,reach-.12);p[horizontal?0:2]+=side*(span/2-.12);
      add("Стойка крыльца",floor.id,"porch",p,[.14,2.36,.14],style==="classic"?"#e6dcc8":"#735137",style==="classic"?"Фасадный декор":"Дерево");
    }
  }
  return parts;
}
