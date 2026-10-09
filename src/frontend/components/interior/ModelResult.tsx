"use client";
import {useEffect, useMemo, useState} from "react";
import dynamic from "next/dynamic";
import type {LocalModelResult} from "@/shared/design/result";
import {interiorCutHeight} from "@/shared/geometry";
import {findAsset} from "@/shared/interior/catalog";

import ProcurementList from "../ProcurementList";
import {modelProcurement} from "@/shared/procurement";

const Viewer = dynamic(() => import("../three/ConceptViewer"), {ssr: false});
const CompositionViewer = dynamic(() => import("./CompositionViewer"), {ssr: false});
const HouseViewer = dynamic(() => import("./HouseViewer"), {ssr: false,loading:()=> <p className="p-6 text-muted">Загрузка обстановки…</p>});
const button = "rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40";

export default function ModelResult({result, onReturn}: {result: LocalModelResult; onReturn: () => void}) {
  const [selected, setSelected] = useState<string | null>(null), [section, setSection] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [floor, setFloor] = useState<number | null>(result.document ? 0 : null);
  const [plan, setPlan] = useState(false), [roomId,setRoomId] = useState<string|null>(null);
  const {concept} = result;
  const procurement = useMemo(() => modelProcurement(result), [result]);
  useEffect(() => {setFloor(result.document ? 0 : null);setSelected(null);setSection(false);setPlan(false);setRoomId(null);}, [result]);
  const room = useMemo(()=>result.interiors?.find(r=>r.floorId===result.document?.floors[floor??0]?.id&&r.roomId===roomId),[result,floor,roomId]);
  async function save(format: "json" | "glb") {
    setBusy(true); setError("");
    try {
      const {exportConceptGlb, downloadBlob} = await import("@/frontend/export-3d");
      const blob = format === "glb" ? result.composition ? await (await import("@/frontend/composition-model")).exportComposition(result) : result.document ? await (await import("@/frontend/house-model")).exportFurnishedHouse(result) : await exportConceptGlb(concept) : new Blob([JSON.stringify(result.composition ? {...concept, composition: result.composition} : result.document ? {...concept, houseDocument: result.document, interiors:result.interiors} : concept, null, 2)], {type: "application/json"});
      downloadBlob(`atrion-model.${format}`, blob);
    } catch {setError("Не удалось экспортировать модель");}
    finally {setBusy(false);}
  }
  return <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface2">
    <div className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="font-medium text-white">{concept.name}</h2><p className="text-xs text-muted">{result.source === "local-ai" ? "Сцена по тексту · локальная нейросеть на CPU" : "3D-модель · процедурная генерация"}</p></div><button className={button} onClick={onReturn}>Вернуться к комнате</button></div>
    {result.document && <div className="space-y-3 border-t border-white/10 px-4 py-3"><div className="flex flex-wrap items-center gap-2"><span className="mr-2 text-xs text-muted">{result.document.floors.length} эт. · {result.document.floors.reduce((n,f) => n + f.rooms.length, 0)} помещений · {result.interiors?.reduce((n,r)=>n+r.scene.objects.length,0)??0} предметов</span><button className={button} aria-pressed={floor === null} onClick={() => {setFloor(null);setRoomId(null);setPlan(false);}}>Дом целиком</button>{result.document.floors.map((f,i) => <button key={f.id} className={button} aria-pressed={floor === i} onClick={() => {setFloor(i);setRoomId(null);}}>Внутри · {i+1} этаж</button>)}{floor!==null&&<button className={button} aria-pressed={plan} onClick={()=>setPlan(v=>!v)}>Вид сверху</button>}</div>{floor!==null&&<div className="flex flex-wrap gap-2"><button className={button} aria-pressed={!roomId} onClick={()=>setRoomId(null)}>Весь этаж</button>{result.document.floors[floor]?.rooms.map(r=><button key={r.id} className={button} aria-pressed={roomId===r.id} onClick={()=>setRoomId(r.id)}>{r.name}</button>)}</div>}</div>}
    <div className="h-[clamp(420px,60vh,700px)]" aria-label="Сгенерированная 3D-модель">{result.composition ? <CompositionViewer result={result}/> : result.document ? <HouseViewer result={result} view={{floor,plan,roomId}}/> : <Viewer concept={concept} selectedId={selected} onSelect={setSelected} sectionHeight={section ? interiorCutHeight(concept) ?? concept.dimensions.height / 2 : null}/>}</div>
    {room&&<div className="border-t border-white/10 px-4 py-3 text-sm text-slate-200"><b>{room.name}</b><p className="mt-1 text-xs text-muted">{room.scene.objects.map(o=>findAsset(o.assetId).name).join(" · ")||"Без мебели"}</p></div>}
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs text-muted"><span>{concept.dimensions.width} × {concept.dimensions.depth} × {concept.dimensions.height} м · вращайте мышью</span><div className="flex gap-2">{!result.document&&!result.composition&&<button className={button} aria-pressed={section} onClick={() => setSection(v => !v)}>Разрез</button>}{(["glb", "json"] as const).map(f => <button className={button} disabled={busy} key={f} onClick={() => void save(f)}>{f.toUpperCase()} ↓</button>)}</div></div>
    <div className="px-4 pb-4"><ProcurementList value={procurement}/></div>
    <div className="space-y-2 border-t border-white/10 p-4 text-xs text-muted"><p>{result.composition ? "Состав сцены" : "Учтено"}: {result.recognized.join(" · ")}. Проверьте детали по своему описанию.</p>{result.document?.floors.map((f,i) => <p key={f.id}>Этаж {i+1}: {f.rooms.map(r => r.name).join(", ")}</p>)}{result.notes?.map((note,i) => <p key={i}>{note}</p>)}<p>Модель хранится на этой странице. Скачайте GLB или JSON перед закрытием.</p>{result.missing.length > 0 && <p className="text-amber-300">Не удалось подтвердить: {result.missing.join(", ")}</p>}{error && <p role="alert" className="text-rose-300">{error}</p>}</div>
  </div>;
}
