"use client";
import type {PlacementMode} from "./ObjectGizmo";
export default function PlacementToolbar({mode,onChange,disabled}: {mode:PlacementMode;onChange:(mode:PlacementMode)=>void;disabled?:boolean}) {
  return <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Редактирование в сцене">
    {([["select","Обзор"],["translate","Переместить"],["rotate","Повернуть"]] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={mode===value} disabled={disabled}
      className={"rounded-xl border px-3 py-2 text-xs disabled:opacity-40 "+(mode===value?"border-accent bg-accent/15 text-accent":"border-white/15 text-slate-200 hover:bg-white/10")} onClick={()=>onChange(value)}>{label}</button>)}
    <span className="text-xs text-muted">Выберите предмет и потяните за стрелку или кольцо.</span>
  </div>;
}
