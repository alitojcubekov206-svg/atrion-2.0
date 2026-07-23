"use client";

/**
 * Soft cinematic entry backdrop — CSS only (no WebGL lag).
 */
export default function EntryGateScene() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#050507]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_30%,rgba(167,139,250,0.16),transparent_52%),radial-gradient(ellipse_at_10%_90%,rgba(255,255,255,0.04),transparent_40%)]" />
      <div className="absolute inset-0 opacity-[0.045] [background-image:linear-gradient(rgba(167,139,250,0.9)_1px,transparent_1px),linear-gradient(90deg,rgba(167,139,250,0.9)_1px,transparent_1px)] [background-size:64px_64px]" />

      <div className="absolute right-[6%] top-[16%] h-28 w-48 animate-[gateFloat_8s_ease-in-out_infinite] rounded-sm border border-[#a78bfa]/30 bg-gradient-to-br from-[#a78bfa]/15 to-transparent shadow-[0_0_60px_rgba(167,139,250,0.12)]" />
      <div className="absolute right-[16%] top-[40%] h-36 w-32 animate-[gateFloat_10s_ease-in-out_infinite_reverse] rounded-sm border border-white/10 bg-white/[0.03]" />
      <div className="absolute right-[26%] top-[58%] h-16 w-52 animate-[gateFloat_9s_ease-in-out_infinite] rounded-sm border border-[#a78bfa]/20 bg-[#a78bfa]/08" />
      <div className="absolute right-[10%] bottom-[20%] h-24 w-24 animate-[gateSpin_22s_linear_infinite] rounded-full border border-[#a78bfa]/35" />
      <div className="absolute right-[12%] bottom-[22%] h-16 w-16 animate-[gateSpin_14s_linear_infinite_reverse] rounded-full border border-white/15" />

      <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#050507] via-[#050507]/80 to-transparent md:w-[58%]" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#050507] to-transparent" />
    </div>
  );
}
