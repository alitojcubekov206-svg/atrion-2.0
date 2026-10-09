import type {ModelPart} from "../types";
import type {InteriorScene} from "./scene";

/** Closed door leaves and hardware share their opening coordinates in every export. */
export function interiorDoors(scene:InteriorScene):ModelPart[] {
  const parts:ModelPart[]=[];
  for(const o of scene.openings.filter(o=>o.kind==="door")) {
    const horizontal=o.wall==="north"||o.wall==="south",span=horizontal?scene.width:scene.length;
    const line=(horizontal?scene.length:scene.width)/2+.06,sign=o.wall==="north"||o.wall==="west"?-1:1;
    const center=o.offset+o.width/2-span/2,frame=.055;
    const add=(name:string,x:number,y:number,width:number,height:number,depth:number,color:string,role:string,out=0)=>{
      parts.push({id:`${o.id}_fitting_${parts.length}`,name,group:o.id,shape:"box",role,color,material:role==="door-hardware"?"Металл":"Дерево",quantity:1,rotation:[0,0,0],
        position:horizontal?[x,y,sign*line+out]:[sign*line+out,y,x],size:horizontal?[width,height,depth]:[depth,height,width]});
    };
    for(const side of [-1,1])add("Дверная коробка",center+side*(o.width/2-frame/2),o.height/2,frame,o.height,.13,"#65513e","door-frame");
    add("Дверная коробка",center,o.height-frame/2,o.width,frame,.13,"#65513e","door-frame");
    add("Дверное полотно",center,(o.height-frame)/2+.01,o.width-frame*2,o.height-frame-.02,.045,"#a88563","door");
    for(const side of [-1,1]) {
      add("Панель двери",center,o.height*.58,o.width*.64,o.height*.6,.012,"#b99676","door-detail",side*.028);
      add("Накладка ручки",center+o.width*.32,1,.035,.13,.013,"#495054","door-hardware",side*.04);
      add("Ручка двери",center+o.width*.26,1.02,.13,.022,.025,"#bbc1c5","door-hardware",side*.065);
    }
  }
  return parts;
}
