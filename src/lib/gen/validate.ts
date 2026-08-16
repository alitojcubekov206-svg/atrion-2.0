import type { ModelPart, PartShape } from "@/lib/types";
import { expandPart, groundParts, partsBounds, primitiveCount, round3, scaleParts } from "@/lib/gen/kit";

const SHAPES: PartShape[] = [
  "box",
  "cylinder",
  "sphere",
  "cone",
  "pyramid",
  "prism",
  "wedge",
  "torus",
  "capsule",
  "tube",
  "plane",
];

/** Aliases the model reaches for that map cleanly onto a real primitive. */
const SHAPE_ALIASES: Record<string, PartShape> = {
  cube: "box",
  block: "box",
  rect: "box",
  slab: "plane",
  panel: "plane",
  quad: "plane",
  ball: "sphere",
  ellipsoid: "sphere",
  dome: "sphere",
  disc: "cylinder",
  disk: "cylinder",
  tube_: "tube",
  pipe: "tube",
  ring: "torus",
  donut: "torus",
  roof: "prism",
  gable: "prism",
  triangle: "prism",
  ramp: "wedge",
  slope: "wedge",
  spire: "cone",
  pill: "capsule",
};

export const MAX_PARTS = 160;

export type RepairReport = {
  parts: ModelPart[];
  issues: string[];
  /** 0–1 — how much this reads as one coherent object. */
  score: number;
  primitives: number;
};

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function vector(
  value: unknown,
  fallback: [number, number, number],
  limit: number
): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [
    clamp(num(value[0], fallback[0]), -limit, limit),
    clamp(num(value[1], fallback[1]), -limit, limit),
    clamp(num(value[2], fallback[2]), -limit, limit),
  ];
}

function normalizeShape(value: unknown): PartShape {
  if (typeof value !== "string") return "box";
  const key = value.trim().toLowerCase();
  if (key === "mesh") return "mesh";
  if ((SHAPES as string[]).includes(key)) return key as PartShape;
  return SHAPE_ALIASES[key] ?? "box";
}

/**
 * Baked geometry from a boolean operation. It never comes from the model, but
 * an edited concept round-trips through here, and dropping it would silently
 * turn a boolean result back into a box.
 */
function normalizeMesh(value: unknown): ModelPart["mesh"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as { position?: unknown; normal?: unknown };
  if (!Array.isArray(raw.position) || raw.position.length < 9) return undefined;
  const numbers = (input: unknown[]) =>
    input.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry));
  const position = numbers(raw.position);
  if (position.length < 9) return undefined;
  const normal = Array.isArray(raw.normal) ? numbers(raw.normal) : undefined;
  return {
    position,
    ...(normal && normal.length === position.length ? { normal } : {}),
  };
}

function normalizeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex
      .slice(1)
      .split("")
      .map((c) => c + c)
      .join("")}`.toLowerCase();
  }
  return fallback;
}

/** Coerce whatever the model returned into well-formed, renderable parts. */
export function sanitizeParts(value: unknown): ModelPart[] {
  if (!Array.isArray(value)) return [];
  const used = new Set<string>();
  const parts: ModelPart[] = [];

  for (const entry of value.slice(0, MAX_PARTS)) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;

    let id = text(raw.id, `part-${parts.length + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .slice(0, 40);
    if (!id || used.has(id)) id = `${id || "part"}-${parts.length + 1}`;
    used.add(id);

    const size = vector(raw.size, [1, 1, 1], 400).map((n) =>
      clamp(Math.abs(n), 0.01, 400)
    ) as [number, number, number];

    const repeatRaw = raw.repeat as Record<string, unknown> | undefined;
    const repeatCount =
      repeatRaw && typeof repeatRaw === "object"
        ? clamp(Math.round(num(repeatRaw.count, 1)), 1, 64)
        : 1;
    const repeat =
      repeatCount > 1
        ? {
            count: repeatCount,
            step: vector(repeatRaw?.step, [0, 0, 0], 400),
            ...(Array.isArray(repeatRaw?.rotationStep)
              ? { rotationStep: vector(repeatRaw?.rotationStep, [0, 0, 0], Math.PI * 2) }
              : {}),
          }
        : undefined;

    const mirrorRaw = typeof raw.mirror === "string" ? raw.mirror.trim().toLowerCase() : "";
    const mirror =
      mirrorRaw === "x" || mirrorRaw === "z" || mirrorRaw === "xz"
        ? (mirrorRaw as ModelPart["mirror"])
        : undefined;

    const role = text(raw.role, "detail");
    const mesh = normalizeMesh(raw.mesh);
    const shape = normalizeShape(raw.shape);
    // "mesh" without vertices is not renderable — fall back to a solid block.
    const safeShape: PartShape = shape === "mesh" && !mesh ? "box" : shape;

    parts.push({
      id,
      name: text(raw.name, `Деталь ${parts.length + 1}`).slice(0, 60),
      shape: safeShape,
      ...(mesh && safeShape === "mesh" ? { mesh } : {}),
      position: vector(raw.position, [0, 0, 0], 400),
      size,
      rotation: vector(raw.rotation, [0, 0, 0], Math.PI * 4),
      color: normalizeColor(raw.color, "#b9b4ac"),
      material: text(raw.material, "Не указан").slice(0, 40),
      quantity: clamp(Math.round(num(raw.quantity, 1)), 1, 200),
      role,
      group: text(raw.group, role).slice(0, 40),
      parentId: typeof raw.parentId === "string" && raw.parentId.trim() ? raw.parentId.trim() : null,
      ...(raw.sides !== undefined ? { sides: clamp(Math.round(num(raw.sides, 32)), 3, 64) } : {}),
      ...(raw.hole !== undefined ? { hole: clamp(num(raw.hole, 0.6), 0, 0.95) } : {}),
      ...(repeat ? { repeat } : {}),
      ...(mirror ? { mirror } : {}),
      ...(raw.opacity !== undefined ? { opacity: clamp(num(raw.opacity, 1), 0.05, 1) } : {}),
      ...(raw.metalness !== undefined ? { metalness: clamp(num(raw.metalness, 0), 0, 1) } : {}),
      ...(raw.roughness !== undefined ? { roughness: clamp(num(raw.roughness, 0.6), 0, 1) } : {}),
      ...(raw.emissive !== undefined ? { emissive: clamp(num(raw.emissive, 0), 0, 1) } : {}),
    });
  }

  // Parent references must point at parts that survived sanitising.
  const ids = new Set(parts.map((item) => item.id));
  return parts.map((item) => ({
    ...item,
    parentId: item.parentId && ids.has(item.parentId) ? item.parentId : null,
  }));
}

type Box = { min: [number, number, number]; max: [number, number, number] };

function instanceBoxes(item: ModelPart): Box[] {
  return expandPart(item).map((instance) => ({
    min: [
      instance.position[0] - instance.size[0] / 2,
      instance.position[1] - instance.size[1] / 2,
      instance.position[2] - instance.size[2] / 2,
    ] as [number, number, number],
    max: [
      instance.position[0] + instance.size[0] / 2,
      instance.position[1] + instance.size[1] / 2,
      instance.position[2] + instance.size[2] / 2,
    ] as [number, number, number],
  }));
}

function boxesTouch(a: Box, b: Box, tolerance: number): boolean {
  return (
    a.min[0] - tolerance <= b.max[0] &&
    a.max[0] + tolerance >= b.min[0] &&
    a.min[1] - tolerance <= b.max[1] &&
    a.max[1] + tolerance >= b.min[1] &&
    a.min[2] - tolerance <= b.max[2] &&
    a.max[2] + tolerance >= b.min[2]
  );
}

/**
 * Split parts into connected clusters. Two parts belong together when their
 * bounding boxes touch or overlap — the cheap test that separates "one object"
 * from "a pile of floating boxes".
 */
function connectedGroups(parts: ModelPart[], tolerance: number): number[][] {
  const boxes = parts.map(instanceBoxes);
  const parent = parts.map((_, index) => index);

  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (find(i) === find(j)) continue;
      const touching = boxes[i].some((a) => boxes[j].some((b) => boxesTouch(a, b, tolerance)));
      if (touching) union(i, j);
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < parts.length; i++) {
    const root = find(i);
    clusters.set(root, [...(clusters.get(root) ?? []), i]);
  }
  return [...clusters.values()].sort((a, b) => b.length - a.length);
}

function boundsOf(indices: number[], parts: ModelPart[]): Box {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const index of indices) {
    for (const box of instanceBoxes(parts[index])) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], box.min[axis]);
        max[axis] = Math.max(max[axis], box.max[axis]);
      }
    }
  }
  return { min, max };
}

/**
 * Pull detached fragments back onto the main body instead of dropping them —
 * a stray chimney should land on the roof, not disappear.
 */
function reattachFloaters(parts: ModelPart[], tolerance: number): { parts: ModelPart[]; moved: number } {
  if (parts.length < 2) return { parts, moved: 0 };
  const groups = connectedGroups(parts, tolerance);
  if (groups.length <= 1) return { parts, moved: 0 };

  const [main, ...loose] = groups;
  const mainBox = boundsOf(main, parts);
  const mainCentre: [number, number, number] = [
    (mainBox.min[0] + mainBox.max[0]) / 2,
    (mainBox.min[1] + mainBox.max[1]) / 2,
    (mainBox.min[2] + mainBox.max[2]) / 2,
  ];

  const next = [...parts];
  let moved = 0;

  for (const cluster of loose) {
    const box = boundsOf(cluster, parts);
    const centre: [number, number, number] = [
      (box.min[0] + box.max[0]) / 2,
      (box.min[1] + box.max[1]) / 2,
      (box.min[2] + box.max[2]) / 2,
    ];

    // Shortest translation that makes the cluster touch the main body.
    const shift: [number, number, number] = [0, 0, 0];
    for (let axis = 0; axis < 3; axis++) {
      const gapPositive = mainBox.min[axis] - box.max[axis];
      const gapNegative = box.min[axis] - mainBox.max[axis];
      if (gapPositive > 0) shift[axis] = gapPositive + tolerance * 0.5;
      else if (gapNegative > 0) shift[axis] = -(gapNegative + tolerance * 0.5);
    }

    const smallest = shift
      .map((value, axis) => ({ value, axis }))
      .filter((entry) => entry.value !== 0)
      .sort((a, b) => Math.abs(a.value) - Math.abs(b.value))[0];

    if (!smallest) continue;

    const delta: [number, number, number] = [0, 0, 0];
    delta[smallest.axis] = smallest.value;
    // Nudge toward the main body on the other axes so it lands on the object.
    for (let axis = 0; axis < 3; axis++) {
      if (axis === smallest.axis) continue;
      const overshoot = centre[axis] - mainCentre[axis];
      const span = (mainBox.max[axis] - mainBox.min[axis]) / 2;
      if (Math.abs(overshoot) > span) delta[axis] = -(overshoot - Math.sign(overshoot) * span);
    }

    for (const index of cluster) {
      next[index] = {
        ...next[index],
        position: [
          round3(next[index].position[0] + delta[0]),
          round3(next[index].position[1] + delta[1]),
          round3(next[index].position[2] + delta[2]),
        ],
      };
      moved++;
    }
  }

  return { parts: next, moved };
}

/** Drop parts so tiny they would never be visible next to the main body. */
function dropInvisible(parts: ModelPart[]): { parts: ModelPart[]; removed: number } {
  if (parts.length < 6) return { parts, removed: 0 };
  const { min, max } = partsBounds(parts);
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const floor = span * 0.0015;
  const kept = parts.filter((item) => Math.max(...item.size) >= floor);
  return { parts: kept.length >= 3 ? kept : parts, removed: parts.length - kept.length };
}

/** Remove exact duplicates — same shape at the same place is wasted geometry. */
function dedupe(parts: ModelPart[]): { parts: ModelPart[]; removed: number } {
  const seen = new Set<string>();
  const kept: ModelPart[] = [];
  for (const item of parts) {
    const key = [
      item.shape,
      item.position.map((n) => Math.round(n * 50)).join(","),
      item.size.map((n) => Math.round(n * 50)).join(","),
      item.rotation.map((n) => Math.round(n * 50)).join(","),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }
  return { parts: kept, removed: parts.length - kept.length };
}

/**
 * Quality score for a parts list. Used to decide whether AI-authored geometry
 * beats the parametric baseline — never ship the worse of the two.
 */
export function scoreParts(parts: ModelPart[]): number {
  if (parts.length < 3) return 0;

  const primitives = primitiveCount(parts);
  const { min, max } = partsBounds(parts);
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  if (!Number.isFinite(span) || span <= 0) return 0;

  // Coherence: share of parts in the largest connected cluster.
  const groups = connectedGroups(parts, span * 0.02);
  const coherence = groups.length ? groups[0].length / parts.length : 0;

  // Detail: more primitives read as a finished model, with diminishing returns.
  const detail = Math.min(1, Math.log10(1 + primitives) / Math.log10(1 + 90));

  // Variety: an object made only of boxes looks like a pile of boxes.
  const shapes = new Set(parts.map((item) => item.shape));
  const variety = Math.min(1, (shapes.size - 1) / 4);

  // Proportion: nothing should dwarf the whole model or vanish inside it.
  const sane =
    parts.filter((item) => {
      const largest = Math.max(...item.size);
      return largest <= span * 1.05 && largest >= span * 0.002;
    }).length / parts.length;

  return round3(coherence * 0.45 + detail * 0.25 + variety * 0.12 + sane * 0.18);
}

/**
 * Full clean-up pass for AI-authored geometry: coerce, de-duplicate, reconnect
 * stray fragments, drop invisible slivers, sit the model on the ground and
 * bring it to a sensible metre scale.
 */
export function validateAndRepair(
  value: unknown,
  options: { targetMaxSize?: number } = {}
): RepairReport {
  const issues: string[] = [];
  let parts = sanitizeParts(value);

  if (parts.length === 0) {
    return { parts: [], issues: ["Модель не вернула ни одной детали"], score: 0, primitives: 0 };
  }

  const deduped = dedupe(parts);
  if (deduped.removed > 0) issues.push(`Удалено дубликатов: ${deduped.removed}`);
  parts = deduped.parts;

  const trimmed = dropInvisible(parts);
  if (trimmed.removed > 0) issues.push(`Удалено невидимых деталей: ${trimmed.removed}`);
  parts = trimmed.parts;

  const { min, max } = partsBounds(parts);
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);

  const reattached = reattachFloaters(parts, Math.max(0.02, span * 0.02));
  if (reattached.moved > 0) issues.push(`Присоединено отвалившихся деталей: ${reattached.moved}`);
  parts = reattached.parts;

  const target = options.targetMaxSize;
  if (target && span > 0) {
    const ratio = target / span;
    if (ratio > 2.5 || ratio < 0.4) {
      parts = scaleParts(parts, ratio);
      issues.push(`Масштаб приведён к ${round3(target)} м`);
    }
  }

  parts = groundParts(parts);

  return {
    parts,
    issues,
    score: scoreParts(parts),
    primitives: primitiveCount(parts),
  };
}
