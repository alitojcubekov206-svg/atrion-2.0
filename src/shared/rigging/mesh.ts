import type { Skin2D } from "./rig2d";
import { check, integer, number } from "./validation";

type Point=[number,number];
type Triangle=[number,number,number];
const area=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const editable=(skin:Skin2D):Skin2D & {uv:Point[]}=>({...structuredClone(skin),uv:structuredClone(skin.uv??skin.vertices)});

/** Regular triangulation covers the layer rectangle; texture alpha keeps its silhouette. */
export function gridMesh(width:number,height:number,columns:number,rows:number,boneId:string):Skin2D{
  number(width,"width",1,8192);number(height,"height",1,8192);integer(columns,"columns",1,32);integer(rows,"rows",1,32);
  const vertices:Point[]=[],triangles:Triangle[]=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++)vertices.push([width*x/columns,height*y/rows]);
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x,b=a+1,c=a+columns+1,d=c+1;triangles.push([a,b,d],[a,d,c]);}
  return {vertices,uv:structuredClone(vertices),triangles,weights:vertices.map(()=>[{boneId,weight:1}])};
}

export function moveMeshVertex(skin:Skin2D,index:number,point:Point,width:number,height:number):Skin2D{
  integer(index,"vertex",0,skin.vertices.length-1);number(point[0],"X",0,width);number(point[1],"Y",0,height);
  const next=editable(skin);next.vertices[index]=[...point];
  for(const triangle of skin.triangles){if(!triangle.includes(index))continue;
    const before=area(...triangle.map((i)=>skin.vertices[i]) as [Point,Point,Point]);
    const after=area(...triangle.map((i)=>next.vertices[i]) as [Point,Point,Point]);
    check(before*after>0&&Math.abs(after)>1e-6,"Вершина переворачивает или схлопывает треугольник");
  }
  return next;
}

/** Split one face, interpolate UV and skin weights, preserve every existing index. */
export function insertMeshVertex(skin:Skin2D,point:Point):Skin2D{
  check(skin.vertices.length<4096&&skin.triangles.length+2<=8192,"Превышен бюджет сетки");
  for(const [face,triangle] of skin.triangles.entries()){
    const [a,b,c]=triangle.map((i)=>skin.vertices[i]),total=area(a,b,c);
    const bary=[area(point,b,c)/total,area(a,point,c)/total,area(a,b,point)/total];
    if(!bary.every((v)=>v>1e-5&&v<1))continue;
    const next=editable(skin),uv:Point=[0,0],weights=new Map<string,number>();
    triangle.forEach((index,k)=>{uv[0]+=next.uv[index][0]*bary[k];uv[1]+=next.uv[index][1]*bary[k];
      for(const influence of skin.weights[index])weights.set(influence.boneId,(weights.get(influence.boneId)??0)+influence.weight*bary[k]);});
    const influences=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=influences.reduce((s,w)=>s+w[1],0),n=next.vertices.length;
    next.vertices.push([...point]);next.uv.push(uv);next.weights.push(influences.map(([boneId,weight])=>({boneId,weight:weight/sum})));
    const [i,j,k]=triangle;next.triangles.splice(face,1,[i,j,n],[j,k,n],[k,i,n]);return next;
  }
  throw new Error("Добавьте вершину внутри треугольника, чуть дальше от рёбер");
}

/** Retriangulate only the removed vertex's one-ring; a boundary deletion trims the outline. */
export function removeMeshVertex(skin:Skin2D,index:number):Skin2D{
  integer(index,"vertex",0,skin.vertices.length-1);check(skin.vertices.length>3,"Нужно оставить минимум три вершины");
  const next=editable(skin),faces=skin.triangles.filter((t)=>t.includes(index));
  const neighbors=new Map<number,number[]>();
  for(const face of faces){const [a,b]=face.filter((v)=>v!==index);neighbors.set(a,[...(neighbors.get(a)??[]),b]);neighbors.set(b,[...(neighbors.get(b)??[]),a]);}
  const ends=[...neighbors].filter(([,n])=>n.length===1).map(([id])=>id);
  check(neighbors.size>=2&&(ends.length===0||ends.length===2)&&[...neighbors.values()].every((n)=>n.length===1||n.length===2),"Некорректная окрестность вершины");
  const ring=[ends[0]??neighbors.keys().next().value!];let previous=-1;
  while(true){const current=ring[ring.length-1],following=neighbors.get(current)!.find((n)=>n!==previous);if(following===undefined||following===ring[0])break;
    check(!ring.includes(following),"Некорректная окрестность вершины");ring.push(following);previous=current;}
  check(ring.length===neighbors.size,"Несвязная окрестность вершины");
  const signed=ring.reduce((s,id,i)=>{const a=next.vertices[id],b=next.vertices[ring[(i+1)%ring.length]];return s+a[0]*b[1]-b[0]*a[1];},0);
  if(signed<0)ring.reverse();const fill:Triangle[]=[];
  while(ring.length>3){let clipped=false;
    for(let i=0;i<ring.length;i++){
      const a=ring[(i+ring.length-1)%ring.length],b=ring[i],c=ring[(i+1)%ring.length],pa=next.vertices[a],pb=next.vertices[b],pc=next.vertices[c];
      if(area(pa,pb,pc)<=1e-6)continue;
      if(ring.some((id)=>id!==a&&id!==b&&id!==c&&area(pa,pb,next.vertices[id])>=-1e-6&&area(pb,pc,next.vertices[id])>=-1e-6&&area(pc,pa,next.vertices[id])>=-1e-6))continue;
      fill.push([a,b,c]);ring.splice(i,1);clipped=true;break;
    }
    check(clipped,"Не удалось триангулировать окрестность вершины");
  }
  if(ring.length===3)fill.push(ring as Triangle);
  for(const t of fill)check(area(...t.map((i)=>next.uv[i]) as [Point,Point,Point])>1e-6,"Удаление схлопывает или переворачивает UV-треугольник");
  next.triangles=[...skin.triangles.filter((t)=>!t.includes(index)),...fill].map((t)=>t.map((i)=>i>index?i-1:i) as Triangle);
  check(next.triangles.length>0,"Нужно оставить минимум один треугольник");
  next.vertices.splice(index,1);next.uv.splice(index,1);next.weights.splice(index,1);return next;
}
