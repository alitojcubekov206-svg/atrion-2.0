"use client";
import type {PlacementMode} from "./ObjectGizmo";

/** Room axes: ← → is x, ↑ moves away from the default camera (−z), ↓ towards it. */
const MOVES = [
  {label: "↑", title: "Дальше", dx: 0, dz: -1, area: "up"},
  {label: "←", title: "Влево", dx: -1, dz: 0, area: "left"},
  {label: "→", title: "Вправо", dx: 1, dz: 0, area: "right"},
  {label: "↓", title: "Ближе", dx: 0, dz: 1, area: "down"},
] as const;
const STEPS = [0.1, 0.5] as const;

export default function PlacementToolbar({mode, onChange, disabled, target, step = 0.1, onStep, onNudge, onTurn, note}: {
  mode: PlacementMode; onChange: (mode: PlacementMode) => void; disabled?: boolean;
  /** Name of the selected piece; the arrow pad shows only while one is selected and handlers are given. */
  target?: string; step?: number; onStep?: (step: number) => void;
  onNudge?: (dx: number, dz: number) => void; onTurn?: (degrees: number) => void; note?: string;
}) {
  const pad = Boolean(target && onNudge && onTurn);
  const key = "flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-base text-slate-100 hover:bg-white/10 disabled:opacity-40";
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Редактирование в сцене">
      {([["select","Обзор"],["translate","Переместить"],["rotate","Повернуть"]] as const).map(([value,label]) => <button key={value} type="button" aria-pressed={mode===value} disabled={disabled}
        className={"rounded-xl border px-3 py-2 text-xs disabled:opacity-40 "+(mode===value?"border-accent bg-accent/15 text-accent":"border-white/15 text-slate-200 hover:bg-white/10")} onClick={()=>onChange(value)}>{label}</button>)}
      <span className="text-xs text-muted">{pad ? "Двигайте стрелками ниже или тяните за стрелку в сцене." : onNudge ? "Нажмите на предмет в сцене, чтобы его двигать." : "Выберите предмет и потяните за стрелку или кольцо."}</span>
    </div>
    {pad && <div className="flex flex-wrap items-center gap-4" role="group" aria-label={`Переместить: ${target}`}>
      <span className="text-xs text-slate-300">{target}</span>
      <div className="grid grid-cols-3 gap-1" style={{gridTemplateAreas: '". up ." "left . right" ". down ."'}}>
        {MOVES.map(m => <button key={m.area} type="button" title={m.title} aria-label={m.title} disabled={disabled} className={key} style={{gridArea: m.area}}
          onClick={() => onNudge?.(m.dx * step, m.dz * step)}>{m.label}</button>)}
      </div>
      <div className="flex gap-1">
        <button type="button" title="Повернуть против часовой на 90°" aria-label="Повернуть против часовой на 90°" disabled={disabled} className={key} onClick={() => onTurn?.(90)}>⟲</button>
        <button type="button" title="Повернуть по часовой на 90°" aria-label="Повернуть по часовой на 90°" disabled={disabled} className={key} onClick={() => onTurn?.(-90)}>⟳</button>
      </div>
      <div className="flex gap-1 text-xs" role="group" aria-label="Шаг">
        {STEPS.map(s => <button key={s} type="button" aria-pressed={step === s} onClick={() => onStep?.(s)}
          className={"rounded-lg border px-2 py-1 "+(step === s ? "border-accent bg-accent/15 text-accent" : "border-white/15 text-slate-300 hover:bg-white/10")}>{s * 100} см</button>)}
      </div>
      {note && <span role="status" className="text-xs text-amber-300">{note}</span>}
    </div>}
  </div>;
}
