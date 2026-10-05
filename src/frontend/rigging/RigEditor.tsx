"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { addBone2D, bindLayer, bindPart, blank2D, demo3D, parseRigDocument, posedConcept, removeBone, rigFromConcept, type RigDocument } from "@/shared/rigging/editor";
import { evaluateRig2D, sample2DTrack, type Transform2D } from "@/shared/rigging/rig2d";
import { evaluateRig3D } from "@/shared/rigging/rig3d";
import { demo2D } from "./demo";
import RigCanvas from "./RigCanvas";
import CharacterGenerator from "./CharacterGenerator";
import { requestJson } from "@/frontend/api";
import { downloadBlob, exportConceptGlb } from "@/frontend/export-3d";

const ConceptViewer=dynamic(()=>import("@/frontend/components/three/ConceptViewer"),{ssr:false,loading:()=> <div className="min-h-[480px] animate-pulse rounded-2xl bg-white/5"/>});
type Snapshot={doc:RigDocument;pose2D:Record<string,Transform2D>};
type Saved={id:string;name:string;kind:string;revision:number;data?:unknown};
const button="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium transition hover:border-violet-400 hover:bg-violet-400/10 disabled:opacity-35";
const input="w-full rounded-lg border border-white/15 bg-[#201e2b] px-2 py-2 text-sm text-white focus:border-violet-400 focus:outline-none";
const newId=(prefix:string)=>`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
const boneLabels:Record<string,string>={body:"Корпус",head:"Голова",arm:"Рука",arm_left:"Левая рука",arm_right:"Правая рука",leg_left:"Левая нога",leg_right:"Правая нога",root:"Корень"};
const boneName=(id:string)=>Object.hasOwn(boneLabels,id)?boneLabels[id]:id.replace(/^bone_/,"Кость ");
const clone=<T,>(value:T):T=>structuredClone(value);
const label="text-xs text-violet-200/70";
const packed=(snapshot:Snapshot):RigDocument=>snapshot.doc.kind==="rig2d"?{...snapshot.doc,pose:snapshot.pose2D}:snapshot.doc;

function NumberField({name,value,onChange,step=1,min,max}:{name:string;value:number;onChange:(n:number)=>void;step?:number;min?:number;max?:number}) {
  return <label className={label}>{name}<input aria-label={name} className={`${input} mt-1`} type="number" step={step} min={min} max={max} value={Math.round(value*10000)/10000} onChange={(event)=>{if(event.target.value!==""){const n=Number(event.target.value);if(Number.isFinite(n))onChange(n);}}}/></label>;
}

export default function RigEditor({initialMode="rig2d",preview=false}:{initialMode?:"rig2d"|"rig3d";preview?:boolean}) {
  const [state,setState]=useState<Snapshot>(()=>({doc:initialMode==="rig3d"?demo3D():blank2D(),pose2D:{}}));
  const [past,setPast]=useState<Snapshot[]>([]),[future,setFuture]=useState<Snapshot[]>([]);
  const [name,setName]=useState("Учебный персонаж"),[selected,setSelected]=useState("body"),[layerId,setLayerId]=useState("");
  const [clipId,setClipId]=useState("wave"),[time,setTime]=useState(0),[playing,setPlaying]=useState(false),[showBones,setShowBones]=useState(true);
  const [addingBone,setAddingBone]=useState(false);
  const [editBind,setEditBind]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [saved,setSaved]=useState<Saved|null>(null),[documents,setDocuments]=useState<Saved[]>([]),[openId,setOpenId]=useState("");
  const [busy,setBusy]=useState(false),[baseline,setBaseline]=useState(""),[ready,setReady]=useState(false);
  const [interpolation,setInterpolation]=useState<"linear"|"step">("linear");
  const initialized=useRef(false), storageBlocked=useRef(false);
  const draftKey=(kind:string)=>`atrion:rigging-draft:${preview?"preview":"editor"}:${kind}`;
  const epoch=useRef(0),stateRef=useRef(state);stateRef.current=state;
  const doc=state.doc,mode=doc.kind;
  const clip=doc.kind==="rig2d"?doc.clips.find((item)=>item.id===clipId):undefined;
  const bone=doc.bones.find((item)=>item.id===selected)??doc.bones[0];
  const digest=JSON.stringify({state,name});
  const digestRef=useRef(digest);digestRef.current=digest;
  const dirty=ready&&digest!==baseline;

  function install(next:RigDocument,nextName:string,metadata:Saved|null=null) {
    const parsed=parseRigDocument(next);
    if(parsed.kind==="rig2d")evaluateRig2D(parsed);else evaluateRig3D(parsed);
    const snapshot:Snapshot={doc:parsed,pose2D:parsed.kind==="rig2d"?clone(parsed.pose??{}):{}};
    epoch.current++;setState(snapshot);setName(nextName);setSaved(metadata);setPast([]);setFuture([]);setPlaying(false);setTime(0);setEditBind(false);setAddingBone(false);setDocuments([]);setOpenId("");
    setSelected(snapshot.doc.bones[0].id);setLayerId("");setClipId(snapshot.doc.kind==="rig2d"?(snapshot.doc.clips[0]?.id??""):"");
    setBaseline(JSON.stringify({state:snapshot,name:nextName}));setError("");setNotice("");
  }
  useEffect(()=>{
    if(initialized.current)return;initialized.current=true;
    try {
      const query=new URLSearchParams(window.location.search),chosen=query.get("mode")==="rig3d"?"rig3d":initialMode;
      const transfer=query.get("import")==="design-engine"?sessionStorage.getItem("atrion:rigging-transfer"):null;
      if(transfer){install(rigFromConcept(JSON.parse(transfer)),"Модель из Design Engine");sessionStorage.removeItem("atrion:rigging-transfer");}
      else {
        const cached=localStorage.getItem(draftKey(chosen));
        if(cached) {
          const data=JSON.parse(cached),validated=parseRigDocument(data.document);
          install(validated,typeof data.name==="string"?data.name:"Восстановленный риг");setNotice("Восстановлен локальный черновик.");
        } else install(chosen==="rig3d"?demo3D():demo2D(),chosen==="rig3d"?"Учебный 3D-риг":"Учебный персонаж");
      }
    } catch {storageBlocked.current=true;install(initialMode==="rig3d"?demo3D():demo2D(),"Учебный персонаж");setNotice("Локальный черновик не удалось прочитать; исходные данные в хранилище не удалены.");}
    setReady(true);
    // Initial URL/import is consumed once; live edits must not reset the document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{
    if(!ready||storageBlocked.current)return;
    const timer=window.setTimeout(()=>{try{localStorage.setItem(draftKey(state.doc.kind),JSON.stringify({name,document:packed(state)}));}catch{setNotice("Локальный черновик не сохранён: скачайте JSON.");}},500);
    return()=>clearTimeout(timer);
  },[state,name,ready]);
  useEffect(()=>{
    if(!dirty)return;const handler=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);
  },[dirty]);
  useEffect(()=>{
    if(!playing||!clip)return;
    let frame=0,start:number|undefined;const from=time,duration=clip.duration;
    function tick(now:number) {start??=now;const t=from+Math.max(0,(now-start)/1000);
      if(t>=duration&&!clip!.loop){setTime(duration);setPlaying(false);return;}
      setTime(clip!.loop?t%duration:t);frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
    // The playback clock starts on play, not on each rendered frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[playing,clip]);

  function change(edit:(snapshot:Snapshot)=>void) {
    try {const next=clone(stateRef.current);edit(next);next.doc=parseRigDocument(next.doc);
      if(new TextEncoder().encode(JSON.stringify(packed(next))).length>1048000)throw new Error("Общий размер рига превышает 1 MiB. Уменьшите изображения перед загрузкой.");
      if(next.doc.kind==="rig2d")evaluateRig2D(next.doc,{pose:next.pose2D});else evaluateRig3D(next.doc);
      setPast((items)=>[...items.slice(-29),clone(stateRef.current)]);setFuture([]);setState(next);setError("");setNotice("");setPlaying(false);return true;
    } catch(e){setError(e instanceof Error?e.message:"Не удалось применить изменение");return false;}
  }
  function undo() {if(!past.length)return;setFuture([clone(state),...future]);setState(past[past.length-1]);setPast(past.slice(0,-1));setPlaying(false);setError("");}
  function redo() {if(!future.length)return;setPast([...past,clone(state)]);setState(future[0]);setFuture(future.slice(1));setPlaying(false);setError("");}
  function discardOkay(){return !dirty||window.confirm("Заменить текущий риг? Несохранённые изменения останутся только в скачанном JSON, если вы его экспортировали.");}
  function switchMode(next:"rig2d"|"rig3d") {
    if(next===mode)return;
    try {
      localStorage.setItem(draftKey(mode),JSON.stringify({name,document:packed(state)}));
      const cached=localStorage.getItem(draftKey(next));
      if(cached){const data=JSON.parse(cached);install(parseRigDocument(data.document),data.name);}
      else install(next==="rig2d"?demo2D():demo3D(),next==="rig2d"?"Учебный персонаж":"Учебный 3D-риг");
    }catch(e){setError("Не удалось сохранить черновик перед переключением. Скачайте JSON. "+(e as Error).message);}
  }
  function effectivePose2D():Record<string,Transform2D> {
    if(doc.kind!=="rig2d"||editBind)return {};
    const result:Record<string,Transform2D>={};
    if(clip)for(const track of clip.tracks)result[track.boneId]=sample2DTrack(track,clip.loop?time%clip.duration:Math.min(time,clip.duration));
    return {...result,...state.pose2D};
  }
  function active2DTransform():Transform2D {
    if(doc.kind!=="rig2d")throw new Error("Требуется 2D");
    const selectedBone=doc.bones.find((item)=>item.id===bone.id)!;
    if(editBind)return selectedBone.bind;
    if(Object.hasOwn(state.pose2D,bone.id))return state.pose2D[bone.id];
    const track=clip?.tracks.find((item)=>item.boneId===bone.id);
    return track?sample2DTrack(track,clip!.loop?time%clip!.duration:Math.min(time,clip!.duration)):selectedBone.bind;
  }
  function transformValue() {return doc.kind==="rig2d"?active2DTransform():!editBind&&doc.pose&&Object.hasOwn(doc.pose,bone.id)?doc.pose[bone.id]:bone.bind;}
  const transform=transformValue();
  function setPosition(index:number,value:number){change((next)=>{
    const current=clone(transform);current.position[index]=value;
    if(next.doc.kind==="rig2d") {if(editBind)next.doc.bones.find((b)=>b.id===bone.id)!.bind=current as Transform2D;else next.pose2D[bone.id]=current as Transform2D;}
    else {if(editBind)next.doc.bones.find((b)=>b.id===bone.id)!.bind=current as typeof next.doc.bones[number]["bind"];else next.doc.pose={...next.doc.pose,[bone.id]:current as typeof next.doc.bones[number]["bind"]};}
  });}
  function setAngle(index:number,degrees:number){change((next)=>{
    const current=clone(transform);
    if(next.doc.kind==="rig2d") {const local=current as Transform2D;local.rotation=degrees*Math.PI/180;if(editBind)next.doc.bones.find((b)=>b.id===bone.id)!.bind=local;else next.pose2D[bone.id]=local;}
    else {const local=current as typeof next.doc.bones[number]["bind"];local.rotation[index]=degrees*Math.PI/180;if(editBind)next.doc.bones.find((b)=>b.id===bone.id)!.bind=local;else next.doc.pose={...next.doc.pose,[bone.id]:local};}
  });}
  function addBone(){
    if(doc.kind==="rig2d"){setAddingBone(!addingBone);setEditBind(true);setPlaying(false);return;}
    let count=1;while(doc.bones.some((item)=>item.id===`bone_${count}`))count++;
    const id=`bone_${count}`;
    if(change((next)=>{if(next.doc.kind==="rig3d")next.doc.bones.push({id,parentId:bone.id,length:0.5,bind:{position:[0,bone.length,0],rotation:[0,0,0]}});})){
      setSelected(id);setEditBind(true);
    }
  }
  function drawBone(head:[number,number],tail:[number,number]) {
    if(doc.kind!=="rig2d")return;let count=1;while(doc.bones.some((item)=>item.id===`bone_${count}`))count++;
    const id=`bone_${count}`;
    if(change((next)=>{if(next.doc.kind==="rig2d")next.doc=addBone2D(next.doc,id,bone.id,head,tail);})){
      setSelected(id);setAddingBone(false);
    }
  }
  function keyframe(){if(doc.kind!=="rig2d"||!clip)return;const local=clone(active2DTransform());change((next)=>{
    if(next.doc.kind!=="rig2d")return;const target=next.doc.clips.find((c)=>c.id===clip.id)!;
    let track=target.tracks.find((t)=>t.boneId===bone.id);if(!track){track={boneId:bone.id,rotationMode:"unwrapped",keys:[]};target.tracks.push(track);}
    track.keys=track.keys.filter((k)=>Math.abs(k.time-time)>1e-6);track.keys.push({time,transform:local,interpolation});track.keys.sort((a,b)=>a.time-b.time);next.pose2D={};
  });}
  async function uploadLayer(file:File|undefined){if(!file||doc.kind!=="rig2d")return;const requestEpoch=epoch.current;
    try {if(!["image/png","image/webp"].includes(file.type)||file.size>262144)throw new Error("Нужен PNG/WebP до 256 KiB");
      const uri=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Не удалось прочитать файл"));reader.readAsDataURL(file);});
      const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("Не удалось декодировать изображение"));image.src=uri;});
      if(epoch.current!==requestEpoch)return;const assetId=newId("asset"),id=newId("layer");
      change((next)=>{if(next.doc.kind!=="rig2d")return;next.doc.assets.push({id:assetId,uri,mime:file.type as "image/png"|"image/webp",width:img.naturalWidth,height:img.naturalHeight});
        next.doc.layers.push({id,assetId,zIndex:next.doc.layers.length,visible:true,pivot:[img.naturalWidth/2,img.naturalHeight/2],transform:{position:[0,0],rotation:0,scale:[1,1]}});});setLayerId(id);
    } catch(e){setError((e as Error).message);}
  }
  async function importFile(file:File|undefined){if(!file)return;const requestEpoch=epoch.current;
    try {if(file.size>1048576)throw new Error("JSON превышает 1 MiB");const data=JSON.parse(await file.text()),value=data.document??data;
      const validated=value.kind?parseRigDocument(value):rigFromConcept(value);
      if(epoch.current===requestEpoch&&discardOkay())install(validated,typeof data.name==="string"?data.name:file.name.replace(/\.json$/i,""));
    }catch(e){setError((e as Error).message);}
  }
  async function save(){if(busy)return;if(preview){setError("Это локальная проверка интерфейса. Серверное сохранение доступно после входа в аккаунт.");return;}
    const requestEpoch=epoch.current,snapshot=clone(state),currentName=name,currentDigest=digest;
    if(new TextEncoder().encode(JSON.stringify({name,document:packed(snapshot)})).length>1048500){setError("Документ слишком большой для сервера (1 MiB). Скачайте JSON или уменьшите изображения.");return;}
    setBusy(true);setError("");
    const response=await requestJson<{document:Saved}>(saved?`/api/design-documents/${saved.id}`:"/api/design-documents",{method:saved?"PATCH":"POST",body:{name:currentName,document:packed(snapshot),...(saved?{revision:saved.revision}:{})}});
    if(epoch.current===requestEpoch){if(response.ok){setSaved(response.data.document);setBaseline(currentDigest);setNotice("Документ сохранён.");}else setError(response.data.error??"Не удалось сохранить");}setBusy(false);
  }
  async function list(){const requestEpoch=epoch.current;setError("");const response=await requestJson<{documents:Saved[]}>(`/api/design-documents?kind=${mode}&limit=50`,{method:"GET"});
    if(epoch.current!==requestEpoch)return;
    if(response.ok){setDocuments(response.data.documents);setNotice(response.data.documents.length?"Выберите документ и нажмите «Открыть».":"Сохранённых документов этого типа пока нет.");}else setError(response.data.error??"Не удалось получить список");}
  async function open(){if(!openId||!discardOkay())return;const requestEpoch=epoch.current,requestDigest=digest;setBusy(true);
    const response=await requestJson<{document:Saved}>(`/api/design-documents/${openId}`,{method:"GET"});
    if(epoch.current===requestEpoch){try{if(!response.ok)throw new Error(response.data.error??"Не удалось открыть");if(digestRef.current!==requestDigest)throw new Error("Риг изменился во время загрузки. Изменения сохранены в редакторе; повторите открытие.");const value=response.data.document;install(parseRigDocument(value.data),value.name,value);}catch(e){setError((e as Error).message);}}setBusy(false);
  }
  const three=useMemo(()=>{if(doc.kind!=="rig3d")return null;const visible=editBind?{...doc,pose:{}}:doc;return {concept:posedConcept(visible),bones:evaluateRig3D(visible).bones};},[doc,editBind]);
  const selectedLayer=doc.kind==="rig2d"?doc.layers.find((l)=>l.id===layerId):undefined;
  const attachment=doc.kind==="rig2d"?doc.attachments.find((a)=>a.layerId===layerId):undefined;
  const selectedTrack=clip?.tracks.find((t)=>t.boneId===bone.id);

  return <section className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 text-white md:px-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs uppercase tracking-[0.25em] text-violet-300">Atrion · Character studio</p><h1 className="mt-2 text-3xl font-semibold">{mode==="rig2d"?"2D-риггинг":"3D-риггинг"}</h1><p className="mt-2 text-sm text-white/50">{mode==="rig2d"?"Слои → скелет → ключевые кадры → анимация":"Кости → привязка деталей → поза"}</p></div>
      <div className="flex flex-wrap gap-2"><button className={`${button} ${mode==="rig2d"?"border-violet-400 bg-violet-400/15":""}`} onClick={()=>switchMode("rig2d")}>2D-риггинг</button><button className={`${button} ${mode==="rig3d"?"border-violet-400 bg-violet-400/15":""}`} onClick={()=>switchMode("rig3d")}>3D-риггинг</button><Link href="/dashboard/design-engine" className={button}>Design Engine ↗</Link></div>
    </header>
    <div hidden={mode!=="rig2d"}><CharacterGenerator preview={preview}/></div>
    {preview&&<p className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-200">Локальная проверка редактора. Вход и серверное хранение здесь не используются.</p>}
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <label className="sr-only" htmlFor="rig-name">Название рига</label><input id="rig-name" className={`${input} !w-52`} maxLength={120} value={name} onChange={(e)=>setName(e.target.value)}/>
      <span className="mr-2 text-xs text-white/40">{dirty?"Есть изменения":saved?`Версия ${saved.revision}`:"Локальный черновик"}</span>
      <button className={button} disabled={!past.length} onClick={undo}>Отменить</button><button className={button} disabled={!future.length} onClick={redo}>Повторить</button>
      <button className={button} onClick={()=>change((next)=>{next.pose2D={};if(next.doc.kind==="rig3d")next.doc.pose={};setTime(0);setClipId("");})}>Сбросить позу</button>
      <button className={button} onClick={()=>{if(discardOkay()){storageBlocked.current=false;install(mode==="rig2d"?demo2D():demo3D(),mode==="rig2d"?"Учебный персонаж":"Учебный 3D-риг");}}}>Новый пример</button>
      <button className={`${button} bg-violet-500/20`} disabled={busy} onClick={save}>{busy?"Операция…":"Сохранить"}</button>
      <button className={button} onClick={()=>downloadBlob("atrion-rig.json",new Blob([JSON.stringify({name,document:packed(state)})],{type:"application/json"}))}>Скачать JSON</button>
      <label className={`${button} cursor-pointer`}>Импорт JSON<input aria-label="Импорт JSON" type="file" accept="application/json,.json" className="sr-only" onChange={(e)=>{void importFile(e.target.files?.[0]);e.target.value="";}}/></label>
      {mode==="rig3d"&&<button className={button} onClick={async()=>{try{const blob=await exportConceptGlb(three!.concept);downloadBlob("atrion-rig-static-pose.glb",blob);}catch(e){setError((e as Error).message);}}}>GLB · статическая поза</button>}
    </div>
    {error&&<p role="alert" className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
    {notice&&<p role="status" className="text-sm text-violet-200">{notice}</p>}
    <div className="grid gap-4 md:grid-cols-[170px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_270px]">
      <aside className="order-2 space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4 md:order-1">
        <h2 className="text-sm font-semibold">Скелет</h2>
        <div className="max-h-80 space-y-1 overflow-auto">{doc.bones.map((item)=><button key={item.id} className={`block w-full truncate rounded-lg px-3 py-2 text-left text-xs ${item.id===bone.id?"bg-violet-500/20 text-violet-200":"text-white/65 hover:bg-white/5"}`} title={item.id} onClick={()=>setSelected(item.id)}>{item.parentId?"↳ ":"◆ "}{boneName(item.id)}</button>)}</div>
        <div className="flex flex-wrap gap-2"><button className={button} onClick={addBone}>{addingBone?"Отменить добавление":"+ Кость"}</button><button className={button} onClick={()=>change((next)=>{next.doc=removeBone(next.doc,bone.id,effectivePose2D(),editBind?{}:undefined);delete next.pose2D[bone.id];})}>Удалить</button></div>
        <label className="flex gap-2 text-xs text-white/60"><input type="checkbox" checked={showBones} onChange={(e)=>setShowBones(e.target.checked)}/>Показывать кости</label>
        <label className="flex gap-2 text-xs text-white/60"><input type="checkbox" checked={editBind} onChange={(e)=>{setEditBind(e.target.checked);setPlaying(false);}}/>Править исходный скелет</label>
        <p className="text-xs leading-relaxed text-white/35">{editBind?"Изменения записываются в исходный скелет. Смена родителя сохраняет локальные координаты.":"Сейчас вы меняете позу; исходный скелет сохраняется."}</p>
      </aside>
      <div className="order-1 min-w-0 space-y-4 md:order-2">
        {doc.kind==="rig2d"?<RigCanvas document={doc} pose={editBind?{}:state.pose2D} clipId={editBind?undefined:clip?.id} time={time} selected={bone.id} onSelect={setSelected} showBones={showBones} addingBone={addingBone} onDrawBone={drawBone}/>:<div className="h-[560px] overflow-hidden rounded-2xl border border-white/10"><ConceptViewer fitModel concept={three!.concept} selectedId={null} onSelect={(id)=>{if(id){const partId=id.replace(/_\d+$/,"");setLayerId(partId);const binding=doc.bindings.find((b)=>b.partId===partId);if(binding)setSelected(binding.boneId);}}} rigBones={showBones?three!.bones:undefined} selectedBoneId={bone.id} onBoneSelect={setSelected}/></div>}
        {doc.kind==="rig2d"&&<div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <div className="flex flex-wrap items-center gap-2"><h2 className="mr-2 text-sm font-semibold">Анимация</h2><select aria-label="Клип" className={`${input} !w-40`} value={clip?.id??""} onChange={(e)=>{setClipId(e.target.value);setTime(0);setPlaying(false);setState({...state,pose2D:{}});}}><option value="">Исходная поза</option>{doc.clips.map((c)=><option key={c.id} value={c.id}>{c.id}</option>)}</select>
            <button className={button} onClick={()=>{const id=newId("clip");change((next)=>{if(next.doc.kind==="rig2d")next.doc.clips.push({id,duration:2,loop:true,tracks:[]});});setClipId(id);setTime(0);}}>+ Клип</button>
            <button className={button} disabled={!clip||editBind} onClick={()=>{setState({...state,pose2D:{}});if(time>=clip!.duration)setTime(0);setPlaying(!playing);}}>{playing?"Пауза":"Воспроизвести"}</button><button className={button} disabled={!clip||editBind} onClick={keyframe}>+ Ключ</button>
          </div>
          {clip&&<><div className="flex items-center gap-3"><input aria-label="Время анимации" className="min-w-0 flex-1 accent-violet-400" type="range" min={0} max={clip.duration} step={0.01} value={time} onChange={(e)=>{setPlaying(false);setTime(Number(e.target.value));setState({...state,pose2D:{}});}}/><span className="w-24 text-right font-mono text-xs">{time.toFixed(2)} / {clip.duration}s</span></div>
            <div className="flex flex-wrap items-end gap-3"><div className="w-28"><NumberField name="Длительность, с" value={clip.duration} min={0.1} max={3600} step={0.1} onChange={(value)=>change((next)=>{if(next.doc.kind==="rig2d")next.doc.clips.find((c)=>c.id===clip.id)!.duration=value;})}/></div>
              <label className="flex gap-2 pb-2 text-xs"><input type="checkbox" checked={clip.loop} onChange={(e)=>change((next)=>{if(next.doc.kind==="rig2d")next.doc.clips.find((c)=>c.id===clip.id)!.loop=e.target.checked;})}/>Зациклить</label>
              <label className={label}>Интерполяция<select className={`${input} mt-1`} value={interpolation} onChange={(e)=>setInterpolation(e.target.value as "linear"|"step")}><option value="linear">Плавная</option><option value="step">Ступенчатая</option></select></label>
            </div><div className="flex flex-wrap gap-2">{selectedTrack?.keys.map((key)=><button className={button} key={key.time} onClick={()=>{setTime(key.time);setPlaying(false);setState({...state,pose2D:{}});}}>{key.time.toFixed(2)}s</button>)}</div>
            <button className={button} disabled={!selectedTrack?.keys.some((k)=>Math.abs(k.time-time)<1e-6)} onClick={()=>change((next)=>{if(next.doc.kind!=="rig2d")return;const target=next.doc.clips.find((c)=>c.id===clip.id)!;const track=target.tracks.find((t)=>t.boneId===bone.id)!;track.keys=track.keys.filter((k)=>Math.abs(k.time-time)>1e-6);target.tracks=target.tracks.filter((t)=>t.keys.length);})}>Удалить ключ в этом времени</button>
          </>}
        </div>}
        {doc.kind==="rig3d"&&<p className="text-xs text-white/40">Жёсткие привязки деталей. GLB сохраняет видимую статическую позу; деформация по весам и экспорт анимационного скелета пока отсутствуют.</p>}
      </div>
      <aside className="order-3 space-y-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4 md:col-span-2 xl:col-span-1">
        <div><h2 className="mb-3 text-sm font-semibold">{editBind?"Исходная кость":"Поза кости"}: <span className="text-violet-300">{boneName(bone.id)}</span></h2>
          <div className="grid grid-cols-2 gap-2">{transform.position.map((value,index)=><NumberField key={index} name={`Позиция ${["X","Y","Z"][index]}`} value={value} step={mode==="rig2d"?1:0.1} onChange={(n)=>setPosition(index,n)}/>)}</div>
          <div className="mt-3 grid grid-cols-2 gap-2">{(typeof transform.rotation==="number"?[transform.rotation]:transform.rotation).map((value,index)=><NumberField key={index} name={`Угол ${mode==="rig2d"?"":"XYZ"[index]}°`} value={value*180/Math.PI} step={1} onChange={(n)=>setAngle(index,n)}/>)}</div>
          {editBind&&<div className="mt-3 space-y-3"><NumberField name="Длина кости" value={bone.length} min={mode==="rig2d"?0.01:0.001} step={mode==="rig2d"?1:0.1} onChange={(value)=>change((next)=>{next.doc.bones.find((b)=>b.id===bone.id)!.length=value;})}/>
            <label className={label}>Родитель<select aria-label="Родитель кости" className={`${input} mt-1`} value={bone.parentId??""} onChange={(e)=>change((next)=>{next.doc.bones.find((b)=>b.id===bone.id)!.parentId=e.target.value||null;})}><option value="">Корневая кость</option>{doc.bones.filter((b)=>b.id!==bone.id).map((b)=><option key={b.id} value={b.id}>{boneName(b.id)}</option>)}</select></label>
          </div>}
        </div>
        <div className="space-y-3 border-t border-white/10 pt-4"><h2 className="text-sm font-semibold">{mode==="rig2d"?"Слои и привязки":"Детали и привязки"}</h2>
          <select aria-label={mode==="rig2d"?"Слой":"Деталь"} className={input} value={layerId} onChange={(e)=>setLayerId(e.target.value)}><option value="">Выберите {mode==="rig2d"?"слой":"деталь"}</option>{(doc.kind==="rig2d"?doc.layers:doc.parts).map((item)=><option key={item.id} value={item.id}>{"name" in item?item.name:item.id}</option>)}</select>
          {doc.kind==="rig2d"&&<label className={`${button} block cursor-pointer text-center`}>+ PNG / WebP<input type="file" aria-label="Загрузить слой" accept="image/png,image/webp" className="sr-only" onChange={(e)=>{void uploadLayer(e.target.files?.[0]);e.target.value="";}}/></label>}
          {layerId&&<label className={label}>Привязка к кости<select aria-label="Привязка к кости" className={`${input} mt-1`} value={doc.kind==="rig2d"?attachment?.boneId??"":doc.bindings.find((b)=>b.partId===layerId)?.boneId??""} onChange={(e)=>change((next)=>{
            if(next.doc.kind==="rig2d")next.doc=bindLayer(next.doc,layerId,e.target.value||null,effectivePose2D());
            else next.doc=bindPart(next.doc,layerId,e.target.value||null,editBind?{}:next.doc.pose);
          })}><option value="">Без привязки</option>{doc.bones.map((b)=><option key={b.id} value={b.id}>{boneName(b.id)}</option>)}</select></label>}
          {selectedLayer&&doc.kind==="rig2d"&&<>
            <div className="grid grid-cols-2 gap-2">{selectedLayer.pivot.map((value,index)=><NumberField key={index} name={`Pivot ${index?"Y":"X"}`} value={value} onChange={(n)=>change((next)=>{if(next.doc.kind==="rig2d")next.doc.layers.find((l)=>l.id===layerId)!.pivot[index]=n;})}/>)}</div>
            <div className="grid grid-cols-2 gap-2">{(attachment?.offset??selectedLayer.transform).position.map((value,index)=><NumberField key={index} name={`Слой ${index?"Y":"X"}`} value={value} onChange={(n)=>change((next)=>{if(next.doc.kind!=="rig2d")return;const target=next.doc.attachments.find((a)=>a.layerId===layerId)?.offset??next.doc.layers.find((l)=>l.id===layerId)!.transform;target.position[index]=n;})}/>)}</div>
            <NumberField name="Поворот слоя°" value={(attachment?.offset??selectedLayer.transform).rotation*180/Math.PI} onChange={(n)=>change((next)=>{if(next.doc.kind!=="rig2d")return;const target=next.doc.attachments.find((a)=>a.layerId===layerId)?.offset??next.doc.layers.find((l)=>l.id===layerId)!.transform;target.rotation=n*Math.PI/180;})}/>
            <div className="grid grid-cols-2 gap-2">{(attachment?.offset??selectedLayer.transform).scale.map((value,index)=><NumberField key={index} name={`Масштаб слоя ${index?"Y":"X"}`} value={value} min={0.01} max={100} step={0.1} onChange={(n)=>change((next)=>{if(next.doc.kind!=="rig2d")return;const target=next.doc.attachments.find((a)=>a.layerId===layerId)?.offset??next.doc.layers.find((l)=>l.id===layerId)!.transform;target.scale[index]=n;})}/>)}</div>
            <NumberField name="Порядок слоя" value={selectedLayer.zIndex} onChange={(n)=>change((next)=>{if(next.doc.kind==="rig2d")next.doc.layers.find((l)=>l.id===layerId)!.zIndex=n;})}/>
            <label className="flex gap-2 text-xs"><input type="checkbox" checked={selectedLayer.visible} onChange={(e)=>change((next)=>{if(next.doc.kind==="rig2d")next.doc.layers.find((l)=>l.id===layerId)!.visible=e.target.checked;})}/>Показывать слой</label>
            <button className={button} onClick={()=>change((next)=>{if(next.doc.kind!=="rig2d")return;const assetId=selectedLayer.assetId;next.doc.layers=next.doc.layers.filter((l)=>l.id!==layerId);next.doc.attachments=next.doc.attachments.filter((a)=>a.layerId!==layerId);if(!next.doc.layers.some((l)=>l.assetId===assetId))next.doc.assets=next.doc.assets.filter((a)=>a.id!==assetId);})}>Удалить слой</button>
          </>}
        </div>
      </aside>
    </div>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 p-3"><button className={button} disabled={preview||busy} onClick={list}>Мои сохранённые риги</button><select aria-label="Сохранённый риг" className={`${input} !w-64`} value={openId} onChange={(e)=>setOpenId(e.target.value)}><option value="">Выберите документ</option>{documents.map((item)=><option key={item.id} value={item.id}>{item.name} · v{item.revision}</option>)}</select><button className={button} disabled={!openId||busy||preview} onClick={open}>Открыть</button></div>
    {doc.kind==="rig2d"&&<p className="text-xs leading-relaxed text-white/40">Загружайте отдельные прозрачные части персонажа. PNG/WebP до 256 KiB на слой включаются в JSON. Общий лимит серверного документа — 1 MiB. Цельный рисунок автоматически на части не разрезается.</p>}
  </section>;
}
