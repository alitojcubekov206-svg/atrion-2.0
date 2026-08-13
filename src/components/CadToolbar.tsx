"use client";

import type { PartShape } from "@/lib/types";

export type CadTool = "select" | "translate" | "rotate" | "scale";

const ADD_SHAPES: { id: PartShape; label: string }[] = [
  { id: "box", label: "Box" },
  { id: "cylinder", label: "Cylinder" },
  { id: "sphere", label: "Sphere" },
  { id: "cone", label: "Cone" },
  { id: "pyramid", label: "Pyramid" },
  { id: "prism", label: "Prism" },
  { id: "wedge", label: "Wedge" },
  { id: "torus", label: "Torus" },
  { id: "capsule", label: "Capsule" },
  { id: "tube", label: "Tube" },
  { id: "plane", label: "Plane" },
];

export default function CadToolbar({
  tool,
  onTool,
  snap,
  onSnap,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  units,
  addShape,
  onAddShape,
  onAddPart,
  onDuplicatePart,
  onDeletePart,
  canEditSelection,
}: {
  tool: CadTool;
  onTool: (t: CadTool) => void;
  snap: boolean;
  onSnap: (v: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  units: "m" | "cm";
  addShape: PartShape;
  onAddShape: (shape: PartShape) => void;
  onAddPart: () => void;
  onDuplicatePart: () => void;
  onDeletePart: () => void;
  canEditSelection: boolean;
}) {
  const tools: { id: CadTool; label: string }[] = [
    { id: "select", label: "Select" },
    { id: "translate", label: "Move" },
    { id: "rotate", label: "Rotate" },
    { id: "scale", label: "Scale" },
  ];

  return (
    <div className="absolute left-4 top-14 z-20 flex flex-wrap items-center gap-1 rounded-xl border border-violet-400/25 bg-[#0a0a0c]/80 px-2 py-1.5 backdrop-blur-xl">
      <span className="mr-1 font-mono text-[9px] uppercase tracking-[0.18em] text-violet-300/70">
        CAD
      </span>
      {tools.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onTool(item.id)}
          className={`rounded-full px-2.5 py-1 text-[11px] transition ${
            tool === item.id
              ? "bg-violet-400/30 text-violet-100"
              : "text-[#8f8a82] hover:text-white"
          }`}
        >
          {item.label}
        </button>
      ))}
      <span className="mx-1 h-4 w-px bg-white/10" />
      <select
        value={addShape}
        onChange={(e) => onAddShape(e.target.value as PartShape)}
        title="Форма новой детали"
        className="rounded-full border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-[#b8b2a8] outline-none"
      >
        {ADD_SHAPES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onAddPart}
        title="Добавить деталь"
        className="rounded-full bg-violet-400/25 px-2.5 py-1 text-[11px] text-violet-100 hover:bg-violet-400/35"
      >
        + Add
      </button>
      <button
        type="button"
        disabled={!canEditSelection}
        onClick={onDuplicatePart}
        title="Дублировать выбранную деталь"
        className="rounded-full px-2.5 py-1 text-[11px] text-[#8f8a82] hover:text-white disabled:opacity-30"
      >
        Dup
      </button>
      <button
        type="button"
        disabled={!canEditSelection}
        onClick={onDeletePart}
        title="Удалить выбранную деталь"
        className="rounded-full px-2.5 py-1 text-[11px] text-red-300/90 hover:bg-red-500/15 hover:text-red-200 disabled:opacity-30"
      >
        Del
      </button>
      <span className="mx-1 h-4 w-px bg-white/10" />
      <button
        type="button"
        onClick={() => onSnap(!snap)}
        className={`rounded-full px-2.5 py-1 text-[11px] ${
          snap ? "bg-violet-400/25 text-violet-100" : "text-[#8f8a82]"
        }`}
      >
        Snap
      </button>
      <button
        type="button"
        disabled={!canUndo}
        onClick={onUndo}
        className="rounded-full px-2.5 py-1 text-[11px] text-[#8f8a82] disabled:opacity-30"
      >
        Undo
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onClick={onRedo}
        className="rounded-full px-2.5 py-1 text-[11px] text-[#8f8a82] disabled:opacity-30"
      >
        Redo
      </button>
      <span className="ml-1 font-mono text-[9px] text-[#6a6560]">{units}</span>
    </div>
  );
}
