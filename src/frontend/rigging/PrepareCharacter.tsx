"use client";
import { useEffect, useRef, useState } from "react";
import { BODY_BONES, JOINTS, defaultLandmarks, fullBodyRig, type JointId, type Landmarks } from "@/shared/rigging/fullbody";
import { removeWhiteBorder } from "@/shared/rigging/cutout";
import type { Rig2DDocument } from "@/shared/rigging/rig2d";

type Prepared={asset:Rig2DDocument["assets"][number];alpha:Uint8Array;bounds:{left:number;top:number;right:number;bottom:number}};
const button="rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40";

async function prepare(blob:Blob,removeBackground:boolean,tolerance:number,seeds:[number,number][]):Promise<Prepared>{
  if(!["image/png","image/webp","image/jpeg"].includes(blob.type)||blob.size>8*1024*1024)throw new Error("Нужен PNG, WebP или JPEG до 8 MiB");
  const url=URL.createObjectURL(blob),image=new Image();
  try {
    image.src=url;await image.decode();
    if(image.width>8192||image.height>8192||image.width*image.height>20_000_000)throw new Error("Изображение слишком большое: уменьшите его до 4096 × 4096");
    const factor=Math.min(1,1024/Math.max(image.width,image.height)),width=Math.max(1,Math.round(image.width*factor)),height=Math.max(1,Math.round(image.height*factor));
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});if(!ctx)throw new Error("Canvas недоступен");
    ctx.drawImage(image,0,0,width,height);const pixels=ctx.getImageData(0,0,width,height);
    if(removeBackground)pixels.data.set(removeWhiteBorder(pixels.data,width,height,tolerance,seeds));
    ctx.putImageData(pixels,0,0);
    const alpha=new Uint8Array(width*height),bounds={left:width,top:height,right:0,bottom:0};
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const value=pixels.data[(y*width+x)*4+3];alpha[y*width+x]=value;
      if(value>8){bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x+1);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y+1);}
    }
    if(bounds.right-bounds.left<32||bounds.bottom-bounds.top<64)throw new Error("Персонаж не найден. Уменьшите удаление фона или загрузите другой рисунок.");
    let uri="";
    for(const quality of [.94,.86,.76,.64]){uri=canvas.toDataURL("image/webp",quality);if(atob(uri.split(",")[1]).length<=262144)break;}
    if(!uri.startsWith("data:image/webp;")||atob(uri.split(",")[1]).length>262144)throw new Error("Рисунок не помещается в 256 KiB. Загрузите менее крупное изображение.");
    return {asset:{id:"character_art",uri,mime:"image/webp",width,height},alpha,bounds};
  } finally {URL.revokeObjectURL(url);}
}

export default function PrepareCharacter({source,onCreate,onClose}:{source:Blob;onCreate:(rig:Rig2DDocument)=>void;onClose:()=>void}){
  const [prepared,setPrepared]=useState<Prepared|null>(null),[joints,setJoints]=useState<Landmarks|null>(null);
  const [remove,setRemove]=useState(source.type==="image/jpeg"),[tolerance,setTolerance]=useState(24),[error,setError]=useState("");
  const [selected,setSelected]=useState<JointId>("neck"),[busy,setBusy]=useState(true),[history,setHistory]=useState<Landmarks[]>([]);
  const [seeds,setSeeds]=useState<[number,number][]>([]),[erase,setErase]=useState(false);
  const drag=useRef<{id:JointId;before:Landmarks}|null>(null);
  useEffect(()=>{setJoints(null);setHistory([]);setSeeds([]);setErase(false);setRemove(source.type==="image/jpeg");drag.current=null;},[source]);
  useEffect(()=>{
    let active=true;setBusy(true);setError("");
    prepare(source,remove,tolerance,seeds).then((result)=>{if(active){setPrepared(result);setJoints((previous)=>previous??defaultLandmarks(result.bounds));}})
      .catch((e)=>{if(active){setPrepared(null);setError((e as Error).message);}}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[source,remove,tolerance,seeds]);
  const w=prepared?.asset.width??1024,h=prepared?.asset.height??1024;
  function move(event:React.PointerEvent<SVGSVGElement>){
    if(!drag.current||!joints)return;const rect=event.currentTarget.getBoundingClientRect();
    const p:[number,number]=[Math.max(0,Math.min(w,(event.clientX-rect.left)/rect.width*w)),Math.max(0,Math.min(h,(event.clientY-rect.top)/rect.height*h))];
    setJoints({...joints,[drag.current.id]:p});
  }
  function finish(cancel=false){if(!drag.current)return;const before=drag.current.before;drag.current=null;if(cancel)setJoints(before);else setHistory((items)=>[...items.slice(-29),before]);}
  return <section aria-label="Подготовка полного роста" className="rounded-2xl border border-teal-300/30 bg-[#171d24] p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Рисунок → скелет → движение</h2><p className="mt-1 text-sm text-white/60">Совместите точки с суставами. Левая и правая стороны указаны относительно экрана.</p></div><button className={button} onClick={onClose}>Закрыть подготовку</button></div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,620px)_minmax(200px,1fr)]">
      <div className="relative overflow-hidden rounded-xl bg-[#302c40]" style={{backgroundImage:"conic-gradient(#302c40 25%,#262333 0 50%,#302c40 0 75%,#262333 0)",backgroundSize:"24px 24px"}}>
        {prepared&&joints&&<svg aria-label="Суставы на рисунке" viewBox={`0 0 ${w} ${h}`} className="block w-full touch-none" onPointerDown={(event)=>{if(!erase||!remove||busy)return;const r=event.currentTarget.getBoundingClientRect();setSeeds([...seeds,[Math.floor((event.clientX-r.left)/r.width*w),Math.floor((event.clientY-r.top)/r.height*h)]]);}} onPointerMove={move} onPointerUp={()=>finish()} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>finish()}>
          <image href={prepared.asset.uri} width={w} height={h}/>
          {BODY_BONES.map(([id,,from,to])=><line key={id} x1={joints[from][0]} y1={joints[from][1]} x2={joints[to][0]} y2={joints[to][1]} stroke="#70ffe0" strokeWidth={2} vectorEffect="non-scaling-stroke"/>)}
          {JOINTS.map(([id,label])=><g key={id} aria-label={label} role="button" tabIndex={0} onFocus={()=>setSelected(id)} onKeyDown={(event)=>{
            const directions:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},direction=directions[event.key];if(!direction)return;
            event.preventDefault();setHistory((items)=>[...items.slice(-29),joints]);const step=event.shiftKey?10:1;
            setJoints({...joints,[id]:[Math.max(0,Math.min(w,joints[id][0]+direction[0]*step)),Math.max(0,Math.min(h,joints[id][1]+direction[1]*step))]});
          }} onPointerDown={(event)=>{if(erase||busy)return;event.stopPropagation();event.preventDefault();setSelected(id);drag.current={id,before:structuredClone(joints)};event.currentTarget.ownerSVGElement!.setPointerCapture(event.pointerId);}} style={{cursor:erase?"crosshair":"grab"}}>
            <title>{label}</title><circle cx={joints[id][0]} cy={joints[id][1]} r={17} fill="transparent"/><circle cx={joints[id][0]} cy={joints[id][1]} r={selected===id?8:5} fill={selected===id?"#ffda80":"#9affdf"} stroke="#182432" strokeWidth={2}/>
          </g>)}
        </svg>}
        {busy&&<div role="status" className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm">Подготавливаю рисунок…</div>}
      </div>
      <div className="space-y-4 text-sm">
        <p className="text-teal-100">1. Проверьте контур и прозрачность.<br/>2. Перетащите точки на суставы.<br/>3. Соберите риг и проверьте движение.</p>
        <label className="flex items-center gap-2"><input type="checkbox" checked={remove} onChange={(event)=>setRemove(event.target.checked)}/>Убрать белый фон от краёв</label>
        {remove&&<label className="block text-white/65">Допуск белого: {tolerance}<input aria-label="Допуск белого" type="range" min={4} max={64} value={tolerance} onChange={(e)=>setTolerance(Number(e.target.value))} className="mt-2 w-full accent-teal-300"/></label>}
        {remove&&<div className="space-y-2"><label className="flex gap-2"><input type="checkbox" checked={erase} onChange={(e)=>setErase(e.target.checked)}/>Убирать белые участки кликом</label>{erase&&<p className="text-xs text-teal-100">Нажмите на оставшийся белый фон между волосами и телом. Чтобы двигать суставы, выключите этот режим.</p>}<button className={button} disabled={!seeds.length||busy} onClick={()=>setSeeds(seeds.slice(0,-1))}>Отменить удаление участка</button></div>}
        <p className="text-xs leading-relaxed text-white/50">Удаление подходит для однотонного белого фона. Светлые края одежды могут исчезнуть — уменьшите допуск. Для сложного фона используйте прозрачный PNG/WebP.</p>
        <label className="block text-white/65">Выбранный сустав<select aria-label="Сустав для настройки" value={selected} onChange={(e)=>setSelected(e.target.value as JointId)} className="mt-2 w-full rounded-lg bg-[#282536] p-2">{JOINTS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        {joints&&<div className="grid grid-cols-2 gap-2">{[0,1].map((axis)=><label key={axis} className="text-xs text-white/60">{axis?"Y сверху":"X слева"}<input aria-label={`Сустав ${axis?"Y":"X"}`} type="number" step={1} min={0} max={axis?h:w} value={Math.round(joints[selected][axis])} className="mt-1 w-full rounded bg-[#282536] p-2" onChange={(e)=>{
          if(e.target.value==="")return;const value=Number(e.target.value);if(!Number.isFinite(value))return;
          setHistory((items)=>[...items.slice(-29),joints]);const next=structuredClone(joints);next[selected][axis]=Math.max(0,Math.min(axis?h:w,value));setJoints(next);
        }}/></label>)}</div>}
        <div className="flex flex-wrap gap-2"><button className={button} disabled={!history.length||busy} onClick={()=>{setJoints(history[history.length-1]);setHistory(history.slice(0,-1));}}>Отменить точку</button><button className={button} disabled={!prepared||busy} onClick={()=>{if(joints)setHistory((items)=>[...items.slice(-29),joints]);setJoints(defaultLandmarks(prepared!.bounds));}}>Начальная раскладка</button></div>
        <button className="w-full rounded-xl bg-teal-300 px-4 py-3 font-semibold text-slate-950 disabled:opacity-40" disabled={busy||!prepared||!joints} onClick={()=>{
          try{setError("");onCreate(fullBodyRig(prepared!.asset,joints!,prepared!.alpha));}catch(e){setError((e as Error).message);}
        }}>Собрать риг полного роста</button>
        <p className="text-xs leading-relaxed text-white/50">14 костей, сетка с весами, дыхание и приветствие. Это деформация видимого рисунка: скрытые поверхности и отдельные выражения лица здесь не дорисовываются.</p>
        {error&&<p role="alert" className="text-rose-300">{error}</p>}
      </div>
    </div>
  </section>;
}
