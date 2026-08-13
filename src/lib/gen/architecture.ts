import type { ModelPart, PartShape, ThreeDConcept } from "@/lib/types";
import { PALETTE, part, pickColor, rngFor, shade, wrapConcept, type Rng } from "@/lib/gen/kit";
import { parsePromptParams, scaleFactor, titleFromPrompt, type PromptParams, type RoofKind } from "@/lib/gen/prompt-params";

/* ---------------- shared architecture vocabulary ---------------- */

type Axis = "x" | "z";

function idFactory(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${n++}`;
}

/** A repeated row of window units (frame + glass + sill) along one facade. */
function windowRow(
  id: () => string,
  opts: {
    axis: Axis;
    group: string;
    center: [number, number, number];
    count: number;
    spacing: number;
    width: number;
    height: number;
    frameColor: string;
    glassColor: string;
  }
): ModelPart[] {
  const count = Math.max(1, Math.min(40, Math.round(opts.count)));
  const thickness = 0.1;
  const dims: [number, number, number] =
    opts.axis === "x"
      ? [opts.width, opts.height, thickness]
      : [thickness, opts.height, opts.width];
  const sillDims: [number, number, number] =
    opts.axis === "x"
      ? [opts.width + 0.16, 0.07, thickness + 0.14]
      : [thickness + 0.14, 0.07, opts.width + 0.16];
  const step: [number, number, number] =
    opts.axis === "x" ? [opts.spacing, 0, 0] : [0, 0, opts.spacing];
  const repeat = count > 1 ? { count, step } : undefined;
  const sillY = opts.center[1] - opts.height / 2 - 0.07;

  const frame = part(id(), "Оконная рама", {
    shape: "box",
    role: "window",
    group: opts.group,
    position: opts.center,
    size: [dims[0] + 0.09, dims[1] + 0.09, dims[2] + 0.03],
    color: shade(opts.frameColor, -0.35),
    material: "Рама",
    ...(repeat ? { repeat } : {}),
  });
  const glass = part(id(), "Стекло", {
    shape: "box",
    role: "window",
    group: opts.group,
    position: opts.center,
    size: dims,
    color: opts.glassColor,
    material: "Стеклопакет",
    opacity: 0.5,
    metalness: 0.1,
    roughness: 0.05,
    ...(repeat ? { repeat } : {}),
  });
  const sill = part(id(), "Подоконник", {
    shape: "box",
    role: "detail",
    group: opts.group,
    position: [opts.center[0], sillY, opts.center[2]],
    size: sillDims,
    color: shade(opts.frameColor, 0.2),
    material: "Камень",
    ...(repeat ? { repeat } : {}),
  });
  return [frame, glass, sill];
}

/** Panelled entrance door with a frame, on the +z facade unless overridden. */
function doorUnit(
  id: () => string,
  opts: {
    group: string;
    position: [number, number, number];
    width: number;
    height: number;
    color: string;
    axis?: Axis;
  }
): ModelPart[] {
  const axis = opts.axis ?? "x";
  const dims: [number, number, number] =
    axis === "x" ? [opts.width, opts.height, 0.12] : [0.12, opts.height, opts.width];
  const frameDims: [number, number, number] =
    axis === "x"
      ? [opts.width + 0.14, opts.height + 0.1, 0.16]
      : [0.16, opts.height + 0.1, opts.width + 0.14];
  const frame = part(id(), "Дверная рама", {
    shape: "box",
    role: "door",
    group: opts.group,
    position: opts.position,
    size: frameDims,
    color: shade(opts.color, -0.4),
    material: "Металл",
  });
  const door = part(id(), "Дверь", {
    shape: "box",
    role: "door",
    group: opts.group,
    position: opts.position,
    size: dims,
    color: opts.color,
    material: "Дерево",
  });
  const handle = part(id(), "Ручка", {
    shape: "cylinder",
    role: "detail",
    group: opts.group,
    position:
      axis === "x"
        ? [opts.position[0] + opts.width * 0.32, opts.position[1], opts.position[2] + 0.09]
        : [opts.position[0] + 0.09, opts.position[1], opts.position[2] + opts.width * 0.32],
    size: [0.03, 0.22, 0.03],
    rotation: axis === "x" ? [Math.PI / 2, 0, 0] : [Math.PI / 2, Math.PI / 2, 0],
    color: "#c9973f",
    material: "Латунь",
    metalness: 0.8,
    roughness: 0.3,
  });
  return [frame, door, handle];
}

/** Roof volume(s) for a box footprint centred at (cx, baseY, cz). */
function roofFor(
  id: () => string,
  opts: {
    kind: RoofKind;
    group: string;
    cx: number;
    cz: number;
    baseY: number;
    width: number;
    depth: number;
    color: string;
    rise?: number;
  }
): ModelPart[] {
  const overhang = 0.5;
  const w = opts.width + overhang;
  const d = opts.depth + overhang;
  const rise = opts.rise ?? Math.max(1.1, Math.min(w, d) * 0.32);
  const parts: ModelPart[] = [];

  switch (opts.kind) {
    case "flat": {
      parts.push(
        part(id(), "Кровля", {
          shape: "box",
          role: "roof",
          group: opts.group,
          position: [opts.cx, opts.baseY + 0.14, opts.cz],
          size: [w, 0.28, d],
          color: shade(opts.color, -0.2),
          material: "Мембранная кровля",
        }),
        part(id(), "Парапет", {
          shape: "box",
          role: "detail",
          group: opts.group,
          position: [opts.cx, opts.baseY + 0.42, opts.cz],
          size: [w * 0.98, 0.32, d * 0.98],
          color: shade(opts.color, -0.08),
          material: "Штукатурка",
        })
      );
      return parts;
    }
    case "shed": {
      parts.push(
        part(id(), "Скат крыши", {
          shape: "wedge",
          role: "roof",
          group: opts.group,
          position: [opts.cx, opts.baseY + rise / 2, opts.cz],
          size: [w, rise, d],
          rotation: [0, Math.PI / 2, 0],
          color: shade(opts.color, -0.15),
          material: "Металлочерепица",
        })
      );
      return parts;
    }
    case "hip": {
      parts.push(
        part(id(), "Вальмовая крыша", {
          shape: "pyramid",
          role: "roof",
          group: opts.group,
          position: [opts.cx, opts.baseY + rise / 2, opts.cz],
          size: [w, rise, d],
          color: shade(opts.color, -0.15),
          material: "Металлочерепица",
        })
      );
      return parts;
    }
    case "mansard": {
      const lowerRise = rise * 0.62;
      const upperRise = rise * 0.5;
      parts.push(
        part(id(), "Нижний скат мансарды", {
          shape: "pyramid",
          role: "roof",
          group: opts.group,
          position: [opts.cx, opts.baseY + lowerRise / 2, opts.cz],
          size: [w, lowerRise, d],
          color: shade(opts.color, -0.2),
          material: "Черепица",
        }),
        part(id(), "Верхний скат мансарды", {
          shape: "pyramid",
          role: "roof",
          group: opts.group,
          position: [opts.cx, opts.baseY + lowerRise + upperRise / 2, opts.cz],
          size: [w * 0.55, upperRise, d * 0.55],
          color: shade(opts.color, -0.1),
          material: "Черепица",
        })
      );
      return parts;
    }
    case "dome": {
      const radius = Math.max(w, d) * 0.52;
      parts.push(
        part(id(), "Купол", {
          shape: "sphere",
          role: "roof",
          group: opts.group,
          position: [opts.cx, opts.baseY - radius * 0.15, opts.cz],
          size: [radius * 2, radius * 1.9, radius * 2],
          color: shade(opts.color, -0.1),
          material: "Металл",
          metalness: 0.5,
          roughness: 0.3,
        }),
        part(id(), "Барабан купола", {
          shape: "cylinder",
          role: "roof",
          group: opts.group,
          position: [opts.cx, opts.baseY - 0.3, opts.cz],
          size: [radius * 1.5, 0.9, radius * 1.5],
          sides: 24,
          color: shade(opts.color, -0.25),
          material: "Штукатурка",
        })
      );
      return parts;
    }
    case "gable":
    default: {
      parts.push(
        part(id(), "Двускатная крыша", {
          shape: "prism",
          role: "roof",
          group: opts.group,
          position: [opts.cx, opts.baseY + rise / 2, opts.cz],
          size: [w, rise, d],
          color: shade(opts.color, -0.15),
          material: "Металлочерепица",
        }),
        part(id(), "Коньковая балка", {
          shape: "cylinder",
          role: "detail",
          group: opts.group,
          position: [opts.cx, opts.baseY + rise + 0.02, opts.cz],
          size: [0.1, w, 0.1],
          rotation: [0, 0, Math.PI / 2],
          sides: 6,
          color: shade(opts.color, -0.4),
          material: "Металл",
        })
      );
      return parts;
    }
  }
}

/** Solid plinth beneath a footprint. */
function plinth(
  id: () => string,
  opts: { group: string; cx: number; cz: number; width: number; depth: number; height?: number; color?: string }
): ModelPart {
  const h = opts.height ?? 0.5;
  return part(id(), "Цоколь", {
    shape: "box",
    role: "foundation",
    group: opts.group,
    position: [opts.cx, -h / 2, opts.cz],
    size: [opts.width + 0.4, h, opts.depth + 0.4],
    color: opts.color ?? "#5a5a62",
    material: "Железобетон",
  });
}

function entranceSteps(
  id: () => string,
  opts: { group: string; position: [number, number, number]; width: number; axis?: Axis }
): ModelPart[] {
  const axis = opts.axis ?? "x";
  const steps: ModelPart[] = [];
  const count = 3;
  for (let i = 0; i < count; i++) {
    const depth = 0.34;
    const height = 0.16;
    const offset = depth * (count - i - 0.5);
    const size: [number, number, number] =
      axis === "x" ? [opts.width, height, depth] : [depth, height, opts.width];
    const position: [number, number, number] =
      axis === "x"
        ? [opts.position[0], height / 2 + height * i, opts.position[2] + offset]
        : [opts.position[0] + offset, height / 2 + height * i, opts.position[2]];
    steps.push(
      part(id(), `Ступень ${i + 1}`, {
        shape: "box",
        role: "detail",
        group: opts.group,
        position,
        size,
        color: "#8b8378",
        material: "Гранит",
      })
    );
  }
  return steps;
}

function materialToColor(rng: Rng, material: PromptParams["material"], userColor?: string) {
  if (userColor) return userColor;
  switch (material) {
    case "brick":
      return pickColor(rng, "brick");
    case "concrete":
      return pickColor(rng, "concrete");
    case "wood":
      return pickColor(rng, "wood");
    case "stone":
      return shade(pickColor(rng, "concrete"), -0.05);
    case "metal":
      return pickColor(rng, "metal");
    case "glass":
      return pickColor(rng, "glass");
    default:
      return pickColor(rng, "plaster");
  }
}

function materialName(material: PromptParams["material"]): string {
  switch (material) {
    case "brick":
      return "Кирпич";
    case "concrete":
      return "Бетон";
    case "wood":
      return "Дерево";
    case "stone":
      return "Камень";
    case "metal":
      return "Металл";
    case "glass":
      return "Стекло/сталь";
    default:
      return "Штукатурка";
  }
}

function columnsRow(
  id: () => string,
  opts: {
    group: string;
    axis: Axis;
    center: [number, number, number];
    count: number;
    spacing: number;
    height: number;
    radius: number;
    color: string;
  }
): ModelPart[] {
  const step: [number, number, number] =
    opts.axis === "x" ? [opts.spacing, 0, 0] : [0, 0, opts.spacing];
  const column = part(id(), "Колонна", {
    shape: "cylinder",
    role: "detail",
    group: opts.group,
    position: opts.center,
    size: [opts.radius * 2, opts.height, opts.radius * 2],
    sides: 16,
    color: opts.color,
    material: "Камень",
    repeat: opts.count > 1 ? { count: opts.count, step } : undefined,
  });
  const cap = part(id(), "Капитель", {
    shape: "cylinder",
    role: "detail",
    group: opts.group,
    position: [opts.center[0], opts.center[1] + opts.height / 2 + 0.05, opts.center[2]],
    size: [opts.radius * 2.6, 0.14, opts.radius * 2.6],
    sides: 16,
    color: shade(opts.color, 0.1),
    material: "Камень",
    repeat: opts.count > 1 ? { count: opts.count, step } : undefined,
  });
  return [column, cap];
}

function fenceLoop(
  id: () => string,
  opts: { group: string; width: number; depth: number; setback: number; height?: number }
): ModelPart[] {
  const h = opts.height ?? 1.1;
  const w = opts.width + opts.setback * 2;
  const d = opts.depth + opts.setback * 2;
  const post = "#3a3d42";
  const railFront = part(id(), "Ограда — перила", {
    shape: "tube",
    role: "detail",
    group: opts.group,
    position: [0, h * 0.5, d / 2],
    size: [w, 0.06, 0.06],
    rotation: [0, 0, Math.PI / 2],
    sides: 8,
    hole: 0.6,
    color: post,
    material: "Металл",
  });
  const railBack = { ...railFront, id: id(), position: [0, h * 0.5, -d / 2] as [number, number, number] };
  const railLeft = part(id(), "Ограда — боковая", {
    shape: "tube",
    role: "detail",
    group: opts.group,
    position: [-w / 2, h * 0.5, 0],
    size: [d, 0.06, 0.06],
    rotation: [0, Math.PI / 2, Math.PI / 2],
    sides: 8,
    hole: 0.6,
    color: post,
    material: "Металл",
  });
  const railRight = { ...railLeft, id: id(), position: [w / 2, h * 0.5, 0] as [number, number, number] };
  return [railFront, railBack, railLeft, railRight];
}

/* ---------------- category builders ---------------- */

export function buildHouse(prompt: string): ThreeDConcept {
  const params = parsePromptParams(prompt);
  const rng = params.rng;
  const scale = scaleFactor(params.scale);
  const width = params.width ?? 10 * scale;
  const depth = params.depth ?? 8.5 * scale;
  const floors = params.floors ?? (params.scale === "huge" || params.scale === "large" ? 2 : rng.int(1, 2));
  const floorHeight = 2.9;
  const wallColor = materialToColor(rng, params.material, params.color);
  const roofKind: RoofKind = params.roof ?? (params.style === "classic" ? "hip" : params.style === "modern" || params.style === "minimal" ? "flat" : "gable");
  const id = idFactory("house");
  const parts: ModelPart[] = [];

  parts.push(plinth(id, { group: "Фундамент", cx: 0, cz: 0, width, depth }));

  for (let floor = 0; floor < floors; floor++) {
    const y = floor * floorHeight + floorHeight / 2;
    parts.push(
      part(id(), `Этаж ${floor + 1}`, {
        shape: "box",
        role: "volume",
        group: "Объём",
        position: [0, y, 0],
        size: [width, floorHeight, depth],
        color: floor % 2 === 1 ? shade(wallColor, 0.06) : wallColor,
        material: materialName(params.material),
      })
    );
    const winCount = Math.max(2, Math.min(7, Math.round(width / 2.6)));
    parts.push(
      ...windowRow(id, {
        axis: "x",
        group: "Фасад",
        center: [0, y + 0.1, depth / 2 + 0.03],
        count: winCount,
        spacing: width / (winCount + 1),
        width: 1.35,
        height: 1.5,
        frameColor: shade(wallColor, -0.3),
        glassColor: pickColor(rng, "glass"),
      })
    );
    if (rng.chance(0.7)) {
      parts.push(
        ...windowRow(id, {
          axis: "z",
          group: "Фасад",
          center: [width / 2 + 0.03, y + 0.1, 0],
          count: Math.max(1, Math.round(depth / 3)),
          spacing: depth / (Math.max(1, Math.round(depth / 3)) + 1),
          width: 1.2,
          height: 1.4,
          frameColor: shade(wallColor, -0.3),
          glassColor: pickColor(rng, "glass"),
        })
      );
    }
  }

  parts.push(
    ...doorUnit(id, {
      group: "Фасад",
      position: [-width * 0.28, 1.1, depth / 2 + 0.02],
      width: 1.1,
      height: 2.15,
      color: shade(wallColor, -0.5),
    }),
    ...entranceSteps(id, { group: "Вход", position: [-width * 0.28, 0, depth / 2 + 0.16], width: 1.6 })
  );

  const roofBaseY = floors * floorHeight;
  parts.push(
    ...roofFor(id, {
      kind: roofKind,
      group: "Крыша",
      cx: 0,
      cz: 0,
      baseY: roofBaseY,
      width,
      depth,
      color: pickColor(rng, "roofTile"),
    })
  );

  if (params.features.has("chimney") || (roofKind === "gable" && rng.chance(0.5))) {
    parts.push(
      part(id(), "Дымоход", {
        shape: "box",
        role: "detail",
        group: "Крыша",
        position: [width * 0.22, roofBaseY + 1.5, depth * 0.15],
        size: [0.5, 1.6, 0.5],
        color: pickColor(rng, "brick"),
        material: "Кирпич",
      })
    );
  }

  if (params.features.has("garage")) {
    const gw = 3.4 * scale;
    parts.push(
      part(id(), "Гараж", {
        shape: "box",
        role: "volume",
        group: "Объём",
        position: [width / 2 + gw / 2 - 0.2, floorHeight * 0.62, depth * 0.1],
        size: [gw, floorHeight * 0.85, depth * 0.7],
        color: shade(wallColor, -0.05),
        material: materialName(params.material),
      }),
      part(id(), "Ворота гаража", {
        shape: "box",
        role: "door",
        group: "Фасад",
        position: [width / 2 + gw / 2 - 0.2, floorHeight * 0.4, depth * 0.7 / 2 + 0.05],
        size: [gw - 0.5, floorHeight * 0.65, 0.1],
        color: "#3a3d42",
        material: "Металл",
      })
    );
  }

  if (params.features.has("balcony") && floors > 1) {
    parts.push(
      part(id(), "Балкон", {
        shape: "box",
        role: "detail",
        group: "Фасад",
        position: [width * 0.15, floorHeight * 1.02, depth / 2 + 0.6],
        size: [2.6, 0.12, 1.2],
        color: shade(wallColor, 0.2),
        material: "Бетон",
      }),
      part(id(), "Перила балкона", {
        shape: "tube",
        role: "detail",
        group: "Фасад",
        position: [width * 0.15, floorHeight * 1.02 + 0.5, depth / 2 + 1.15],
        size: [2.6, 0.9, 0.05],
        rotation: [0, 0, Math.PI / 2],
        hole: 0.7,
        sides: 12,
        color: "#3a3d42",
        material: "Металл",
      })
    );
  }

  if (params.features.has("terrace") || params.features.has("porch")) {
    parts.push(
      part(id(), "Терраса", {
        shape: "plane",
        role: "detail",
        group: "Вход",
        position: [width * 0.05, 0.03, depth / 2 + 1.6],
        size: [width * 0.6, 0.05, 2.4],
        color: pickColor(rng, "wood"),
        material: "Дерево",
      })
    );
  }

  if (params.features.has("fence")) {
    parts.push(...fenceLoop(id, { group: "Участок", width, depth, setback: 3.2 }));
  }

  if (params.features.has("garden")) {
    const count = 4;
    parts.push(
      part(id(), "Дерево во дворе", {
        shape: "sphere",
        role: "detail",
        group: "Участок",
        position: [-width * 0.7, 1.1, -depth * 0.4],
        size: [1.3, 1.7, 1.3],
        rotation: [0, 0, 0],
        color: "#3f8a5b",
        material: "Растение",
        repeat: { count, step: [1.6, 0, -1.0] },
      }),
      part(id(), "Ствол", {
        shape: "cylinder",
        role: "detail",
        group: "Участок",
        position: [-width * 0.7, 0.35, -depth * 0.4],
        size: [0.18, 0.7, 0.18],
        color: "#6f4a2c",
        material: "Дерево",
        repeat: { count, step: [1.6, 0, -1.0] },
      })
    );
  }

  if (params.features.has("pool")) {
    parts.push(
      part(id(), "Бассейн", {
        shape: "box",
        role: "detail",
        group: "Участок",
        position: [0, -0.35, -depth / 2 - 3],
        size: [width * 0.55, 0.7, 3.4],
        color: "#3fa8d9",
        material: "Вода",
        opacity: 0.75,
        roughness: 0.05,
      })
    );
  }

  return wrapConcept({
    name: titleFromPrompt(prompt, "Дом"),
    description: `${floors}-этажный дом ${width.toFixed(1)}×${depth.toFixed(1)} м, крыша: ${roofKind}.`,
    category: "house",
    seed: params.seed,
    parts,
  });
}

export function buildSchool(prompt: string): ThreeDConcept {
  return institutionalBuilding(prompt, {
    category: "school",
    defaultWidth: 34,
    defaultDepth: 16,
    defaultFloors: 3,
    label: "Школа",
    hasWing: true,
    signageText: "Школа",
  });
}

export function buildOffice(prompt: string): ThreeDConcept {
  return institutionalBuilding(prompt, {
    category: "office",
    defaultWidth: 24,
    defaultDepth: 18,
    defaultFloors: 6,
    label: "Офисное здание",
    hasWing: false,
    signageText: "Office",
  });
}

export function buildHospital(prompt: string): ThreeDConcept {
  return institutionalBuilding(prompt, {
    category: "hospital",
    defaultWidth: 30,
    defaultDepth: 18,
    defaultFloors: 5,
    label: "Больница",
    hasWing: true,
    signageText: "H",
  });
}

export function buildBuilding(prompt: string): ThreeDConcept {
  return institutionalBuilding(prompt, {
    category: "building",
    defaultWidth: 22,
    defaultDepth: 16,
    defaultFloors: 4,
    label: "Здание",
    hasWing: false,
    signageText: null,
  });
}

function institutionalBuilding(
  prompt: string,
  opts: {
    category: string;
    defaultWidth: number;
    defaultDepth: number;
    defaultFloors: number;
    label: string;
    hasWing: boolean;
    signageText: string | null;
  }
): ThreeDConcept {
  const params = parsePromptParams(prompt);
  const rng = params.rng;
  const scale = scaleFactor(params.scale);
  const width = params.width ?? opts.defaultWidth * scale;
  const depth = params.depth ?? opts.defaultDepth * scale;
  const floors = params.floors ?? opts.defaultFloors;
  const floorHeight = 3.6;
  const wallColor = materialToColor(rng, params.material, params.color);
  const roofKind: RoofKind = params.roof ?? "flat";
  const id = idFactory(opts.category);
  const parts: ModelPart[] = [];

  parts.push(plinth(id, { group: "Фундамент", cx: 0, cz: 0, width, depth, height: 0.7 }));

  const bodyHeight = floors * floorHeight;
  parts.push(
    part(id(), "Главный корпус", {
      shape: "box",
      role: "volume",
      group: "Объём",
      position: [0, bodyHeight / 2, 0],
      size: [width, bodyHeight, depth],
      color: wallColor,
      material: materialName(params.material),
    })
  );

  const winPerFloor = Math.max(4, Math.min(16, Math.round(width / 2.2)));
  for (let floor = 0; floor < floors; floor++) {
    const y = floor * floorHeight + floorHeight / 2 + 0.15;
    parts.push(
      ...windowRow(id, {
        axis: "x",
        group: "Фасад",
        center: [(-width + width / winPerFloor) / 2, y, depth / 2 + 0.03],
        count: winPerFloor,
        spacing: width / winPerFloor,
        width: 1.5,
        height: 1.7,
        frameColor: shade(wallColor, -0.35),
        glassColor: pickColor(rng, "glass"),
      })
    );
  }

  if (opts.hasWing) {
    const wingWidth = width * 0.42;
    const wingDepth = depth * 0.85;
    const wingHeight = floorHeight * Math.max(1, floors - 1);
    parts.push(
      part(id(), "Крыло", {
        shape: "box",
        role: "volume",
        group: "Объём",
        position: [width / 2 + wingWidth / 2 - 0.6, wingHeight / 2, depth * 0.05],
        size: [wingWidth, wingHeight, wingDepth],
        color: shade(wallColor, -0.05),
        material: materialName(params.material),
      }),
      ...windowRow(id, {
        axis: "z",
        group: "Фасад",
        center: [width / 2 + wingWidth - 0.6, wingHeight * 0.55, -wingDepth / 2 + wingDepth / 6],
        count: Math.max(2, Math.round(wingDepth / 3)),
        spacing: wingDepth / Math.max(2, Math.round(wingDepth / 3)),
        width: 1.4,
        height: 1.6,
        frameColor: shade(wallColor, -0.35),
        glassColor: pickColor(rng, "glass"),
      })
    );
    parts.push(
      ...roofFor(id, {
        kind: roofKind,
        group: "Крыша",
        cx: width / 2 + wingWidth / 2 - 0.6,
        cz: depth * 0.05,
        baseY: wingHeight,
        width: wingWidth,
        depth: wingDepth,
        color: shade(wallColor, -0.3),
      })
    );
  }

  const entranceWidth = 6;
  parts.push(
    part(id(), "Входная группа", {
      shape: "box",
      role: "volume",
      group: "Вход",
      position: [-width * 0.15, floorHeight * 0.62, depth / 2 + 1.4],
      size: [entranceWidth, floorHeight * 0.9, 2.6],
      color: shade(wallColor, 0.08),
      material: "Стекло/металл",
      opacity: 0.75,
    }),
    part(id(), "Козырёк входа", {
      shape: "box",
      role: "detail",
      group: "Вход",
      position: [-width * 0.15, floorHeight * 0.9 + 0.15, depth / 2 + 2.8],
      size: [entranceWidth + 1, 0.16, 2.4],
      color: "#4dd6ff",
      material: "Стекло",
      opacity: 0.55,
    }),
    ...doorUnit(id, {
      group: "Вход",
      position: [-width * 0.15, 1.15, depth / 2 + 2.6],
      width: 1.8,
      height: 2.3,
      color: shade(wallColor, -0.5),
    }),
    ...entranceSteps(id, { group: "Вход", position: [-width * 0.15, 0, depth / 2 + 2.75], width: entranceWidth - 1 })
  );

  parts.push(
    ...roofFor(id, {
      kind: roofKind,
      group: "Крыша",
      cx: 0,
      cz: 0,
      baseY: bodyHeight,
      width,
      depth,
      color: shade(wallColor, -0.3),
    })
  );

  if (params.features.has("columns") || params.style === "classic") {
    const count = Math.max(4, Math.min(10, Math.round(entranceWidth / 1.3)));
    parts.push(
      ...columnsRow(id, {
        group: "Вход",
        axis: "x",
        center: [-width * 0.15 - entranceWidth / 2 + entranceWidth / count / 2, floorHeight * 0.62, depth / 2 + 3.6],
        count,
        spacing: entranceWidth / count,
        height: floorHeight * 1.1,
        radius: 0.22,
        color: "#d8d2c4",
      })
    );
  }

  if (opts.signageText) {
    parts.push(
      part(id(), "Вывеска", {
        shape: "box",
        role: "detail",
        group: "Вход",
        position: [-width * 0.15, floorHeight * 0.92, depth / 2 + 1.5],
        size: [3.4, 0.7, 0.1],
        color: "#101418",
        material: "Композит",
        emissive: 0.4,
      })
    );
  }

  if (params.features.has("solar")) {
    parts.push(
      part(id(), "Солнечная панель", {
        shape: "plane",
        role: "detail",
        group: "Крыша",
        position: [-width / 3, bodyHeight + 0.4, 0],
        size: [1.6, 0.05, 1],
        rotation: [0.25, 0, 0],
        color: "#1c2a44",
        material: "Солнечная панель",
        metalness: 0.6,
        roughness: 0.25,
        repeat: { count: 6, step: [1.8, 0, 0] },
      })
    );
  }

  if (params.features.has("antenna")) {
    parts.push(
      part(id(), "Антенна", {
        shape: "cylinder",
        role: "detail",
        group: "Крыша",
        position: [width * 0.3, bodyHeight + 1.5, -depth * 0.2],
        size: [0.05, 3, 0.05],
        sides: 6,
        color: "#8f9299",
        material: "Металл",
      })
    );
  }

  if (params.features.has("parking")) {
    parts.push(
      part(id(), "Парковочная разметка", {
        shape: "plane",
        role: "detail",
        group: "Участок",
        position: [0, 0.01, -depth / 2 - 4],
        size: [0.12, 0.01, 4.5],
        color: "#e8e6e1",
        material: "Разметка",
        repeat: { count: 8, step: [2.6, 0, 0] },
      })
    );
  }

  return wrapConcept({
    name: titleFromPrompt(prompt, opts.label),
    description: `${floors}-этажное здание (${opts.label.toLowerCase()}) ${width.toFixed(1)}×${depth.toFixed(1)} м.`,
    category: opts.category,
    seed: params.seed,
    parts,
  });
}

export function buildTower(prompt: string): ThreeDConcept {
  const params = parsePromptParams(prompt);
  const rng = params.rng;
  const scale = scaleFactor(params.scale);
  const footprint = params.width ?? 16 * scale;
  const floors = params.floors ?? Math.max(12, Math.round(footprint * 2));
  const floorHeight = 3.4;
  const total = floors * floorHeight;
  const wallColor = materialToColor(rng, params.material ?? "glass", params.color);
  const id = idFactory("tower");
  const parts: ModelPart[] = [];

  parts.push(
    plinth(id, { group: "Фундамент", cx: 0, cz: 0, width: footprint * 1.3, depth: footprint * 1.3, height: 1 })
  );

  const segments = Math.max(3, Math.min(6, Math.round(floors / 12)));
  let y = 0;
  for (let seg = 0; seg < segments; seg++) {
    const segFloors = Math.round(floors / segments);
    const segHeight = segFloors * floorHeight;
    const taper = 1 - seg * 0.09;
    parts.push(
      part(id(), `Секция ${seg + 1}`, {
        shape: "box",
        role: "volume",
        group: "Объём",
        position: [0, y + segHeight / 2, 0],
        size: [footprint * taper, segHeight, footprint * taper],
        color: shade(wallColor, seg % 2 === 0 ? 0 : 0.04),
        material: materialName(params.material ?? "glass"),
        opacity: params.material === "glass" || !params.material ? 0.88 : 1,
      }),
      part(id(), `Пояс остекления ${seg + 1}`, {
        shape: "box",
        role: "window",
        group: "Фасад",
        position: [0, y + 0.02, footprint * taper / 2 + 0.02],
        size: [footprint * taper * 0.94, 0.12, 0.06],
        color: pickColor(rng, "glass"),
        material: "Витраж",
        repeat: { count: segFloors, step: [0, floorHeight, 0] },
      })
    );
    y += segHeight;
  }

  parts.push(
    part(id(), "Шпиль", {
      shape: "cone",
      role: "detail",
      group: "Крыша",
      position: [0, total + 3, 0],
      size: [1.4, 6, 1.4],
      sides: 12,
      color: "#c9cdd3",
      material: "Металл",
      metalness: 0.7,
      roughness: 0.2,
    }),
    part(id(), "Маячок", {
      shape: "sphere",
      role: "light",
      group: "Крыша",
      position: [0, total + 6.1, 0],
      size: [0.3, 0.3, 0.3],
      color: "#ff4d4d",
      material: "Сигнальный огонь",
      emissive: 0.9,
    })
  );

  const doorWidth = 2.4;
  parts.push(
    ...doorUnit(id, {
      group: "Вход",
      position: [0, 1.3, footprint * 0.65 / 2 + 0.02],
      width: doorWidth,
      height: 2.6,
      color: shade(wallColor, -0.5),
    })
  );

  return wrapConcept({
    name: titleFromPrompt(prompt, "Башня"),
    description: `Высотное здание, ${floors} этажей, ${total.toFixed(0)} м.`,
    category: "tower",
    seed: params.seed,
    parts,
  });
}

export function buildBridge(prompt: string): ThreeDConcept {
  const params = parsePromptParams(prompt);
  const rng = params.rng;
  const scale = scaleFactor(params.scale);
  const span = params.width ?? params.depth ?? 60 * scale;
  const deckWidth = params.height ? Math.max(4, params.height) : 9;
  const deckThickness = 0.9;
  const deckY = 6 + span * 0.02;
  const pierCount = Math.max(2, Math.min(6, Math.round(span / 22)));
  const id = idFactory("bridge");
  const parts: ModelPart[] = [];
  const deckColor = materialToColor(rng, params.material ?? "concrete", params.color);

  parts.push(
    part(id(), "Пролёт моста", {
      shape: "box",
      role: "volume",
      group: "Пролёт",
      position: [0, deckY, 0],
      size: [span, deckThickness, deckWidth],
      color: deckColor,
      material: materialName(params.material ?? "concrete"),
    }),
    part(id(), "Дорожное полотно", {
      shape: "plane",
      role: "detail",
      group: "Пролёт",
      position: [0, deckY + deckThickness / 2 + 0.02, 0],
      size: [span - 0.4, 0.04, deckWidth - 0.6],
      color: "#3a3a3f",
      material: "Асфальт",
    })
  );

  const pierSpacing = span / (pierCount + 1);
  parts.push(
    part(id(), "Опора", {
      shape: "cylinder",
      role: "foundation",
      group: "Опоры",
      position: [-span / 2 + pierSpacing, deckY / 2, 0],
      size: [1.6, deckY, 1.6],
      sides: 12,
      color: shade(deckColor, -0.15),
      material: "Железобетон",
      repeat: { count: pierCount, step: [pierSpacing, 0, 0] },
    }),
    part(id(), "Оголовок опоры", {
      shape: "box",
      role: "detail",
      group: "Опоры",
      position: [-span / 2 + pierSpacing, deckY - 0.5, 0],
      size: [2.4, 0.7, deckWidth * 0.7],
      color: shade(deckColor, -0.1),
      material: "Железобетон",
      repeat: { count: pierCount, step: [pierSpacing, 0, 0] },
    })
  );

  parts.push(
    part(id(), "Пилон", {
      shape: "box",
      role: "structure",
      group: "Ванты",
      position: [-span * 0.22, deckY + 12, 0],
      size: [1.2, 24, 1.2],
      color: "#c9cdd3",
      material: "Сталь",
      metalness: 0.5,
      repeat: { count: 2, step: [span * 0.44, 0, 0] },
    }),
    part(id(), "Ванта", {
      shape: "cylinder",
      role: "detail",
      group: "Ванты",
      position: [-span * 0.22 + 3, deckY + 16, 0],
      size: [0.05, 18, 0.05],
      rotation: [0, 0, Math.PI / 5],
      sides: 6,
      color: "#dfe3e8",
      material: "Трос",
      repeat: { count: 6, step: [2.4, -1.6, 0] },
    })
  );

  parts.push(
    part(id(), "Перила", {
      shape: "tube",
      role: "detail",
      group: "Пролёт",
      position: [0, deckY + deckThickness / 2 + 0.6, deckWidth / 2 - 0.15],
      size: [span, 0.9, 0.06],
      rotation: [0, 0, Math.PI / 2],
      sides: 8,
      hole: 0.75,
      color: "#8f9299",
      material: "Металл",
      repeat: { count: 2, step: [0, 0, -(deckWidth - 0.3)] },
    })
  );

  return wrapConcept({
    name: titleFromPrompt(prompt, "Мост"),
    description: `Мостовое сооружение, пролёт ${span.toFixed(0)} м.`,
    category: "bridge",
    seed: params.seed,
    parts,
  });
}

export function buildStadium(prompt: string): ThreeDConcept {
  const params = parsePromptParams(prompt);
  const rng = params.rng;
  const scale = scaleFactor(params.scale);
  const length = params.width ?? 105 * scale;
  const width = params.depth ?? 68 * scale;
  const id = idFactory("stadium");
  const parts: ModelPart[] = [];
  const standColor = materialToColor(rng, params.material ?? "concrete", params.color);

  parts.push(
    part(id(), "Поле", {
      shape: "plane",
      role: "detail",
      group: "Поле",
      position: [0, 0.02, 0],
      size: [length, 0.05, width],
      color: "#3f8a5b",
      material: "Газон",
    })
  );

  const bowlOuterX = length / 2 + 18;
  const bowlOuterZ = width / 2 + 18;
  const standHeight = 14;
  parts.push(
    part(id(), "Трибуна", {
      shape: "tube",
      role: "volume",
      group: "Трибуны",
      position: [0, standHeight / 2, 0],
      size: [bowlOuterX * 2, standHeight, bowlOuterZ * 2],
      hole: 0.72,
      sides: 48,
      color: standColor,
      material: materialName(params.material ?? "concrete"),
    }),
    part(id(), "Кольцо освещения", {
      shape: "torus",
      role: "detail",
      group: "Крыша",
      position: [0, standHeight + 3, 0],
      size: [bowlOuterX * 1.9, 1.2, bowlOuterZ * 1.9],
      hole: 0.08,
      sides: 48,
      color: "#c9cdd3",
      material: "Металл",
      metalness: 0.6,
    })
  );

  const towerPositions: [number, number][] = [
    [bowlOuterX * 0.72, bowlOuterZ * 0.72],
    [-bowlOuterX * 0.72, bowlOuterZ * 0.72],
    [bowlOuterX * 0.72, -bowlOuterZ * 0.72],
    [-bowlOuterX * 0.72, -bowlOuterZ * 0.72],
  ];
  for (const [x, z] of towerPositions) {
    parts.push(
      part(id(), "Мачта освещения", {
        shape: "cylinder",
        role: "structure",
        group: "Освещение",
        position: [x, 22, z],
        size: [0.6, 44, 0.6],
        sides: 10,
        color: "#8f9299",
        material: "Сталь",
      }),
      part(id(), "Прожекторная панель", {
        shape: "box",
        role: "light",
        group: "Освещение",
        position: [x, 43, z],
        size: [3.6, 2.2, 0.4],
        color: "#e8e6e1",
        material: "Прожектор",
        emissive: 0.6,
      })
    );
  }

  if (params.features.has("panoramic") || rng.chance(0.6)) {
    parts.push(
      part(id(), "Козырёк трибуны", {
        shape: "tube",
        role: "roof",
        group: "Крыша",
        position: [0, standHeight + 1, 0],
        size: [bowlOuterX * 2.15, 1.6, bowlOuterZ * 2.15],
        hole: 0.86,
        sides: 48,
        color: "#dfe3e8",
        material: "Мембрана",
        opacity: 0.85,
      })
    );
  }

  return wrapConcept({
    name: titleFromPrompt(prompt, "Стадион"),
    description: `Стадион, поле ${length.toFixed(0)}×${width.toFixed(0)} м с трибунами по периметру.`,
    category: "stadium",
    seed: params.seed,
    parts,
  });
}
