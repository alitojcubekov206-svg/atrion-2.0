/**
 * Reusable detail assemblies.
 *
 * A model reads as finished when its parts have parts: a window is a frame, a
 * pane, a sill and a mullion — not a blue rectangle. Every helper here returns
 * a small cluster of primitives that already touch each other, so a builder can
 * spend its effort on proportions instead of on re-deriving a wheel each time.
 *
 * Conventions shared with the rest of the generator:
 *   • `size` is always the full bounding box [x, y, z] before rotation.
 *   • +y is up, +z is the front / facade / face.
 *   • Nothing floats: every helper anchors onto the surface it is given.
 */
import type { ModelPart } from "@/shared/types";
import { part, shade } from "@/shared/geometry";

export type Vec3 = [number, number, number];

/** Which face of a volume a detail is mounted on. */
export type Facing = "front" | "back" | "left" | "right";

/** Sequential id source; one per assembly keeps ids short and unique. */
export function ids(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${n++}`;
}

/**
 * Size vector for a detail described in wall-local terms: `u` runs along the
 * wall, `v` is vertical, `n` is the outward thickness.
 */
export function orient(facing: Facing, u: number, v: number, n: number): Vec3 {
  return facing === "front" || facing === "back" ? [u, v, n] : [n, v, u];
}

/** Offset from a wall-mounted anchor, in the same wall-local terms as `orient`. */
export function offset(facing: Facing, u: number, v: number, n: number): Vec3 {
  switch (facing) {
    case "front":
      return [u, v, n];
    case "back":
      return [-u, v, -n];
    case "right":
      return [n, v, -u];
    case "left":
    default:
      return [-n, v, u];
  }
}

function shift(base: Vec3, delta: Vec3): Vec3 {
  return [base[0] + delta[0], base[1] + delta[1], base[2] + delta[2]];
}

/* ---------------- openings ---------------- */

export type WindowOptions = {
  id: () => string;
  group?: string;
  name?: string;
  /** Centre of the opening, on the wall surface. */
  center: Vec3;
  width: number;
  height: number;
  facing?: Facing;
  frameColor: string;
  glassColor?: string;
  /** Cross-section of the frame bars. Defaults to 6% of the opening. */
  bar?: number;
  /** How far the unit stands proud of the wall. */
  depth?: number;
  sill?: boolean;
  sillColor?: string;
  /** Vertical glazing bars inside the opening. */
  mullions?: number;
  /** Horizontal glazing bar. */
  transom?: boolean;
  /** Shutters either side of the opening. */
  shutters?: boolean;
  shutterColor?: string;
  repeat?: ModelPart["repeat"];
  mirror?: ModelPart["mirror"];
  emissive?: number;
};

/**
 * Frame + pane + sill. This is the single biggest difference between "a
 * building" and "a box with blue squares on it", so it is worth the parts.
 */
export function windowUnit(options: WindowOptions): ModelPart[] {
  const {
    id,
    center,
    width,
    height,
    facing = "front",
    frameColor,
    glassColor = "#8ecbf0",
    group = "Окна",
    name = "Окно",
    mullions = 0,
    transom = false,
    sill = true,
    shutters = false,
    repeat,
    mirror,
    emissive,
  } = options;

  const bar = options.bar ?? Math.max(0.03, Math.min(width, height) * 0.09);
  const depth = options.depth ?? Math.max(0.05, bar * 1.6);
  const parts: ModelPart[] = [];
  const common = { group, ...(repeat ? { repeat } : {}), ...(mirror ? { mirror } : {}) };

  // Glass sits slightly inside the frame so the frame reads as a frame.
  parts.push(
    part(id(), `${name} — стекло`, {
      shape: "box",
      role: "window",
      position: shift(center, offset(facing, 0, 0, depth * 0.25)),
      size: orient(facing, width - bar, height - bar, depth * 0.3),
      color: glassColor,
      material: "Стекло",
      opacity: 0.42,
      metalness: 0.1,
      roughness: 0.08,
      ...(emissive !== undefined ? { emissive } : {}),
      ...common,
    })
  );

  // Frame: two verticals as one mirrored part, head and cill bars separately.
  parts.push(
    part(id(), `${name} — стойка рамы`, {
      shape: "box",
      role: "detail",
      position: shift(center, offset(facing, (width - bar) / 2, 0, depth * 0.5)),
      size: orient(facing, bar, height, depth),
      color: frameColor,
      material: "Профиль",
      ...common,
      ...(mirror ? {} : { mirror: facing === "left" || facing === "right" ? "z" : "x" }),
    }),
    part(id(), `${name} — верхняя перемычка`, {
      shape: "box",
      role: "detail",
      position: shift(center, offset(facing, 0, (height - bar) / 2, depth * 0.5)),
      size: orient(facing, width, bar, depth),
      color: frameColor,
      material: "Профиль",
      ...common,
    }),
    part(id(), `${name} — нижняя перемычка`, {
      shape: "box",
      role: "detail",
      position: shift(center, offset(facing, 0, -(height - bar) / 2, depth * 0.5)),
      size: orient(facing, width, bar, depth),
      color: frameColor,
      material: "Профиль",
      ...common,
    })
  );

  if (mullions > 0) {
    const gap = width / (mullions + 1);
    parts.push(
      part(id(), `${name} — импост`, {
        shape: "box",
        role: "detail",
        position: shift(center, offset(facing, -width / 2 + gap, 0, depth * 0.45)),
        size: orient(facing, bar * 0.6, height - bar, depth * 0.8),
        color: frameColor,
        material: "Профиль",
        ...common,
        repeat: {
          count: mullions,
          step: offset(facing, gap, 0, 0),
        },
      })
    );
  }

  if (transom) {
    parts.push(
      part(id(), `${name} — ригель`, {
        shape: "box",
        role: "detail",
        position: shift(center, offset(facing, 0, height * 0.16, depth * 0.45)),
        size: orient(facing, width - bar, bar * 0.6, depth * 0.8),
        color: frameColor,
        material: "Профиль",
        ...common,
      })
    );
  }

  if (sill) {
    parts.push(
      part(id(), `${name} — отлив`, {
        shape: "box",
        role: "detail",
        position: shift(center, offset(facing, 0, -height / 2 - bar * 0.4, depth * 0.9)),
        size: orient(facing, width + bar * 2.2, bar * 0.7, depth * 2.4),
        color: options.sillColor ?? shade(frameColor, -0.25),
        material: "Отлив",
        ...common,
      })
    );
  }

  if (shutters) {
    parts.push(
      part(id(), `${name} — ставня`, {
        shape: "box",
        role: "detail",
        position: shift(center, offset(facing, width * 0.62, 0, depth * 0.8)),
        size: orient(facing, width * 0.44, height * 0.98, depth * 0.7),
        color: options.shutterColor ?? shade(frameColor, -0.3),
        material: "Ставня",
        ...common,
        ...(mirror ? {} : { mirror: facing === "left" || facing === "right" ? "z" : "x" }),
      })
    );
  }

  return parts;
}

export type DoorOptions = {
  id: () => string;
  group?: string;
  name?: string;
  /** Centre of the doorway; y is the middle of the leaf, not the threshold. */
  center: Vec3;
  width: number;
  height: number;
  facing?: Facing;
  leafColor: string;
  frameColor?: string;
  /** Two leaves with a central joint. */
  double?: boolean;
  glazed?: boolean;
  glassColor?: string;
  handle?: boolean;
  depth?: number;
};

/** Leaf, casing, threshold and handle — the entrance people actually look at. */
export function doorUnit(options: DoorOptions): ModelPart[] {
  const {
    id,
    center,
    width,
    height,
    facing = "front",
    leafColor,
    group = "Вход",
    name = "Дверь",
    double = false,
    glazed = false,
    glassColor = "#8ecbf0",
    handle = true,
  } = options;

  const frameColor = options.frameColor ?? shade(leafColor, -0.3);
  const depth = options.depth ?? Math.max(0.05, width * 0.09);
  const parts: ModelPart[] = [];
  const leafWidth = double ? width / 2 - width * 0.01 : width;

  parts.push(
    part(id(), double ? `${name} — створка` : `${name} — полотно`, {
      shape: "box",
      role: "door",
      group,
      position: shift(
        center,
        offset(facing, double ? leafWidth / 2 + width * 0.01 : 0, 0, depth * 0.5)
      ),
      size: orient(facing, leafWidth, height, depth),
      color: leafColor,
      material: "Дверное полотно",
      ...(double ? { mirror: facing === "left" || facing === "right" ? ("z" as const) : ("x" as const) } : {}),
    })
  );

  if (glazed) {
    parts.push(
      part(id(), `${name} — остекление`, {
        shape: "box",
        role: "window",
        group,
        position: shift(
          center,
          offset(facing, double ? leafWidth / 2 + width * 0.01 : 0, height * 0.16, depth * 1.02)
        ),
        size: orient(facing, leafWidth * 0.6, height * 0.44, depth * 0.3),
        color: glassColor,
        material: "Стекло",
        opacity: 0.4,
        roughness: 0.08,
        ...(double ? { mirror: facing === "left" || facing === "right" ? ("z" as const) : ("x" as const) } : {}),
      })
    );
  }

  parts.push(
    part(id(), `${name} — наличник`, {
      shape: "box",
      role: "detail",
      group,
      position: shift(center, offset(facing, width / 2 + depth * 0.6, 0, depth * 0.7)),
      size: orient(facing, depth * 1.2, height + depth * 2.4, depth * 1.4),
      color: frameColor,
      material: "Наличник",
      mirror: facing === "left" || facing === "right" ? "z" : "x",
    }),
    part(id(), `${name} — притолока`, {
      shape: "box",
      role: "detail",
      group,
      position: shift(center, offset(facing, 0, height / 2 + depth * 0.6, depth * 0.7)),
      size: orient(facing, width + depth * 3.6, depth * 1.2, depth * 1.4),
      color: frameColor,
      material: "Наличник",
    }),
    part(id(), `${name} — порог`, {
      shape: "box",
      role: "detail",
      group,
      position: shift(center, offset(facing, 0, -height / 2 - depth * 0.2, depth * 1.1)),
      size: orient(facing, width + depth * 2, depth * 0.5, depth * 3),
      color: shade(frameColor, -0.2),
      material: "Порог",
    })
  );

  if (handle) {
    parts.push(
      part(id(), `${name} — ручка`, {
        shape: "capsule",
        role: "detail",
        group,
        position: shift(
          center,
          offset(facing, double ? width * 0.06 : width * 0.36, -height * 0.02, depth * 1.25)
        ),
        size: orient(facing, width * 0.04, height * 0.11, width * 0.04),
        color: "#c9b98a",
        material: "Фурнитура",
        metalness: 0.75,
        roughness: 0.28,
        ...(double ? { mirror: facing === "left" || facing === "right" ? ("z" as const) : ("x" as const) } : {}),
      })
    );
  }

  return parts;
}

/* ---------------- wheels ---------------- */

export type WheelOptions = {
  id: () => string;
  group?: string;
  name?: string;
  /** Hub centre. */
  center: Vec3;
  diameter: number;
  width: number;
  /** Axle direction. "x" for a car, "z" for a wheel seen from the side. */
  axis?: "x" | "z";
  tyreColor?: string;
  rimColor?: string;
  spokes?: number;
  mirror?: ModelPart["mirror"];
  /** Add a brake disc behind the rim. */
  brake?: boolean;
};

/**
 * Tyre, rim, hub, spokes and brake disc.
 *
 * The base torus and cylinder both stand with their axis along +y, so the whole
 * assembly is turned once: 90° about z puts the axle on x, 90° about x puts it
 * on z. Spokes ride the same rotation via `repeat.rotationStep`, which is what
 * keeps a five-spoke wheel to a single part entry.
 */
export function wheelUnit(options: WheelOptions): ModelPart[] {
  const {
    id,
    center,
    diameter,
    width,
    axis = "x",
    tyreColor = "#1b1d21",
    rimColor = "#b6bcc4",
    spokes = 5,
    group = "Колёса",
    name = "Колесо",
    mirror,
    brake = true,
  } = options;

  const rotation: Vec3 = axis === "x" ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
  const size: Vec3 = [diameter, width, diameter];
  const rimDiameter = diameter * 0.62;
  const common = { group, ...(mirror ? { mirror } : {}) };
  const parts: ModelPart[] = [];

  parts.push(
    part(id(), `${name} — покрышка`, {
      shape: "torus",
      role: "wheel",
      position: center,
      size,
      rotation,
      hole: 0.6,
      sides: 28,
      color: tyreColor,
      material: "Резина",
      roughness: 0.9,
      ...common,
    }),
    part(id(), `${name} — диск`, {
      shape: "cylinder",
      role: "wheel",
      position: center,
      size: [rimDiameter, width * 0.72, rimDiameter],
      rotation,
      sides: 24,
      color: rimColor,
      material: "Литой диск",
      metalness: 0.72,
      roughness: 0.28,
      ...common,
    }),
    part(id(), `${name} — ступица`, {
      shape: "cylinder",
      role: "wheel",
      position: center,
      size: [diameter * 0.2, width * 0.95, diameter * 0.2],
      rotation,
      sides: 16,
      color: shade(rimColor, -0.35),
      material: "Ступица",
      metalness: 0.6,
      ...common,
    })
  );

  // Each bar is a spoke and its opposite, so n bars read as 2n spokes. They are
  // emitted one by one rather than through `repeat`: a rotation step composed on
  // top of the wheel's own rotation would tilt them out of the wheel plane.
  for (let i = 0; i < spokes; i++) {
    const angle = (Math.PI * i) / spokes;
    parts.push(
      part(id(), `${name} — спица ${i + 1}`, {
        shape: "box",
        role: "wheel",
        position: center,
        size:
          axis === "x"
            ? [width * 0.5, rimDiameter * 0.94, diameter * 0.07]
            : [diameter * 0.07, rimDiameter * 0.94, width * 0.5],
        // Spokes live in the plane normal to the axle: yz for an x axle, xy for z.
        rotation: axis === "x" ? [angle, 0, 0] : [0, 0, angle],
        color: shade(rimColor, 0.08),
        material: "Спица",
        metalness: 0.7,
        roughness: 0.3,
        ...common,
      })
    );
  }

  if (brake) {
    parts.push(
      part(id(), `${name} — тормозной диск`, {
        shape: "cylinder",
        role: "wheel",
        position: center,
        size: [diameter * 0.45, width * 1.02, diameter * 0.45],
        rotation,
        sides: 20,
        color: "#5b6068",
        material: "Сталь",
        metalness: 0.85,
        roughness: 0.4,
        ...common,
      })
    );
  }

  return parts;
}

/* ---------------- structures ---------------- */

export type RailingOptions = {
  id: () => string;
  group?: string;
  name?: string;
  /** Centre of the run. */
  center: Vec3;
  /** Length along `along`. */
  length: number;
  height?: number;
  along?: "x" | "z";
  color: string;
  posts?: number;
  mirror?: ModelPart["mirror"];
};

/** Balusters plus a handrail and a bottom rail — terraces, balconies, bridges. */
export function railingRun(options: RailingOptions): ModelPart[] {
  const {
    id,
    center,
    length,
    height = 1.05,
    along = "x",
    color,
    group = "Ограждение",
    name = "Ограждение",
    mirror,
  } = options;

  const posts = Math.max(2, Math.min(40, options.posts ?? Math.round(length / 0.6)));
  const gap = length / (posts - 1);
  const thickness = Math.max(0.025, height * 0.045);
  const axis = (u: number): Vec3 => (along === "x" ? [u, 0, 0] : [0, 0, u]);
  const span = (u: number, v: number, n: number): Vec3 =>
    along === "x" ? [u, v, n] : [n, v, u];
  const common = { group, ...(mirror ? { mirror } : {}) };
  const start = axis(-length / 2);

  return [
    part(id(), `${name} — стойка`, {
      shape: "cylinder",
      role: "structure",
      position: shift(center, [start[0], height / 2, start[2]]),
      size: [thickness, height, thickness],
      sides: 10,
      color,
      material: "Стойка",
      metalness: 0.45,
      ...common,
      repeat: { count: posts, step: axis(gap) },
    }),
    part(id(), `${name} — поручень`, {
      shape: "box",
      role: "structure",
      position: shift(center, [0, height, 0]),
      size: span(length, thickness * 1.6, thickness * 2.2),
      color: shade(color, 0.1),
      material: "Поручень",
      metalness: 0.45,
      ...common,
    }),
    part(id(), `${name} — нижний ригель`, {
      shape: "box",
      role: "structure",
      position: shift(center, [0, height * 0.18, 0]),
      size: span(length, thickness * 1.1, thickness * 1.4),
      color: shade(color, -0.1),
      material: "Ригель",
      metalness: 0.45,
      ...common,
    }),
  ];
}

export type StairOptions = {
  id: () => string;
  group?: string;
  name?: string;
  /** Centre of the bottom step, at floor level. */
  base: Vec3;
  width: number;
  steps: number;
  rise: number;
  run: number;
  /** Direction the flight climbs away from the viewer. */
  facing?: Facing;
  color: string;
  cheeks?: boolean;
};

/** Treads, risers and side cheeks from one repeat each. */
export function stairFlight(options: StairOptions): ModelPart[] {
  const {
    id,
    base,
    width,
    steps,
    rise,
    run,
    facing = "front",
    color,
    group = "Вход",
    name = "Ступени",
    cheeks = true,
  } = options;

  const count = Math.max(1, Math.min(30, Math.round(steps)));
  const parts: ModelPart[] = [];

  parts.push(
    part(id(), `${name} — проступь`, {
      shape: "box",
      role: "structure",
      group,
      position: shift(base, offset(facing, 0, rise / 2, 0)),
      size: orient(facing, width, rise, run),
      color,
      material: "Ступень",
      repeat: { count, step: offset(facing, 0, rise, -run) },
    })
  );

  if (cheeks) {
    const totalRise = rise * count;
    const totalRun = run * count;
    parts.push(
      part(id(), `${name} — щека`, {
        shape: "wedge",
        role: "structure",
        group,
        position: shift(
          base,
          offset(facing, width / 2 + run * 0.09, totalRise / 2, -totalRun / 2 + run / 2)
        ),
        size: orient(facing, run * 0.18, totalRise, totalRun),
        rotation:
          facing === "front"
            ? [0, Math.PI / 2, 0]
            : facing === "back"
              ? [0, -Math.PI / 2, 0]
              : [0, 0, 0],
        color: shade(color, -0.18),
        material: "Косоур",
        mirror: facing === "left" || facing === "right" ? "z" : "x",
      })
    );
  }

  return parts;
}

/* ---------------- surface detail ---------------- */

export type SlotOptions = {
  id: () => string;
  group?: string;
  name?: string;
  center: Vec3;
  /** Overall span the slots cover. */
  width: number;
  height: number;
  facing?: Facing;
  count?: number;
  color: string;
  depth?: number;
};

/** A row of louvres — grilles, vents, radiator fins, speaker slots. */
export function ventSlots(options: SlotOptions): ModelPart[] {
  const {
    id,
    center,
    width,
    height,
    facing = "front",
    color,
    group = "Детали",
    name = "Решётка",
  } = options;

  const count = Math.max(2, Math.min(48, options.count ?? Math.round(width / 0.02)));
  const gap = width / count;
  const depth = options.depth ?? Math.max(0.004, gap * 0.5);

  return [
    part(id(), `${name} — ламель`, {
      shape: "box",
      role: "detail",
      group,
      position: shift(center, offset(facing, -width / 2 + gap / 2, 0, depth * 0.5)),
      size: orient(facing, gap * 0.45, height, depth),
      color,
      material: "Решётка",
      metalness: 0.4,
      roughness: 0.5,
      repeat: { count, step: offset(facing, gap, 0, 0) },
    }),
  ];
}

export type SeamOptions = {
  id: () => string;
  group?: string;
  name?: string;
  center: Vec3;
  length: number;
  facing?: Facing;
  along?: "u" | "v";
  color: string;
  thickness?: number;
};

/** A recessed line across a surface — panel gaps, door shut lines, trim. */
export function panelSeam(options: SeamOptions): ModelPart[] {
  const {
    id,
    center,
    length,
    facing = "front",
    along = "v",
    color,
    group = "Детали",
    name = "Шов",
  } = options;
  const thickness = options.thickness ?? Math.max(0.004, length * 0.012);

  return [
    part(id(), name, {
      shape: "box",
      role: "detail",
      group,
      position: shift(center, offset(facing, 0, 0, thickness * 0.4)),
      size:
        along === "v"
          ? orient(facing, thickness, length, thickness * 1.2)
          : orient(facing, length, thickness, thickness * 1.2),
      color,
      material: "Шов",
      roughness: 0.8,
    }),
  ];
}

/**
 * A tapering chain of primitives following a curve — tails, necks, spines,
 * cable runs. `repeat` cannot shrink its copies, so these are separate parts;
 * that is exactly where the fine detail of an animal comes from.
 */
export function taperedChain(options: {
  id: () => string;
  group?: string;
  name?: string;
  /** Where the chain leaves the body. */
  start: Vec3;
  /** Unit-ish direction the chain travels. */
  direction: Vec3;
  segments: number;
  /** Length of the first segment; each one shortens by `taper`. */
  segmentLength: number;
  startRadius: number;
  endRadius: number;
  /** Bend per segment, radians, applied around x. */
  curve?: number;
  color: string;
  material?: string;
  shape?: "capsule" | "sphere" | "cylinder" | "box";
  role?: string;
}): ModelPart[] {
  const {
    id,
    start,
    direction,
    segments,
    segmentLength,
    startRadius,
    endRadius,
    curve = 0,
    color,
    material = "Тело",
    shape = "capsule",
    group = "Хвост",
    name = "Сегмент",
    role = "limb",
  } = options;

  const count = Math.max(1, Math.min(24, Math.round(segments)));
  const length = Math.hypot(direction[0], direction[1], direction[2]) || 1;
  let dir: Vec3 = [direction[0] / length, direction[1] / length, direction[2] / length];
  let cursor: Vec3 = [...start];
  const parts: ModelPart[] = [];

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const radius = startRadius + (endRadius - startRadius) * t;
    const segment = segmentLength * (1 - t * 0.35);
    const centre: Vec3 = [
      cursor[0] + (dir[0] * segment) / 2,
      cursor[1] + (dir[1] * segment) / 2,
      cursor[2] + (dir[2] * segment) / 2,
    ];

    // The primitive's long axis is y; tilt it onto the current direction.
    const pitch = Math.atan2(Math.hypot(dir[0], dir[2]), dir[1]);
    const yaw = Math.atan2(dir[0], dir[2]);

    parts.push(
      part(id(), `${name} ${i + 1}`, {
        shape,
        role,
        group,
        position: centre,
        size: [radius * 2, segment + radius, radius * 2],
        rotation: [pitch * Math.cos(yaw), 0, -pitch * Math.sin(yaw)],
        color: i % 2 === 0 ? color : shade(color, -0.04),
        material,
      })
    );

    cursor = [
      cursor[0] + dir[0] * segment,
      cursor[1] + dir[1] * segment,
      cursor[2] + dir[2] * segment,
    ];

    if (curve) {
      const cos = Math.cos(curve);
      const sin = Math.sin(curve);
      dir = [dir[0], dir[1] * cos - dir[2] * sin, dir[1] * sin + dir[2] * cos];
    }
  }

  return parts;
}

/* ---------------- furniture parts ---------------- */

export type LegOptions = {
  id: () => string;
  group?: string;
  name?: string;
  /** Foot centre on the floor. */
  foot: Vec3;
  height: number;
  thickness: number;
  color: string;
  style?: "square" | "turned" | "tapered" | "metal";
  mirror?: ModelPart["mirror"];
};

/** A leg with a foot and a shoulder — three primitives instead of one stick. */
export function furnitureLeg(options: LegOptions): ModelPart[] {
  const {
    id,
    foot,
    height,
    thickness,
    color,
    style = "square",
    group = "Каркас",
    name = "Ножка",
    mirror,
  } = options;
  const common = { group, ...(mirror ? { mirror } : {}) };
  const parts: ModelPart[] = [];

  if (style === "turned") {
    parts.push(
      part(id(), `${name} — стойка`, {
        shape: "cylinder",
        role: "structure",
        position: [foot[0], foot[1] + height * 0.5, foot[2]],
        size: [thickness, height, thickness],
        sides: 14,
        color,
        material: "Дерево",
        ...common,
      }),
      part(id(), `${name} — точёный узел`, {
        shape: "sphere",
        role: "detail",
        position: [foot[0], foot[1] + height * 0.72, foot[2]],
        size: [thickness * 1.45, thickness * 1.1, thickness * 1.45],
        color: shade(color, -0.1),
        material: "Дерево",
        ...common,
      })
    );
  } else if (style === "tapered") {
    parts.push(
      part(id(), `${name} — стойка`, {
        shape: "cylinder",
        role: "structure",
        position: [foot[0], foot[1] + height * 0.5, foot[2]],
        size: [thickness * 0.6, height, thickness],
        sides: 12,
        color,
        material: "Дерево",
        ...common,
      })
    );
  } else if (style === "metal") {
    parts.push(
      part(id(), `${name} — стойка`, {
        shape: "cylinder",
        role: "structure",
        position: [foot[0], foot[1] + height * 0.5, foot[2]],
        size: [thickness * 0.8, height, thickness * 0.8],
        sides: 12,
        color,
        material: "Сталь",
        metalness: 0.75,
        roughness: 0.3,
        ...common,
      })
    );
  } else {
    parts.push(
      part(id(), `${name} — стойка`, {
        shape: "box",
        role: "structure",
        position: [foot[0], foot[1] + height * 0.5, foot[2]],
        size: [thickness, height, thickness],
        color,
        material: "Дерево",
        ...common,
      })
    );
  }

  parts.push(
    part(id(), `${name} — подпятник`, {
      shape: "cylinder",
      role: "detail",
      position: [foot[0], foot[1] + height * 0.012, foot[2]],
      size: [thickness * 1.05, height * 0.025, thickness * 1.05],
      sides: 10,
      color: "#2a2c31",
      material: "Подпятник",
      ...common,
    })
  );

  return parts;
}

/** A soft cushion with a piped edge — sofas, chairs, beds. */
export function cushion(options: {
  id: () => string;
  group?: string;
  name?: string;
  center: Vec3;
  size: Vec3;
  color: string;
  mirror?: ModelPart["mirror"];
  repeat?: ModelPart["repeat"];
  rotation?: Vec3;
}): ModelPart[] {
  const {
    id,
    center,
    size,
    color,
    group = "Сиденье",
    name = "Подушка",
    mirror,
    repeat,
    rotation,
  } = options;
  const common = {
    group,
    ...(mirror ? { mirror } : {}),
    ...(repeat ? { repeat } : {}),
    ...(rotation ? { rotation } : {}),
  };

  return [
    part(id(), name, {
      shape: "box",
      role: "furniture",
      position: center,
      size,
      color,
      material: "Ткань",
      roughness: 0.9,
      ...common,
    }),
    part(id(), `${name} — кант`, {
      shape: "box",
      role: "detail",
      position: [center[0], center[1] - size[1] * 0.42, center[2]],
      size: [size[0] * 1.02, size[1] * 0.14, size[2] * 1.02],
      color: shade(color, -0.18),
      material: "Кант",
      roughness: 0.9,
      ...common,
    }),
  ];
}

/* ---------------- electronics ---------------- */

/** A grid of keys built as one repeat per row. */
export function keyGrid(options: {
  id: () => string;
  group?: string;
  name?: string;
  /** Centre of the whole grid, on the surface it sits on. */
  center: Vec3;
  width: number;
  depth: number;
  rows: number;
  columns: number;
  color: string;
  keyHeight?: number;
}): ModelPart[] {
  const {
    id,
    center,
    width,
    depth,
    rows,
    columns,
    color,
    group = "Клавиатура",
    name = "Клавиша",
  } = options;

  const rowCount = Math.max(1, Math.min(8, rows));
  const columnCount = Math.max(1, Math.min(24, columns));
  const stepX = width / columnCount;
  const stepZ = depth / rowCount;
  const keyHeight = options.keyHeight ?? Math.max(0.002, stepZ * 0.25);
  const parts: ModelPart[] = [];

  for (let row = 0; row < rowCount; row++) {
    parts.push(
      part(id(), `${name} — ряд ${row + 1}`, {
        shape: "box",
        role: "detail",
        group,
        position: [
          center[0] - width / 2 + stepX / 2 + (row % 2) * stepX * 0.12,
          center[1] + keyHeight / 2,
          center[2] - depth / 2 + stepZ / 2 + row * stepZ,
        ],
        size: [stepX * 0.82, keyHeight, stepZ * 0.78],
        color: row === 0 ? shade(color, 0.12) : color,
        material: "Клавиша",
        roughness: 0.75,
        repeat: { count: columnCount, step: [stepX, 0, 0] },
      })
    );
  }

  return parts;
}

/** A lit screen with its bezel — monitors, phones, dashboards, signage. */
export function screenPanel(options: {
  id: () => string;
  group?: string;
  name?: string;
  center: Vec3;
  width: number;
  height: number;
  facing?: Facing;
  bezelColor: string;
  screenColor?: string;
  rotation?: Vec3;
  emissive?: number;
}): ModelPart[] {
  const {
    id,
    center,
    width,
    height,
    facing = "front",
    bezelColor,
    screenColor = "#16324f",
    group = "Экран",
    name = "Экран",
    rotation,
    emissive = 0.6,
  } = options;

  const bezel = Math.max(0.004, Math.min(width, height) * 0.045);
  const common = rotation ? { rotation } : {};

  return [
    part(id(), `${name} — рамка`, {
      shape: "box",
      role: "detail",
      group,
      position: center,
      size: orient(facing, width, height, bezel * 1.6),
      color: bezelColor,
      material: "Корпус",
      roughness: 0.45,
      ...common,
    }),
    part(id(), name, {
      shape: "box",
      role: "detail",
      group,
      position: shift(center, offset(facing, 0, 0, bezel)),
      size: orient(facing, width - bezel * 2, height - bezel * 2, bezel * 0.5),
      color: screenColor,
      material: "Матрица",
      emissive,
      roughness: 0.1,
      ...common,
    }),
  ];
}
