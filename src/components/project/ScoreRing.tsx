"use client";

export default function ScoreRing({ value, label }: { value: number; label: string }) {
  const r = 41;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = value >= 75 ? "#34d399" : value >= 50 ? "#7c6cff" : "#f59e0b";

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="110" height="110" viewBox="0 0 110 110" className="score-ring -rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
        <circle
          className="fill"
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="-mt-[74px] text-xl font-bold">{value}</span>
      <span className="mt-[38px] text-xs uppercase tracking-wider text-muted">{label}</span>
    </div>
  );
}
