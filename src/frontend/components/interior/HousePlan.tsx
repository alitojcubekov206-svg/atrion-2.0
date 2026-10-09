"use client";
import {useRef} from "react";
import type {HouseDocument} from "@/shared/house/document";
import type {HouseRoomInterior} from "@/shared/house/furnishing";
import {findAsset} from "@/shared/interior/catalog";

export default function HousePlan({document:doc,floor=0,interiors=[]}:{document:HouseDocument;floor?:number;interiors?:HouseRoomInterior[]}) {
  const svg=useRef<SVGSVGElement>(null),f=doc.floors[floor];
  if(!f)return null;
  const font=Math.max(doc.width,doc.depth)*.024;
  function download(){if(!svg.current)return;const url=URL.createObjectURL(new Blob([svg.current.outerHTML],{type:"image/svg+xml"}));const a=window.document.createElement("a");a.href=url;a.download=`atrion-floor-${floor+1}.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  return <details className="border-t border-white/10 p-4"><summary className="cursor-pointer text-sm text-white">План и размеры · {floor+1} этаж</summary>
    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted"><span>Схема текущей модели · двери, окна и мебель</span><button className="rounded-lg border border-white/15 px-3 py-2 text-accent" onClick={download}>Скачать план SVG</button></div>
    <svg ref={svg} xmlns="http://www.w3.org/2000/svg" viewBox={`-1.5 -1.5 ${doc.width+3} ${doc.depth+3}`} role="img" aria-label={`План этажа ${floor+1}`} className="mt-3 max-h-[600px] w-full rounded-xl bg-[#14131b]" style={{background:"#14131b",fontFamily:"sans-serif",fontSize:font}}>
      <rect x={-1.5} y={-1.5} width={doc.width+3} height={doc.depth+3} fill="#14131b"/>
      {f.rooms.map(r=><g key={r.id}><rect x={r.x} y={r.z} width={r.width} height={r.depth} fill="#242230" stroke="#cec7df" strokeWidth={doc.wallThickness}/><text x={r.x+r.width/2} y={r.z+r.depth/2} textAnchor="middle" fill="#ffffff">{r.name.slice(0,30)}</text><text x={r.x+r.width/2} y={r.z+r.depth/2+font*1.5} textAnchor="middle" fill="#b7a8da">{r.width.toFixed(2)} × {r.depth.toFixed(2)} м</text></g>)}
      {interiors.filter(r=>r.floorId===f.id).flatMap(r=>r.scene.objects.map(o=>{const a=findAsset(o.assetId),x=r.origin[0]+doc.width/2+o.position.x,z=r.origin[2]+doc.depth/2+o.position.z;return <rect key={o.id} x={x-a.width*o.scale.x/2} y={z-a.depth*o.scale.z/2} width={a.width*o.scale.x} height={a.depth*o.scale.z} transform={`rotate(${-o.rotation.y*180/Math.PI} ${x} ${z})`} fill="none" stroke={o.color} strokeWidth={.05}/>;}))}
      {f.openings.map(o=>{const r=f.rooms.find(r=>r.id===o.roomId)!;const horizontal=o.side==="north"||o.side==="south";const x=r.x+(horizontal?o.offset:o.side==="east"?r.width:0),z=r.z+(horizontal?(o.side==="south"?r.depth:0):o.offset);return <g key={o.id}><line x1={x} y1={z} x2={x+(horizontal?o.width:0)} y2={z+(horizontal?0:o.width)} stroke="#14131b" strokeWidth={doc.wallThickness+.03}/><line x1={x} y1={z} x2={x+(horizontal?o.width:0)} y2={z+(horizontal?0:o.width)} stroke={o.kind==="window"?"#76c9f5":"#c5a576"} strokeWidth={o.kind==="window"?.06:.09}/><text x={x+(horizontal?o.width/2:.15)} y={z+(horizontal?-.15:o.width/2)} fill="#eee" fontSize={font*.7}>{o.kind==="window"?"О":"Д"}</text></g>;})}
      <text x={doc.width/2} y={-.65} textAnchor="middle" fill="#cbb9ff">{doc.width} м</text><text x={-.7} y={doc.depth/2} textAnchor="middle" transform={`rotate(-90 -.7 ${doc.depth/2})`} fill="#cbb9ff">{doc.depth} м</text>
    </svg><p className="mt-2 text-xs text-muted">О — окно, Д — дверь. Эскиз без инженерных расчётов.</p>
  </details>;
}
