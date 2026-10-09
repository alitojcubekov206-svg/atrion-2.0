import {part,shade} from "@/shared/geometry";
import type {ModelPart} from "@/shared/types";
import type {Blueprint} from "./blueprint";

/** A launch vehicle has a full-width nose and radial fins, not a building spire. */
export function rocketParts(bp:Blueprint):ModelPart[] {
  const parts:ModelPart[]=[],w=bp.width,d=bp.length,h=bp.height;
  const add=(name:string,shape:ModelPart["shape"],position:ModelPart["position"],size:ModelPart["size"],color=bp.primary,rotation:ModelPart["rotation"]=[0,0,0],role="structure")=>parts.push(part(`rocket_${parts.length}`,name,{shape,position,size,rotation,color,material:"Окрашенный металл",metalness:.25,roughness:.4,role,group:"Ракета",sides:32}));
  const stages=/тр[её]хступ|3\s*ступен|three.stage/i.test(bp.prompt)?3:/одноступ|1\s*ступен|single.stage/i.test(bp.prompt)?1:2;
  const bottom=h*.07,bodyHeight=h*.77,step=bodyHeight/stages;
  for(let i=0;i<stages;i++) {
    add(`Ступень ${i+1}`,"cylinder",[0,bottom+step*(i+.5),0],[w*.64,step,d*.64],i%2?shade(bp.primary,-.08):bp.primary,[0,0,0],"volume");
    if(i)add("Стыковочное кольцо","cylinder",[0,bottom+step*i,0],[w*.66,h*.014,d*.66],bp.trim);
  }
  add("Головной обтекатель","cone",[0,h*.92,0],[w*.64,h*.16,d*.64],bp.primary,[0,0,0],"nose");
  add("Сопло двигателя","cone",[0,h*.035,0],[w*.4,h*.07,d*.4],"#383e43",[Math.PI,0,0],"engine");
  const fins=Math.max(0,Math.min(8,bp.fins));
  for(let i=0;i<fins;i++) {
    const angle=i*Math.PI*2/fins;
    add(`Стабилизатор ${i+1}`,"wedge",[Math.sin(angle)*w*.385,h*.16,Math.cos(angle)*d*.385],[Math.min(w,d)*.035,h*.22,d*.23],bp.accent,[0,angle,0],"fin");
  }
  if(/ускорител|booster/i.test(bp.prompt)&&!/без\s+ускорител|without\s+boosters?/i.test(bp.prompt))for(const side of [-1,1]) {
    add("Боковой ускоритель","cylinder",[side*w*.41,h*.31,0],[w*.16,h*.48,d*.16],shade(bp.primary,.03),[0,0,0],"booster");
    add("Нос ускорителя","cone",[side*w*.41,h*.59,0],[w*.16,h*.08,d*.16],bp.accent,[0,0,0],"booster");
    add("Сопло ускорителя","cone",[side*w*.41,h*.055,0],[w*.13,h*.03,d*.13],"#383e43",[Math.PI,0,0],"engine");
  }
  return parts;
}
