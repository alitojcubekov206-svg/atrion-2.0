import type { ModelPart, PartShape, ThreeDConcept } from "@/lib/types";

/* ---------------- deterministic randomness ---------------- */

/** Stable 32-bit hash — the same prompt always seeds the same model. */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 1;
  }

  /** 0 ≤ x < 1 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))];
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Multiply by 1 ± amount — nudges a dimension without breaking proportions. */
  vary(value: number, amount = 0.12): number {
    return value * (1 + this.float(-amount, amount));
  }
}

export function rngFor(prompt: string, salt = ""): Rng {
  return new Rng(hashString(`${prompt}::${salt}`));
}

/* ---------------- part construction ---------------- */

export type PartOptions = {
  shape?: PartShape;
  role: string;
  group: string;
  parentId?: string | null;
  position: [number, number, number];
  size: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  material: string;
  quantity?: number;
  sides?: number;
  hole?: number;
  repeat?: ModelPart["repeat"];
  mirror?: ModelPart["mirror"];
  opacity?: number;
  metalness?: number;
  roughness?: number;
  emissive?: number;
};

/** Build a part with sane defaults. `size` is always the bounding box. */
export function part(id: string, name: string, opts: PartOptions): ModelPart {
  const repeatCount = opts.repeat?.count ?? 1;
  const mirrorCount = opts.mirror === "xz" ? 4 : opts.mirror ? 2 : 1;
  return {
    id,
    name,
    shape: opts.shape ?? "box",
    role: opts.role,
    group: opts.group,
    parentId: opts.parentId ?? null,
    position: opts.position,
    size: [
      Math.max(0.01, Math.abs(opts.size[0])),
      Math.max(0.01, Math.abs(opts.size[1])),
      Math.max(0.01, Math.abs(opts.size[2])),
    ],
    rotation: opts.rotation ?? [0, 0, 0],
    color: opts.color,
    material: opts.material,
    quantity: opts.quantity ?? Math.max(1, repeatCount * mirrorCount),
    ...(opts.sides !== undefined ? { sides: opts.sides } : {}),
    ...(opts.hole !== undefined ? { hole: opts.hole } : {}),
    ...(opts.repeat ? { repeat: opts.repeat } : {}),
    ...(opts.mirror ? { mirror: opts.mirror } : {}),
    ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}),
    ...(opts.metalness !== undefined ? { metalness: opts.metalness } : {}),
    ...(opts.roughness !== undefined ? { roughness: opts.roughness } : {}),
    ...(opts.emissive !== undefined ? { emissive: opts.emissive } : {}),
  };
}

/* ---------------- instancing ---------------- */

export type PartInstance = {
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number, number];
};

/**
 * Resolve `repeat` and `mirror` into concrete instances.
 * Renderer, exporter and bounding-box maths all go through this so a part
 * never looks different from the geometry it actually occupies.
 */
export function expandPart(item: ModelPart): PartInstance[] {
  const base: PartInstance[] = [];
  const count = Math.max(1, Math.min(64, Math.round(item.repeat?.count ?? 1)));
  const step = item.repeat?.step ?? [0, 0, 0];
  const rotationStep = item.repeat?.rotationStep ?? [0, 0, 0];

  for (let i = 0; i < count; i++) {
    base.push({
      position: [
        item.position[0] + step[0] * i,
        item.position[1] + step[1] * i,
        item.position[2] + step[2] * i,
      ],
      rotation: [
        item.rotation[0] + rotationStep[0] * i,
        item.rotation[1] + rotationStep[1] * i,
        item.rotation[2] + rotationStep[2] * i,
      ],
      size: item.size,
    });
  }

  if (!item.mirror) return base;

  const axes: ("x" | "z")[] = item.mirror === "xz" ? ["x", "z"] : [item.mirror];
  let instances = base;
  for (const axis of axes) {
    const mirrored = instances.map((instance) => ({
      size: instance.size,
      position:
        axis === "x"
          ? ([-instance.position[0], instance.position[1], instance.position[2]] as [
              number,
              number,
              number,
            ])
          : ([instance.position[0], instance.position[1], -instance.position[2]] as [
              number,
              number,
              number,
            ]),
      rotation:
        axis === "x"
          ? ([instance.rotation[0], -instance.rotation[1], -instance.rotation[2]] as [
              number,
              number,
              number,
            ])
          : ([-instance.rotation[0], -instance.rotation[1], instance.rotation[2]] as [
              number,
              number,
              number,
            ]),
    }));
    instances = [...instances, ...mirrored];
  }
  return instances;
}

/** Total rendered primitive count — the honest "detail" number. */
export function primitiveCount(parts: ModelPart[]): number {
  return parts.reduce((total, item) => total + expandPart(item).length, 0);
}

/* ---------------- bounds ---------------- */

export type Bounds = { min: [number, number, number]; max: [number, number, number] };

/**
 * Axis-aligned bounds. Rotation is handled by taking the rotated extent of the
 * box along each axis, so tilted roofs still report the space they occupy.
 */
export function partsBounds(parts: ModelPart[]): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const item of parts) {
    for (const instance of expandPart(item)) {
      const [rx, ry, rz] = instance.rotation;
      const half = rotatedHalfExtent(instance.size, [rx, ry, rz]);
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], instance.position[axis] - half[axis]);
        max[axis] = Math.max(max[axis], instance.position[axis] + half[axis]);
      }
    }
  }

  if (!Number.isFinite(min[0])) {
    return { min: [0, 0, 0], max: [1, 1, 1] };
  }
  return { min, max };
}

function rotatedHalfExtent(
  size: [number, number, number],
  rotation: [number, number, number]
): [number, number, number] {
  const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
  const [rx, ry, rz] = rotation;
  if (!rx && !ry && !rz) return [hx, hy, hz];

  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);

  // Column-major |R| applied to the half extents (three.js XYZ euler order).
  const m = [
    [cy * cz, -cy * sz, sy],
    [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
    [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
  ];

  return [
    Math.abs(m[0][0]) * hx + Math.abs(m[0][1]) * hy + Math.abs(m[0][2]) * hz,
    Math.abs(m[1][0]) * hx + Math.abs(m[1][1]) * hy + Math.abs(m[1][2]) * hz,
    Math.abs(m[2][0]) * hx + Math.abs(m[2][1]) * hy + Math.abs(m[2][2]) * hz,
  ];
}

export function dimensionsOf(parts: ModelPart[]): ThreeDConcept["dimensions"] {
  const { min, max } = partsBounds(parts);
  return {
    width: round2(Math.max(0.05, max[0] - min[0])),
    height: round2(Math.max(0.05, max[1] - min[1])),
    depth: round2(Math.max(0.05, max[2] - min[2])),
  };
}

/**
 * Drop the model onto y = 0 and centre it over the origin in x/z.
 * Everything downstream (camera framing, grid, explode) assumes this.
 */
export function groundParts(parts: ModelPart[]): ModelPart[] {
  const { min, max } = partsBounds(parts);
  const dx = (min[0] + max[0]) / 2;
  const dz = (min[2] + max[2]) / 2;
  const dy = min[1];
  if (!dx && !dy && !dz) return parts;
  return parts.map((item) => ({
    ...item,
    position: [
      round3(item.position[0] - dx),
      round3(item.position[1] - dy),
      round3(item.position[2] - dz),
    ] as [number, number, number],
  }));
}

/** Uniformly rescale so the largest dimension matches `targetMax` metres. */
export function scaleParts(parts: ModelPart[], factor: number): ModelPart[] {
  if (!Number.isFinite(factor) || factor === 1 || factor <= 0) return parts;
  return parts.map((item) => ({
    ...item,
    position: item.position.map((n) => round3(n * factor)) as [number, number, number],
    size: item.size.map((n) => Math.max(0.01, round3(n * factor))) as [number, number, number],
    ...(item.repeat
      ? {
          repeat: {
            ...item.repeat,
            step: item.repeat.step.map((n) => round3(n * factor)) as [number, number, number],
          },
        }
      : {}),
  }));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/* ---------------- palettes ---------------- */

export const PALETTE = {
  concrete: ["#b9b4ac", "#a8a49c", "#c6c1b8", "#9d9a93"],
  plaster: ["#e8ddc9", "#d9cbb2", "#efe6d6", "#cdbfa6"],
  brick: ["#a5563f", "#8f4a37", "#b76a4e", "#7d4231"],
  wood: ["#8a5f3c", "#6f4a2c", "#a2764c", "#5c3d24"],
  roofTile: ["#8c4a3a", "#6b4a3c", "#48505c", "#7a5c34", "#3f4650"],
  metal: ["#9aa3ad", "#7d858f", "#b3bac2", "#68707a"],
  glass: ["#8ecbf0", "#a7d8f5", "#6fb4de", "#c2e5fa"],
  accent: ["#c1462f", "#2f6fb0", "#3f8a5b", "#c9973f", "#6d4a9c"],
  skin: ["#f0c9a6", "#e0b189", "#c98f68", "#8d5a3c", "#f7dcc0"],
  hair: ["#2b1f1a", "#5a3a24", "#c9a05a", "#1c1c22", "#8c4a3a", "#b56b8d"],
  fabric: ["#3d4a63", "#7d3c4a", "#4a6350", "#2f3138", "#a8896b"],
  plastic: ["#2e3238", "#e8e6e1", "#3f6fa8", "#c94f4f", "#4a4f57"],
} as const;

export type PaletteKey = keyof typeof PALETTE;

export function pickColor(rng: Rng, key: PaletteKey): string {
  return rng.pick(PALETTE[key]);
}

/** Darken or lighten a hex colour — trims, shadows, panel breaks. */
export function shade(hex: string, amount: number): string {
  const normalized = hex.replace("#", "");
  const value = parseInt(
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized,
    16
  );
  if (!Number.isFinite(value)) return hex;
  const channel = (shift: number) => {
    const base = (value >> shift) & 0xff;
    const next = Math.round(base + (amount >= 0 ? (255 - base) * amount : base * amount));
    return Math.max(0, Math.min(255, next)).toString(16).padStart(2, "0");
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/* ---------------- concept assembly ---------------- */

export type WrapOptions = {
  name: string;
  description: string;
  category: string;
  seed: number;
  parts: ModelPart[];
  /** Explicit structure tree; derived from `group` when omitted. */
  structure?: NonNullable<ThreeDConcept["structure"]>;
  materials?: ThreeDConcept["materials"];
  assemblySteps?: string[];
  costEstimate?: ThreeDConcept["costEstimate"];
  advantages?: string[];
  disadvantages?: string[];
  engineeringNotes?: string[];
};

/** Group parts into a structure tree by their `group` label, in first-seen order. */
export function structureFromGroups(
  parts: ModelPart[]
): NonNullable<ThreeDConcept["structure"]> {
  const groups = new Map<string, string[]>();
  for (const item of parts) {
    const label = item.group || item.role || "Parts";
    groups.set(label, [...(groups.get(label) ?? []), item.id]);
  }
  return [...groups.entries()].map(([label, partIds], index) => ({
    id: `group-${index + 1}`,
    label,
    partIds,
  }));
}

/** Ground the parts, measure them, and fill in the non-geometric metadata. */
export function wrapConcept(options: WrapOptions): ThreeDConcept {
  const parts = groundParts(options.parts);
  const dimensions = dimensionsOf(parts);
  const structure = options.structure ?? structureFromGroups(parts);
  const details = primitiveCount(parts);

  return {
    name: options.name,
    description: options.description,
    category: options.category,
    seed: options.seed,
    source: "procedural",
    units: "m",
    dimensions,
    parts,
    structure,
    materials:
      options.materials?.length
        ? options.materials
        : [
            {
              name: "Основные материалы",
              specification: "Уточняется по спецификации проекта",
              estimatedQuantity: "По расчёту",
              reason: "Несущие и отделочные элементы модели",
            },
          ],
    equipment: [
      { name: "Измерительный инструмент", purpose: "Разметка и контроль размеров", access: "buy" },
      { name: "Монтажный инструмент", purpose: "Сборка узлов", access: "rent" },
    ],
    requirements: [
      `Габариты: ${dimensions.width} × ${dimensions.depth} × ${dimensions.height} м`,
      `Детализация: ${details} примитивов`,
      "Проверка размеров и нагрузок профильным специалистом",
    ],
    assemblySteps: options.assemblySteps?.length
      ? options.assemblySteps
      : structure.map((group, index) => `${index + 1}. ${group.label}`),
    costEstimate:
      options.costEstimate ??
      {
        currency: "KGS",
        minimum: 0,
        maximum: 0,
        breakdown: [],
        note: "Оценка стоимости зависит от материалов и региона — уточните у поставщиков.",
      },
    advantages: options.advantages ?? [
      "Параметрическая модель: правится размерами и деталями",
      "Работает без платных 3D-API",
    ],
    disadvantages: options.disadvantages ?? [
      "Концептуальная геометрия, не производственная документация",
    ],
    risks: [
      {
        risk: "Размеры и нагрузки не проверены расчётом",
        severity: "High",
        mitigation: "Согласовать с инженером до изготовления",
      },
    ],
    engineeringNotes: options.engineeringNotes ?? [
      "Модель собрана из параметрических примитивов Atrion",
    ],
    disclaimer:
      "Концептуальная 3D-модель Atrion. Не является рабочей документацией — размеры, материалы и нагрузки должен проверить квалифицированный специалист.",
  };
}
