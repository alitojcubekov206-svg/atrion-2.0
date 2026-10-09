import {ASSETS} from "../interior/catalog";
import {check, choice, list, number, record, text} from "./validation";
import type {ModelPart} from "../types";
import {partsBounds} from "../geometry";

export const COMPOSITION_SHAPES = ["box", "sphere", "cylinder", "cone", "pyramid", "prism", "wedge", "torus", "capsule", "tube", ...ASSETS.map(a => a.id)];
export type SceneNode = {name: string; shape: string; p: [number, number, number]; s: [number, number, number]; r: [number, number, number]; color: string};
export type Composition = {title: string; question: string; options: string[]; assumptions: string[]; limitations: string[]; nodes: SceneNode[]};
const vector = {type: "array", items: {type: "number"}, minItems: 3, maxItems: 3};
const strings = {type: "array", items: {type: "string"}, maxItems: 8};
export const compositionSchema = {
  type: "object", additionalProperties: false,
  properties: {action: {type: "string", enum: ["clarify", "create"]}, title: {type: "string"}, question: {type: "string"}, options: strings, assumptions: strings, limitations: strings,
    nodes: {type: "array", maxItems: 96, items: {type: "object", additionalProperties: false,
      properties: {name: {type: "string"}, shape: {type: "string", enum: COMPOSITION_SHAPES}, p: vector, s: vector, r: vector, color: {type: "string"}},
      required: ["name", "shape", "p", "s", "r", "color"]}}},
  required: ["action", "title", "question", "options", "assumptions", "limitations", "nodes"],
};
/** Untrusted model output is data only. No code, URLs, mesh payloads or arbitrary file access. */
export function parseComposition(raw: unknown): Composition {
  const c = record(raw, "План сцены");
  const array = (v: unknown, label: string) => list(v, label, 8).map(s => text(s, label, 500));
  check(typeof c.question === "string" && c.question.length <= 500, "Некорректный вопрос");
  const vec = (v: unknown, label: string, min: number, max: number) => list(v, label, 3, 3).map(n => number(n, label, min, max)) as SceneNode["p"];
  const nodes = list(c.nodes, "Объекты", 96).map(rawNode => {
    const n = record(rawNode, "Объект"), color = text(n.color, "Цвет", 7);
    check(/^#[0-9a-f]{6}$/i.test(color), "Цвет должен быть #RRGGBB");
    return {name: text(n.name, "Название", 100), shape: choice(n.shape, COMPOSITION_SHAPES, "Геометрия"),
      p: vec(n.p, "Положение", -200, 200), s: vec(n.s, "Размер", .01, 200), r: vec(n.r, "Поворот", -360, 360), color};
  });
  check(!c.question.trim() || nodes.length === 0, "Вопрос не должен сопровождаться незавершённой сценой");
  check(c.question.trim() || nodes.length > 0, "Модель не построила сцену и не задала вопрос");
  if (c.action !== undefined) check(c.action === (c.question.trim() ? "clarify" : "create"), "Решение модели не соответствует результату");
  return {title: c.question.trim() && c.title === "" ? "Уточнение" : text(c.title, "Название сцены", 120), question: c.question.trim(), options: array(c.options, "Варианты"),
    assumptions: array(c.assumptions, "Допущения"), limitations: array(c.limitations, "Ограничения"), nodes};
}

/** Catalog nodes use a bounding proxy here; the viewer and GLB replace it with the detailed mesh. */
export function compositionParts(c: Composition): ModelPart[] {
  return c.nodes.map((n, i) => ({id: `node_${i}`, name: n.name, shape: ASSETS.some(a => a.id === n.shape) ? "box" : n.shape as ModelPart["shape"],
    position: n.p, size: n.s, rotation: n.r.map(d => d * Math.PI / 180) as ModelPart["rotation"], color: n.color,
    material: "Материал концепта", quantity: 1, group: n.name, roughness: .7}));
}

/** Conservative checks for complete catalog objects; joined primitive components may overlap intentionally. */
export function compositionIssues(c: Composition): string[] {
  const parts = compositionParts(c), bounds = parts.map(p => partsBounds([p])), issues: string[] = [];
  for (const [i, node] of c.nodes.entries()) {
    if (!ASSETS.some(a => a.id === node.shape)) continue;
    const b = bounds[i];
    if (b.min[1] < -.03) issues.push(`${node.name}: ниже пола на ${(-b.min[1]).toFixed(2)} м.`);
    if (b.min[1] > .03 && !bounds.some((support, j) => j !== i && Math.abs(support.max[1] - b.min[1]) < .06 && support.min[0] < node.p[0] && support.max[0] > node.p[0] && support.min[2] < node.p[2] && support.max[2] > node.p[2]))
      issues.push(`${node.name}: висит над полом без опоры, низ y=${b.min[1].toFixed(2)}.`);
    for (let j = 0; j < i; j++) {
      if (!ASSETS.some(a => a.id === c.nodes[j].shape)) continue;
      if ([0, 1, 2].every(axis => Math.min(b.max[axis], bounds[j].max[axis]) - Math.max(b.min[axis], bounds[j].min[axis]) > .04))
        issues.push(`${node.name} и ${c.nodes[j].name}: габариты пересекаются. Разнеси предметы с зазором.`);
    }
  }
  return issues.slice(0, 12);
}

/** Deterministic placement pass, independent of prompt words or scene templates. */
export function settleComposition(input: Composition): Composition {
  if (input.question) return input;
  const c = structuredClone(input), catalog = c.nodes.map(n => ASSETS.some(a => a.id === n.shape));
  let grounded = 0, moved = false;
  const bounds = compositionParts(c).map(p => partsBounds([p]));
  for (const [i, n] of c.nodes.entries()) {
    if (!catalog[i]) continue;
    const b = bounds[i];
    // Keep an existing support (for example a podium); otherwise use ground level.
    const supports = bounds.filter((s, j) => j !== i && !catalog[j] && s.max[1] >= 0 && s.max[1] <= n.p[1] &&
      s.max[1] - s.min[1] < .6 && s.min[0] <= b.min[0] && s.max[0] >= b.max[0] && s.min[2] <= b.min[2] && s.max[2] >= b.max[2]);
    const base = Math.max(0, ...supports.map(s => s.max[1])), delta = base - b.min[1];
    if (Math.abs(delta) > .02) {n.p[1] += delta; b.min[1] += delta; b.max[1] += delta; grounded++;}
  }
  // Separate complete objects, preserving left/right or front/back order. Joined primitive parts stay intact.
  for (let pass = 0; pass < 40; pass++) {
    let changed = false;
    for (let i = 0; i < c.nodes.length; i++) for (let j = 0; j < i; j++) {
      if (!catalog[i] || !catalog[j]) continue;
      const a = bounds[i], b = bounds[j];
      if (![0, 1, 2].every(k => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]) > .005)) continue;
      const dx = c.nodes[i].p[0] - c.nodes[j].p[0], dz = c.nodes[i].p[2] - c.nodes[j].p[2];
      const axis = Math.abs(dx) >= Math.abs(dz) ? 0 : 2, direction = c.nodes[i].p[axis] >= c.nodes[j].p[axis] ? 1 : -1;
      const overlap = direction > 0 ? b.max[axis] - a.min[axis] : a.max[axis] - b.min[axis];
      const shift = (overlap + .12) / 2 * direction;
      c.nodes[i].p[axis] += shift; c.nodes[j].p[axis] -= shift;
      a.min[axis] += shift; a.max[axis] += shift; b.min[axis] -= shift; b.max[axis] -= shift;
      changed = moved = true;
    }
    if (!changed) break;
  }
  if (grounded) c.assumptions = [...c.assumptions.slice(0, 6), `Высота ${grounded} предметов автоматически скорректирована по полу или подиуму.`];
  if (moved) c.assumptions = [...c.assumptions.slice(0, 7), "Пересекавшаяся мебель разнесена автоматически. Проверьте расстояния и проходы."];
  return parseComposition(c);
}
