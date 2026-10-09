"use client";
import {useRouter} from "next/navigation";
import {storeDesignDraft} from "@/frontend/design-draft";
import type {LocalModelResult} from "@/shared/design/result";

export default function OpenDesignButton({result,prompt,preview=false,disabled=false,className=""}: {
  result: LocalModelResult; prompt: string; preview?: boolean; disabled?: boolean; className?: string;
}) {
  const router=useRouter();
  return <button type="button" disabled={disabled} className={`rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg disabled:opacity-40 ${className}`} onClick={()=>{
    const id=storeDesignDraft(result,prompt);
    router.push(`${preview?"/playground/interior":"/dashboard/design"}?model=${encodeURIComponent(id)}`);
  }}>Дизайн и интерьер →</button>;
}
