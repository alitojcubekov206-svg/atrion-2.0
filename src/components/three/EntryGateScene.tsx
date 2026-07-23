"use client";

/**
 * Lightweight entry background — CSS only, no WebGL (fixes login lag).
 * Iron Man workshop vibe: black + gold.
 */
export default function EntryGateScene() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#07060a]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_35%,rgba(245,197,24,0.18),transparent_50%),radial-gradient(ellipse_at_12%_80%,rgba(167,139,250,0.12),transparent_45%)]" />
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(245,197,24,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(245,197,24,0.5)_1px,transparent_1px)] [background-size:56px_56px]" />

      <div className="absolute right-[8%] top-[18%] h-24 w-40 animate-[gateFloat_7s_ease-in-out_infinite] rounded-sm border border-amber-400/35 bg-gradient-to-br from-amber-400/20 to-transparent shadow-[0_0_40px_rgba(245,197,24,0.15)]" />
      <div className="absolute right-[18%] top-[38%] h-32 w-28 animate-[gateFloat_9s_ease-in-out_infinite_reverse] rounded-sm border border-violet-400/25 bg-violet-500/10" />
      <div className="absolute right-[28%] top-[55%] h-16 w-44 animate-[gateFloat_8s_ease-in-out_infinite] rounded-sm border border-amber-300/20 bg-amber-400/10" />
      <div className="absolute right-[12%] bottom-[22%] h-20 w-20 animate-[gateSpin_18s_linear_infinite] rounded-full border border-amber-400/40" />
      <div className="absolute right-[14%] bottom-[24%] h-14 w-14 animate-[gateSpin_12s_linear_infinite_reverse] rounded-full border border-violet-400/30" />

      <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#07060a] via-[#07060a]/75 to-transparent md:w-[55%]" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#07060a] to-transparent" />
    </div>
  );
}
