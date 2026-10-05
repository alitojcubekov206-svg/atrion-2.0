import { evaluateRig2D, inverseMatrix2D, parseRig2D, point2D, type Rig2DDocument, type Skin2D, type Transform2D } from "./rig2d";
import { check } from "./validation";

export type Point=[number,number];
export const JOINTS=[
  ["pelvis","Таз",.5,.49],["neck","Шея",.5,.18],["crown","Верх головы",.5,.055],
  ["shoulder_l","Плечо слева",.40,.215],["elbow_l","Локоть слева",.255,.28],["wrist_l","Запястье слева",.125,.315],["hand_l","Кисть слева",.035,.345],
  ["shoulder_r","Плечо справа",.60,.215],["elbow_r","Локоть справа",.745,.28],["wrist_r","Запястье справа",.875,.315],["hand_r","Кисть справа",.965,.345],
  ["hip_l","Бедро слева",.43,.53],["knee_l","Колено слева",.44,.675],["ankle_l","Щиколотка слева",.43,.915],["toe_l","Стопа слева",.405,.985],
  ["hip_r","Бедро справа",.57,.53],["knee_r","Колено справа",.56,.675],["ankle_r","Щиколотка справа",.57,.915],["toe_r","Стопа справа",.595,.985],
] as const;
export type JointId=typeof JOINTS[number][0];
export type Landmarks=Record<JointId,Point>;
export const BODY_BONES:[string,string|null,JointId,JointId][]=[
  ["body",null,"pelvis","neck"],["head","body","neck","crown"],
  ["upper_arm_l","body","shoulder_l","elbow_l"],["forearm_l","upper_arm_l","elbow_l","wrist_l"],["hand_l","forearm_l","wrist_l","hand_l"],
  ["upper_arm_r","body","shoulder_r","elbow_r"],["forearm_r","upper_arm_r","elbow_r","wrist_r"],["hand_r","forearm_r","wrist_r","hand_r"],
  ["thigh_l","body","hip_l","knee_l"],["shin_l","thigh_l","knee_l","ankle_l"],["foot_l","shin_l","ankle_l","toe_l"],
  ["thigh_r","body","hip_r","knee_r"],["shin_r","thigh_r","knee_r","ankle_r"],["foot_r","shin_r","ankle_r","toe_r"],
];

export function defaultLandmarks(bounds:{left:number;top:number;right:number;bottom:number}):Landmarks {
  return Object.fromEntries(JOINTS.map(([id,,x,y])=>[id,[bounds.left+x*(bounds.right-bounds.left),bounds.top+y*(bounds.bottom-bounds.top)]])) as Landmarks;
}
function segmentDistance(p:Point,a:readonly number[],b:readonly number[]) {
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}

/** Landmark positions are image pixels (+y down). No inferred joints or hidden painted parts. */
export function fullBodyRig(asset:Rig2DDocument["assets"][number],joints:Landmarks,alpha:Uint8Array):Rig2DDocument {
  const {width,height}=asset;
  check(alpha.length===width*height,"Размер маски не совпадает с рисунком");
  const bones:Rig2DDocument["bones"]=[],worlds=new Map<string,{head:Point;angle:number}>();
  const worldPoint=(p:Point):Point=>[p[0]-width/2,height/2-p[1]];
  for(const [id,parentId,from,to] of BODY_BONES){
    const head=worldPoint(joints[from]),tail=worldPoint(joints[to]);
    check([...head,...tail].every(Number.isFinite),"Некорректные суставы");
    const length=Math.hypot(tail[0]-head[0],tail[1]-head[1]),angle=Math.atan2(tail[1]-head[1],tail[0]-head[0]);
    check(length>=4,`Суставы кости ${id} слишком близко`);
    const parent=parentId?worlds.get(parentId)!:undefined;
    const position:Point=parent?point2D(inverseMatrix2D([Math.cos(parent.angle),Math.sin(parent.angle),-Math.sin(parent.angle),Math.cos(parent.angle),...parent.head]),head):head;
    bones.push({id,parentId,length,bind:{position,rotation:angle-(parent?.angle??0),scale:[1,1]}});worlds.set(id,{head,angle});
  }
  const identity:Transform2D={position:[0,0],rotation:0,scale:[1,1]};
  const rig:Rig2DDocument={kind:"rig2d",schemaVersion:1,canvas:{width,height},assets:[asset],
    layers:[{id:"character",assetId:asset.id,visible:true,zIndex:0,pivot:[width/2,height/2],transform:identity}],bones,attachments:[],clips:[]};
  const evaluated=evaluateRig2D(rig,{pose:{}}).bones;
  // Fixed cell size at working resolution; keep only occupied cells and their shared vertices.
  const seamX=(joints.hip_l[0]+joints.hip_r[0])/2,legTop=Math.max(joints.hip_l[1],joints.hip_r[1]);
  const xs=Array.from(new Set([...Array.from({length:41},(_,i)=>i/40*width),seamX])).sort((a,b)=>a-b);
  const rows=Math.min(64,Math.max(8,Math.round(40*height/width))),columns=xs.length-1,occupied=new Uint8Array(columns*rows);
  const xCells=new Uint8Array(width);let cell=0;
  for(let x=0;x<width;x++){while(cell+1<columns&&x>=xs[cell+1])cell++;xCells[x]=cell;}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(alpha[y*width+x]>8)occupied[Math.min(rows-1,Math.floor(y/height*rows))*columns+xCells[x]]=1;
  const skin:Skin2D={vertices:[],triangles:[],weights:[]},indices=new Map<string,number>();
  function vertex(x:number,y:number,side:"l"|"r"){
    const imageY=y/rows*height,lower=imageY>=legTop;
    // The midline lies in the gap between separated legs. Duplicate seam vertices so a
    // coarse cell never transfers the moving leg's weights to the stationary boot.
    const atSeam=xs[x]===seamX&&lower,key=`${y*(columns+1)+x}${atSeam?side:""}`,existing=indices.get(key);if(existing!==undefined)return existing;
    const p:Point=[xs[x],height-imageY],world:Point=[p[0]-width/2,p[1]-height/2];
    const legSide=xs[x]===seamX?side:xs[x]<seamX?"l":"r";
    const candidates=lower?evaluated.filter((b)=>b.id==="body"||["thigh_","shin_","foot_"].some((prefix)=>b.id===prefix+legSide)):evaluated;
    const ranked=candidates.map((bone)=>({bone,d:segmentDistance(world,bone.head,bone.tail)})).sort((a,b)=>a.d-b.d);
    const first=ranked[0],definition=bones.find((b)=>b.id===first.bone.id)!;
    const second=ranked.slice(1).find(({bone,d})=>d-first.d<height*.035&&(definition.parentId===bone.id||bones.find((b)=>b.id===bone.id)!.parentId===definition.id));
    const influences=[first,...(second?[second]:[])],scores=influences.map(({d})=>1/Math.pow(d+height*.012,4)),sum=scores.reduce((a,b)=>a+b,0);
    const index=skin.vertices.length;indices.set(key,index);skin.vertices.push(p);
    skin.weights.push(influences.map(({bone},i)=>({boneId:bone.id,weight:scores[i]/sum})));return index;
  }
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)if(occupied[y*columns+x]){
    const side=(xs[x]+xs[x+1])/2<seamX?"l":"r";
    const a=vertex(x,y,side),b=vertex(x+1,y,side),c=vertex(x,y+1,side),d=vertex(x+1,y+1,side);skin.triangles.push([a,c,b],[b,c,d]);
  }
  check(skin.triangles.length>0,"На изображении нет видимых пикселей");rig.layers[0].skin=skin;
  function track(boneId:string,angles:number[],duration:number,breathing=false):Rig2DDocument["clips"][number]["tracks"][number]{
    const bind=bones.find((b)=>b.id===boneId)!.bind;
    return {boneId,rotationMode:"unwrapped",keys:angles.map((angle,i)=>({time:i/(angles.length-1)*duration,interpolation:"linear",transform:{position:[...bind.position],rotation:bind.rotation+angle,scale:[breathing?1+(i%2)*.008:1,1]}}))};
  }
  rig.clips=[{id:"idle",duration:4,loop:true,tracks:[track("body",[0,0,0],4,true),track("head",[0,.015,0],4)]},
    {id:"greeting",duration:3,loop:true,tracks:[track("forearm_r",[0,.75,.55,.85,0],3),track("hand_r",[0,.1,-.1,.1,0],3)]}];
  return parseRig2D(rig);
}
