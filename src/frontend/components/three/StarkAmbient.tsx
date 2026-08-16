"use client";

/** Lightweight dashboard backdrop — CSS only (no WebGL lag) */
export default function StarkAmbient({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_0%,rgba(167,139,250,0.2),transparent_46%),radial-gradient(ellipse_at_92%_82%,rgba(232,121,249,0.12),transparent_42%),linear-gradient(180deg,#050507_0%,#0a0812_50%,#050507_100%)]" />
      <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(167,139,250,0.55)_1px,transparent_1px),linear-gradient(90deg,rgba(167,139,250,0.55)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="absolute left-[12%] top-[18%] h-40 w-40 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="absolute bottom-[12%] right-[10%] h-48 w-48 rounded-full bg-fuchsia-500/10 blur-3xl" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#050507] via-transparent to-[#050507]/55" />
    </div>
  );
}
