"use client";

import Link from "next/link";
import {DESIGN_EXAMPLES, type DesignExample} from "@/shared/design/examples";

export default function DesignExamples({disabled = false, onSelect}: {
  disabled?: boolean;
  onSelect?: (example: DesignExample) => void;
}) {
  const cardClass = "rounded-full border border-white/15 bg-[#111116] px-4 py-2 text-left text-xs text-slate-300 transition hover:border-accent/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-40";
  return <section className="mt-5 w-full" aria-label="Примеры моделей">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
      <h2 className="text-sm font-medium text-white">Выберите пример</h2>
      <p className="text-xs text-muted">Откроется в 3D · можно редактировать и скачать</p>
    </div>
    <div className="flex flex-wrap gap-2">
      {DESIGN_EXAMPLES.map(example => {
        const content = example.name;
        const label = `Открыть пример: ${example.name}`;
        return onSelect || disabled
          ? <button key={example.id} type="button" aria-label={label} className={cardClass} disabled={disabled} onClick={() => onSelect?.(example)}>{content}</button>
          : <Link key={example.id} aria-label={label} className={cardClass} href={`/dashboard/design?example=${example.id}`}>{content}</Link>;
      })}
    </div>
  </section>;
}
