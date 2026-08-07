"use client";

export type CadTool = "select" | "translate" | "rotate" | "scale";

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
