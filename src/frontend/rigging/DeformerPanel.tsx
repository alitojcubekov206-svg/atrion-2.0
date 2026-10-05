"use client";
import { useEffect, useRef, useState } from "react";
import { matrix2D, point2D, type Rig2DDocument } from "@/shared/rigging/rig2d";
import { neutralDeformer, parseDeformers, type Deformer2D } from "@/shared/rigging/deformers";

const button="rounded-lg border border-white/20 px-3 py-2 text-xs disabled:opacity-40";
const input="w-full rounded-lg border border-white/20 bg-[#211f2e] p-2 text-xs";
function Field({label,value,change}:{label:string;value:number;change:(n:number)=>void}){
  const [draft,setDraft]=useState(String(Math.round(value*10000)/10000));useEffect(()=>setDraft(String(Math.round(value*10000)/10000)),[value]);
  return <label className="text-xs text-white/60">{label}<input aria-label={label} className={input} type="number" step="0.1" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft.trim()&&Number.isFinite(Number(draft))&&Number(draft)!==Math.round(value*10000)/10000)change(Number(draft));setDraft(String(Math.round(value*10000)/10000));}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>;
}

export default function DeformerPanel({document,layerId,onChange,onPreview}:{document:Rig2DDocument;layerId:string;onChange:(edit:(doc:Rig2DDocument)=>void)=>boolean;onPreview:(doc:Rig2DDocument|null)=>void}){
  const [selected,setSelected]=useState(''),[pointIndex,setPointIndex]=useState(4),[error,setError]=useState('');
  const deformers=document.deformers??[],current=deformers.find(d=>d.id===selected),layer=document.layers.find(l=>l.id===layerId);
  const [draft,setDraft]=useState<Deformer2D|undefined>(current),drag=useRef<{index:number;before:Deformer2D}|null>(null),live=useRef(draft);live.current=draft;
  useEffect(()=>{drag.current=null;setDraft(current);},[current]);
  function update(edit:(d:Deformer2D)=>void){if(!current)return;const okay=onChange(doc=>edit(doc.deformers!.find(d=>d.id===current.id)!));if(okay)setError('');}
  function add(kind:Deformer2D['kind']){
    if(!layer?.skin)return;
    const points=layer.skin.vertices.map(p=>point2D(matrix2D(layer.transform),[p[0]-layer.pivot[0],p[1]-layer.pivot[1]]));
    const min:[number,number]=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],max=[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
    const id=`deformer_${crypto.randomUUID()}`;
    if(onChange(doc=>{doc.deformers??=[];doc.deformers.push(neutralDeformer(id,kind,min,[Math.max(1,max[0]-min[0]),Math.max(1,max[1]-min[1])],layer.deformerId??null));doc.layers.find(l=>l.id===layer.id)!.deformerId=id;}))setSelected(id);
  }
  function previewPoint(e:React.PointerEvent<SVGSVGElement>){
          const active=drag.current;if(!active||active.before.kind!=='warp')return;
          const matrix=e.currentTarget.getScreenCTM();if(!matrix)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());
          const next=structuredClone(active.before);next.points[active.index]=[p.x,-p.y];
          try{parseDeformers([...deformers.filter(d=>d.id!==next.id),next]);const doc={...document,deformers:document.deformers!.map(d=>d.id===next.id?next:d)};live.current=next;setDraft(next);onPreview(doc);setError('');}catch(err){setError((err as Error).message);}
        }
  function finish(cancel=false){const active=drag.current;drag.current=null;if(!active)return;onPreview(null);if(!cancel&&live.current){const next=live.current;onChange(doc=>{const index=doc.deformers!.findIndex(d=>d.id===next.id);doc.deformers![index]=next;});}else setDraft(active.before);}
  const cage=draft?.kind==='warp'?draft:undefined;
  const bounds=cage?{x:cage.origin[0]-cage.size[0]*.3,y:-cage.origin[1]-cage.size[1]*1.3,w:cage.size[0]*1.6,h:cage.size[1]*1.6}:null;
  return <section aria-label="Деформеры 2D" className="space-y-3 rounded-xl border border-teal-300/20 p-4">
    <div className="flex flex-wrap items-center gap-2"><h2 className="mr-auto text-sm font-semibold">Деформеры</h2><button className={button} disabled={!layer?.skin} onClick={()=>add('warp')}>+ Warp</button><button className={button} disabled={!layer?.skin} onClick={()=>add('rotation')}>+ Поворот</button></div>
    <p className="text-xs text-white/50">Выберите слой с сеткой справа. Деформер управляет всеми назначенными ему слоями. Порядок: сетка → дочерний деформер → родитель → кости.</p>
    <select aria-label="Деформер" className={input} value={current?.id??''} onChange={e=>{onPreview(null);setSelected(e.target.value);}}><option value="">Выберите деформер</option>{deformers.map((d,i)=><option key={d.id} value={d.id}>{d.kind==='warp'?'Warp':'Поворот'} {i+1}{d.parentId?' · вложенный':''}</option>)}</select>
    {layer?.skin&&<label className="block text-xs">Деформер выбранного слоя<select aria-label="Деформер слоя" className={input} value={layer.deformerId??''} onChange={e=>onChange(doc=>{const l=doc.layers.find(l=>l.id===layer.id)!;if(e.target.value)l.deformerId=e.target.value;else delete l.deformerId;})}><option value="">Без деформера</option>{deformers.map((d,i)=><option key={d.id} value={d.id}>{d.kind==='warp'?'Warp':'Поворот'} {i+1}</option>)}</select></label>}
    {current&&<><label className="block text-xs">Родитель деформера<select aria-label="Родитель деформера" className={input} value={current.parentId??''} onChange={e=>update(d=>{d.parentId=e.target.value||null;})}><option value="">Корневой</option>{deformers.filter(d=>d.id!==current.id).map(d=><option key={d.id} value={d.id}>{d.kind==='warp'?'Warp':'Поворот'} {deformers.indexOf(d)+1}</option>)}</select></label>
      <p className="text-xs text-white/45">Смена родителя сохраняет числовые настройки; внешний вид может измениться.</p>
      <div className="grid grid-cols-2 gap-2">{(['position','pivot','scale'] as const).flatMap(key=>[0,1].map(axis=><Field key={`${key}${axis}`} label={`${key==='position'?'Сдвиг':key==='pivot'?'Центр':'Масштаб'} деформера ${axis?'Y':'X'}`} value={current[key][axis]} change={v=>update(d=>{d[key][axis]=v;})}/>))}<Field label="Угол деформера°" value={current.rotation*180/Math.PI} change={v=>update(d=>{d.rotation=v*Math.PI/180;})}/></div>
      {cage&&bounds&&<><p className="text-xs text-white/60">Тяните управляющие точки. Сетка показана в исходных координатах до поворота и масштаба; изображение выше показывает результат.</p>
        <svg aria-label="Сетка деформера" viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} className="h-56 w-full touch-none rounded-lg bg-black/25" onPointerMove={previewPoint} onPointerUp={e=>{previewPoint(e);finish();}} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>finish()}>
          {Array.from({length:cage.rows+1},(_,y)=><polyline key={`r${y}`} points={Array.from({length:cage.columns+1},(_,x)=>{const p=cage.points[y*(cage.columns+1)+x];return `${p[0]},${-p[1]}`;}).join(' ')} fill="none" stroke="#6ee7d8" strokeWidth={bounds.w/500}/>)}
          {Array.from({length:cage.columns+1},(_,x)=><polyline key={`c${x}`} points={Array.from({length:cage.rows+1},(_,y)=>{const p=cage.points[y*(cage.columns+1)+x];return `${p[0]},${-p[1]}`;}).join(' ')} fill="none" stroke="#6ee7d8" strokeWidth={bounds.w/500}/>)}
          {cage.points.map((p,i)=><circle key={i} cx={p[0]} cy={-p[1]} r={bounds.w/65} fill={pointIndex===i?'#ffc65a':'#a7fff1'} onPointerDown={e=>{setPointIndex(i);drag.current={index:i,before:structuredClone(cage)};e.currentTarget.setPointerCapture(e.pointerId);}}/>)}
        </svg>
        <div className="grid grid-cols-2 gap-2">{cage.points[Math.min(pointIndex,cage.points.length-1)].map((v,axis)=><Field key={`${current.id}-${pointIndex}-${axis}`} label={`Точка деформера ${axis?'Y':'X'}`} value={v} change={value=>update(d=>{if(d.kind==='warp')d.points[Math.min(pointIndex,d.points.length-1)][axis]=value;})}/>)}</div>
      </>}
      <div className="flex flex-wrap gap-2"><button className={button} onClick={()=>update(d=>{d.position=[0,0];d.rotation=0;d.scale=[1,1];if(d.kind==='warp')d.points=d.points.map((_,i)=>[d.origin[0]+(i%(d.columns+1))*d.size[0]/d.columns,d.origin[1]+Math.floor(i/(d.columns+1))*d.size[1]/d.rows]);})}>Сбросить деформацию</button><button className={button} onClick={()=>{if(onChange(doc=>{doc.deformers=doc.deformers!.filter(d=>d.id!==current.id).map(d=>d.parentId===current.id?{...d,parentId:current.parentId}:d);for(const l of doc.layers)if(l.deformerId===current.id){if(current.parentId)l.deformerId=current.parentId;else delete l.deformerId;}}))setSelected('');}}>Удалить деформер</button></div>
    </>}
    {error&&<p role="alert" className="text-xs text-red-200">{error}</p>}
  </section>;
}



