import {check, choice, id, list, number, record, text, unique, DesignError} from "../design/validation";
import {ASSETS, STYLES, findAsset, type InteriorStyle} from "./catalog";

export type Vec3 = {x: number; y: number; z: number};
export type Opening = {id: string; kind: "door" | "window"; wall: "north" | "south" | "west" | "east"; offset: number; width: number; bottom: number; height: number};
export type SceneObject = {id: string; assetId: string; position: Vec3; rotation: Vec3; scale: Vec3; locked: boolean; color: string};
export type InteriorScene = {
  schemaVersion: 1; units: "m"; width: number; length: number; height: number;
  roomType: string; style: InteriorStyle; wallColor: string; floorColor: string;
  openings: Opening[]; objects: SceneObject[];
  lights: {id: string; position: Vec3; color: string; intensity: number}[];
};
export const DEFAULT_PROMPT = "Современная спальня 4×5 метров. Кровать, шкаф, рабочий стол, два светильника и растение.";
export function color(value: unknown): string {
  check(typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value), "Цвет должен быть в формате #RRGGBB");
  return value;
}
export function vec(value: unknown, label: string, min = -100, max = 100): Vec3 {
  const v = record(value, label);
  return {x: number(v.x, label, min, max), y: number(v.y, label, min, max), z: number(v.z, label, min, max)};
}
export function parseScene(value: unknown): InteriorScene {
  const s = record(value, "scene");
  check(s.schemaVersion === 1 && s.units === "m", "Нужна сцена версии 1 в метрах");
  const width = number(s.width, "Ширина", 2, 30), length = number(s.length, "Длина", 2, 30), height = number(s.height, "Высота", 2, 6);
  const openings = list(s.openings, "Проёмы", 24).map(raw => {
    const o = record(raw, "opening");
    const item: Opening = {id: id(o.id, "opening.id"), kind: choice(o.kind, ["door", "window"] as const, "kind"), wall: choice(o.wall, ["north", "south", "west", "east"] as const, "wall"),
      offset: number(o.offset, "offset", 0, 30), width: number(o.width, "opening.width", .5, 6), bottom: number(o.bottom, "bottom", 0, 5), height: number(o.height, "opening.height", .3, 6)};
    check(item.offset + item.width <= (item.wall === "north" || item.wall === "south" ? width : length), "Проём выходит за стену");
    check(item.bottom + item.height <= height, "Проём выше стены");
    check(item.kind !== "door" || (item.bottom === 0 && item.width >= .7 && item.height >= 1.9), "Дверь должна начинаться от пола и иметь проход не менее 0.7×1.9 м");
    return item;
  });
  unique(openings, "Проёмы");
  for (let i = 0; i < openings.length; i++) for (const b of openings.slice(i + 1)) {
    const a = openings[i];
    check(a.wall !== b.wall || a.offset + a.width <= b.offset || b.offset + b.width <= a.offset || a.bottom + a.height <= b.bottom || b.bottom + b.height <= a.bottom, "Проёмы пересекаются");
  }
  check(openings.some(o => o.kind === "door"), "Добавьте входную дверь");
  const objects = list(s.objects, "Предметы", 60).map(raw => {
    const o = record(raw, "object");
    const assetId = text(o.assetId, "assetId");
    check(ASSETS.some(a => a.id === assetId), "Предмет отсутствует в библиотеке");
    const rotation = vec(o.rotation, "rotation", -Math.PI * 2, Math.PI * 2);
    check(rotation.x === 0 && rotation.z === 0, "Мебель можно вращать только вокруг вертикальной оси");
    const position = vec(o.position, "position");
    check(position.y === 0, "Мебель должна стоять на полу");
    check(typeof o.locked === "boolean", "Укажите locked");
    return {id: id(o.id, "object.id"), assetId, position, rotation, scale: vec(o.scale, "scale", .5, 2), locked: o.locked, color: color(o.color)};
  });
  unique(objects, "Предметы");
  const lights = list(s.lights, "Свет", 16).map(raw => {
    const l = record(raw, "light"), position = vec(l.position, "light.position", 0, 30);
    check(position.x <= width && position.z <= length && position.y <= height, "Источник света вне комнаты");
    return {id: id(l.id, "light.id"), position, color: color(l.color), intensity: number(l.intensity, "intensity", 0, 5)};
  });
  unique(lights, "Свет");
  return {schemaVersion: 1, units: "m", width, length, height, roomType: text(s.roomType, "Тип комнаты"), style: choice(s.style, Object.keys(STYLES) as InteriorStyle[], "Стиль"),
    wallColor: color(s.wallColor), floorColor: color(s.floorColor), openings, objects, lights};
}
export function newScene(width = 4, length = 5, height = 2.8, style: InteriorStyle = "modern", roomType = "bedroom"): InteriorScene {
  return parseScene({schemaVersion: 1, units: "m", width, length, height, roomType, style,
    wallColor: STYLES[style].wall, floorColor: STYLES[style].floor,
    openings: [{id: "door_1", kind: "door", wall: "south", offset: .15, width: .9, bottom: 0, height: 2.1},
      {id: "window_1", kind: "window", wall: "north", offset: Math.max(.1, (width - 1.2) / 2), width: 1.2, bottom: .9, height: 1.2}],
    objects: [], lights: [{id: "ceiling_1", position: {x: width / 2, y: height - .1, z: length / 2}, color: "#fff0d2", intensity: 1}]});
}
export type Rect = {x: number; z: number; width: number; depth: number};
/** Conservative world-aligned bounds include rotation and scale. */
export function footprint(o: SceneObject): Rect {
  const a = findAsset(o.assetId), c = Math.abs(Math.cos(o.rotation.y)), s = Math.abs(Math.sin(o.rotation.y));
  const width = a.width * o.scale.x * c + a.depth * o.scale.z * s, depth = a.width * o.scale.x * s + a.depth * o.scale.z * c;
  return {x: o.position.x - width / 2, z: o.position.z - depth / 2, width, depth};
}
export function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.width + gap - 1e-6 && a.x + a.width + gap > b.x + 1e-6 && a.z < b.z + b.depth + gap - 1e-6 && a.z + a.depth + gap > b.z + 1e-6;
}
export function doorway(s: InteriorScene, o: Opening): Rect {
  if (o.wall === "north" || o.wall === "south") return {x: o.offset, z: o.wall === "north" ? 0 : s.length - 1, width: o.width, depth: 1};
  return {x: o.wall === "west" ? 0 : s.width - 1, z: o.offset, width: 1, depth: o.width};
}
export function layoutIssues(s: InteriorScene, circulation = true): string[] {
  const issues: string[] = [], boxes = s.objects.map(footprint);
  boxes.forEach((b, i) => {
    const o = s.objects[i];
    if (b.x < -.001 || b.z < -.001 || b.x + b.width > s.width + .001 || b.z + b.depth > s.length + .001) issues.push(`${o.id}: предмет выходит за стены`);
    if (findAsset(o.assetId).height * o.scale.y > s.height) issues.push(`${o.id}: предмет выше потолка`);
    if (s.openings.some(d => d.kind === "door" && overlaps(b, doorway(s, d), .05))) issues.push(`${o.id}: перекрыт проход у двери`);
    for (let j = 0; j < i; j++) if (overlaps(b, boxes[j], .05)) issues.push(`${o.id}: пересечение с ${s.objects[j].id}`);
  });
  if (circulation && !issues.length && !hasCirculation(s, boxes)) issues.push("Нет прохода шириной 0.6 м от двери к каждому предмету");
  return issues;
}
/** Flood-fill the free floor for a 0.6 m wide person; check access to each object. */
function hasCirculation(s: InteriorScene, boxes: Rect[]): boolean {
  const step = .2, radius = .3, nx = Math.ceil(s.width / step), nz = Math.ceil(s.length / step);
  const reached = new Set<number>(), queue: number[] = [];
  const point = (i: number) => ({x: (i % nx + .5) * step, z: (Math.floor(i / nx) + .5) * step});
  const free = (i: number) => {
    const p = point(i);
    return p.x >= radius && p.z >= radius && p.x <= s.width - radius && p.z <= s.length - radius &&
      !boxes.some(b => overlaps({x: p.x - radius, z: p.z - radius, width: radius * 2, depth: radius * 2}, b));
  };
  const doors = s.openings.filter(o => o.kind === "door").map(d => doorway(s, d));
  for (let i = 0; i < nx * nz; i++) if (free(i) && doors.some(d => overlaps({ ...point(i), width: .01, depth: .01}, d))) {queue.push(i); reached.add(i); break;}
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % nx, z = Math.floor(i / nx);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, zz = z + dz, next = zz * nx + xx;
      if (xx >= 0 && xx < nx && zz >= 0 && zz < nz && !reached.has(next) && free(next)) {reached.add(next); queue.push(next);}
    }
  }
  return doors.every(d => queue.some(i => overlaps({...point(i), width: .01, depth: .01}, d))) &&
    boxes.every(b => queue.some(i => {const p = point(i); return p.x >= b.x - .65 && p.x <= b.x + b.width + .65 && p.z >= b.z - .65 && p.z <= b.z + b.depth + .65;}));
}
export function validateLayout(scene: InteriorScene): InteriorScene {
  const parsed = parseScene(scene), issues = layoutIssues(parsed);
  if (issues.length) throw new DesignError(issues.slice(0, 4).join("; "), 422, "DESIGN_COLLISION");
  return parsed;
}
