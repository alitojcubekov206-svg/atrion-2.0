import { check, choice, id, list, number, record, text, unique, vector2 } from "./validation";
import { parseDeformers, type Deformer2D } from "./deformers";

export type Keyform2D={value:number;position:[number,number];rotation:number;scale:[number,number];points?:[number,number][]};
export type Parameter2D={id:string;name:string;min:number;max:number;default:number;value:number;deformerId:string;keyforms:Keyform2D[]};
export type ParameterTrack2D={parameterId:string;keys:{time:number;value:number;interpolation:"linear"|"step"}[]};

export function captureKeyform(d:Deformer2D,value:number):Keyform2D {
  return {value,position:[...d.position],rotation:d.rotation,scale:[...d.scale],...(d.kind==='warp'?{points:d.points.map(p=>[...p] as [number,number])}:{})};
}

/** Check the entire interpolation interval: each oriented corner is quadratic in t. */
function checkWarpInterval(a:[number,number][],b:[number,number][],columns:number,rows:number){
  const cross=(p:number[],q:number[],r:number[])=>(q[0]-p[0])*(r[1]-q[1])-(q[1]-p[1])*(r[0]-q[0]);
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const i=y*(columns+1)+x,indices=[i,i+1,i+columns+2,i+columns+1];
    for(let j=0;j<4;j++){
      const ids=[indices[j],indices[(j+1)%4],indices[(j+2)%4]];
      const f=(t:number)=>{const p=ids.map(k=>[a[k][0]+(b[k][0]-a[k][0])*t,a[k][1]+(b[k][1]-a[k][1])*t]);return cross(p[0],p[1],p[2]);};
      const c=f(0),end=f(1),middle=f(.5),aa=2*(end+c-2*middle),bb=end-c-aa;
      check(c>1e-8&&end>1e-8,"Вырожденная ключевая форма");
      const t=aa>0?-bb/(2*aa):-1;
      check(!(t>0&&t<1)||f(t)>1e-8,"Между ключевыми формами складывается сетка");
    }
  }
}

export function parseParameters(input:unknown,deformers:Deformer2D[]):Parameter2D[]{
  const targets=new Map(deformers.map(d=>[d.id,d])),used=new Set<string>();let pointCount=0;
  const parameters=list(input,"parameters",64).map((raw):Parameter2D=>{
    const p=record(raw,"parameter"),min=number(p.min,"parameter.min"),max=number(p.max,"parameter.max");check(max>min,"Максимум параметра должен быть больше минимума");
    const deformerId=id(p.deformerId,"parameter.deformerId"),target=targets.get(deformerId);check(target,"Параметр ссылается на неизвестный деформер");
    check(!used.has(deformerId),"Один деформер может управляться одним параметром; для сочетания используйте вложенность");used.add(deformerId);
    let previous=-Infinity;
    const keyforms=list(p.keyforms,"parameter.keyforms",32,1).map(raw=>{
      const k=record(raw,"keyform"),value=number(k.value,"keyform.value",min,max);check(value>previous,"Ключевые формы должны идти по возрастанию без повторов");previous=value;
      const position=vector2(k.position,"keyform.position"),scale=vector2(k.scale,"keyform.scale"),rotation=number(k.rotation,"keyform.rotation");
      check(scale.every(v=>v>=.01&&v<=100),"Масштаб формы должен быть 0.01–100");
      let points:[number,number][]|undefined;
      if(target.kind==='warp'){
        points=list(k.points,"keyform.points",289,4).map(p=>vector2(p,"keyform.point"));check(points.length===target.points.length,"Сетка ключевой формы не совпадает с деформером");
        pointCount+=points.length;check(pointCount<=32768,"Превышен бюджет ключевых форм");
        parseDeformers([{...target,parentId:null,points,position,scale,rotation}]);
      }else check(k.points===undefined,"У поворотной формы не должно быть точек Warp");
      return {value,position,scale,rotation,...(points?{points}:{})};
    });
    if(target.kind==='warp')for(let i=1;i<keyforms.length;i++)checkWarpInterval(keyforms[i-1].points!,keyforms[i].points!,target.columns,target.rows);
    const initial=number(p.default,"parameter.default",min,max);
    check(keyforms.some(k=>k.value===initial),"Нужна ключевая форма в значении по умолчанию");
    return {id:id(p.id,"parameter.id"),name:text(p.name,"parameter.name"),min,max,default:initial,value:number(p.value,"parameter.value",min,max),deformerId,keyforms};
  });
  unique(parameters,"parameters");return parameters;
}

export function sampleKeyforms(parameter:Parameter2D,value:number):Keyform2D{
  const keys=parameter.keyforms;
  if(value<=keys[0].value)return keys[0];
  for(let i=1;i<keys.length;i++)if(value<keys[i].value){
    const a=keys[i-1],b=keys[i],t=(value-a.value)/(b.value-a.value),lerp=(x:number,y:number)=>x+(y-x)*t;
    const pair=(a:[number,number],b:[number,number]):[number,number]=>[lerp(a[0],b[0]),lerp(a[1],b[1])];
    return {value,position:pair(a.position,b.position),scale:pair(a.scale,b.scale),rotation:lerp(a.rotation,b.rotation),...(a.points?{points:a.points.map((p,i)=>pair(p,b.points![i]))}:{})};
  }
  return keys[keys.length-1];
}

export function parameterValues(parameters:Parameter2D[],tracks:ParameterTrack2D[]=[],time=0,override:unknown={}):Record<string,number>{
  const values:Record<string,number>=Object.create(null);
  for(const p of parameters)values[p.id]=p.value;
  for(const track of tracks){const keys=track.keys;let value=keys[keys.length-1].value;
    if(time<=keys[0].time)value=keys[0].value;
    else for(let i=1;i<keys.length;i++)if(time<keys[i].time){const a=keys[i-1],b=keys[i];value=a.interpolation==='step'?a.value:a.value+(b.value-a.value)*(time-a.time)/(b.time-a.time);break;}
    values[track.parameterId]=value;
  }
  for(const [key,value] of Object.entries(record(override,"parameterValues"))){const p=parameters.find(p=>p.id===key);check(p,"Неизвестный параметр");values[key]=number(value,"parameter.value",p.min,p.max);}
  return values;
}

export function applyParameters(deformers:Deformer2D[],parameters:Parameter2D[],values:Record<string,number>):Deformer2D[]{
  const byTarget=new Map(parameters.map(p=>[p.deformerId,p]));
  return deformers.map(d=>{const p=byTarget.get(d.id);if(!p)return d;const k=sampleKeyforms(p,values[p.id]);return {...d,position:k.position,scale:k.scale,rotation:k.rotation,...(d.kind==='warp'?{points:k.points!}:{})};});
}

export function parseParameterTracks(input:unknown,parameters:Parameter2D[],duration:number):ParameterTrack2D[]{
  const used=new Set<string>();let count=0;
  return list(input,"parameterTracks",64).map(raw=>{const t=record(raw,"parameterTrack"),parameterId=id(t.parameterId,"parameterId"),p=parameters.find(p=>p.id===parameterId);check(p&&!used.has(parameterId),"Неизвестный или повторный параметр трека");used.add(parameterId);let previous=-1;
    const keys=list(t.keys,"parameterTrack.keys",512,1).map(raw=>{const k=record(raw,"parameterKey"),time=number(k.time,"parameterKey.time",0,duration);check(time>previous,"Время ключей параметра должно возрастать");previous=time;check(++count<=4096,"Слишком много ключей параметров");return {time,value:number(k.value,"parameterKey.value",p.min,p.max),interpolation:choice(k.interpolation,["linear","step"] as const,"parameterKey.interpolation")};});return {parameterId,keys};});
}
