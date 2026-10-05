"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseHouse, type HouseDocument } from "@/shared/house/document";
import { createHouse, houseConcept, splitRoom } from "@/shared/house/editor";
import { requestJson } from "@/frontend/api";
import { downloadBlob, exportConceptGlb } from "@/frontend/export-3d";

const Viewer=dynamic(()=>import("@/frontend/components/three/ConceptViewer"),{ssr:false});
const button="rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-violet-400/15 disabled:opacity-40";
const input="w-full rounded-lg border border-white/20 bg-[#211f2e] px-2 py-2 text-sm";
type Saved={id:string;name:string;revision:number;data?:unknown};
const uid=()=>`item_${crypto.randomUUID()}`;
function NumberField({label,value,change}:{label:string;value:number;change:(value:number)=>void}) {
  const [draft,setDraft]=useState(String(value));
  useEffect(()=>setDraft(String(value)),[value]);
  return <label className="text-xs text-white/65">{label}<input aria-label={label} className={`${input} mt-1`} type="number" step="0.1" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft.trim()&&Number.isFinite(Number(draft))&&Number(draft)!==value)change(Number(draft));setDraft(String(value));}} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}/></label>;
}

export default function HouseEditor({preview=false}:{preview?:boolean}) {
  const [doc,setDoc]=useState<HouseDocument>(()=>createHouse()),[past,setPast]=useState<HouseDocument[]>([]),[future,setFuture]=useState<HouseDocument[]>([]);
  const [floorId,setFloorId]=useState("floor_1"),[roomId,setRoomId]=useState("room_1");
  const [name,setName]=useState("Мой дом"),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [hideRoof,setHideRoof]=useState(true),[oneFloor,setOneFloor]=useState(true),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
  const [saved,setSaved]=useState<Saved|null>(null),[documents,setDocuments]=useState<Saved[]>([]),[openId,setOpenId]=useState("");
  const storageBlocked=useRef(false),initialized=useRef(false);
  const draftKey=`atrion:house-draft:${preview?"preview":"editor"}`;
  const floor=doc.floors.find(f=>f.id===floorId)??doc.floors[0],room=floor.rooms.find(r=>r.id===roomId)??floor.rooms[0];
  const concept=useMemo(()=>houseConcept(doc,oneFloor?floor.id:undefined,hideRoof),[doc,oneFloor,floor.id,hideRoof]);
  useEffect(()=>{
    if(initialized.current)return;initialized.current=true;
    try{const raw=localStorage.getItem(draftKey);if(raw){const data=JSON.parse(raw);setDoc(parseHouse(data.document));setName(typeof data.name==="string"?data.name:"Мой дом");setNotice("Восстановлен локальный черновик.");}}
    catch{storageBlocked.current=true;setError("Черновик не прочитан. Исходные данные сохранены в браузере; новые изменения скачайте в JSON.");}
    setReady(true);
  },[draftKey]);
  useEffect(()=>{if(!ready||storageBlocked.current)return;const timer=setTimeout(()=>{try{localStorage.setItem(draftKey,JSON.stringify({name,document:doc}));}catch{setError("Не удалось сохранить черновик. Скачайте JSON.");}},400);return()=>clearTimeout(timer);},[doc,name,ready,draftKey]);
  function install(next:HouseDocument){if(JSON.stringify(next)===JSON.stringify(doc))return;setPast(p=>[...p.slice(-29),doc]);setFuture([]);setDoc(parseHouse(next));setError("");setNotice("");}
  function change(edit:(next:HouseDocument)=>void){try{const next=structuredClone(doc);edit(next);const parsed=parseHouse(next);install(parsed);}catch(e){setError((e as Error).message);}}
  function editRoom(key:string,value:string|number){change(next=>{Object.assign(next.floors.find(f=>f.id===floor.id)!.rooms.find(r=>r.id===room.id)!,{[key]:value});});}
  function undo(){if(!past.length)return;setFuture([doc,...future]);setDoc(past[past.length-1]);setPast(past.slice(0,-1));setError("");}
  function redo(){if(!future.length)return;setPast([...past,doc]);setDoc(future[0]);setFuture(future.slice(1));setError("");}
  async function save(){setBusy(true);setError("");try{const response=await requestJson<{document:Saved}>(saved?`/api/design-documents/${saved.id}`:"/api/design-documents",{method:saved?"PATCH":"POST",body:{name,document:doc,...(saved?{revision:saved.revision}:{})}});if(!response.ok)throw new Error(response.data.error??"Не удалось сохранить");setSaved(response.data.document);setNotice("Дом сохранён в аккаунте.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function list(){setBusy(true);try{const r=await requestJson<{documents:Saved[]}>("/api/design-documents?kind=house&limit=50",{method:"GET"});if(!r.ok)throw new Error(r.data.error??"Не удалось загрузить список");setDocuments(r.data.documents);setNotice(r.data.documents.length?"Выберите дом в списке.":"Сохранённых домов пока нет.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function open(){setBusy(true);try{const r=await requestJson<{document:Saved}>(`/api/design-documents/${openId}`,{method:"GET"});if(!r.ok)throw new Error(r.data.error??"Не удалось открыть дом");const next=parseHouse(r.data.document.data);install(next);setSaved(r.data.document);setName(r.data.document.name);setNotice("Дом открыт. Предыдущее состояние доступно через отмену.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function importFile(file:File){setBusy(true);try{if(file.size>1048000)throw new Error("JSON должен быть меньше 1 MiB");const value=JSON.parse(await file.text()),next=parseHouse(value.document??value);install(next);setSaved(null);setName(typeof value.name==="string"?value.name.slice(0,120):"Импортированный дом");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function exportGlb(){setBusy(true);try{downloadBlob("atrion-house.glb",await exportConceptGlb(houseConcept(doc)));setNotice("Экспортирован весь дом, включая крышу и все этажи.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  function addOpening(kind:"door"|"window"){change(next=>next.floors.find(f=>f.id===floor.id)!.openings.push({id:uid(),roomId:room.id,side:"north",kind,offset:0.3,width:kind==="door"?0.9:1.2,bottom:kind==="door"?0:0.9,height:kind==="door"?2.1:1.2}));}
  return <main className="mx-auto max-w-[1600px] space-y-4 p-4 text-white md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-violet-300">Atrion · дизайн дома</p><h1 className="text-2xl font-semibold">Планировка и 3D</h1></div><Link className={button} href="/dashboard/design-engine">Design Engine ↗</Link></header>
    <p className="text-sm text-white/55">Редактируйте комнаты и проёмы — 3D обновляется сразу. Все размеры в метрах. Начальный план 12 × 9 м можно изменить.</p>
    {error&&<p role="alert" className="rounded-lg bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}{notice&&<p role="status" className="text-sm text-violet-200">{notice}</p>}
    <fieldset disabled={busy||!ready} className="space-y-4 disabled:opacity-60">
      <div className="flex flex-wrap items-center gap-2"><input aria-label="Название дома" className={`${input} !w-48`} maxLength={120} value={name} onChange={e=>setName(e.target.value)}/><button className={button} disabled={!past.length} onClick={undo}>Отменить</button><button className={button} disabled={!future.length} onClick={redo}>Повторить</button><button className={button} disabled={preview||!name.trim()} onClick={save}>Сохранить в аккаунте</button><button className={button} onClick={()=>downloadBlob("atrion-house.json",new Blob([JSON.stringify({name,document:doc},null,2)],{type:"application/json"}))}>Скачать JSON</button><label className={`${button} cursor-pointer`}>Импорт JSON<input aria-label="Импорт дома" className="sr-only" type="file" accept=".json,application/json" onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void importFile(file);}}/></label><button className={button} onClick={exportGlb}>Экспорт GLB</button></div>
      <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
        <aside className="space-y-4 rounded-2xl border border-white/10 p-4">
          <h2 className="font-medium">Дом</h2><div className="grid grid-cols-2 gap-2">{([['Ширина дома','width'],['Глубина дома','depth'],['Высота этажа','floorHeight'],['Толщина стен','wallThickness']] as const).map(([label,key])=><NumberField key={key} label={label} value={doc[key]} change={value=>change(next=>{next[key]=value;})}/>)}</div>
          <label className="block text-xs">Крыша<select aria-label="Крыша" className={`${input} mt-1`} value={doc.roof} onChange={e=>change(next=>{next.roof=e.target.value as HouseDocument['roof'];})}><option value="gable">Двускатная</option><option value="flat">Плоская</option></select></label>
          <label className="flex items-center justify-between text-sm">Цвет стен<input aria-label="Цвет стен" type="color" value={doc.wallColor} onChange={e=>change(next=>{next.wallColor=e.target.value;})}/></label>
          <label className="block text-xs">Этаж<select aria-label="Этаж" className={`${input} mt-1`} value={floor.id} onChange={e=>setFloorId(e.target.value)}>{doc.floors.map((f,i)=><option key={f.id} value={f.id}>Этаж {i+1}</option>)}</select></label>
          <div className="flex gap-2"><button className={button} disabled={doc.floors.length>=3} onClick={()=>{const id=uid();change(next=>next.floors.push({...structuredClone(floor),id}));setFloorId(id);}}>+ Этаж</button><button className={button} disabled={doc.floors.length<=1} onClick={()=>change(next=>{next.floors=next.floors.filter(f=>f.id!==floor.id);})}>Удалить этаж</button></div>
          <h2 className="border-t border-white/10 pt-4 font-medium">Комната</h2><select aria-label="Комната" className={input} value={room.id} onChange={e=>setRoomId(e.target.value)}>{floor.rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <input aria-label="Название комнаты" className={input} value={room.name} onChange={e=>editRoom('name',e.target.value)}/><div className="grid grid-cols-2 gap-2">{([['X комнаты','x'],['Z комнаты','z'],['Ширина комнаты','width'],['Глубина комнаты','depth']] as const).map(([label,key])=><NumberField key={`${room.id}-${key}`} label={label} value={room[key]} change={v=>editRoom(key,v)}/>)}</div>
          <div className="flex flex-wrap gap-2">{(['x','z'] as const).map(axis=><button key={axis} className={button} onClick={()=>{try{install(splitRoom(doc,floor.id,room.id,axis,uid()));}catch(e){setError((e as Error).message);}}}>Разделить по {axis.toUpperCase()}</button>)}<button className={button} disabled={floor.rooms.length<=1} onClick={()=>change(next=>{const f=next.floors.find(f=>f.id===floor.id)!;f.rooms=f.rooms.filter(r=>r.id!==room.id);f.openings=f.openings.filter(o=>o.roomId!==room.id);})}>Удалить комнату</button></div>
        </aside>
        <section className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#201e2b] p-4"><h2 className="mb-2 font-medium">План · этаж {doc.floors.indexOf(floor)+1}</h2><svg aria-label="План дома" viewBox={`-1 -1 ${doc.width+2} ${doc.depth+2}`} className="h-[370px] w-full"><rect width={doc.width} height={doc.depth} fill="#17151f" stroke="#9386b7" strokeWidth={doc.wallThickness}/>{floor.rooms.map(r=><g key={r.id} onClick={()=>setRoomId(r.id)} className="cursor-pointer"><rect x={r.x} y={r.z} width={r.width} height={r.depth} fill={room.id===r.id?'#51406d':'#2c293d'} stroke="#c8bce0" strokeWidth={doc.wallThickness}/><text x={r.x+r.width/2} y={r.z+r.depth/2} textAnchor="middle" fill="white" fontSize={Math.min(r.width/8,0.35)}>{r.name}</text><text x={r.x+r.width/2} y={r.z+r.depth/2+0.45} textAnchor="middle" fill="#b9adce" fontSize="0.25">{(r.width*r.depth).toFixed(1)} м²</text></g>)}{floor.openings.map(o=>{const r=floor.rooms.find(r=>r.id===o.roomId)!,horizontal=o.side==='north'||o.side==='south',x=r.x+(horizontal?o.offset:o.side==='east'?r.width:0),z=r.z+(horizontal?(o.side==='south'?r.depth:0):o.offset);return <line key={o.id} x1={x} y1={z} x2={x+(horizontal?o.width:0)} y2={z+(horizontal?0:o.width)} stroke={o.kind==='door'?'#201e2b':'#67d6f0'} strokeWidth={doc.wallThickness*1.6}/>;})}</svg><p className="text-xs text-white/50">Нажмите комнату, чтобы редактировать. Голубой — окно, разрыв — дверь. Площадь по контуру, без вычета толщины стен.</p></div>
            <div className="overflow-hidden rounded-2xl border border-white/10"><div className="flex flex-wrap gap-3 p-3 text-xs"><label><input type="checkbox" checked={hideRoof} onChange={e=>setHideRoof(e.target.checked)}/> Скрыть крышу</label><label><input type="checkbox" checked={oneFloor} onChange={e=>setOneFloor(e.target.checked)}/> Только выбранный этаж</label></div><div className="h-[390px]"><Viewer concept={concept} selectedId={null} onSelect={()=>{}} fitModel/></div></div>
          </div>
          <div className="space-y-3 rounded-2xl border border-white/10 p-4"><div className="flex flex-wrap items-center gap-2"><h2 className="mr-auto font-medium">Проёмы · {room.name}</h2><button className={button} onClick={()=>addOpening('door')}>+ Дверь</button><button className={button} onClick={()=>addOpening('window')}>+ Окно</button></div>
            {floor.openings.filter(o=>o.roomId===room.id).map(o=><div key={o.id} className="grid items-end gap-2 border-t border-white/10 pt-3 sm:grid-cols-3 lg:grid-cols-7"><span className="pb-2 text-sm">{o.kind==='door'?'Дверь':'Окно'}</span><label className="text-xs">Стена<select aria-label={`Стена ${o.id}`} className={`${input} mt-1`} value={o.side} onChange={e=>change(next=>{next.floors.find(f=>f.id===floor.id)!.openings.find(v=>v.id===o.id)!.side=e.target.value as typeof o.side;})}>{[['north','Север'],['south','Юг'],['west','Запад'],['east','Восток']].map(([value,title])=><option key={value} value={value}>{title}</option>)}</select></label>{([['Отступ','offset'],['Ширина','width'],['От пола','bottom'],['Высота','height']] as const).map(([label,key])=><NumberField key={key} label={`${label} ${o.kind==='door'?'двери':'окна'}`} value={o[key]} change={v=>change(next=>{next.floors.find(f=>f.id===floor.id)!.openings.find(a=>a.id===o.id)![key]=v;})}/>)}<button aria-label={`Удалить ${o.kind==='door'?'дверь':'окно'}`} className={button} onClick={()=>change(next=>{const f=next.floors.find(f=>f.id===floor.id)!;f.openings=f.openings.filter(a=>a.id!==o.id);})}>Удалить</button></div>)}
            {!floor.openings.some(o=>o.roomId===room.id)&&<p className="text-sm text-white/50">В комнате нет проёмов.</p>}
          </div>
        </section>
      </div>
      {!preview&&<div className="flex flex-wrap gap-2"><button className={button} onClick={list}>Мои дома</button><select aria-label="Сохранённый дом" className={`${input} !w-64`} value={openId} onChange={e=>setOpenId(e.target.value)}><option value="">Выберите дом</option>{documents.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select><button disabled={!openId} className={button} onClick={open}>Открыть</button></div>}
    </fieldset>
    <p className="text-xs text-white/50">{preview?'Локальная проверка: черновик хранится в браузере, серверное сохранение отключено. ':''}Концептуальный эскиз без инженерных расчётов. Мебель, лестницы, стекло и дверные полотна пока отсутствуют. GLB содержит весь дом; JSON сохраняет редактируемую планировку.</p>
  </main>;
}


