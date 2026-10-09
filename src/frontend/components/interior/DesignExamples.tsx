"use client";

import Image from "next/image";
import Link from "next/link";
import {DESIGN_EXAMPLES, type DesignExample} from "@/shared/design/examples";

export default function DesignExamples({disabled = false, onSelect}: {
  disabled?: boolean;
  onSelect?: (example: DesignExample) => void;
}) {
  const cardClass = "group min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#111116] text-left transition hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-wait disabled:opacity-40";
  return <section className="mt-5 w-full" aria-label="Примеры моделей">
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
      <h2 className="text-sm font-medium text-white">Выберите пример</h2>
      <p className="text-xs text-muted">Откроется в 3D · можно редактировать и скачать</p>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {DESIGN_EXAMPLES.map(example => {
        const content = <>
          <div className="relative aspect-[4/3] overflow-hidden bg-[#191922]">
            <Image src={example.image} alt="" fill sizes="(max-width: 640px) 45vw, 220px" className="object-contain transition-transform group-hover:scale-105"/>
          </div>
          <div className="p-3">
            <h3 className="text-xs font-medium leading-5 text-slate-100">{example.name}</h3>
            <p className="mt-1 text-[11px] leading-4 text-muted">{example.description}</p>
            <span className="mt-2 block text-[11px] text-accent">Открыть в редакторе →</span>
          </div>
        </>;
        const label = `Открыть пример: ${example.name}`;
        return onSelect || disabled
          ? <button key={example.id} type="button" aria-label={label} className={cardClass} disabled={disabled} onClick={() => onSelect?.(example)}>{content}</button>
          : <Link key={example.id} aria-label={label} className={cardClass} href={`/dashboard/design?example=${example.id}`}>{content}</Link>;
      })}
    </div>
  </section>;
}
