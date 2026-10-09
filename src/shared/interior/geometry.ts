import type {ModelPart, ThreeDConcept} from "../types";
import {findAsset} from "./catalog";
import type {InteriorScene, SceneObject} from "./scene";
import {fixtureParts} from "./fixtures";

function box(id: string, name: string, position: number[], size: number[], color: string, group = name): ModelPart {
  return {id, name, shape: "box", position: position as [number, number, number], size: size as [number, number, number], rotation: [0, 0, 0], color, material: "Материал концепта", quantity: 1, group};
}
export function assetParts(assetId: string, color = "#81959b"): ModelPart[] {
  const fixture = fixtureParts(assetId, color);
  if (fixture) return fixture;
  const a = findAsset(assetId), w = a.width, h = a.height, d = a.depth, parts: ModelPart[] = [];
  // Legacy box-concept consumers use catalog bounds; the viewer/GLB use detailedAsset.
  if (a.template) return [box(assetId, a.name, [0, h / 2, 0], [w, h, d], color)];
  const add = (name: string, p: number[], s: number[], c = color) => parts.push(box(`${assetId}_${parts.length}`, name, p, s, c, a.name));
  const legs = (top: number) => {for (const x of [-1, 1]) for (const z of [-1, 1]) add("Ножка", [x * (w / 2 - .05), top / 2, z * (d / 2 - .05)], [.06, top, .06], "#7b6653");};
  if (a.category === "bed") {
    add("Каркас", [0, .21, 0], [w, .24, d], "#9b8166");
    add("Матрас", [0, .43, .04], [w - .06, .2, d - .14], "#eee9df");
    add("Покрывало", [0, .55, .28], [w - .04, .05, d * .65]);
    add("Изголовье", [0, h / 2, -d / 2 + .04], [w, h, .08]);
    for (const x of a.width > 1.2 ? [-w / 4, w / 4] : [0]) add("Подушка", [x, .58, -d * .31], [w * .4, .12, .36], "#faf6ee");
  } else if (a.category === "table") {legs(h - .06); add("Столешница", [0, h - .03, 0], [w, .06, d], "#bfaa8b");}
  else if (a.category === "chair") {legs(.43); add("Сиденье", [0, .46, 0], [w, .06, d]); add("Спинка", [0, .68, -d / 2 + .03], [w, .34, .06]);}
  else if (a.category === "sofa") {
    add("Основание", [0, .23, 0], [w, .3, d]); add("Спинка", [0, (h + .3) / 2, -d / 2 + .09], [w, h - .3, .18]);
    for (const x of [-1, 1]) {add("Подлокотник", [x * (w / 2 - .08), .46, 0], [.16, .44, d]); add("Подушка сиденья", [x * w / 4, .42, .06], [w / 2 - .2, .12, d - .24], "#b4c2c5");}
  } else if (a.category === "wardrobe") {
    add("Корпус шкафа", [0, h / 2, -.015], [w, h, d - .03], "#c0aa8e");
    for (const x of [-1, 1]) {add("Фасад", [x * w / 4, h / 2, d / 2 - .025], [w / 2 - .01, h - .02, .01]); add("Ручка", [x * .07, h * .5, d / 2 - .007], [.014, .18, .014], "#393f42");}
  } else if (a.category === "lamp") {
    add("Основание торшера", [0, .025, 0], [w, .05, d], "#454c50"); add("Стойка", [0, h / 2, 0], [.025, h - .1, .025], "#454c50");
    add("Абажур", [0, h - .16, 0], [w, .32, d], "#fff1d3"); parts[parts.length - 1].emissive = .4;
  } else if (a.category === "plant") {
    add("Кашпо", [0, .15, 0], [w * .65, .3, d * .65], "#c6b5a3"); add("Стебель", [0, .5, 0], [.025, .55, .025], "#526b46");
    for (let i = 0; i < 4; i++) {const p = [i % 2 ? .06 : -.06, .42 + i * .12, 0]; add("Листва", p, [w * .65, .12, d * .65], i % 2 ? "#658b56" : "#799c62");}
  } else add(a.name, [0, h / 2, 0], [w, h, d]);
  return parts;
}
function transformed(parts: ModelPart[], o: SceneObject, scene: InteriorScene): ModelPart[] {
  const c = Math.cos(o.rotation.y), s = Math.sin(o.rotation.y);
  return parts.map(p => {const [x, y, z] = p.position, xx = x * o.scale.x, zz = z * o.scale.z; return {...p, id: `${o.id}_${p.id}`, group: `${findAsset(o.assetId).name} · ${o.id}`,
    position: [o.position.x - scene.width / 2 + xx * c + zz * s, y * o.scale.y, o.position.z - scene.length / 2 - xx * s + zz * c] as [number, number, number],
    size: [p.size[0] * o.scale.x, p.size[1] * o.scale.y, p.size[2] * o.scale.z] as [number, number, number], rotation: [0, o.rotation.y, 0] as [number, number, number]};});
}
/** The same scene geometry feeds the viewer and GLB export, including actual wall gaps. */
export function sceneParts(scene: InteriorScene): ModelPart[] {
  const parts = [box("floor", "Пол", [0, -.06, 0], [scene.width, .12, scene.length], scene.floorColor)];
  for (const wall of ["north", "south", "west", "east"] as const) {
    const horizontal = wall === "north" || wall === "south", span = horizontal ? scene.width : scene.length;
    const openings = scene.openings.filter(o => o.wall === wall), cuts = [...new Set([0, span, ...openings.flatMap(o => [o.offset, o.offset + o.width])])].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const left = cuts[i], right = cuts[i + 1], mid = (left + right) / 2;
      const holes = openings.filter(o => o.offset <= mid && o.offset + o.width >= mid).sort((a, b) => a.bottom - b.bottom);
      let bottom = 0;
      const solid = (low: number, high: number) => {
        if (high - low < .001) return;
        const p = horizontal ? [mid - scene.width / 2, (high + low) / 2, (wall === "north" ? -1 : 1) * (scene.length / 2 + .06)] : [(wall === "west" ? -1 : 1) * (scene.width / 2 + .06), (high + low) / 2, mid - scene.length / 2];
        const size = horizontal ? [right - left, high - low, .12] : [.12, high - low, right - left];
        parts.push({...box(`wall_${wall}_${parts.length}`, "Стена", p, size, scene.wallColor), role: "wall"});
      };
      for (const hole of holes) {solid(bottom, hole.bottom); bottom = hole.bottom + hole.height;}
      solid(bottom, scene.height);
    }
    for (const o of openings.filter(o => o.kind === "window")) {
      const p = horizontal ? [o.offset + o.width / 2 - scene.width / 2, o.bottom + o.height / 2, (wall === "north" ? -1 : 1) * (scene.length / 2 + .06)] : [(wall === "west" ? -1 : 1) * (scene.width / 2 + .06), o.bottom + o.height / 2, o.offset + o.width / 2 - scene.length / 2];
      parts.push({...box(o.id, "Окно", p, horizontal ? [o.width, o.height, .02] : [.02, o.height, o.width], "#b4d8e6"), opacity: .3, role: "window"});
    }
  }
  for (const object of scene.objects) parts.push(...transformed(assetParts(object.assetId, object.color), object, scene));
  return parts;
}
export function sceneConcept(scene: InteriorScene, name = "Дизайн комнаты"): ThreeDConcept {
  return {name, description: "Редактируемый интерьерный концепт", units: "m", dimensions: {width: scene.width, height: scene.height, depth: scene.length}, parts: sceneParts(scene),
    materials: [], equipment: [], requirements: [], assemblySteps: [], costEstimate: {currency: "KGS", minimum: 0, maximum: 0, breakdown: [], note: "Смета не рассчитывалась"}, advantages: [], disadvantages: [], risks: [], engineeringNotes: [], disclaimer: "Концепт: проверьте реальные размеры мебели и проходы перед реализацией."};
}
