import { check, choice, hierarchy, id, integer, list, number, parent, record, vector2 } from "./validation";

type Point=[number,number];
type Base={id:string;parentId:string|null;pivot:Point;position:Point;rotation:number;scale:Point};
export type Deformer2D=(Base & {kind:"rotation"}) | (Base & {
  kind:"warp";origin:Point;size:Point;columns:number;rows:number;points:Point[];
});

/** All cages use model rest coordinates (+y up), before bone skinning. */
export function parseDeformers(input:unknown):Deformer2D[] {
  let controls=0;
  const deformers=list(input,"deformers",128).map((raw):Deformer2D=>{
    const d=record(raw,"deformer"),kind=choice(d.kind,["rotation","warp"] as const,"deformer.kind");
    const scale=vector2(d.scale,"deformer.scale");
    check(scale.every(v=>v>=0.01&&v<=100),"Масштаб деформера должен быть 0.01–100");
    const base={id:id(d.id,"deformer.id"),parentId:parent(d.parentId),pivot:vector2(d.pivot,"deformer.pivot"),position:vector2(d.position,"deformer.position"),rotation:number(d.rotation,"deformer.rotation"),scale};
    if(kind==="rotation")return {...base,kind};
    const columns=integer(d.columns,"deformer.columns",1,16),rows=integer(d.rows,"deformer.rows",1,16);
    const size=vector2(d.size,"deformer.size"),origin=vector2(d.origin,"deformer.origin");
    check(size.every(v=>v>=0.01&&v<=32768),"Некорректный размер сетки деформера");
    const points=list(d.points,"deformer.points",289,4).map(p=>vector2(p,"deformer.point"));
    check(points.length===(columns+1)*(rows+1),"Число управляющих точек не соответствует сетке");
    controls+=points.length;check(controls<=8192,"Превышен бюджет управляющих точек");
    // Convex, consistently oriented cells keep the bilinear Jacobian positive.
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
      const a=y*(columns+1)+x,q=[points[a],points[a+1],points[a+columns+2],points[a+columns+1]];
      for(let i=0;i<4;i++){const p=q[i],b=q[(i+1)%4],c=q[(i+2)%4];check((b[0]-p[0])*(c[1]-b[1])-(b[1]-p[1])*(c[0]-b[0])>1e-8,"Сетка деформера складывается или вырождается");}
    }
    return {...base,kind,origin,size,columns,rows,points};
  });
  hierarchy(deformers);
  return deformers;
}

export function neutralDeformer(id:string,kind:Deformer2D['kind'],origin:Point,size:Point,parentId:string|null=null):Deformer2D {
  const base={id,parentId,pivot:[origin[0]+size[0]/2,origin[1]+size[1]/2] as Point,position:[0,0] as Point,rotation:0,scale:[1,1] as Point};
  if(kind==='rotation')return {...base,kind};
  return {...base,kind,origin,size,columns:2,rows:2,points:Array.from({length:9},(_,i):Point=>[origin[0]+(i%3)*size[0]/2,origin[1]+Math.floor(i/3)*size[1]/2])};
}

export function deformPoint(d:Deformer2D,point:Point):Point {
  let [x,y]=point;
  if(d.kind==='warp'){
    const u=Math.max(0,Math.min(d.columns,(x-d.origin[0])/d.size[0]*d.columns)),v=Math.max(0,Math.min(d.rows,(y-d.origin[1])/d.size[1]*d.rows));
    const column=Math.min(d.columns-1,Math.floor(u)),row=Math.min(d.rows-1,Math.floor(v)),a=u-column,b=v-row;
    // Extend boundary displacement, rather than clamping outside vertices onto the cage.
    for(const [dx,dy,weight] of [[0,0,(1-a)*(1-b)],[1,0,a*(1-b)],[0,1,(1-a)*b],[1,1,a*b]]){
      const p=d.points[(row+dy)*(d.columns+1)+column+dx];
      x+=(p[0]-(d.origin[0]+(column+dx)*d.size[0]/d.columns))*weight;
      y+=(p[1]-(d.origin[1]+(row+dy)*d.size[1]/d.rows))*weight;
    }
  }
  const sx=(x-d.pivot[0])*d.scale[0],sy=(y-d.pivot[1])*d.scale[1],c=Math.cos(d.rotation),s=Math.sin(d.rotation);
  return [d.pivot[0]+d.position[0]+sx*c-sy*s,d.pivot[1]+d.position[1]+sx*s+sy*c];
}

export function deformerChain(deformers:Deformer2D[],leaf:string):Deformer2D[] {
  const byId=new Map(deformers.map(d=>[d.id,d])),chain:Deformer2D[]=[],seen=new Set<string>();
  let current:string|null=leaf;
  while(current!==null){check(!seen.has(current),"Цикл деформеров");seen.add(current);const d=byId.get(current);check(d,"Неизвестный деформер");chain.push(d);current=d.parentId;}
  return chain;
}
