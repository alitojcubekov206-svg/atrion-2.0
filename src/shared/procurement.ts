import {expandPart} from "./geometry";
import type {ModelPart} from "./types";
import {findAsset} from "./interior/catalog";
import type {InteriorScene} from "./interior/scene";
import type {LocalModelResult} from "./design/result";

export type ProcurementItem = {name: string; material: string; color: string; size: [number, number, number] | null; quantity: number; unit: "шт" | "м²"};
export type ProcurementReport = {items: ProcurementItem[]; note: string};
const round = (n: number) => Math.round(n * 1000) / 1000;
function report(rows: ProcurementItem[]): ProcurementReport {
  const grouped = new Map<string, ProcurementItem>();
  for (const row of rows) {
    const key = JSON.stringify([row.name, row.material, row.color, row.size, row.unit]);
    const previous = grouped.get(key);
    if (previous) previous.quantity = round(previous.quantity + row.quantity);
    else grouped.set(key, {...row});
  }
  return {items: [...grouped.values()].sort((a,b) => a.name.localeCompare(b.name, "ru")), note: "Количество рассчитано по текущей модели. Марки материалов, крепёж, запас и цены нужно уточнить перед закупкой."};
}
/** Count exactly the instances used by the renderer, without multiplying by descriptive quantity. */
export function partsProcurement(parts: ModelPart[]): ProcurementReport {
  return report(parts.map(p => ({name: p.name, material: p.material, color: p.color, size: p.size.map(round) as [number,number,number], quantity: expandPart(p).length, unit: "шт"})));
}
export function furnitureProcurement(scene: InteriorScene): ProcurementReport {
  return report(scene.objects.map(o => {const a = findAsset(o.assetId); return {name: a.name, material: "Уточнить у поставщика", color: o.color,
    size: [round(a.width * o.scale.x), round(a.height * o.scale.y), round(a.depth * o.scale.z)], quantity: 1, unit: "шт"};}));
}
export function roomProcurement(scene: InteriorScene): ProcurementReport {
  const wallArea = 2 * (scene.width + scene.length) * scene.height - scene.openings.reduce((n,o) => n + o.width * o.height, 0);
  return report([...furnitureProcurement(scene).items,
    {name: "Напольное покрытие", material: "Уточнить покрытие", color: scene.floorColor, size: null, quantity: round(scene.width * scene.length), unit: "м²"},
    {name: "Отделка стен", material: "Уточнить покрытие", color: scene.wallColor, size: null, quantity: round(Math.max(0,wallArea)), unit: "м²"},
    ...scene.openings.map(o => ({name: o.kind === "window" ? "Оконный блок" : "Дверной блок", material: "Уточнить у поставщика", color: "", size: [o.width,o.height,0] as [number,number,number], quantity: 1, unit: "шт" as const}))]);
}
export function modelProcurement(result: LocalModelResult): ProcurementReport {
  if (!result.interiors) return partsProcurement(result.concept.parts);
  // A whole door/window block includes its glazing, frames, panels and handles.
  const fittings=new Set(["opening-frame","window","door","door-detail","door-hardware"]);
  const blocks:ProcurementItem[]=(result.document?.floors??[]).flatMap(f=>f.openings.map(o=>({name:o.kind==="window"?"Оконный блок":"Дверной блок",material:"Уточнить у поставщика",color:o.kind==="window"?result.document?.architecture?.frameColor??"":result.document?.architecture?.doorColor??"",size:[o.width,o.height,result.document!.wallThickness],quantity:1,unit:"шт"})));
  return report([...partsProcurement(result.concept.parts.filter(p => p.role !== "furniture" && (!result.document || !fittings.has(p.role??"")) && !/^Шов /.test(p.name))).items,
    ...blocks,
    ...result.interiors.flatMap(r => furnitureProcurement(r.scene).items)]);
}
export function procurementCsv(value: ProcurementReport): string {
  const cell = (value: string | number) => '"' + String(value).replace(/^[=+@-]/, "'$&").replaceAll('"','""') + '"';
  return "\uFEFF" + [["Деталь", "Материал", "Цвет", "Ширина, м", "Высота, м", "Глубина, м", "Количество", "Единица"],
    ...value.items.map(i => [i.name, i.material, i.color, ...(i.size ?? ["","",""]), i.quantity, i.unit])].map(row => row.map(cell).join(";")).join("\r\n");
}
