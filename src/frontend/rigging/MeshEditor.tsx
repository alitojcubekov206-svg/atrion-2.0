"use client";
import { useEffect, useRef, useState } from "react";
import type { Rig2DDocument, Skin2D } from "@/shared/rigging/rig2d";
import { insertMeshVertex, moveMeshVertex, removeMeshVertex } from "@/shared/rigging/mesh";
import { drawSkin, releaseSkinRenderer } from "./skin-renderer";

type Asset=Rig2DDocument["assets"][number];
const button="rounded-lg border border-white/20 px-3 py-2 text-xs disabled:opacity-40";

/** A drag is a local draft until pointer-up; the owner records a single undo transaction. */
export default function MeshEditor({asset,skin,onCommit,onClose}:{asset:Asset;skin:Skin2D;onCommit:(skin:Skin2D)=>boolean;onClose:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),drag=useRef<{index:number;before:Skin2D}|null>(null);
  const [draft,setDraft]=useState(skin),[selected,setSelected]=useState(0),[adding,setAdding]=useState(false),[error,setError]=useState("");
  const [image,setImage]=useState<HTMLImageElement|null>(null);
  const live=useRef(draft);live.current=draft;
  useEffect(()=>{drag.current=null;setDraft(skin);setSelected((i)=>Math.min(i,skin.vertices.length-1));},[skin]);
  useEffect(()=>{let active=true;setImage(null);const img=new Image();img.onload=()=>{if(active)setImage(img);};img.onerror=()=>{if(active)setError("Не удалось загрузить текстуру слоя");};img.src=asset.uri;return()=>{active=false;};},[asset.uri]);
  useEffect(()=>{const element=canvas.current;return()=>{if(element)releaseSkinRenderer(element);};},[]);
  const ratio=Math.min(1,900/Math.max(asset.width,asset.height));
  useEffect(()=>{
    const ctx=canvas.current?.getContext("2d");if(!ctx)return;
    ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.save();ctx.scale(ratio,-ratio);ctx.translate(0,-asset.height);
    if(image)drawSkin(ctx,image,asset.width,asset.height,{...draft,uv:draft.uv??draft.vertices},ratio);
    ctx.strokeStyle="#74e8d8aa";ctx.lineWidth=.7/ratio;ctx.beginPath();
    for(const [a,b,c] of draft.triangles){ctx.moveTo(...draft.vertices[a]);ctx.lineTo(...draft.vertices[b]);ctx.lineTo(...draft.vertices[c]);ctx.closePath();}ctx.stroke();
    draft.vertices.forEach((p,i)=>{ctx.fillStyle=i===selected?"#ffc65a":"#a7fff1";ctx.beginPath();ctx.arc(...p,(i===selected?5:2.8)/ratio,0,Math.PI*2);ctx.fill();});ctx.restore();
  },[draft,selected,image,ratio,asset.width,asset.height]);
  function commit(next:Skin2D){if(onCommit(next)){setDraft(next);setError("");return true;}setDraft(skin);return false;}
  function finish(cancel=false){const current=drag.current;drag.current=null;if(!current)return;
    if(cancel){setDraft(current.before);setError("");return;}
    if(JSON.stringify(current.before.vertices)!==JSON.stringify(live.current.vertices))commit(live.current);
  }
  function apply(edit:()=>Skin2D){try{commit(edit());}catch(e){setError((e as Error).message);}}
  function point(event:React.PointerEvent<HTMLCanvasElement>):[number,number]{const r=event.currentTarget.getBoundingClientRect();return [Math.max(0,Math.min(asset.width,(event.clientX-r.left)/r.width*asset.width)),Math.max(0,Math.min(asset.height,(1-(event.clientY-r.top)/r.height)*asset.height))];}
  return <section aria-label="Редактор сетки слоя" className="space-y-3 rounded-2xl border border-teal-300/30 bg-[#211f2c] p-4">
    <div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold">Сетка слоя · {asset.id}</h2><span className="text-xs text-white/60">{draft.vertices.length} вершин · {draft.triangles.length} треугольников</span><button className={button} onClick={onClose}>Закрыть сетку</button></div>
    <p className="text-xs text-white/60">Редактируется исходная геометрия слоя. Тяните точки: текстура деформируется, UV сохраняются. Один drag — один шаг отмены.</p>
    <div className="flex flex-wrap items-center gap-3">
      <button className={`${button} ${adding?"bg-teal-500/20":""}`} aria-pressed={adding} onClick={()=>setAdding(!adding)}>{adding?"Выбрать вершину":"Добавить вершину"}</button>
      <button className={button} onClick={()=>apply(()=>removeMeshVertex(draft,selected))}>Удалить вершину</button>
      {draft.vertices[selected]?.map((value,axis)=><label key={axis} className="text-xs">Вершина {axis?"Y":"X"}<input aria-label={`Вершина ${axis?"Y":"X"}`} type="number" min={0} max={axis?asset.height:asset.width} step={1} className="ml-2 w-24 rounded bg-black/30 p-2" value={Math.round(value*100)/100} onChange={(e)=>{if(e.target.value==="")return;const p:[number,number]=[...draft.vertices[selected]];p[axis]=Number(e.target.value);apply(()=>moveMeshVertex(draft,selected,p,asset.width,asset.height));}}/></label>)}
    </div>
    {error&&<p role="alert" className="text-sm text-amber-200">{error}</p>}
    <canvas ref={canvas} aria-label="Вершины сетки слоя" width={Math.round(asset.width*ratio)} height={Math.round(asset.height*ratio)} className="mx-auto block h-auto max-h-[65vh] max-w-full touch-none bg-black/20" style={{aspectRatio:`${asset.width}/${asset.height}`}}
      onPointerDown={(e)=>{const p=point(e);if(adding){try{const next=insertMeshVertex(draft,p);if(commit(next))setSelected(next.vertices.length-1);}catch(err){setError((err as Error).message);}return;}
        const threshold=12*asset.width/e.currentTarget.getBoundingClientRect().width;
        const nearest=draft.vertices.map((v,i)=>({i,d:Math.hypot(v[0]-p[0],v[1]-p[1])})).sort((a,b)=>a.d-b.d)[0];
        if(nearest?.d<=threshold){setSelected(nearest.i);drag.current={index:nearest.i,before:structuredClone(draft)};e.currentTarget.setPointerCapture(e.pointerId);}
      }} onPointerMove={(e)=>{if(!drag.current)return;try{const next=moveMeshVertex(drag.current.before,drag.current.index,point(e),asset.width,asset.height);live.current=next;setDraft(next);setError("");}catch(err){setError((err as Error).message);}}}
      onPointerUp={()=>finish()} onPointerCancel={()=>finish(true)} onLostPointerCapture={()=>finish()} onKeyDown={(e)=>{if(e.key==="Escape")finish(true);}} tabIndex={0}/>
  </section>;
}
