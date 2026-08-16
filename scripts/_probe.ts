import { buildFromPrompt } from "@/lib/procedural-3d";
import { expandPart } from "@/lib/gen/kit";
const c = buildFromPrompt("Школа 4 этажа ширина 60 длина 120 с большими окнами");
const rows = c.parts.flatMap((p) =>
  expandPart(p).map((i) => ({ id: p.id, name: p.name, top: i.position[1] + i.size[1] / 2, y: i.position[1], sy: i.size[1] }))
);
rows.sort((a, b) => b.top - a.top);
for (const r of rows.slice(0, 8)) console.log(r.top.toFixed(2), "|", r.name, "| y=", r.y.toFixed(2), "sy=", r.sy.toFixed(2));
