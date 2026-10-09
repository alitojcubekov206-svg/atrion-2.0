"use client";
import {useMemo,useState} from "react";
import dynamic from "next/dynamic";
import type {LocalModelResult} from "@/shared/design/result";
import type {ModelPart} from "@/shared/types";
import {interiorCutHeight} from "@/shared/geometry";
import {findAsset} from "@/shared/interior/catalog";
import {editHouseRoom,transferHouseObject} from "@/shared/house/edit";
import {editModelPart} from "@/shared/design/edit-model";
import {isLivingConcept} from "@/shared/living/request";
import type {CadTool} from "../CadToolbar";
import type {ObjectPose} from "./ObjectGizmo";
import PlacementToolbar from "./PlacementToolbar";
import ProcurementList from "../ProcurementList";
import {modelProcurement} from "@/shared/procurement";

const Viewer=dynamic(()=>import("../three/ConceptViewer"),{ssr:false});
const CompositionViewer=dynamic(()=>import("./CompositionViewer"),{ssr:false});
const HouseViewer=dynamic(()=>import("./HouseViewer"),{ssr:false});
const LivingViewer=dynamic(()=>import("./LivingViewer"),{ssr:false});
const button="rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40";
const input="rounded-lg border border-white/15 bg-surface2 px-2 py-1 text-sm";

export default function ModelResult({result,onChange,onReturn}:{result:LocalModelResult;onChange:(result:LocalModelResult)=>void;onReturn:()=>void}) {
  const [selected,setSelected]=useState<string|null>(null),[section,setSection]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [floor,setFloor]=useState<number|null>(null),[plan,setPlan]=useState(false),[roomId,setRoomId]=useState<string|null>(null);
  const [mode,setMode]=useState<CadTool>("select"),[playing,setPlaying]=useState(true);
  const [undo,setUndo]=useState<LocalModelResult[]>([]),[redo,setRedo]=useState<LocalModelResult[]>([]);
  const {concept}=result,living=isLivingConcept(concept),placement=mode==="scale"?"select":mode;
  const procurement=useMemo(()=>modelProcurement(result),[result]);
  const room=result.interiors?.find(r=>r.floorId===result.document?.floors[floor??0]?.id&&r.roomId===roomId);
  const owner=result.interiors?.find(r=>r.scene.objects.some(o=>o.id===selected));
  const item=owner?.scene.objects.find(o=>o.id===selected),part=concept.parts.find(p=>p.id===selected);
  const options=result.document?result.interiors?.filter(r=>(floor===null||r.floorId===result.document?.floors[floor]?.id)&&(!roomId||r.roomId===roomId)).flatMap(r=>r.scene.objects.map(o=>({id:o.id,name:`${r.name} · ${findAsset(o.assetId).name}`})))??[]:concept.parts.map(p=>({id:p.id,name:p.name}));

  function commit(update:()=>LocalModelResult):boolean {
    try {const next=update();setUndo(h=>[...h.slice(-49),result]);setRedo([]);onChange(next);setError("");return true;}
    catch(e) {setError((e as Error).message);return false;}
  }
  function history(forward:boolean) {
    const stack=forward?redo:undo,next=stack.at(-1);if(!next)return;
    if(forward){setRedo(stack.slice(0,-1));setUndo(h=>[...h,result]);}else{setUndo(stack.slice(0,-1));setRedo(h=>[...h,result]);}
    onChange(next);setError("");
    const restored=next.interiors?.find(r=>r.scene.objects.some(o=>o.id===selected));
    if(restored){setFloor(next.document!.floors.findIndex(f=>f.id===restored.floorId));setRoomId(restored.roomId);}
  }
  function furniture(actions:Record<string,unknown>[]) {
    return commit(()=>{if(!owner)throw new Error("Выберите предмет");return editHouseRoom(result,owner.floorId,owner.roomId,actions);});
  }
  async function moveObject(id:string,pose:ObjectPose) {
    const target=result.interiors?.find(r=>r.scene.objects.some(o=>o.id===id));
    if(result.document) return commit(()=>{if(!target)throw new Error("Предмет не найден");return editHouseRoom(result,target.floorId,target.roomId,[{type:"MOVE_OBJECT",objectId:id,position:{...pose.position,y:0}},{type:"ROTATE_OBJECT",objectId:id,angle:pose.angle}]);});
    const rotation=concept.parts.find(p=>p.id===id)?.rotation??[0,0,0];
    return commit(()=>editModelPart(result,id,{position:[pose.position.x,pose.position.y,pose.position.z],rotation:[rotation[0],pose.angle,rotation[2]]}));
  }
  const patchPart=(id:string,patch:Partial<ModelPart>)=>commit(()=>editModelPart(result,id,patch));
  async function save(format:"json"|"glb") {
    setBusy(true);setError("");
    try {
      const {exportConceptGlb,downloadBlob}=await import("@/frontend/export-3d");
      const blob=format==="glb"?result.composition?await(await import("@/frontend/composition-model")).exportComposition(result):result.document?await(await import("@/frontend/house-model")).exportFurnishedHouse(result):await exportConceptGlb(concept):new Blob([JSON.stringify(result.composition?{...concept,composition:result.composition}:result.document?{...concept,houseDocument:result.document,interiors:result.interiors}:concept,null,2)],{type:"application/json"});
      downloadBlob(`atrion-model.${format}`,blob);
    } catch(e) {setError((e as Error).message||"Не удалось экспортировать модель");}finally{setBusy(false);}
  }
  return <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface2">
    <div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="font-medium text-white">{concept.name}</h2><p className="text-xs text-muted">{result.source==="local-ai"?"Сцена по тексту · локальная нейросеть на CPU":result.source==="ai"?"3D-модель · AI":"3D-модель · процедурная генерация"}</p></div><button className={button} onClick={onReturn}>Вернуться к комнате</button></div>
    {result.document&&<div className="space-y-3 border-t border-white/10 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2"><span className="mr-2 text-xs text-muted">{result.document.floors.length} эт. · {result.interiors?.reduce((n,r)=>n+r.scene.objects.length,0)??0} предметов</span><button className={button} aria-pressed={floor===null} onClick={()=>{setFloor(null);setRoomId(null);setSelected(null);setPlan(false);}}>Дом целиком</button>{result.document.floors.map((f,i)=><button key={f.id} className={button} aria-pressed={floor===i} onClick={()=>{setFloor(i);setRoomId(null);setSelected(null);}}>Внутри · {i+1} этаж</button>)}{floor!==null&&<button className={button} aria-pressed={plan} onClick={()=>setPlan(v=>!v)}>Вид сверху</button>}</div>
      {floor!==null&&<div className="flex flex-wrap gap-2"><button className={button} aria-pressed={!roomId} onClick={()=>setRoomId(null)}>Весь этаж</button>{result.document.floors[floor]?.rooms.map(r=><button key={r.id} className={button} aria-pressed={roomId===r.id} onClick={()=>{setRoomId(r.id);setSelected(null);}}>{r.name}</button>)}</div>}
    </div>}
    <div className="flex flex-wrap items-center gap-2 border-t border-white/10 p-3">
      <PlacementToolbar mode={placement} onChange={setMode} disabled={busy}/>
      {!result.document&&!result.composition&&<button className={button} aria-pressed={mode==="scale"} onClick={()=>setMode("scale")}>Размер</button>}
      <button className={button} disabled={!undo.length||busy} onClick={()=>history(false)}>Отменить</button><button className={button} disabled={!redo.length||busy} onClick={()=>history(true)}>Повторить</button>
      {living&&<><button className={button} aria-pressed={playing} onClick={()=>{setPlaying(v=>!v);setMode("select");}}>{playing?"Пауза":"Движение"}</button><label className="text-sm">Анимация <select className={input} aria-label="Анимация" value={concept.motion??"idle"} onChange={e=>commit(()=>({...result,concept:{...concept,motion:e.target.value as "idle"|"walk"}}))}><option value="idle">Покой</option><option value="walk">Ходьба</option></select></label></>}
    </div>
    <div className="h-[clamp(420px,60vh,700px)]" aria-label="Сгенерированная 3D-модель">
      {result.composition?<CompositionViewer result={result} selected={selected} onSelect={setSelected} mode={placement} onCommit={moveObject}/>:result.document?<HouseViewer result={result} view={{floor,plan,roomId}} selected={selected} onSelect={setSelected} mode={placement} onCommit={moveObject}/>:living&&mode==="select"?<LivingViewer concept={concept} playing={playing}/>:<Viewer concept={concept} selectedId={selected} onSelect={setSelected} cadTool={mode} onPartChange={patchPart} sectionHeight={section?interiorCutHeight(concept)??concept.dimensions.height/2:null}/>}
    </div>
    <div className="flex flex-wrap items-center gap-3 border-t border-white/10 p-4 text-sm">
      <label>{result.document?"Предмет":"Деталь"} <select className={input} aria-label={result.document?"Выбрать предмет":"Выбрать деталь"} value={selected??""} onChange={e=>setSelected(e.target.value||null)}><option value="">Выберите в сцене или списке</option>{options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      {item&&(["x","z"] as const).map(axis=><label key={`${item.id}/${axis}/${item.position[axis]}`}>{axis.toUpperCase()}, м <input aria-label={`Положение ${axis.toUpperCase()}`} className={`${input} w-24`} type="number" step=".1" defaultValue={item.position[axis]} disabled={item.locked} onBlur={e=>{if(e.target.value!==""&&Number(e.target.value)!==item.position[axis]&&!furniture([{type:"MOVE_OBJECT",objectId:item.id,position:{...item.position,[axis]:Number(e.target.value)}}]))e.target.value=String(item.position[axis]);}}/></label>)}
      {item&&<><button className={button} disabled={item.locked} onClick={()=>furniture([{type:"ROTATE_OBJECT",objectId:item.id,angle:(item.rotation.y+Math.PI/2)%(Math.PI*2)}])}>Повернуть 90°</button><button className={button} aria-pressed={item.locked} onClick={()=>furniture([{type:"LOCK_OBJECT",objectId:item.id,locked:!item.locked}])}>{item.locked?"Разблокировать":"Закрепить"}</button><button className={button} disabled={item.locked} onClick={()=>{if(furniture([{type:"REMOVE_OBJECT",objectId:item.id}]))setSelected(null);}}>Удалить предмет</button></>}
      {item&&<label>Перенести в комнату <select aria-label="Перенести в комнату" className={input} value="" disabled={item.locked} onChange={e=>{const target=result.interiors?.find(r=>`${r.floorId}/${r.roomId}`===e.target.value);if(target&&commit(()=>transferHouseObject(result,item.id,target.floorId,target.roomId))){setFloor(result.document!.floors.findIndex(f=>f.id===target.floorId));setRoomId(target.roomId);}}}><option value="">Выберите помещение</option>{result.interiors?.filter(r=>r!==owner).map(r=><option key={`${r.floorId}/${r.roomId}`} value={`${r.floorId}/${r.roomId}`}>{result.document!.floors.findIndex(f=>f.id===r.floorId)+1} этаж · {r.name}</option>)}</select></label>}
      {!result.document&&part&&([0,1,2] as const).map(axis=><label key={`${part.id}/${axis}/${part.position[axis]}`}>{["X","Y","Z"][axis]}, м <input aria-label={`Положение ${["X","Y","Z"][axis]}`} className={`${input} w-24`} type="number" step=".1" defaultValue={part.position[axis]} onBlur={e=>{if(e.target.value===""||Number(e.target.value)===part.position[axis])return;const position=[...part.position] as ModelPart["position"];position[axis]=Number(e.target.value);if(!patchPart(part.id,{position}))e.target.value=String(part.position[axis]);}}/></label>)}
    </div>
    {room&&<div className="px-4 pb-3 text-sm text-slate-200"><b>{room.name}</b><p className="mt-1 text-xs text-muted">{room.scene.objects.map(o=>findAsset(o.assetId).name).join(" · ")||"Без мебели"}</p></div>}
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs text-muted"><span>{concept.dimensions.width} × {concept.dimensions.depth} × {concept.dimensions.height} м</span><div className="flex gap-2">{!result.document&&!result.composition&&!living&&<button className={button} aria-pressed={section} onClick={()=>setSection(v=>!v)}>Разрез</button>}{(["glb","json"] as const).map(f=><button className={button} disabled={busy} key={f} onClick={()=>void save(f)}>{f.toUpperCase()} ↓</button>)}</div></div>
    <div className="px-4 pb-4"><ProcurementList value={procurement}/></div>
    <div className="space-y-2 border-t border-white/10 p-4 text-xs text-muted"><p>{result.composition?"Состав сцены":"Учтено"}: {result.recognized.join(" · ")}. Проверьте детали по своему описанию.</p>{living&&<p>Покой и ходьба на месте входят в GLB. Анимация выполнена шарнирами деталей; Humanoid-скелет не создаётся.</p>}{result.notes?.map((note,i)=><p key={i}>{note}</p>)}<p>Модель хранится на этой странице. Скачайте GLB или JSON перед закрытием.</p>{result.missing.length>0&&<p className="text-amber-300">Не удалось подтвердить: {result.missing.join(", ")}</p>}{error&&<p role="alert" className="text-rose-300">{error}</p>}</div>
  </div>;
}
