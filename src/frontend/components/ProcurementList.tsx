"use client";
import {procurementCsv, type ProcurementReport} from "@/shared/procurement";
export default function ProcurementList({value}: {value: ProcurementReport}) {
  function download() {
    const url = URL.createObjectURL(new Blob([procurementCsv(value)], {type: "text/csv;charset=utf-8"}));
    const link = document.createElement("a"); link.href = url; link.download = "atrion-procurement.csv"; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return <details className="rounded-xl border border-white/15 bg-black/20 p-3 text-slate-200"><summary className="cursor-pointer text-sm font-medium">Что закупать · {value.items.length} позиций</summary><button type="button" className="my-3 rounded-lg border border-white/20 px-3 py-2 text-xs hover:bg-white/10" onClick={download}>Скачать список CSV</button><div className="max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Деталь / материал</th><th className="p-2">Размер Ш × В × Г, м</th><th className="p-2">Кол-во</th></tr></thead><tbody>{value.items.map((i,index) => <tr key={index} className="border-t border-white/10"><td className="p-2">{i.name}<span className="block text-slate-400">{i.material}{i.color && ` · ${i.color}`}</span></td><td className="p-2">{i.size?.join(" × ") ?? "—"}</td><td className="whitespace-nowrap p-2">{i.quantity} {i.unit}</td></tr>)}</tbody></table></div><p className="mt-3 text-xs leading-5 text-slate-400">{value.note}</p></details>;
}
