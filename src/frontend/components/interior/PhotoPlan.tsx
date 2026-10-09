"use client";
import {useEffect,useRef,useState,type PointerEvent} from "react";
import {emptyPlan,modelFromPlan} from "@/shared/house/from-plan";
import type {HouseDocument} from "@/shared/house/document";
import type {LocalModelResult} from "@/shared/design/result";

const input="min-w-0 rounded-lg border border-white/15 bg-surface2 px-2 py-1 text-xs text-white";
const button="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-40";
type Room=HouseDocument["floors"][number]["rooms"][number];
type Opening=HouseDocument["floors"][number]["openings"][number];
export default function PhotoPlan({preview,disabled,onBuild}:{preview:boolean;disabled:boolean;onBuild:(result:LocalModelResult)=>void}) {
  const [image,setImage]=useState(""),[document,setDocument]=useState(emptyPlan),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [configured,setConfigured]=useState(false),[checked,setChecked]=useState(false),[warnings,setWarnings]=useState<string[]>([]);
  const file=useRef<File|null>(null),request=useRef<AbortController|null>(null),selection=useRef<[number,number]|null>(null);
  const endpoint=preview?"/api/playground/design/plan":"/api/design/plan",floor=document.floors[0];
  useEffect(()=>{const controller=new AbortController();fetch(endpoint,{signal:controller.signal}).then(r=>r.ok?r.json():null).then(v=>setConfigured(v?.configured===true)).catch(()=>{});return ()=>controller.abort();},[endpoint]);
  useEffect(()=>()=>{if(image)URL.revokeObjectURL(image);},[image]);
  useEffect(()=>()=>request.current?.abort(),[]);
  function change(next:HouseDocument){setDocument(next);setChecked(false);setError("");}
  function rooms(next:Room[]){change({...document,floors:[{...floor,rooms:next,openings:floor.openings.filter(o=>next.some(r=>r.id===o.roomId))}]});}
  function openings(next:Opening[]){change({...document,floors:[{...floor,openings:next}]});}
  function point(e:PointerEvent<SVGSVGElement>):[number,number] {const rect=e.currentTarget.getBoundingClientRect();return [Math.max(0,Math.min(document.width,(e.clientX-rect.left)/rect.width*document.width)),Math.max(0,Math.min(document.depth,(e.clientY-rect.top)/rect.height*document.depth))];}
  function addRoom(box?:[number,number,number,number]) {if(floor.rooms.length>=32)return;const [x,z,width,depth]=box??[0,0,document.width,document.depth];rooms([...floor.rooms,{id:`room_${crypto.randomUUID()}`,name:`Комната ${floor.rooms.length+1}`,x,z,width,depth}]);}
  async function analyze(){if(!file.current||busy)return;setBusy(true);setError("");const controller=new AbortController();request.current=controller;
    try {const bitmap=await createImageBitmap(file.current);if(bitmap.width*bitmap.height>24_000_000){bitmap.close();throw new Error("Фото превышает 24 мегапикселя. Уменьшите разрешение.");}
      const canvas=window.document.createElement("canvas"),ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
      const context=canvas.getContext("2d");if(!context){bitmap.close();throw new Error("Не удалось подготовить фото");}context.fillStyle="#fff";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Не удалось подготовить фото")),"image/jpeg",.9));
      if(blob.size>3*1024*1024)throw new Error("Изображение слишком большое. Уменьшите его разрешение.");
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"image/jpeg"},body:blob,signal:controller.signal});
      const data=await response.json().catch(()=>{throw new Error("Сервер вернул неполный ответ. Разметка сохранена.");});
      if(!response.ok)throw new Error(data.error?.message||data.error||"Не удалось распознать план");
      change(data.document);setWarnings(data.warnings??[]);
    }catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{setBusy(false);request.current=null;}
  }
  return <details className="rounded-2xl border border-white/10 bg-surface p-4"><summary className="cursor-pointer text-sm font-medium text-white">Создать дом по фото плана</summary>
    <fieldset disabled={disabled||busy} className="mt-4 space-y-4 disabled:opacity-60">
      <p className="text-xs leading-5 text-muted">Загрузите PNG/JPG до 15 МБ. Для ручной разметки обрежьте фото по внешнему контуру здания, укажите ширину и длину, затем выделите прямоугольные комнаты. Косое фото сначала выровняйте. Один этаж на фото.</p>
      <input type="file" accept="image/png,image/jpeg" aria-label="Фото плана дома" className="w-full text-xs text-muted" onChange={e=>{const selected=e.target.files?.[0];e.target.value="";if(!selected)return;if(!["image/png","image/jpeg"].includes(selected.type)||selected.size>15*1024*1024){setError("Нужен PNG/JPG до 15 МБ");return;}file.current=selected;setImage(URL.createObjectURL(selected));change(emptyPlan());setWarnings([]);}}/>
      {image&&<>
        <p className="text-xs text-muted">{configured?"При распознавании фото отправляется в Cloudflare. Результат нужно проверить перед построением.":"Автораспознавание сейчас не подключено. Доступна ручная разметка поверх фото."}</p>
        <button type="button" className={button} disabled={!configured||busy} onClick={()=>void analyze()}>{busy?"Читаю план…":"Распознать план"}</button>
        <div className="flex flex-wrap gap-3">{([["width","Ширина дома"],["depth","Длина дома"],["floorHeight","Высота этажа"],["wallThickness","Толщина стен"]] as const).map(([key,label])=><label key={key} className="text-xs text-muted">{label}, м<input aria-label={label} type="number" min={key==="wallThickness"?.05:key==="floorHeight"?2.2:3} max={key==="wallThickness"?.6:key==="floorHeight"?6:100} step=".01" className={`${input} ml-2 w-20`} value={document[key]} onChange={e=>change({...document,[key]:Number(e.target.value)})}/></label>)}</div>
        <p className="text-xs text-muted">Протяните от одного угла комнаты к другому. Координаты и размеры можно исправить ниже; пересечения не допускаются.</p>
        <svg role="img" aria-label="Разметка фото плана" viewBox={`0 0 ${document.width||10} ${document.depth||8}`} className="max-h-[550px] w-full touch-none rounded-lg border border-white/15" style={{aspectRatio:`${document.width||10}/${document.depth||8}`,cursor:"crosshair"}} preserveAspectRatio="none"
          onPointerDown={e=>{if(disabled||busy)return;selection.current=point(e);e.currentTarget.setPointerCapture(e.pointerId);}}
          onPointerCancel={()=>{selection.current=null;}}
          onPointerUp={e=>{const start=selection.current;selection.current=null;if(!start)return;const end=point(e),round=(n:number)=>Math.round(n*100)/100;const x=round(Math.min(start[0],end[0])),z=round(Math.min(start[1],end[1])),w=round(Math.abs(start[0]-end[0])),d=round(Math.abs(start[1]-end[1]));if(w>=1&&d>=1)addRoom([x,z,w,d]);}}>
          <image href={image} width={document.width||10} height={document.depth||8} preserveAspectRatio="none"/>
          {floor.rooms.map(r=><g key={r.id} pointerEvents="none"><rect x={r.x} y={r.z} width={r.width} height={r.depth} fill="#9b7ce433" stroke="#a78bfa" strokeWidth={.04}/><text x={r.x+.1} y={r.z+.3} fontSize={.22} fill="#301754" stroke="white" strokeWidth={.015} paintOrder="stroke">{r.name}</text></g>)}
        </svg>
        <button className={button} type="button" disabled={floor.rooms.length>=32} onClick={()=>addRoom()}>Добавить комнату по размерам</button>
        <div className="space-y-2">{floor.rooms.map((r,i)=><div key={r.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 p-2">
          <label className="text-xs text-muted">Комната {i+1}<input aria-label={`Название комнаты ${i+1}`} className={`${input} block w-36`} value={r.name} maxLength={80} onChange={e=>rooms(floor.rooms.map(v=>v.id===r.id?{...v,name:e.target.value}:v))}/></label>
          {([["x","X"],["z","Z"],["width","Ширина"],["depth","Длина"]] as const).map(([key,label])=><label key={key} className="text-xs text-muted">{label}, м<input aria-label={`${label} комнаты ${i+1}`} type="number" step=".01" min={key==="x"||key==="z"?0:1} className={`${input} block w-20`} value={r[key]} onChange={e=>rooms(floor.rooms.map(v=>v.id===r.id?{...v,[key]:Number(e.target.value)}:v))}/></label>)}
          <button className={button} onClick={()=>rooms(floor.rooms.filter(v=>v.id!==r.id))}>Удалить комнату {i+1}</button>
        </div>)}</div>
        <div className="flex gap-2">{(["door","window"] as const).map(kind=><button key={kind} className={button} disabled={!floor.rooms.length||floor.openings.length>=128} onClick={()=>openings([...floor.openings,{id:`opening_${crypto.randomUUID()}`,roomId:floor.rooms[0].id,side:"south",kind,offset:.3,width:kind==="door"?.9:1.2,bottom:kind==="door"?0:.9,height:kind==="door"?2.1:1.2}])}>{kind==="door"?"+ Дверь":"+ Окно"}</button>)}</div>
        {floor.openings.map((o,i)=><div key={o.id} className="flex flex-wrap items-center gap-2 text-xs text-muted"><span>{o.kind==="door"?"Дверь":"Окно"} {i+1}</span>
          <select aria-label={`Комната проёма ${i+1}`} className={input} value={o.roomId} onChange={e=>openings(floor.openings.map(v=>v.id===o.id?{...v,roomId:e.target.value}:v))}>{floor.rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <select aria-label={`Стена проёма ${i+1}`} className={input} value={o.side} onChange={e=>openings(floor.openings.map(v=>v.id===o.id?{...v,side:e.target.value as Opening["side"]}:v))}>{[["north","Сверху"],["south","Снизу"],["west","Слева"],["east","Справа"]].map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
          {([["offset","Отступ"],["width","Ширина"],["height","Высота"],["bottom","От пола"]] as const).map(([key,label])=><label key={key}>{label}, м<input aria-label={`${label} проёма ${i+1}`} className={`${input} ml-1 w-16`} type="number" step=".1" value={o[key]} disabled={key==="bottom"&&o.kind==="door"} onChange={e=>openings(floor.openings.map(v=>v.id===o.id?{...v,[key]:Number(e.target.value)}:v))}/></label>)}
          <button className={button} onClick={()=>openings(floor.openings.filter(v=>v.id!==o.id))}>Удалить проём {i+1}</button>
        </div>)}
        {warnings.map(w=><p className="text-xs text-amber-200" key={w}>{w}</p>)}
        <label className="block text-xs text-slate-300"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)} className="mr-2"/>Размеры, комнаты, двери и окна проверены по оригиналу</label>
        <button className={`${button} bg-accent/20`} disabled={!checked||!floor.rooms.length} onClick={()=>{try{const result=modelFromPlan(document);onBuild(result);setError("");}catch(e){setError((e as Error).message);}}}>Построить 3D по плану</button>
        <p className="text-xs text-muted">В 3D переносятся указанные комнаты и проёмы. Высота и толщина стен — заданные вами значения. Поддерживается прямоугольный внешний контур и прямоугольные комнаты. Фото хранится только на этой странице.</p>
      </>}
    </fieldset>{error&&<p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
  </details>;
}
