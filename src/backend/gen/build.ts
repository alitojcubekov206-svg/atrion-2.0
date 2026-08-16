/**
 * Blueprint → geometry.
 *
 * One builder for everything. It lays down a mass, stands it on whatever it has
 * to stand on, grows the limbs and openings the blueprint asked for, mounts the
 * surface hardware, and finishes with a detail pass. No branch here knows what
 * a "house" or a "cat" is — it only knows wheels, legs, windows, roofs, heads
 * and screens, so any combination of those is buildable.
 *
 * Axes: x = width (side to side), y = up, z = length (+z is the front).
 */
import type { ModelPart, ThreeDConcept } from "@/shared/types";
import { part, shade, wrapConcept, type Rng } from "@/shared/geometry";
import { titleFromPrompt } from "@/backend/gen/prompt-params";
import {
  cushion,
  doorUnit,
  furnitureLeg,
  ids,
  keyGrid,
  panelSeam,
  railingRun,
  screenPanel,
  stairFlight,
  taperedChain,
  ventSlots,
  wheelUnit,
  windowUnit,
  type Vec3,
} from "@/backend/gen/details";
import { describeBlueprint, type Blueprint } from "@/backend/gen/blueprint";

/** The main mass, once it exists — everything else anchors to this. */
type Body = {
  halfW: number;
  halfL: number;
  y0: number;
  y1: number;
};

type Ctx = {
  bp: Blueprint;
  rng: Rng;
  id: () => string;
  parts: ModelPart[];
  body: Body;
  /** True when the thing stands on end (people, robots, buildings). */
  upright: boolean;
};

function push(ctx: Ctx, ...parts: (ModelPart | ModelPart[])[]) {
  for (const entry of parts) {
    if (Array.isArray(entry)) ctx.parts.push(...entry);
    else ctx.parts.push(entry);
  }
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/* ================= entry point ================= */

export function buildFromBlueprint(bp: Blueprint): ThreeDConcept {
  const ctx: Ctx = {
    bp,
    rng: bp.rng,
    id: ids("p"),
    parts: [],
    body: { halfW: bp.width / 2, halfL: bp.length / 2, y0: 0, y1: bp.height },
    upright: bp.legs === 2 || bp.massPlan === "stacked" || bp.massPlan === "shell",
  };

  const clearance = groundClearance(ctx);
  ctx.body.y0 = clearance;
  ctx.body.y1 = Math.max(clearance + bp.height * 0.12, bp.height - topReserve(ctx));

  buildMass(ctx);

  // Ground contact
  if (bp.wheels > 0) addWheels(ctx);
  if (bp.tracks) addTracks(ctx);
  if (bp.legs > 0) addLegs(ctx);
  if (bp.furnitureLegs > 0) addFurnitureLegs(ctx);
  if (bp.hull) addHull(ctx);
  if (bp.skids) addSkids(ctx);

  // Anatomy
  if (bp.head > 0) addHead(ctx);
  if (bp.arms > 0) addArms(ctx);
  if (bp.wings > 0) addWings(ctx);
  if (bp.tail > 0) addTail(ctx);
  if (bp.spikes > 0) addSpikes(ctx);
  if (bp.fins > 0) addFins(ctx);

  // Architecture
  if (bp.windows > 0) addWindows(ctx);
  if (bp.doors > 0) addDoors(ctx);
  if (bp.roof !== "none") addRoof(ctx);
  if (bp.chimneys > 0) addChimneys(ctx);
  if (bp.columns > 0) addColumns(ctx);
  if (bp.arches > 0) addArches(ctx);
  if (bp.balconies > 0) addBalconies(ctx);
  if (bp.terrace) addTerrace(ctx);
  if (bp.stairs > 0) addStairs(ctx);
  if (bp.railings && !bp.terrace) addRailings(ctx);
  if (bp.fence) addFence(ctx);
  if (bp.garage) addGarage(ctx);
  if (bp.towers > 0) addTowers(ctx);
  if (bp.spire) addSpire(ctx);
  if (bp.solar > 0) addSolar(ctx);

  // Furniture
  if (bp.tabletop) addTabletop(ctx);
  if (bp.seat) addSeat(ctx);
  if (bp.mattress) addMattress(ctx);
  if (bp.shelves > 0) addShelves(ctx);
  if (bp.drawers > 0) addDrawers(ctx);
  if (bp.pillows > 0) addPillows(ctx);

  // Hardware
  if (bp.screens > 0) addScreens(ctx);
  if (bp.keyboard) addKeyboard(ctx);
  if (bp.buttons > 0) addButtons(ctx);
  if (bp.lenses > 0) addLenses(ctx);
  if (bp.antennas > 0) addAntennas(ctx);
  if (bp.vents > 0) addVents(ctx);
  if (bp.handles > 0) addHandles(ctx);
  if (bp.spout) addSpout(ctx);
  if (bp.lid) addLid(ctx);
  if (bp.propellers > 0) addPropellers(ctx);
  if (bp.cables > 0) addCables(ctx);
  if (bp.lights > 0) addLights(ctx);
  if (bp.speakers > 0) addSpeakers(ctx);
  if (bp.cannon) addCannon(ctx);
  if (bp.mast) addMast(ctx);

  addSurfaceDetail(ctx);

  return wrapConcept({
    name: titleFromPrompt(bp.prompt, "Модель Atrion"),
    description: describeModel(ctx),
    category: bp.sizeClass,
    seed: bp.seed,
    parts: ctx.parts,
    engineeringNotes: [
      `Разбор запроса: ${describeBlueprint(bp)}`,
      `Найденные признаки: ${bp.matched.join(", ")}`,
      `Собрано деталей: ${ctx.parts.length}`,
    ],
  });
}

function describeModel(ctx: Ctx): string {
  const { bp } = ctx;
  const bits: string[] = [];
  if (bp.floors > 0) bits.push(`${bp.floors} эт.`);
  if (bp.wheels) bits.push(`${bp.wheels} колёс`);
  if (bp.legs) bits.push(`${bp.legs} опор`);
  if (bp.wings) bits.push(`${bp.wings} крыла`);
  if (bp.windows) bits.push(`${bp.windows} окон`);
  if (bp.screens) bits.push("экран");
  if (bp.roof !== "none") bits.push(`крыша ${bp.roof}`);
  return `Модель по описанию «${bp.prompt}». ${bits.length ? `Состав: ${bits.join(", ")}.` : ""} Габарит ${bp.width.toFixed(2)} × ${bp.length.toFixed(2)} × ${bp.height.toFixed(2)} м.`;
}

/* ================= mass ================= */

function groundClearance(ctx: Ctx): number {
  const { bp } = ctx;
  if (bp.wheels > 0) return bp.height * bp.wheelSize * 0.55;
  if (bp.tracks) return bp.height * 0.3;
  if (bp.legs > 0 && bp.legStyle !== "furniture") return bp.height * bp.legLength;
  if (bp.furnitureLegs > 0 && (bp.tabletop || bp.seat)) {
    return bp.tabletop ? bp.height * 0.86 : bp.height * 0.42;
  }
  if (bp.hull) return bp.height * 0.18;
  return 0;
}

/** Height kept free above the mass for a roof, a head or a spire. */
function topReserve(ctx: Ctx): number {
  const { bp } = ctx;
  let reserve = 0;
  if (bp.roof === "gable" || bp.roof === "hip" || bp.roof === "mansard") reserve += bp.height * 0.22;
  if (bp.roof === "dome") reserve += bp.height * 0.2;
  if (bp.head > 0 && ctx.upright) reserve += bp.height * 0.18;
  if (bp.spire) reserve += bp.height * 0.12;
  return Math.min(bp.height * 0.45, reserve);
}

function buildMass(ctx: Ctx) {
  switch (ctx.bp.massPlan) {
    case "elongated":
      massElongated(ctx);
      break;
    case "platform":
      massPlatform(ctx);
      break;
    case "radial":
      massRadial(ctx);
      break;
    case "shell":
      massShell(ctx);
      break;
    case "stacked":
    default:
      massStacked(ctx);
      break;
  }
}

/** Cross-section multiplier per level — what makes a waist a waist. */
function stackProfile(ctx: Ctx, levels: number): number[] {
  const { bp } = ctx;
  if (bp.floors > 0) {
    return Array.from({ length: levels }, (_, i) =>
      levels > 6 ? 1 - (i / levels) * 0.28 : 1 - (i / levels) * 0.04
    );
  }
  if (bp.arms > 0 || (bp.head > 0 && bp.legs === 2)) {
    const torso = [0.96, 0.82, 1.02, 0.94];
    return Array.from({ length: levels }, (_, i) => torso[Math.min(torso.length - 1, i)]);
  }
  return Array.from({ length: levels }, (_, i) => 1 - (i / Math.max(1, levels)) * bp.taper);
}

function massStacked(ctx: Ctx) {
  const { bp, body } = ctx;
  const levels = clamp(bp.floors > 0 ? bp.floors : Math.max(2, bp.bodySegments), 1, 40);
  const profile = stackProfile(ctx, levels);
  const total = body.y1 - body.y0;
  const step = total / levels;

  if (bp.floors > 0) {
    push(
      ctx,
      part(ctx.id(), "Цоколь", {
        shape: "box",
        role: "foundation",
        group: "Основание",
        position: [0, body.y0 + step * 0.08, 0],
        size: [bp.width * 1.05, step * 0.16, bp.length * 1.05],
        color: shade(bp.trim, 0.15),
        material: "Цоколь",
        roughness: 0.88,
      })
    );
  }

  for (let i = 0; i < levels; i++) {
    const k = profile[i];
    const y = body.y0 + step * (i + 0.5);
    push(
      ctx,
      part(ctx.id(), bp.floors > 0 ? `Этаж ${i + 1}` : `Объём ${i + 1}`, {
        shape: bp.bodyShape === "prism" ? "box" : bp.bodyShape,
        role: "volume",
        group: bp.floors > 0 ? "Этажи" : "Объём",
        position: [0, y, 0],
        size: [bp.width * k, step * 0.98, bp.length * k],
        color: i % 2 === 0 ? bp.primary : shade(bp.primary, -0.05),
        material: "Основной объём",
        metalness: bp.metalness,
        roughness: bp.roughness,
        ...(bp.glassy ? { opacity: 0.72 } : {}),
      })
    );

    if (bp.floors > 0 && i < levels - 1) {
      push(
        ctx,
        part(ctx.id(), `Междуэтажный пояс ${i + 1}`, {
          shape: "box",
          role: "detail",
          group: "Фасад",
          position: [0, body.y0 + step * (i + 1), 0],
          size: [bp.width * k + bp.width * 0.03, step * 0.09, bp.length * k + bp.length * 0.03],
          color: bp.trim,
          material: "Пояс",
          roughness: 0.8,
        })
      );
    }
  }

  body.halfW = (bp.width * profile[0]) / 2;
  body.halfL = (bp.length * profile[0]) / 2;
}

function massElongated(ctx: Ctx) {
  const { bp, body } = ctx;
  const segments = clamp(Math.max(2, bp.bodySegments), 1, 6);
  const total = body.y1 - body.y0;
  const step = bp.length / segments;

  for (let i = 0; i < segments; i++) {
    const t = segments === 1 ? 0 : i / (segments - 1);
    const shrink = 1 - t * bp.taper * 0.6;
    const z = -bp.length / 2 + step * (i + 0.5);
    push(
      ctx,
      part(ctx.id(), `Корпус ${i + 1}`, {
        shape: bp.bodyShape === "prism" ? "box" : bp.bodyShape,
        role: "volume",
        group: "Корпус",
        position: [0, body.y0 + total * 0.5, z],
        size: [bp.width * shrink, total * (0.9 + 0.1 * shrink), step * 1.04],
        color: i === 0 ? shade(bp.primary, -0.04) : bp.primary,
        material: "Корпус",
        metalness: bp.metalness,
        roughness: bp.roughness,
      })
    );
  }

  // A raised upper volume reads as a cabin, a chest, a superstructure.
  if (bp.wheels > 0 || bp.tracks || bp.hull) {
    const cabinL = bp.length * 0.42;
    push(
      ctx,
      part(ctx.id(), "Верхний объём", {
        shape: "box",
        role: "volume",
        group: "Корпус",
        position: [0, body.y1 + total * 0.22, bp.length * 0.02],
        size: [bp.width * 0.86, total * 0.5, cabinL],
        color: shade(bp.primary, 0.06),
        material: "Кабина",
        metalness: bp.metalness,
        roughness: bp.roughness,
      })
    );
    body.y1 += total * 0.45;
  }

  body.halfW = bp.width / 2;
  body.halfL = bp.length / 2;
}

function massPlatform(ctx: Ctx) {
  const { bp, body } = ctx;
  const thickness = Math.max(bp.height * 0.05, 0.02);
  push(
    ctx,
    part(ctx.id(), "Плита", {
      shape: "box",
      role: "volume",
      group: "Основа",
      position: [0, body.y0 + thickness / 2, 0],
      size: [bp.width, thickness, bp.length],
      color: bp.primary,
      material: "Плита",
      metalness: bp.metalness,
      roughness: bp.roughness,
    }),
    part(ctx.id(), "Кромка", {
      shape: "box",
      role: "detail",
      group: "Основа",
      position: [0, body.y0 + thickness * 0.35, bp.length / 2],
      size: [bp.width * 1.01, thickness * 0.7, thickness * 0.8],
      color: shade(bp.primary, -0.16),
      material: "Кромка",
      mirror: "z",
    }),
    part(ctx.id(), "Кромка боковая", {
      shape: "box",
      role: "detail",
      group: "Основа",
      position: [bp.width / 2, body.y0 + thickness * 0.35, 0],
      size: [thickness * 0.8, thickness * 0.7, bp.length * 1.01],
      color: shade(bp.primary, -0.16),
      material: "Кромка",
      mirror: "x",
    })
  );
  body.y1 = body.y0 + thickness;
  body.halfW = bp.width / 2;
  body.halfL = bp.length / 2;
}

function massRadial(ctx: Ctx) {
  const { bp, body } = ctx;
  const total = body.y1 - body.y0;
  const baseR = bp.width * 0.5;

  push(
    ctx,
    part(ctx.id(), "Основание", {
      shape: "cylinder",
      role: "foundation",
      group: "База",
      position: [0, body.y0 + total * 0.05, 0],
      size: [baseR * 1.5, total * 0.1, baseR * 1.5],
      sides: 28,
      color: shade(bp.trim, 0.1),
      material: "Основание",
      metalness: Math.max(bp.metalness, 0.4),
      roughness: 0.4,
    }),
    part(ctx.id(), "Стойка", {
      shape: bp.bodyShape === "sphere" ? "sphere" : "cylinder",
      role: "structure",
      group: "Стойка",
      position: [0, body.y0 + total * 0.5, 0],
      size: [baseR * 0.9, total * 0.85, baseR * 0.9],
      sides: 24,
      color: bp.primary,
      material: "Корпус",
      metalness: bp.metalness,
      roughness: bp.roughness,
    }),
    part(ctx.id(), "Верхний узел", {
      shape: "sphere",
      role: "detail",
      group: "Стойка",
      position: [0, body.y1 - total * 0.04, 0],
      size: [baseR * 1.0, total * 0.16, baseR * 1.0],
      color: shade(bp.primary, 0.1),
      material: "Узел",
      metalness: Math.max(bp.metalness, 0.35),
    })
  );

  body.halfW = baseR;
  body.halfL = baseR;
}

function massShell(ctx: Ctx) {
  const { bp, body } = ctx;
  const wall = Math.max(0.06, Math.min(bp.width, bp.length) * 0.035);
  const h = body.y1 - body.y0;

  push(
    ctx,
    part(ctx.id(), "Пол", {
      shape: "box",
      role: "foundation",
      group: "Помещение",
      position: [0, body.y0 + wall / 2, 0],
      size: [bp.width, wall, bp.length],
      color: shade(bp.secondary, -0.1),
      material: "Пол",
      roughness: 0.85,
    }),
    part(ctx.id(), "Задняя стена", {
      shape: "box",
      role: "wall",
      group: "Стены",
      position: [0, body.y0 + h / 2, -bp.length / 2 + wall / 2],
      size: [bp.width, h, wall],
      color: bp.primary,
      material: "Стена",
      roughness: 0.9,
    }),
    part(ctx.id(), "Боковая стена", {
      shape: "box",
      role: "wall",
      group: "Стены",
      position: [bp.width / 2 - wall / 2, body.y0 + h / 2, 0],
      size: [wall, h, bp.length],
      color: shade(bp.primary, -0.04),
      material: "Стена",
      roughness: 0.9,
      mirror: "x",
    }),
    part(ctx.id(), "Плинтус", {
      shape: "box",
      role: "detail",
      group: "Стены",
      position: [0, body.y0 + wall + h * 0.03, -bp.length / 2 + wall * 1.4],
      size: [bp.width * 0.98, h * 0.045, wall * 0.6],
      color: bp.trim,
      material: "Плинтус",
    }),
    part(ctx.id(), "Плинтус боковой", {
      shape: "box",
      role: "detail",
      group: "Стены",
      position: [bp.width / 2 - wall * 1.4, body.y0 + wall + h * 0.03, 0],
      size: [wall * 0.6, h * 0.045, bp.length * 0.98],
      color: bp.trim,
      material: "Плинтус",
      mirror: "x",
    }),
    part(ctx.id(), "Карниз", {
      shape: "box",
      role: "detail",
      group: "Стены",
      position: [0, body.y1 - h * 0.03, -bp.length / 2 + wall * 1.4],
      size: [bp.width * 0.98, h * 0.035, wall * 0.6],
      color: shade(bp.primary, 0.14),
      material: "Карниз",
    })
  );

  body.halfW = bp.width / 2 - wall;
  body.halfL = bp.length / 2 - wall;
}

/* ================= ground contact ================= */

function addWheels(ctx: Ctx) {
  const { bp, body } = ctx;
  const diameter = bp.height * bp.wheelSize;
  const width = diameter * 0.34;
  const pairs = clamp(Math.round(bp.wheels / 2), 1, 6);
  const y = diameter / 2;
  const x = body.halfW * 0.94;
  const spread = bp.length * 0.34;
  const stepZ = pairs > 1 ? (spread * 2) / (pairs - 1) : 0;

  for (let i = 0; i < pairs; i++) {
    const z = pairs === 1 ? 0 : -spread + stepZ * i;
    push(
      ctx,
      wheelUnit({
        id: ctx.id,
        center: [x, y, z],
        diameter,
        width,
        axis: "x",
        rimColor: bp.metalness > 0.5 ? "#c9ced6" : "#b6bcc4",
        spokes: 5,
        mirror: "x",
        name: `Колесо ${i + 1}`,
      })
    );
    push(
      ctx,
      part(ctx.id(), `Арка ${i + 1}`, {
        shape: "torus",
        role: "detail",
        group: "Кузов",
        position: [x, y + diameter * 0.12, z],
        size: [diameter * 1.22, width * 1.5, diameter * 1.22],
        rotation: [0, 0, Math.PI / 2],
        hole: 0.86,
        sides: 20,
        color: shade(bp.trim, -0.1),
        material: "Арка",
        mirror: "x",
      })
    );
  }

  // Axles tie the wheels into the body instead of leaving them beside it.
  push(
    ctx,
    part(ctx.id(), "Мост", {
      shape: "cylinder",
      role: "structure",
      group: "Шасси",
      position: [0, y, -spread],
      size: [diameter * 0.12, body.halfW * 1.9, diameter * 0.12],
      rotation: [0, 0, Math.PI / 2],
      sides: 12,
      color: "#4a4f57",
      material: "Ось",
      metalness: 0.7,
      ...(pairs > 1 ? { repeat: { count: pairs, step: [0, 0, stepZ] as Vec3 } } : {}),
    })
  );
}

function addTracks(ctx: Ctx) {
  const { bp, body } = ctx;
  const height = bp.height * 0.34;
  const x = body.halfW * 0.92;

  push(
    ctx,
    part(ctx.id(), "Гусеничная лента", {
      shape: "box",
      role: "wheel",
      group: "Ходовая",
      position: [x, height / 2, 0],
      size: [bp.width * 0.2, height, bp.length * 0.94],
      color: "#26282c",
      material: "Гусеница",
      roughness: 0.95,
      mirror: "x",
    }),
    part(ctx.id(), "Трак", {
      shape: "box",
      role: "detail",
      group: "Ходовая",
      position: [x, height * 0.04, -bp.length * 0.44],
      size: [bp.width * 0.23, height * 0.09, bp.length * 0.05],
      color: "#3a3d42",
      material: "Трак",
      mirror: "x",
      repeat: { count: 14, step: [0, 0, (bp.length * 0.88) / 13] },
    }),
    part(ctx.id(), "Каток", {
      shape: "cylinder",
      role: "wheel",
      group: "Ходовая",
      position: [x, height * 0.42, -bp.length * 0.34],
      size: [height * 0.5, bp.width * 0.14, height * 0.5],
      rotation: [0, 0, Math.PI / 2],
      sides: 16,
      color: "#565b62",
      material: "Каток",
      metalness: 0.6,
      mirror: "x",
      repeat: { count: 5, step: [0, 0, (bp.length * 0.68) / 4] },
    })
  );
}

function addLegs(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.legs, 1, 8);
  const pairs = Math.max(1, Math.round(count / 2));
  const legLength = body.y0;
  if (legLength <= 0.01) return;

  const thickness = Math.min(body.halfW * 0.42, legLength * 0.3);
  const x = body.halfW * (count === 2 ? 0.45 : 0.68);
  const spread = pairs > 1 ? body.halfL * 0.72 : 0;
  const stepZ = pairs > 1 ? (spread * 2) / (pairs - 1) : 0;
  const mech = bp.legStyle === "mech";
  const skin = mech ? shade(bp.secondary, 0.05) : bp.secondary;
  const repeat = pairs > 1 ? { count: pairs, step: [0, 0, stepZ] as Vec3 } : undefined;
  const common = { group: "Ноги", mirror: "x" as const, ...(repeat ? { repeat } : {}) };
  const z0 = -spread;

  push(
    ctx,
    part(ctx.id(), "Бедро", {
      shape: mech ? "box" : "capsule",
      role: "limb",
      position: [x, body.y0 - legLength * 0.24, z0],
      size: [thickness, legLength * 0.56, thickness],
      rotation: [0, 0, count === 2 ? 0 : 0.12],
      color: skin,
      material: mech ? "Привод" : "Тело",
      metalness: mech ? 0.6 : bp.metalness,
      ...common,
    }),
    part(ctx.id(), "Колено", {
      shape: "sphere",
      role: "limb",
      position: [x, body.y0 - legLength * 0.5, z0],
      size: [thickness * 1.08, thickness * 1.08, thickness * 1.08],
      color: mech ? "#4a4f57" : shade(skin, -0.08),
      material: mech ? "Шарнир" : "Сустав",
      metalness: mech ? 0.75 : bp.metalness,
      ...common,
    }),
    part(ctx.id(), "Голень", {
      shape: mech ? "cylinder" : "capsule",
      role: "limb",
      position: [x, body.y0 - legLength * 0.74, z0],
      size: [thickness * 0.82, legLength * 0.5, thickness * 0.82],
      color: skin,
      material: mech ? "Привод" : "Тело",
      metalness: mech ? 0.6 : bp.metalness,
      ...common,
    }),
    part(ctx.id(), "Стопа", {
      shape: "box",
      role: "foot",
      position: [x, legLength * 0.045, z0 + thickness * 0.5],
      size: [thickness * 1.1, legLength * 0.09, thickness * 2.3],
      color: mech ? "#3a3d42" : shade(skin, -0.18),
      material: mech ? "Опора" : "Лапа",
      ...common,
    }),
    part(ctx.id(), "Палец", {
      shape: "capsule",
      role: "detail",
      position: [x - thickness * 0.32, legLength * 0.05, z0 + thickness * 1.5],
      size: [thickness * 0.28, thickness * 0.6, thickness * 0.28],
      rotation: [Math.PI / 2, 0, 0],
      color: mech ? "#2f3237" : shade(skin, -0.24),
      material: "Палец",
      group: "Ноги",
      mirror: "x",
      repeat: { count: 3, step: [thickness * 0.32, 0, 0] },
    })
  );
}

function addFurnitureLegs(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.furnitureLegs, 3, 8);
  const height = body.y0;
  if (height <= 0.01) return;

  const thickness = Math.min(bp.width, bp.length) * 0.07;
  const inset = thickness * 1.4;
  const x = bp.width / 2 - inset;
  const z = bp.length / 2 - inset;
  const style = bp.metalness > 0.5 ? "metal" : bp.roughness > 0.8 ? "turned" : "square";

  push(
    ctx,
    furnitureLeg({
      id: ctx.id,
      foot: [x, 0, z],
      height,
      thickness,
      color: shade(bp.primary, -0.2),
      style,
      mirror: "xz",
    })
  );

  if (count > 4) {
    push(
      ctx,
      furnitureLeg({
        id: ctx.id,
        foot: [x, 0, 0],
        height,
        thickness: thickness * 0.9,
        color: shade(bp.primary, -0.2),
        style,
        mirror: "x",
        name: "Средняя ножка",
      })
    );
  }

  // Aprons: the rails that stop four sticks from reading as four sticks.
  push(
    ctx,
    part(ctx.id(), "Царга", {
      shape: "box",
      role: "structure",
      group: "Каркас",
      position: [0, height * 0.86, z + inset * 0.35],
      size: [bp.width * 0.9, height * 0.13, thickness * 0.7],
      color: shade(bp.primary, -0.12),
      material: "Царга",
      mirror: "z",
    }),
    part(ctx.id(), "Царга боковая", {
      shape: "box",
      role: "structure",
      group: "Каркас",
      position: [x + inset * 0.35, height * 0.86, 0],
      size: [thickness * 0.7, height * 0.13, bp.length * 0.9],
      color: shade(bp.primary, -0.12),
      material: "Царга",
      mirror: "x",
    }),
    part(ctx.id(), "Проножка", {
      shape: "cylinder",
      role: "structure",
      group: "Каркас",
      position: [x, height * 0.24, 0],
      size: [thickness * 0.45, bp.length * 0.86, thickness * 0.45],
      rotation: [Math.PI / 2, 0, 0],
      sides: 10,
      color: shade(bp.primary, -0.24),
      material: "Проножка",
      mirror: "x",
    })
  );
}

function addHull(ctx: Ctx) {
  const { bp, body } = ctx;
  push(
    ctx,
    // A prism turned 180° about z is a V-bottom: the ridge ends up underneath.
    part(ctx.id(), "Днище", {
      shape: "prism",
      role: "foundation",
      group: "Корпус",
      position: [0, body.y0 * 0.55, 0],
      size: [bp.width * 0.96, body.y0 * 1.1, bp.length * 0.98],
      rotation: [0, 0, Math.PI],
      color: shade(bp.primary, -0.2),
      material: "Днище",
      roughness: 0.7,
    }),
    part(ctx.id(), "Носовой обвод", {
      shape: "cone",
      role: "detail",
      group: "Корпус",
      position: [0, body.y0 * 0.9, bp.length * 0.5],
      size: [bp.width * 0.6, bp.length * 0.16, bp.width * 0.6],
      rotation: [Math.PI / 2, 0, 0],
      color: shade(bp.primary, -0.1),
      material: "Обвод",
    }),
    part(ctx.id(), "Привальный брус", {
      shape: "box",
      role: "detail",
      group: "Корпус",
      position: [bp.width / 2, body.y0 * 1.4, 0],
      size: [bp.width * 0.03, bp.height * 0.05, bp.length * 0.92],
      color: bp.trim,
      material: "Брус",
      mirror: "x",
    })
  );
}

function addSkids(ctx: Ctx) {
  const { bp, body } = ctx;
  const h = body.y0 > 0.01 ? body.y0 : bp.height * 0.22;
  push(
    ctx,
    part(ctx.id(), "Лыжа", {
      shape: "box",
      role: "structure",
      group: "Шасси",
      position: [bp.width * 0.3, h * 0.06, 0],
      size: [bp.width * 0.05, h * 0.12, bp.length * 0.8],
      color: "#3a3d42",
      material: "Лыжа",
      metalness: 0.6,
      mirror: "x",
    }),
    part(ctx.id(), "Стойка шасси", {
      shape: "cylinder",
      role: "structure",
      group: "Шасси",
      position: [bp.width * 0.3, h * 0.5, bp.length * 0.2],
      size: [bp.width * 0.035, h, bp.width * 0.035],
      rotation: [0, 0, 0.18],
      sides: 10,
      color: "#4a4f57",
      material: "Стойка",
      metalness: 0.65,
      mirror: "xz",
    })
  );
}

/* ================= anatomy ================= */

function headAnchor(ctx: Ctx): { center: Vec3; size: number } {
  const { bp, body } = ctx;
  const size = Math.min(bp.width, bp.height) * (ctx.upright ? 0.26 : 0.42) * (bp.headSize / 0.24);
  const center: Vec3 = ctx.upright
    ? [0, body.y1 + size * 0.62 + bp.height * bp.neck * 0.12, 0]
    : [0, body.y1 - (body.y1 - body.y0) * 0.1 + bp.height * bp.neck * 0.4, body.halfL + size * 0.45];
  return { center, size };
}

function addHead(ctx: Ctx) {
  const { bp, body } = ctx;
  const { center, size } = headAnchor(ctx);
  const skin = bp.secondary;

  // Neck first, so the head never floats off the body.
  const neckLength = Math.max(size * 0.35, bp.height * bp.neck * 0.5);
  const neckDir: Vec3 = ctx.upright ? [0, 1, 0] : [0, 0.45, 1];
  push(
    ctx,
    taperedChain({
      id: ctx.id,
      group: "Шея",
      name: "Шея",
      start: ctx.upright
        ? [0, body.y1 - size * 0.1, 0]
        : [0, body.y1 - (body.y1 - body.y0) * 0.25, body.halfL * 0.7],
      direction: neckDir,
      segments: bp.neck > 0.6 ? 5 : 2,
      segmentLength: neckLength / (bp.neck > 0.6 ? 4 : 2),
      startRadius: size * 0.3,
      endRadius: size * 0.24,
      color: skin,
      material: "Шея",
      role: "structure",
    })
  );

  push(
    ctx,
    part(ctx.id(), "Голова", {
      shape: "sphere",
      role: "head",
      group: "Голова",
      position: center,
      size: [size, size * 1.04, size * (bp.muzzle > 0.6 ? 1.1 : 0.96)],
      color: skin,
      material: "Голова",
      metalness: bp.legStyle === "mech" ? 0.6 : bp.metalness,
      roughness: bp.legStyle === "mech" ? 0.35 : bp.roughness,
    })
  );

  if (bp.muzzle > 0.05) {
    const snout = size * clamp(bp.muzzle, 0.1, 1.6);
    push(
      ctx,
      part(ctx.id(), "Морда", {
        shape: bp.muzzle > 0.9 ? "capsule" : "box",
        role: "detail",
        group: "Голова",
        position: [center[0], center[1] - size * 0.12, center[2] + size * 0.42 + snout * 0.32],
        size: [size * 0.46, size * 0.4, snout * 0.75],
        rotation: bp.muzzle > 0.9 ? [Math.PI / 2, 0, 0] : [0, 0, 0],
        color: shade(skin, -0.06),
        material: "Морда",
      }),
      part(ctx.id(), "Нос", {
        shape: "sphere",
        role: "detail",
        group: "Голова",
        position: [center[0], center[1] - size * 0.08, center[2] + size * 0.42 + snout * 0.68],
        size: [size * 0.16, size * 0.13, size * 0.12],
        color: "#2a2c31",
        material: "Нос",
        roughness: 0.4,
      })
    );
  }

  if (bp.eyes > 0) {
    const pairs = clamp(Math.round(bp.eyes / 2), 1, 4);
    push(
      ctx,
      part(ctx.id(), "Глаз", {
        shape: "sphere",
        role: "detail",
        group: "Голова",
        position: [size * 0.24, center[1] + size * 0.1, center[2] + size * 0.38],
        size: [size * 0.2, size * 0.2, size * 0.14],
        color: "#f4f1ea",
        material: "Глаз",
        roughness: 0.15,
        mirror: "x",
        ...(pairs > 1 ? { repeat: { count: pairs, step: [0, -size * 0.16, 0] as Vec3 } } : {}),
      }),
      part(ctx.id(), "Зрачок", {
        shape: "sphere",
        role: "detail",
        group: "Голова",
        position: [size * 0.25, center[1] + size * 0.1, center[2] + size * 0.44],
        size: [size * 0.1, size * 0.12, size * 0.06],
        color: bp.emissiveAccent ? bp.accent : "#1b1d21",
        material: "Зрачок",
        ...(bp.emissiveAccent ? { emissive: 0.8 } : {}),
        mirror: "x",
        ...(pairs > 1 ? { repeat: { count: pairs, step: [0, -size * 0.16, 0] as Vec3 } } : {}),
      })
    );
  }

  if (bp.ears !== "none") {
    const earShape = bp.ears === "pointed" ? "cone" : bp.ears === "fin" ? "wedge" : "sphere";
    const earHeight = size * (bp.ears === "long" ? 0.95 : bp.ears === "pointed" ? 0.48 : 0.28);
    push(
      ctx,
      part(ctx.id(), "Ухо", {
        shape: earShape,
        role: "detail",
        group: "Голова",
        position: [size * 0.34, center[1] + size * (0.42 + earHeight / size / 2.4), center[2] - size * 0.05],
        size: [size * 0.26, earHeight, size * 0.16],
        rotation: [0, 0, -0.18],
        color: shade(skin, -0.1),
        material: "Ухо",
        mirror: "x",
      }),
      part(ctx.id(), "Ушная раковина", {
        shape: earShape,
        role: "detail",
        group: "Голова",
        position: [size * 0.34, center[1] + size * (0.4 + earHeight / size / 2.6), center[2] + size * 0.01],
        size: [size * 0.14, earHeight * 0.7, size * 0.08],
        rotation: [0, 0, -0.18],
        color: bp.accent,
        material: "Раковина",
        mirror: "x",
      })
    );
  }

  if (bp.horns > 0) {
    const count = clamp(bp.horns, 1, 8);
    const perSide = Math.max(1, Math.round(count / 2));
    push(
      ctx,
      part(ctx.id(), "Рог", {
        shape: "cone",
        role: "detail",
        group: "Голова",
        position: [size * 0.3, center[1] + size * 0.55, center[2] - size * 0.1],
        size: [size * 0.18, size * 0.7, size * 0.18],
        rotation: [-0.5, 0, -0.22],
        color: "#d9cbb2",
        material: "Рог",
        roughness: 0.6,
        mirror: "x",
        ...(perSide > 1 ? { repeat: { count: perSide, step: [0, 0, -size * 0.22] as Vec3 } } : {}),
      })
    );
  }

  if (bp.mane) {
    push(
      ctx,
      part(ctx.id(), "Грива", {
        shape: "capsule",
        role: "detail",
        group: "Голова",
        position: [0, center[1] + size * 0.1, center[2] - size * 0.55],
        size: [size * 0.9, size * 1.25, size * 0.55],
        color: shade(bp.accent, -0.2),
        material: "Грива",
        roughness: 0.9,
      })
    );
  }

  if (bp.hair > 0) {
    const strands = clamp(3 + bp.hair * 2, 3, 12);
    push(
      ctx,
      part(ctx.id(), "Волосы", {
        shape: "sphere",
        role: "detail",
        group: "Волосы",
        position: [center[0], center[1] + size * 0.16, center[2] - size * 0.06],
        size: [size * 1.12, size * 0.95, size * 1.1],
        color: bp.accent,
        material: "Волосы",
        roughness: 0.85,
      }),
      part(ctx.id(), "Прядь", {
        shape: "capsule",
        role: "detail",
        group: "Волосы",
        position: [size * 0.5, center[1] - size * (bp.hair > 2 ? 0.75 : 0.25), center[2] - size * 0.3],
        size: [size * 0.2, size * (bp.hair > 2 ? 1.7 : 0.8), size * 0.2],
        color: shade(bp.accent, -0.05),
        material: "Волосы",
        mirror: "x",
        repeat: { count: Math.round(strands / 2), step: [-size * 0.16, 0, -size * 0.06] },
      })
    );
  }
}

function addArms(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.arms, 1, 8);
  const pairs = Math.max(1, Math.round(count / 2));
  const span = body.y1 - body.y0;
  const shoulderY = body.y1 - span * 0.12;
  const armLength = span * 0.92;
  const thickness = Math.min(body.halfW * 0.34, armLength * 0.16);
  const x = body.halfW * 1.02;
  const mech = bp.legStyle === "mech";
  const skin = bp.secondary;
  const repeat = pairs > 1 ? { count: pairs, step: [0, -span * 0.22, 0] as Vec3 } : undefined;
  const common = { group: "Руки", mirror: "x" as const, ...(repeat ? { repeat } : {}) };

  push(
    ctx,
    part(ctx.id(), "Плечо", {
      shape: mech ? "box" : "sphere",
      role: "limb",
      position: [x, shoulderY, 0],
      size: [thickness * 1.35, thickness * 1.35, thickness * 1.35],
      color: bp.armour ? shade(bp.primary, 0.1) : skin,
      material: bp.armour ? "Наплечник" : "Плечо",
      metalness: mech || bp.armour ? 0.65 : bp.metalness,
      ...common,
    }),
    part(ctx.id(), "Плечевая часть", {
      shape: mech ? "cylinder" : "capsule",
      role: "limb",
      position: [x + thickness * 0.1, shoulderY - armLength * 0.26, 0],
      size: [thickness, armLength * 0.5, thickness],
      rotation: [0, 0, 0.08],
      color: skin,
      material: "Рука",
      metalness: mech ? 0.6 : bp.metalness,
      ...common,
    }),
    part(ctx.id(), "Локоть", {
      shape: "sphere",
      role: "limb",
      position: [x + thickness * 0.18, shoulderY - armLength * 0.5, 0],
      size: [thickness * 0.94, thickness * 0.94, thickness * 0.94],
      color: mech ? "#4a4f57" : shade(skin, -0.08),
      material: mech ? "Шарнир" : "Локоть",
      metalness: mech ? 0.75 : bp.metalness,
      ...common,
    }),
    part(ctx.id(), "Предплечье", {
      shape: mech ? "cylinder" : "capsule",
      role: "limb",
      position: [x + thickness * 0.26, shoulderY - armLength * 0.74, 0],
      size: [thickness * 0.86, armLength * 0.46, thickness * 0.86],
      rotation: [0, 0, 0.08],
      color: skin,
      material: "Предплечье",
      metalness: mech ? 0.6 : bp.metalness,
      ...common,
    })
  );

  if (bp.hands) {
    push(
      ctx,
      part(ctx.id(), "Кисть", {
        shape: "box",
        role: "limb",
        position: [x + thickness * 0.34, shoulderY - armLength * 0.98, 0],
        size: [thickness * 0.8, thickness * 1.1, thickness * 0.5],
        color: skin,
        material: "Кисть",
        ...common,
      }),
      part(ctx.id(), "Палец", {
        shape: "capsule",
        role: "detail",
        group: "Руки",
        position: [x + thickness * 0.2, shoulderY - armLength * 1.1, 0],
        size: [thickness * 0.16, thickness * 0.52, thickness * 0.16],
        color: shade(skin, -0.05),
        material: "Палец",
        mirror: "x",
        repeat: { count: 4, step: [thickness * 0.19, 0, 0] },
      })
    );
  }
}

function addWings(ctx: Ctx) {
  const { bp, body } = ctx;
  const pairs = clamp(Math.round(bp.wings / 2), 1, 4);
  const span = Math.max(bp.width, bp.length) * (bp.wingKind === "fixed" ? 1.5 : 1.1);
  const y = body.y1 - (body.y1 - body.y0) * 0.18;
  const chord = bp.length * (bp.wingKind === "fixed" ? 0.28 : 0.55);
  const repeat = pairs > 1 ? { count: pairs, step: [0, 0, -chord * 0.9] as Vec3 } : undefined;
  const common = { group: "Крылья", mirror: "x" as const, ...(repeat ? { repeat } : {}) };

  if (bp.wingKind === "fixed") {
    push(
      ctx,
      part(ctx.id(), "Крыло", {
        shape: "box",
        role: "limb",
        position: [span * 0.36, y, -bp.length * 0.02],
        size: [span * 0.72, bp.height * 0.035, chord],
        rotation: [0, 0, 0.05],
        color: shade(bp.primary, -0.06),
        material: "Крыло",
        metalness: bp.metalness,
        ...common,
      }),
      part(ctx.id(), "Закрылок", {
        shape: "box",
        role: "detail",
        position: [span * 0.36, y - bp.height * 0.01, -chord * 0.55],
        size: [span * 0.6, bp.height * 0.02, chord * 0.22],
        color: bp.trim,
        material: "Закрылок",
        ...common,
      }),
      part(ctx.id(), "Законцовка", {
        shape: "box",
        role: "detail",
        position: [span * 0.72, y + bp.height * 0.04, 0],
        size: [bp.height * 0.02, bp.height * 0.12, chord * 0.55],
        color: bp.accent,
        material: "Законцовка",
        ...common,
      })
    );
    return;
  }

  const membrane = bp.wingKind === "membrane";
  push(
    ctx,
    part(ctx.id(), membrane ? "Перепонка" : "Маховые перья", {
      shape: membrane ? "wedge" : "box",
      role: "limb",
      position: [span * 0.42, y + bp.height * 0.12, -chord * 0.1],
      size: [span * 0.8, bp.height * 0.5, chord],
      rotation: [0, 0, membrane ? -0.35 : -0.2],
      color: membrane ? shade(bp.accent, -0.15) : shade(bp.primary, -0.1),
      material: membrane ? "Перепонка" : "Перо",
      roughness: 0.85,
      ...common,
    }),
    part(ctx.id(), "Кость крыла", {
      shape: "capsule",
      role: "structure",
      position: [span * 0.38, y + bp.height * 0.2, chord * 0.16],
      size: [span * 0.78, bp.height * 0.05, bp.height * 0.05],
      rotation: [0, 0, Math.PI / 2 - 0.3],
      color: shade(bp.secondary, -0.1),
      material: "Кость",
      ...common,
    }),
    part(ctx.id(), "Фаланга", {
      shape: "capsule",
      role: "structure",
      position: [span * 0.55, y + bp.height * 0.04, -chord * 0.28],
      size: [span * 0.4, bp.height * 0.035, bp.height * 0.035],
      rotation: [0, 0.5, Math.PI / 2 - 0.15],
      color: shade(bp.secondary, -0.16),
      material: "Фаланга",
      group: "Крылья",
      mirror: "x",
      repeat: { count: 3, step: [0, -bp.height * 0.06, -chord * 0.16] },
    })
  );
}

function addTail(ctx: Ctx) {
  const { bp, body } = ctx;
  const segments = clamp(bp.tail, 2, 16);
  const thickness = Math.min(body.halfW, body.halfL) * 0.34;
  const start: Vec3 = [0, body.y0 + (body.y1 - body.y0) * 0.55, -body.halfL * 0.9];

  push(
    ctx,
    taperedChain({
      id: ctx.id,
      group: "Хвост",
      name: "Хвост",
      start,
      direction: [0, 0.35, -1],
      segments,
      segmentLength: (bp.length * 0.7) / segments,
      startRadius: thickness,
      endRadius: thickness * 0.16,
      curve: -0.12,
      color: bp.secondary,
      material: "Хвост",
    })
  );

  if (bp.tailSpikes) {
    push(
      ctx,
      part(ctx.id(), "Шип хвоста", {
        shape: "cone",
        role: "detail",
        group: "Хвост",
        position: [0, body.y0 + (body.y1 - body.y0) * 0.72, -body.halfL * 1.2],
        size: [thickness * 0.4, thickness * 0.9, thickness * 0.4],
        color: bp.trim,
        material: "Шип",
        repeat: { count: Math.min(8, segments), step: [0, bp.length * 0.02, -(bp.length * 0.62) / segments] },
      })
    );
  }
}

function addSpikes(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.spikes, 2, 24);
  const size = Math.min(body.halfW, body.halfL) * 0.32;
  push(
    ctx,
    part(ctx.id(), "Гребень", {
      shape: "cone",
      role: "detail",
      group: "Гребень",
      position: [0, body.y1 + size * 0.35, body.halfL * 0.7],
      size: [size * 0.35, size * 1.1, size * 0.5],
      color: bp.trim,
      material: "Шип",
      repeat: { count, step: [0, 0, -(body.halfL * 1.5) / count] },
    })
  );
}

function addFins(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.fins, 1, 8);
  const size = Math.min(body.halfW, body.halfL);

  push(
    ctx,
    part(ctx.id(), "Спинной плавник", {
      shape: "wedge",
      role: "limb",
      group: "Плавники",
      position: [0, body.y1 + size * 0.35, 0],
      size: [size * 0.12, size * 0.8, size * 1.1],
      rotation: [0, 0, 0],
      color: shade(bp.primary, -0.16),
      material: "Плавник",
    })
  );

  if (count > 1) {
    push(
      ctx,
      part(ctx.id(), "Боковой плавник", {
        shape: "wedge",
        role: "limb",
        group: "Плавники",
        position: [body.halfW * 0.9, body.y0 + (body.y1 - body.y0) * 0.4, body.halfL * 0.1],
        size: [size * 0.7, size * 0.1, size * 0.55],
        rotation: [0, 0.4, -0.3],
        color: shade(bp.primary, -0.1),
        material: "Плавник",
        mirror: "x",
        ...(count > 3 ? { repeat: { count: Math.floor(count / 2), step: [0, 0, -size * 0.7] as Vec3 } } : {}),
      })
    );
  }
}

/* ================= architecture ================= */

function addWindows(ctx: Ctx) {
  const { bp, body } = ctx;
  const levels = Math.max(1, bp.floors || 1);
  const perLevel = clamp(Math.ceil(bp.windows / levels), 1, 14);
  const span = body.y1 - body.y0;
  const levelHeight = span / levels;
  const frameColor = shade(bp.trim, 0.35);
  const glass = bp.glassy ? "#a7d8f5" : "#8ecbf0";

  const usable = bp.width * 0.86;
  const step = usable / perLevel;
  const windowWidth = step * (bp.windowStyle === "curtain" ? 0.94 : 0.62);
  const windowHeight = levelHeight * (bp.windowStyle === "curtain" ? 0.78 : 0.5);

  for (let level = 0; level < Math.min(levels, 12); level++) {
    const y = body.y0 + levelHeight * (level + 0.55);
    push(
      ctx,
      windowUnit({
        id: ctx.id,
        group: "Фасад",
        name: `Окно ${level + 1}`,
        center: [-usable / 2 + step / 2, y, body.halfL],
        width: windowWidth,
        height: windowHeight,
        facing: "front",
        frameColor,
        glassColor: glass,
        mullions: bp.windowStyle === "curtain" ? 2 : 1,
        transom: bp.windowStyle !== "punched",
        sill: bp.windowStyle === "punched",
        shutters: bp.detail > 1.3 && bp.windowStyle === "punched" && levels <= 2,
        repeat: { count: perLevel, step: [step, 0, 0] },
      })
    );

    // The back and the sides get glazing too, at a lower density.
    if (bp.detail > 0.9) {
      const sideCount = clamp(Math.round((bp.length * 0.8) / step), 1, 10);
      push(
        ctx,
        windowUnit({
          id: ctx.id,
          group: "Фасад",
          name: `Окно бок ${level + 1}`,
          center: [body.halfW, y, -bp.length * 0.4 + step / 2],
          width: windowWidth,
          height: windowHeight,
          facing: "right",
          frameColor,
          glassColor: glass,
          mullions: 1,
          sill: bp.windowStyle === "punched",
          mirror: "x",
          repeat: { count: sideCount, step: [0, 0, step] },
        })
      );
    }
  }
}

function addDoors(ctx: Ctx) {
  const { bp, body } = ctx;
  const span = body.y1 - body.y0;
  const height = Math.min(span * 0.72, bp.height * 0.3);
  const width = Math.min(bp.width * 0.2, height * 0.62);

  if (bp.shelves > 0 || bp.drawers > 0) {
    // Cabinet doors: full-height leaves on the front of the carcass.
    const leaves = clamp(bp.doors, 1, 4);
    const leafWidth = (bp.width * 0.96) / leaves;
    push(
      ctx,
      part(ctx.id(), "Фасад дверцы", {
        shape: "box",
        role: "door",
        group: "Фасады",
        position: [-bp.width * 0.48 + leafWidth / 2, body.y0 + span * 0.5, body.halfL + bp.length * 0.02],
        size: [leafWidth * 0.97, span * 0.96, bp.length * 0.04],
        color: shade(bp.primary, 0.06),
        material: "Фасад",
        roughness: bp.roughness,
        repeat: { count: leaves, step: [leafWidth, 0, 0] },
      })
    );
    return;
  }

  push(
    ctx,
    doorUnit({
      id: ctx.id,
      group: "Вход",
      center: [0, body.y0 + height / 2, body.halfL],
      width,
      height,
      facing: "front",
      leafColor: shade(bp.accent, -0.1),
      frameColor: shade(bp.trim, 0.3),
      double: bp.doors > 1 || bp.floors > 2,
      glazed: bp.floors > 0,
    })
  );

  if (bp.floors > 0) {
    push(
      ctx,
      part(ctx.id(), "Козырёк входа", {
        shape: "box",
        role: "roof",
        group: "Вход",
        position: [0, body.y0 + height * 1.12, body.halfL + width * 0.5],
        size: [width * 2.2, height * 0.06, width * 1.3],
        color: bp.trim,
        material: "Козырёк",
      }),
      part(ctx.id(), "Подкос козырька", {
        shape: "cylinder",
        role: "structure",
        group: "Вход",
        position: [width * 0.85, body.y0 + height * 0.85, body.halfL + width * 0.3],
        size: [width * 0.05, height * 0.5, width * 0.05],
        rotation: [0.5, 0, 0],
        sides: 8,
        color: bp.trim,
        material: "Подкос",
        mirror: "x",
      })
    );
  }
}

function addRoof(ctx: Ctx) {
  const { bp, body } = ctx;
  const overhang = Math.min(bp.width, bp.length) * bp.roofOverhang * 0.25;
  const w = bp.width + overhang * 2;
  const l = bp.length + overhang * 2;
  const rise = bp.height - body.y1;
  const roofColor = shade(bp.trim, -0.05);
  const base = body.y1;

  const eaves = () =>
    push(
      ctx,
      part(ctx.id(), "Карнизная доска", {
        shape: "box",
        role: "detail",
        group: "Крыша",
        position: [0, base + rise * 0.03, l / 2],
        size: [w, Math.max(0.04, rise * 0.09), Math.max(0.03, overhang * 0.4)],
        color: shade(roofColor, 0.2),
        material: "Карниз",
        mirror: "z",
      }),
      part(ctx.id(), "Водосточный жёлоб", {
        shape: "tube",
        role: "detail",
        group: "Крыша",
        position: [0, base - rise * 0.02, l / 2 + overhang * 0.1],
        // y is the axis of every round primitive; the rotation then lays it along x.
        size: [Math.max(0.05, rise * 0.08), w * 0.98, Math.max(0.05, rise * 0.08)],
        rotation: [0, 0, Math.PI / 2],
        hole: 0.7,
        sides: 12,
        color: "#8f9299",
        material: "Жёлоб",
        metalness: 0.6,
        mirror: "z",
      }),
      part(ctx.id(), "Водосточная труба", {
        shape: "cylinder",
        role: "detail",
        group: "Крыша",
        position: [bp.width * 0.46, body.y0 + (base - body.y0) * 0.5, l / 2 - overhang * 0.5],
        size: [Math.max(0.05, rise * 0.07), base - body.y0, Math.max(0.05, rise * 0.07)],
        sides: 10,
        color: "#8f9299",
        material: "Труба",
        metalness: 0.6,
        mirror: "xz",
      })
    );

  switch (bp.roof) {
    case "flat":
      push(
        ctx,
        part(ctx.id(), "Кровля", {
          shape: "box",
          role: "roof",
          group: "Крыша",
          position: [0, base + Math.max(0.05, rise * 0.2), 0],
          size: [w, Math.max(0.08, rise * 0.4), l],
          color: roofColor,
          material: "Кровля",
          roughness: 0.85,
        }),
        part(ctx.id(), "Парапет", {
          shape: "box",
          role: "detail",
          group: "Крыша",
          position: [0, base + Math.max(0.16, rise * 0.62), l / 2 - overhang * 0.3],
          size: [w, Math.max(0.12, rise * 0.5), Math.max(0.06, overhang * 0.5)],
          color: shade(roofColor, 0.18),
          material: "Парапет",
          mirror: "z",
        }),
        part(ctx.id(), "Парапет боковой", {
          shape: "box",
          role: "detail",
          group: "Крыша",
          position: [w / 2 - overhang * 0.3, base + Math.max(0.16, rise * 0.62), 0],
          size: [Math.max(0.06, overhang * 0.5), Math.max(0.12, rise * 0.5), l],
          color: shade(roofColor, 0.18),
          material: "Парапет",
          mirror: "x",
        })
      );
      break;

    case "shed":
      push(
        ctx,
        part(ctx.id(), "Односкатная кровля", {
          shape: "wedge",
          role: "roof",
          group: "Крыша",
          position: [0, base + rise / 2, 0],
          size: [w, rise, l],
          color: roofColor,
          material: "Кровля",
          roughness: 0.8,
        })
      );
      eaves();
      break;

    case "hip":
      push(
        ctx,
        part(ctx.id(), "Вальмовая кровля", {
          shape: "pyramid",
          role: "roof",
          group: "Крыша",
          position: [0, base + rise / 2, 0],
          size: [w, rise, l],
          color: roofColor,
          material: "Кровля",
          roughness: 0.8,
        })
      );
      eaves();
      break;

    case "dome":
      push(
        ctx,
        part(ctx.id(), "Купол", {
          shape: "sphere",
          role: "roof",
          group: "Крыша",
          position: [0, base, 0],
          size: [w * 0.96, rise * 2, l * 0.96],
          color: roofColor,
          material: "Купол",
          metalness: 0.4,
          roughness: 0.4,
        }),
        part(ctx.id(), "Рёбра купола", {
          shape: "box",
          role: "detail",
          group: "Крыша",
          position: [0, base + rise * 0.45, 0],
          size: [w * 0.98, rise * 0.9, Math.max(0.04, w * 0.02)],
          rotation: [0, 0, 0],
          color: shade(roofColor, 0.25),
          material: "Ребро",
          repeat: { count: 6, step: [0, 0, 0], rotationStep: [0, Math.PI / 6, 0] },
        }),
        part(ctx.id(), "Барабан", {
          shape: "cylinder",
          role: "structure",
          group: "Крыша",
          position: [0, base - rise * 0.08, 0],
          size: [w * 0.9, rise * 0.24, l * 0.9],
          sides: 24,
          color: shade(bp.primary, 0.08),
          material: "Барабан",
        })
      );
      break;

    case "mansard":
      push(
        ctx,
        part(ctx.id(), "Нижний скат", {
          shape: "prism",
          role: "roof",
          group: "Крыша",
          position: [0, base + rise * 0.28, 0],
          size: [w, rise * 0.56, l],
          color: roofColor,
          material: "Кровля",
        }),
        part(ctx.id(), "Верхний скат", {
          shape: "prism",
          role: "roof",
          group: "Крыша",
          position: [0, base + rise * 0.72, 0],
          size: [w * 0.62, rise * 0.5, l],
          color: shade(roofColor, -0.08),
          material: "Кровля",
        }),
        part(ctx.id(), "Мансардное окно", {
          shape: "box",
          role: "window",
          group: "Крыша",
          position: [-w * 0.22, base + rise * 0.42, l * 0.3],
          size: [w * 0.16, rise * 0.3, l * 0.14],
          color: "#8ecbf0",
          material: "Стекло",
          opacity: 0.45,
          repeat: { count: 2, step: [w * 0.44, 0, 0] },
        })
      );
      eaves();
      break;

    case "gable":
    default:
      push(
        ctx,
        part(ctx.id(), "Двускатная кровля", {
          shape: "prism",
          role: "roof",
          group: "Крыша",
          position: [0, base + rise / 2, 0],
          size: [w, rise, l],
          color: roofColor,
          material: "Кровля",
          roughness: 0.8,
        }),
        part(ctx.id(), "Конёк", {
          shape: "box",
          role: "detail",
          group: "Крыша",
          position: [0, base + rise * 0.99, 0],
          size: [Math.max(0.08, w * 0.03), Math.max(0.05, rise * 0.09), l * 1.01],
          color: shade(roofColor, 0.28),
          material: "Конёк",
        }),
        part(ctx.id(), "Фронтон", {
          shape: "prism",
          role: "wall",
          group: "Крыша",
          position: [0, base + rise / 2, l / 2 - overhang],
          size: [bp.width, rise * 0.98, Math.max(0.04, overhang * 0.5)],
          color: shade(bp.primary, 0.06),
          material: "Фронтон",
          mirror: "z",
        })
      );
      eaves();
      break;
  }
}

function addChimneys(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.chimneys, 1, 4);
  const size = Math.min(bp.width, bp.length) * 0.09;
  const y = bp.height - (bp.height - body.y1) * 0.1;

  push(
    ctx,
    part(ctx.id(), "Дымоход", {
      shape: "box",
      role: "detail",
      group: "Крыша",
      position: [bp.width * 0.26, y, -bp.length * 0.14],
      size: [size, bp.height * 0.2, size],
      color: shade(bp.trim, 0.05),
      material: "Дымоход",
      roughness: 0.9,
      ...(count > 1 ? { repeat: { count, step: [-bp.width * 0.24, 0, 0] as Vec3 } } : {}),
    }),
    part(ctx.id(), "Оголовок", {
      shape: "box",
      role: "detail",
      group: "Крыша",
      position: [bp.width * 0.26, y + bp.height * 0.11, -bp.length * 0.14],
      size: [size * 1.35, bp.height * 0.022, size * 1.35],
      color: shade(bp.trim, 0.25),
      material: "Оголовок",
      ...(count > 1 ? { repeat: { count, step: [-bp.width * 0.24, 0, 0] as Vec3 } } : {}),
    })
  );
}

function addColumns(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.columns, 2, 24);

  // On a deck the columns hold it up from below and run along its length;
  // on a facade they stand in front of it.
  if (bp.massPlan === "platform") {
    const height = Math.max(0.4, bp.height - (body.y1 - body.y0));
    const diameter = Math.min(bp.width * 0.3, height * 0.16);
    const usable = bp.length * 0.86;
    const step = usable / Math.max(1, count - 1);

    push(
      ctx,
      part(ctx.id(), "Опора", {
        shape: "cylinder",
        role: "structure",
        group: "Опоры",
        position: [0, body.y0 - height / 2, -usable / 2],
        size: [diameter, height, diameter],
        sides: 16,
        color: shade(bp.primary, -0.12),
        material: "Опора",
        roughness: 0.85,
        repeat: { count, step: [0, 0, step] },
      }),
      part(ctx.id(), "Ростверк", {
        shape: "box",
        role: "structure",
        group: "Опоры",
        position: [0, body.y0 - height * 0.02, -usable / 2],
        size: [bp.width * 0.98, Math.max(0.1, height * 0.06), diameter * 2.2],
        color: shade(bp.primary, -0.2),
        material: "Ростверк",
        repeat: { count, step: [0, 0, step] },
      }),
      part(ctx.id(), "Продольная балка", {
        shape: "box",
        role: "structure",
        group: "Опоры",
        position: [bp.width * 0.32, body.y0 - Math.max(0.12, height * 0.08), 0],
        size: [Math.max(0.15, bp.width * 0.08), Math.max(0.2, height * 0.12), bp.length * 0.98],
        color: shade(bp.primary, -0.24),
        material: "Балка",
        mirror: "x",
      }),
      part(ctx.id(), "Пилон", {
        shape: "box",
        role: "structure",
        group: "Опоры",
        position: [0, body.y0 + bp.height * 0.32, bp.length * 0.2],
        size: [bp.width * 0.16, bp.height * 0.72, bp.width * 0.16],
        color: shade(bp.primary, 0.05),
        material: "Пилон",
        mirror: "z",
      })
    );
    return;
  }

  const height = body.y1 - body.y0;
  const diameter = Math.min(bp.width / count, height * 0.14);
  const usable = bp.width * 0.92;
  const step = usable / Math.max(1, count - 1);

  push(
    ctx,
    part(ctx.id(), "Колонна", {
      shape: "cylinder",
      role: "structure",
      group: "Колоннада",
      position: [-usable / 2, body.y0 + height / 2, body.halfL + diameter * 0.9],
      size: [diameter, height, diameter],
      sides: 16,
      color: shade(bp.primary, 0.12),
      material: "Колонна",
      roughness: 0.8,
      repeat: { count, step: [step, 0, 0] },
    }),
    part(ctx.id(), "База колонны", {
      shape: "cylinder",
      role: "detail",
      group: "Колоннада",
      position: [-usable / 2, body.y0 + height * 0.03, body.halfL + diameter * 0.9],
      size: [diameter * 1.3, height * 0.06, diameter * 1.3],
      sides: 16,
      color: shade(bp.primary, -0.05),
      material: "База",
      repeat: { count, step: [step, 0, 0] },
    }),
    part(ctx.id(), "Капитель", {
      shape: "cylinder",
      role: "detail",
      group: "Колоннада",
      position: [-usable / 2, body.y0 + height * 0.96, body.halfL + diameter * 0.9],
      size: [diameter * 1.4, height * 0.07, diameter * 1.4],
      sides: 16,
      color: shade(bp.primary, 0.22),
      material: "Капитель",
      repeat: { count, step: [step, 0, 0] },
    }),
    part(ctx.id(), "Антаблемент", {
      shape: "box",
      role: "structure",
      group: "Колоннада",
      position: [0, body.y0 + height * 1.03, body.halfL + diameter * 0.9],
      size: [usable + diameter * 2, height * 0.09, diameter * 1.8],
      color: shade(bp.primary, 0.16),
      material: "Антаблемент",
    })
  );
}

function addArches(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.arches, 1, 12);
  const height = (body.y1 - body.y0) * 0.6;
  const usable = bp.width * 0.9;
  const step = usable / count;

  push(
    ctx,
    part(ctx.id(), "Арка", {
      shape: "tube",
      role: "detail",
      group: "Аркада",
      position: [-usable / 2 + step / 2, body.y0 + height * 0.62, body.halfL + 0.02],
      size: [step * 0.86, Math.max(0.04, step * 0.1), step * 0.86],
      rotation: [Math.PI / 2, 0, 0],
      hole: 0.74,
      sides: 20,
      color: shade(bp.primary, 0.18),
      material: "Арка",
      repeat: { count, step: [step, 0, 0] },
    }),
    part(ctx.id(), "Пилон арки", {
      shape: "box",
      role: "structure",
      group: "Аркада",
      position: [-usable / 2 + step * 0.06, body.y0 + height * 0.32, body.halfL + 0.02],
      size: [step * 0.14, height * 0.66, step * 0.16],
      color: shade(bp.primary, 0.1),
      material: "Пилон",
      repeat: { count: count + 1, step: [step, 0, 0] },
    })
  );
}

function addBalconies(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.balconies, 1, 8);
  const levels = Math.max(1, bp.floors || 1);
  const span = body.y1 - body.y0;
  const levelHeight = span / levels;
  const depth = Math.min(bp.length * 0.18, 1.6);
  const width = bp.width * 0.36;
  const y = body.y0 + levelHeight * 1.05;

  push(
    ctx,
    part(ctx.id(), "Плита балкона", {
      shape: "box",
      role: "structure",
      group: "Балконы",
      position: [0, y, body.halfL + depth / 2],
      size: [width, Math.max(0.06, levelHeight * 0.05), depth],
      color: shade(bp.primary, -0.1),
      material: "Плита",
      ...(count > 1 ? { repeat: { count, step: [0, levelHeight, 0] as Vec3 } } : {}),
    })
  );

  push(
    ctx,
    railingRun({
      id: ctx.id,
      group: "Балконы",
      name: "Ограждение балкона",
      center: [0, y + levelHeight * 0.03, body.halfL + depth],
      length: width,
      height: levelHeight * 0.34,
      along: "x",
      color: shade(bp.trim, 0.2),
    })
  );
}

function addTerrace(ctx: Ctx) {
  const { bp, body } = ctx;
  const depth = Math.min(bp.length * 0.4, 3.2);
  const width = bp.width * 0.78;
  const deckY = body.y0 + Math.max(0.08, bp.height * 0.03);

  push(
    ctx,
    part(ctx.id(), "Настил террасы", {
      shape: "box",
      role: "foundation",
      group: "Терраса",
      position: [0, deckY, body.halfL + depth / 2],
      size: [width, Math.max(0.06, bp.height * 0.02), depth],
      color: shade(bp.secondary, -0.05),
      material: "Настил",
      roughness: 0.9,
    }),
    part(ctx.id(), "Доска настила", {
      shape: "box",
      role: "detail",
      group: "Терраса",
      position: [-width / 2, deckY + bp.height * 0.012, body.halfL + depth / 2],
      size: [width * 0.02, Math.max(0.01, bp.height * 0.004), depth * 0.98],
      color: shade(bp.secondary, -0.18),
      material: "Шов",
      repeat: { count: 10, step: [width / 10, 0, 0] },
    }),
    part(ctx.id(), "Столб навеса", {
      shape: "cylinder",
      role: "structure",
      group: "Терраса",
      position: [width * 0.44, deckY + bp.height * 0.14, body.halfL + depth * 0.86],
      size: [bp.width * 0.035, bp.height * 0.28, bp.width * 0.035],
      sides: 12,
      color: shade(bp.primary, -0.14),
      material: "Столб",
      mirror: "x",
    }),
    part(ctx.id(), "Навес террасы", {
      shape: "box",
      role: "roof",
      group: "Терраса",
      position: [0, deckY + bp.height * 0.29, body.halfL + depth * 0.5],
      size: [width * 1.06, Math.max(0.05, bp.height * 0.018), depth * 1.02],
      color: shade(bp.trim, 0.1),
      material: "Навес",
    })
  );

  push(
    ctx,
    railingRun({
      id: ctx.id,
      group: "Терраса",
      center: [0, deckY, body.halfL + depth],
      length: width,
      height: bp.height * 0.13,
      along: "x",
      color: shade(bp.secondary, -0.12),
    })
  );
}

function addStairs(ctx: Ctx) {
  const { bp, body } = ctx;
  const steps = clamp(bp.stairs, 1, 20);
  const rise = Math.max(0.04, body.y0 > 0.05 ? body.y0 / steps : (bp.height * 0.04) / 1);
  const run = rise * 1.5;
  const width = Math.min(bp.width * 0.32, 2.4);
  const zBase = body.halfL + (bp.terrace ? Math.min(bp.length * 0.4, 3.2) : 0) + run * steps * 0.5;

  push(
    ctx,
    stairFlight({
      id: ctx.id,
      base: [0, 0, zBase],
      width,
      steps,
      rise,
      run,
      facing: "back",
      color: shade(bp.trim, 0.25),
    })
  );
}

function addRailings(ctx: Ctx) {
  const { bp, body } = ctx;
  push(
    ctx,
    railingRun({
      id: ctx.id,
      center: [0, body.y1, body.halfL * 0.98],
      length: bp.width * 0.94,
      height: Math.max(0.5, bp.height * 0.07),
      along: "x",
      color: shade(bp.trim, 0.28),
      mirror: "z",
    })
  );
}

function addFence(ctx: Ctx) {
  const { bp } = ctx;
  const width = bp.width * 1.8;
  const length = bp.length * 1.8;
  const height = bp.height * 0.12;

  push(
    ctx,
    part(ctx.id(), "Секция забора", {
      shape: "box",
      role: "structure",
      group: "Ограда",
      position: [-width / 2, height / 2, length / 2],
      size: [width * 0.02, height, width * 0.012],
      color: shade(bp.trim, 0.1),
      material: "Штакетина",
      mirror: "z",
      repeat: { count: 22, step: [width / 21, 0, 0] },
    }),
    part(ctx.id(), "Прожилина", {
      shape: "box",
      role: "structure",
      group: "Ограда",
      position: [0, height * 0.72, length / 2],
      size: [width, height * 0.08, width * 0.014],
      color: shade(bp.trim, -0.05),
      material: "Прожилина",
      mirror: "z",
    })
  );
}

function addGarage(ctx: Ctx) {
  const { bp, body } = ctx;
  const width = bp.width * 0.42;
  const length = bp.length * 0.7;
  const height = (body.y1 - body.y0) * 0.55;
  const x = bp.width / 2 + width / 2 - bp.width * 0.02;

  push(
    ctx,
    part(ctx.id(), "Объём гаража", {
      shape: "box",
      role: "volume",
      group: "Гараж",
      position: [x, body.y0 + height / 2, body.halfL - length / 2],
      size: [width, height, length],
      color: shade(bp.primary, -0.06),
      material: "Гараж",
      roughness: bp.roughness,
    }),
    part(ctx.id(), "Кровля гаража", {
      shape: "box",
      role: "roof",
      group: "Гараж",
      position: [x, body.y0 + height * 1.03, body.halfL - length / 2],
      size: [width * 1.06, height * 0.07, length * 1.06],
      color: shade(bp.trim, -0.05),
      material: "Кровля",
    }),
    part(ctx.id(), "Ворота", {
      shape: "box",
      role: "door",
      group: "Гараж",
      position: [x, body.y0 + height * 0.44, body.halfL + 0.02],
      size: [width * 0.82, height * 0.78, bp.length * 0.02],
      color: shade(bp.secondary, 0.08),
      material: "Ворота",
      metalness: 0.35,
    }),
    part(ctx.id(), "Панель ворот", {
      shape: "box",
      role: "detail",
      group: "Гараж",
      position: [x, body.y0 + height * 0.14, body.halfL + 0.03],
      size: [width * 0.8, height * 0.02, bp.length * 0.012],
      color: shade(bp.secondary, -0.1),
      material: "Панель",
      repeat: { count: 5, step: [0, height * 0.15, 0] },
    })
  );
}

function addTowers(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.towers, 1, 4);
  const size = Math.min(bp.width, bp.length) * 0.3;
  const height = bp.height * 0.35;

  push(
    ctx,
    part(ctx.id(), "Башня", {
      shape: bp.bodyShape === "cylinder" ? "cylinder" : "box",
      role: "volume",
      group: "Башни",
      position: [bp.width * 0.32, body.y1 + height / 2, -bp.length * 0.2],
      size: [size, height, size],
      sides: 16,
      color: shade(bp.primary, 0.05),
      material: "Башня",
      roughness: bp.roughness,
      ...(count > 1 ? { mirror: "x" as const } : {}),
    }),
    part(ctx.id(), "Зубцы", {
      shape: "box",
      role: "detail",
      group: "Башни",
      position: [bp.width * 0.32 - size * 0.4, body.y1 + height + size * 0.12, -bp.length * 0.2 - size * 0.4],
      size: [size * 0.16, size * 0.24, size * 0.16],
      color: shade(bp.primary, -0.1),
      material: "Зубец",
      ...(count > 1 ? { mirror: "x" as const } : {}),
      repeat: { count: 5, step: [size * 0.2, 0, 0] },
    })
  );
}

function addSpire(ctx: Ctx) {
  const { bp, body } = ctx;
  const base = Math.max(body.y1, bp.height * 0.92);
  const size = Math.min(bp.width, bp.length) * 0.16;

  push(
    ctx,
    part(ctx.id(), "Шпиль", {
      shape: "cone",
      role: "roof",
      group: "Шпиль",
      position: [0, base + bp.height * 0.12, 0],
      size: [size, bp.height * 0.24, size],
      sides: 12,
      color: shade(bp.trim, 0.1),
      material: "Шпиль",
      metalness: 0.5,
    }),
    part(ctx.id(), "Основание шпиля", {
      shape: "cylinder",
      role: "structure",
      group: "Шпиль",
      position: [0, base + bp.height * 0.01, 0],
      size: [size * 1.5, bp.height * 0.03, size * 1.5],
      sides: 12,
      color: shade(bp.trim, -0.05),
      material: "Основание",
    }),
    part(ctx.id(), "Навершие", {
      shape: "sphere",
      role: "detail",
      group: "Шпиль",
      position: [0, base + bp.height * 0.25, 0],
      size: [size * 0.4, size * 0.4, size * 0.4],
      color: "#c9973f",
      material: "Навершие",
      metalness: 0.85,
      roughness: 0.25,
    })
  );
}

function addSolar(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.solar, 1, 12);
  const width = (bp.width * 0.8) / count;

  push(
    ctx,
    part(ctx.id(), "Солнечная панель", {
      shape: "box",
      role: "detail",
      group: "Оборудование",
      position: [-bp.width * 0.4 + width / 2, Math.max(body.y1, bp.height * 0.94), -bp.length * 0.1],
      size: [width * 0.9, bp.height * 0.012, bp.length * 0.3],
      rotation: [-0.35, 0, 0],
      color: "#1c2a44",
      material: "Фотоэлемент",
      metalness: 0.5,
      roughness: 0.18,
      repeat: { count, step: [width, 0, 0] },
    })
  );
}

/* ================= furniture ================= */

function addTabletop(ctx: Ctx) {
  const { bp, body } = ctx;
  const thickness = Math.max(0.02, bp.height * 0.05);
  push(
    ctx,
    part(ctx.id(), "Столешница", {
      shape: "box",
      role: "furniture",
      group: "Столешница",
      position: [0, body.y0 + thickness * 1.6, 0],
      size: [bp.width, thickness, bp.length],
      color: bp.primary,
      material: "Столешница",
      roughness: bp.roughness,
      metalness: bp.metalness,
    }),
    part(ctx.id(), "Кромка столешницы", {
      shape: "box",
      role: "detail",
      group: "Столешница",
      position: [0, body.y0 + thickness * 1.6, bp.length / 2],
      size: [bp.width * 1.01, thickness * 1.08, thickness * 0.5],
      color: shade(bp.primary, -0.2),
      material: "Кромка",
      mirror: "z",
    }),
    part(ctx.id(), "Кромка боковая", {
      shape: "box",
      role: "detail",
      group: "Столешница",
      position: [bp.width / 2, body.y0 + thickness * 1.6, 0],
      size: [thickness * 0.5, thickness * 1.08, bp.length * 1.01],
      color: shade(bp.primary, -0.2),
      material: "Кромка",
      mirror: "x",
    })
  );
}

function addSeat(ctx: Ctx) {
  const { bp, body } = ctx;
  const seatY = body.y0;
  const thickness = bp.height * 0.07;
  const fabric = bp.accent;

  push(
    ctx,
    part(ctx.id(), "Сиденье", {
      shape: "box",
      role: "furniture",
      group: "Сиденье",
      position: [0, seatY + thickness / 2, 0],
      size: [bp.width * 0.98, thickness, bp.length * 0.96],
      color: shade(bp.primary, -0.05),
      material: "Основание сиденья",
      roughness: 0.8,
    })
  );

  const seats = clamp(bp.cushions, 1, 5);
  const seatWidth = (bp.width * 0.94) / seats;
  push(
    ctx,
    cushion({
      id: ctx.id,
      group: "Сиденье",
      center: [-bp.width * 0.47 + seatWidth / 2, seatY + thickness * 1.5, 0],
      size: [seatWidth * 0.94, thickness * 1.4, bp.length * 0.9],
      color: fabric,
      ...(seats > 1 ? { repeat: { count: seats, step: [seatWidth, 0, 0] as Vec3 } } : {}),
    })
  );

  if (bp.backrest) {
    const backHeight = bp.height - (seatY + thickness);
    push(
      ctx,
      part(ctx.id(), "Спинка", {
        shape: "box",
        role: "furniture",
        group: "Спинка",
        position: [0, seatY + thickness + backHeight / 2, -bp.length / 2 + thickness * 0.6],
        size: [bp.width * 0.98, backHeight, thickness * 1.1],
        color: shade(bp.primary, -0.05),
        material: "Спинка",
        roughness: 0.8,
      })
    );
    push(
      ctx,
      cushion({
        id: ctx.id,
        group: "Спинка",
        name: "Подушка спинки",
        center: [
          -bp.width * 0.47 + seatWidth / 2,
          seatY + thickness + backHeight * 0.5,
          -bp.length / 2 + thickness * 1.6,
        ],
        size: [seatWidth * 0.94, backHeight * 0.86, thickness],
        color: shade(fabric, 0.06),
        ...(seats > 1 ? { repeat: { count: seats, step: [seatWidth, 0, 0] as Vec3 } } : {}),
      })
    );
  }

  if (bp.armrests) {
    const armHeight = bp.height * 0.22;
    push(
      ctx,
      part(ctx.id(), "Подлокотник", {
        shape: "box",
        role: "furniture",
        group: "Каркас",
        position: [bp.width / 2 - bp.width * 0.05, seatY + thickness + armHeight / 2, 0],
        size: [bp.width * 0.1, armHeight, bp.length * 0.9],
        color: shade(fabric, -0.1),
        material: "Подлокотник",
        roughness: 0.85,
        mirror: "x",
      }),
      part(ctx.id(), "Накладка подлокотника", {
        shape: "box",
        role: "detail",
        group: "Каркас",
        position: [bp.width / 2 - bp.width * 0.05, seatY + thickness + armHeight, 0],
        size: [bp.width * 0.115, armHeight * 0.09, bp.length * 0.92],
        color: shade(bp.primary, -0.2),
        material: "Накладка",
        mirror: "x",
      })
    );
  }
}

function addMattress(ctx: Ctx) {
  const { bp, body } = ctx;
  const frameTop = body.y0;
  const mattressHeight = bp.height * 0.22;

  push(
    ctx,
    part(ctx.id(), "Основание кровати", {
      shape: "box",
      role: "furniture",
      group: "Каркас",
      position: [0, frameTop + bp.height * 0.04, 0],
      size: [bp.width, bp.height * 0.08, bp.length],
      color: shade(bp.primary, -0.1),
      material: "Каркас",
      roughness: bp.roughness,
    }),
    part(ctx.id(), "Матрас", {
      shape: "box",
      role: "furniture",
      group: "Матрас",
      position: [0, frameTop + bp.height * 0.08 + mattressHeight / 2, 0],
      size: [bp.width * 0.97, mattressHeight, bp.length * 0.97],
      color: "#e8e4dc",
      material: "Матрас",
      roughness: 0.95,
    }),
    part(ctx.id(), "Стёжка матраса", {
      shape: "box",
      role: "detail",
      group: "Матрас",
      position: [0, frameTop + bp.height * 0.08 + mattressHeight * 0.98, -bp.length * 0.4],
      size: [bp.width * 0.95, mattressHeight * 0.06, bp.length * 0.012],
      color: "#d6d1c6",
      material: "Стёжка",
      repeat: { count: 6, step: [0, 0, (bp.length * 0.8) / 5] },
    }),
    part(ctx.id(), "Одеяло", {
      shape: "box",
      role: "furniture",
      group: "Матрас",
      position: [0, frameTop + bp.height * 0.09 + mattressHeight, -bp.length * 0.12],
      size: [bp.width * 0.99, mattressHeight * 0.28, bp.length * 0.72],
      color: bp.accent,
      material: "Одеяло",
      roughness: 0.95,
    }),
    part(ctx.id(), "Изголовье", {
      shape: "box",
      role: "furniture",
      group: "Каркас",
      position: [0, frameTop + bp.height * 0.36, -bp.length / 2 + bp.length * 0.02],
      size: [bp.width * 1.02, bp.height * 0.62, bp.length * 0.04],
      color: shade(bp.primary, 0.05),
      material: "Изголовье",
      roughness: 0.85,
    })
  );
}

function addPillows(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.pillows, 1, 6);
  const width = bp.width * 0.4;
  const y = bp.mattress ? body.y0 + bp.height * 0.34 : body.y0 + bp.height * 0.3;
  const z = bp.mattress ? -bp.length * 0.34 : -bp.length * 0.22;

  push(
    ctx,
    cushion({
      id: ctx.id,
      group: "Текстиль",
      name: "Подушка",
      center: [-bp.width * 0.22, y, z],
      size: [width, bp.height * 0.1, bp.length * 0.18],
      color: shade(bp.accent, 0.18),
      rotation: [0, 0.08, 0],
      ...(count > 1 ? { repeat: { count, step: [(bp.width * 0.44) / Math.max(1, count - 1), 0, 0] as Vec3 } } : {}),
    })
  );
}

function addShelves(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.shelves, 1, 10);
  const span = body.y1 - body.y0;
  const step = span / (count + 1);
  const thickness = Math.max(0.015, span * 0.018);

  push(
    ctx,
    part(ctx.id(), "Полка", {
      shape: "box",
      role: "furniture",
      group: "Полки",
      position: [0, body.y0 + step, 0],
      size: [bp.width * 0.94, thickness, bp.length * 0.9],
      color: shade(bp.primary, -0.08),
      material: "Полка",
      roughness: bp.roughness,
      repeat: { count, step: [0, step, 0] },
    }),
    part(ctx.id(), "Задняя стенка", {
      shape: "box",
      role: "structure",
      group: "Полки",
      position: [0, body.y0 + span / 2, -bp.length / 2 + thickness],
      size: [bp.width * 0.97, span * 0.97, thickness],
      color: shade(bp.primary, -0.22),
      material: "Задняя стенка",
    }),
    part(ctx.id(), "Боковина", {
      shape: "box",
      role: "structure",
      group: "Полки",
      position: [bp.width / 2 - thickness, body.y0 + span / 2, 0],
      size: [thickness * 2, span, bp.length * 0.96],
      color: shade(bp.primary, -0.02),
      material: "Боковина",
      mirror: "x",
    })
  );
}

function addDrawers(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.drawers, 1, 8);
  const span = body.y1 - body.y0;
  const height = (span * 0.9) / count;

  push(
    ctx,
    part(ctx.id(), "Фасад ящика", {
      shape: "box",
      role: "furniture",
      group: "Ящики",
      position: [0, body.y0 + span * 0.05 + height / 2, body.halfL + bp.length * 0.015],
      size: [bp.width * 0.9, height * 0.9, bp.length * 0.03],
      color: shade(bp.primary, 0.08),
      material: "Фасад",
      roughness: bp.roughness,
      repeat: { count, step: [0, height, 0] },
    }),
    part(ctx.id(), "Ручка ящика", {
      shape: "cylinder",
      role: "detail",
      group: "Ящики",
      position: [0, body.y0 + span * 0.05 + height / 2, body.halfL + bp.length * 0.04],
      size: [bp.width * 0.018, bp.width * 0.3, bp.width * 0.018],
      rotation: [0, 0, Math.PI / 2],
      sides: 10,
      color: "#b6bcc4",
      material: "Ручка",
      metalness: 0.8,
      roughness: 0.25,
      repeat: { count, step: [0, height, 0] },
    })
  );
}

/* ================= hardware ================= */

function addScreens(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.screens, 1, 4);
  const width = bp.width * 0.86;
  const height = Math.min((body.y1 - body.y0) * 0.8, bp.height * 0.6);

  if (bp.keyboard) {
    // Laptop lid: hinged at the back edge of the platform.
    const lidHeight = bp.height * 0.76;
    push(
      ctx,
      part(ctx.id(), "Крышка", {
        shape: "box",
        role: "volume",
        group: "Экран",
        position: [0, body.y1 + lidHeight * 0.45, -bp.length * 0.42],
        size: [bp.width, lidHeight, bp.length * 0.045],
        rotation: [-0.22, 0, 0],
        color: bp.primary,
        material: "Крышка",
        metalness: Math.max(bp.metalness, 0.45),
        roughness: 0.35,
      }),
      part(ctx.id(), "Петля", {
        shape: "cylinder",
        role: "detail",
        group: "Экран",
        position: [bp.width * 0.36, body.y1 + bp.height * 0.02, -bp.length * 0.44],
        size: [bp.width * 0.06, bp.width * 0.03, bp.width * 0.03],
        rotation: [0, 0, Math.PI / 2],
        sides: 12,
        color: "#4a4f57",
        material: "Петля",
        metalness: 0.75,
        mirror: "x",
      })
    );
    push(
      ctx,
      screenPanel({
        id: ctx.id,
        center: [0, body.y1 + lidHeight * 0.46, -bp.length * 0.39],
        width: bp.width * 0.93,
        height: lidHeight * 0.9,
        bezelColor: "#1b1d21",
        screenColor: "#16324f",
        rotation: [-0.22, 0, 0],
      })
    );
    return;
  }

  push(
    ctx,
    screenPanel({
      id: ctx.id,
      center: [0, body.y0 + (body.y1 - body.y0) * 0.56, body.halfL + bp.length * 0.02],
      width,
      height,
      bezelColor: shade(bp.trim, 0.1),
      screenColor: "#16324f",
      emissive: 0.7,
    })
  );

  if (count > 1) {
    push(
      ctx,
      screenPanel({
        id: ctx.id,
        name: "Доп. экран",
        center: [body.halfW * 0.9, body.y0 + (body.y1 - body.y0) * 0.56, 0],
        width: bp.length * 0.5,
        height: height * 0.6,
        facing: "right",
        bezelColor: shade(bp.trim, 0.1),
        emissive: 0.55,
      })
    );
  }
}

function addKeyboard(ctx: Ctx) {
  const { bp, body } = ctx;
  push(
    ctx,
    part(ctx.id(), "Панель клавиатуры", {
      shape: "box",
      role: "detail",
      group: "Клавиатура",
      position: [0, body.y1 + bp.height * 0.004, bp.length * 0.02],
      size: [bp.width * 0.88, bp.height * 0.008, bp.length * 0.52],
      color: shade(bp.trim, 0.05),
      material: "Панель",
      roughness: 0.6,
    }),
    part(ctx.id(), "Тачпад", {
      shape: "box",
      role: "detail",
      group: "Клавиатура",
      position: [0, body.y1 + bp.height * 0.006, bp.length * 0.32],
      size: [bp.width * 0.3, bp.height * 0.004, bp.length * 0.2],
      color: shade(bp.primary, -0.12),
      material: "Тачпад",
      roughness: 0.3,
    })
  );

  push(
    ctx,
    keyGrid({
      id: ctx.id,
      center: [0, body.y1 + bp.height * 0.008, bp.length * 0.02],
      width: bp.width * 0.84,
      depth: bp.length * 0.46,
      rows: 5,
      columns: 14,
      color: "#2a2c31",
      keyHeight: bp.height * 0.01,
    })
  );
}

function addButtons(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.buttons, 1, 12);
  const size = Math.min(bp.width, bp.length) * 0.06;
  const y = body.y0 + (body.y1 - body.y0) * 0.24;

  push(
    ctx,
    part(ctx.id(), "Кнопка", {
      shape: "cylinder",
      role: "detail",
      group: "Управление",
      position: [-bp.width * 0.3, y, body.halfL + size * 0.2],
      size: [size, size * 0.5, size],
      rotation: [Math.PI / 2, 0, 0],
      sides: 14,
      color: bp.accent,
      material: "Кнопка",
      metalness: 0.3,
      roughness: 0.4,
      repeat: { count, step: [(bp.width * 0.6) / Math.max(1, count - 1), 0, 0] },
    })
  );
}

function addLenses(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.lenses, 1, 6);
  const size = Math.min(bp.width, bp.length) * 0.18;
  const y = body.y0 + (body.y1 - body.y0) * 0.78;

  push(
    ctx,
    part(ctx.id(), "Оправа объектива", {
      shape: "cylinder",
      role: "detail",
      group: "Оптика",
      position: [-bp.width * 0.22, y, body.halfL + size * 0.1],
      size: [size, size * 0.3, size],
      rotation: [Math.PI / 2, 0, 0],
      sides: 20,
      color: shade(bp.trim, -0.1),
      material: "Оправа",
      metalness: 0.7,
      roughness: 0.3,
      ...(count > 1 ? { repeat: { count, step: [size * 1.25, 0, 0] as Vec3 } } : {}),
    }),
    part(ctx.id(), "Линза", {
      shape: "cylinder",
      role: "detail",
      group: "Оптика",
      position: [-bp.width * 0.22, y, body.halfL + size * 0.22],
      size: [size * 0.66, size * 0.1, size * 0.66],
      rotation: [Math.PI / 2, 0, 0],
      sides: 20,
      color: "#1a2a44",
      material: "Линза",
      metalness: 0.4,
      roughness: 0.05,
      emissive: 0.2,
      ...(count > 1 ? { repeat: { count, step: [size * 1.25, 0, 0] as Vec3 } } : {}),
    })
  );
}

function addAntennas(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.antennas, 1, 6);
  const height = bp.height * 0.3;
  const thickness = Math.max(0.006, Math.min(bp.width, bp.length) * 0.02);

  push(
    ctx,
    part(ctx.id(), "Антенна", {
      shape: "cylinder",
      role: "detail",
      group: "Оборудование",
      position: [body.halfW * 0.6, body.y1 + height / 2, -body.halfL * 0.5],
      size: [thickness, height, thickness],
      rotation: [0, 0, 0.12],
      sides: 8,
      color: "#3a3d42",
      material: "Антенна",
      metalness: 0.7,
      ...(count > 1 ? { mirror: "x" as const } : {}),
    }),
    part(ctx.id(), "Наконечник антенны", {
      shape: "sphere",
      role: "detail",
      group: "Оборудование",
      position: [body.halfW * 0.6 + height * 0.06, body.y1 + height, -body.halfL * 0.5],
      size: [thickness * 2.4, thickness * 2.4, thickness * 2.4],
      color: bp.accent,
      material: "Наконечник",
      emissive: bp.emissiveAccent ? 0.7 : 0,
      ...(count > 1 ? { mirror: "x" as const } : {}),
    })
  );
}

function addVents(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.vents, 1, 6);
  const width = bp.width * 0.34;
  const height = (body.y1 - body.y0) * 0.16;

  push(
    ctx,
    ventSlots({
      id: ctx.id,
      group: "Детали",
      center: [0, body.y0 + (body.y1 - body.y0) * 0.2, body.halfL],
      width,
      height,
      facing: "front",
      count: clamp(count * 4, 4, 24),
      color: shade(bp.trim, -0.15),
    })
  );

  if (count > 1) {
    push(
      ctx,
      ventSlots({
        id: ctx.id,
        group: "Детали",
        name: "Боковая решётка",
        center: [body.halfW, body.y0 + (body.y1 - body.y0) * 0.5, 0],
        width: bp.length * 0.3,
        height,
        facing: "right",
        count: 10,
        color: shade(bp.trim, -0.15),
      })
    );
  }
}

function addHandles(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.handles, 1, 4);
  const size = Math.min(bp.width, bp.height) * 0.3;

  if (bp.spout || bp.bodyShape === "cylinder") {
    // A side handle on a vessel: a ring standing off the wall.
    push(
      ctx,
      part(ctx.id(), "Ручка", {
        shape: "torus",
        role: "detail",
        group: "Ручка",
        position: [body.halfW + size * 0.28, body.y0 + (body.y1 - body.y0) * 0.55, 0],
        size: [size * 0.9, size * 0.16, size * 0.9],
        rotation: [0, Math.PI / 2, Math.PI / 2],
        hole: 0.6,
        sides: 18,
        color: shade(bp.primary, -0.12),
        material: "Ручка",
        metalness: bp.metalness,
      })
    );
    return;
  }

  push(
    ctx,
    part(ctx.id(), "Рукоять", {
      shape: "capsule",
      role: "detail",
      group: "Ручка",
      position: [0, body.y1 + size * 0.18, 0],
      size: [size * 0.16, bp.width * 0.5, size * 0.16],
      rotation: [0, 0, Math.PI / 2],
      color: shade(bp.trim, 0.1),
      material: "Рукоять",
      metalness: 0.4,
      roughness: 0.5,
      ...(count > 1 ? { repeat: { count, step: [0, 0, bp.length * 0.3] as Vec3 } } : {}),
    }),
    part(ctx.id(), "Кронштейн ручки", {
      shape: "box",
      role: "detail",
      group: "Ручка",
      position: [bp.width * 0.24, body.y1 + size * 0.08, 0],
      size: [size * 0.1, size * 0.2, size * 0.1],
      color: shade(bp.trim, -0.1),
      material: "Кронштейн",
      mirror: "x",
    })
  );
}

function addSpout(ctx: Ctx) {
  const { bp, body } = ctx;
  const size = Math.min(bp.width, bp.length);
  push(
    ctx,
    part(ctx.id(), "Носик", {
      shape: "cone",
      role: "detail",
      group: "Носик",
      position: [-body.halfW * 0.9, body.y0 + (body.y1 - body.y0) * 0.72, 0],
      size: [size * 0.24, size * 0.7, size * 0.24],
      rotation: [0, 0, Math.PI * 0.62],
      color: bp.primary,
      material: "Носик",
      metalness: bp.metalness,
    })
  );
}

function addLid(ctx: Ctx) {
  const { bp, body } = ctx;
  const size = Math.min(bp.width, bp.length);
  push(
    ctx,
    part(ctx.id(), "Крышка", {
      shape: "cylinder",
      role: "detail",
      group: "Крышка",
      position: [0, body.y1 + size * 0.03, 0],
      size: [size * 0.92, size * 0.08, size * 0.92],
      sides: 24,
      color: shade(bp.primary, 0.1),
      material: "Крышка",
      metalness: bp.metalness,
    }),
    part(ctx.id(), "Кнопка крышки", {
      shape: "sphere",
      role: "detail",
      group: "Крышка",
      position: [0, body.y1 + size * 0.09, 0],
      size: [size * 0.16, size * 0.12, size * 0.16],
      color: bp.accent,
      material: "Навершие",
    })
  );
}

function addPropellers(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.propellers, 1, 8);
  const armLength = Math.max(bp.width, bp.length) * 0.42;
  const rotorSize = armLength * 0.9;
  const y = body.y1 + bp.height * 0.06;

  if (count >= 3) {
    push(
      ctx,
      part(ctx.id(), "Луч рамы", {
        shape: "box",
        role: "structure",
        group: "Винты",
        position: [armLength * 0.5, body.y1 - bp.height * 0.02, armLength * 0.5],
        size: [armLength, bp.height * 0.05, bp.height * 0.05],
        rotation: [0, Math.PI / 4, 0],
        color: shade(bp.trim, 0.05),
        material: "Луч",
        metalness: 0.5,
        mirror: "xz",
      }),
      part(ctx.id(), "Мотор", {
        shape: "cylinder",
        role: "detail",
        group: "Винты",
        position: [armLength * 0.72, y - bp.height * 0.03, armLength * 0.72],
        size: [bp.width * 0.12, bp.height * 0.1, bp.width * 0.12],
        sides: 14,
        color: "#3a3d42",
        material: "Мотор",
        metalness: 0.7,
        mirror: "xz",
      }),
      part(ctx.id(), "Лопасть", {
        shape: "box",
        role: "detail",
        group: "Винты",
        position: [armLength * 0.72, y + bp.height * 0.02, armLength * 0.72],
        size: [rotorSize, bp.height * 0.014, bp.width * 0.06],
        color: shade(bp.trim, 0.3),
        material: "Лопасть",
        mirror: "xz",
        repeat: { count: 2, step: [0, 0, 0], rotationStep: [0, Math.PI / 2, 0] },
      })
    );
    return;
  }

  push(
    ctx,
    part(ctx.id(), "Втулка винта", {
      shape: "cylinder",
      role: "detail",
      group: "Винты",
      position: [0, y, 0],
      size: [bp.width * 0.14, bp.height * 0.06, bp.width * 0.14],
      sides: 14,
      color: "#3a3d42",
      material: "Втулка",
      metalness: 0.7,
    }),
    part(ctx.id(), "Лопасть", {
      shape: "box",
      role: "detail",
      group: "Винты",
      position: [0, y + bp.height * 0.02, 0],
      size: [Math.max(bp.width, bp.length) * 1.5, bp.height * 0.016, bp.width * 0.1],
      color: shade(bp.trim, 0.3),
      material: "Лопасть",
      repeat: { count: 3, step: [0, 0, 0], rotationStep: [0, Math.PI / 3, 0] },
    })
  );
}

function addCables(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.cables, 1, 24);
  const height = bp.height - body.y1;

  if (bp.columns > 0 && height > 0.5) {
    // Stays running from a pylon down to the deck.
    push(
      ctx,
      part(ctx.id(), "Вант", {
        shape: "cylinder",
        role: "structure",
        group: "Ванты",
        position: [0, body.y1 * 0.6, bp.length * 0.08],
        size: [Math.max(0.03, bp.width * 0.01), bp.height * 0.9, Math.max(0.03, bp.width * 0.01)],
        rotation: [0.5, 0, 0],
        sides: 8,
        color: "#8f9299",
        material: "Вант",
        metalness: 0.7,
        mirror: "z",
        repeat: { count: Math.round(count / 2), step: [0, -bp.height * 0.03, bp.length * 0.06] },
      })
    );
    return;
  }

  push(
    ctx,
    part(ctx.id(), "Кабель", {
      shape: "cylinder",
      role: "detail",
      group: "Детали",
      position: [0, body.y0 + Math.max(0.01, bp.height * 0.01), -body.halfL - bp.length * 0.14],
      size: [Math.max(0.004, bp.width * 0.02), bp.length * 0.3, Math.max(0.004, bp.width * 0.02)],
      rotation: [Math.PI / 2, 0, 0],
      sides: 8,
      color: "#1c1e22",
      material: "Кабель",
      roughness: 0.8,
    })
  );
}

function addLights(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.lights, 1, 8);
  const size = Math.min(bp.width, bp.height) * 0.16;
  const y = body.y0 + (body.y1 - body.y0) * (bp.wheels > 0 ? 0.45 : 0.7);

  push(
    ctx,
    part(ctx.id(), "Фара", {
      shape: "sphere",
      role: "light",
      group: "Оптика",
      position: [body.halfW * 0.62, y, body.halfL + size * 0.15],
      size: [size, size * 0.7, size * 0.5],
      color: "#fff7d6",
      material: "Стекло фары",
      emissive: 0.85,
      roughness: 0.1,
      mirror: count > 1 ? "x" : undefined,
    }),
    part(ctx.id(), "Оправа фары", {
      shape: "box",
      role: "detail",
      group: "Оптика",
      position: [body.halfW * 0.62, y, body.halfL + size * 0.05],
      size: [size * 1.25, size * 0.9, size * 0.2],
      color: shade(bp.trim, -0.1),
      material: "Оправа",
      metalness: 0.6,
      mirror: count > 1 ? "x" : undefined,
    })
  );

  if (bp.wheels > 0 || bp.tracks) {
    push(
      ctx,
      part(ctx.id(), "Задний фонарь", {
        shape: "box",
        role: "light",
        group: "Оптика",
        position: [body.halfW * 0.66, y, -body.halfL - size * 0.05],
        size: [size * 1.1, size * 0.5, size * 0.18],
        color: "#c1462f",
        material: "Фонарь",
        emissive: 0.7,
        mirror: "x",
      })
    );
  }
}

function addSpeakers(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.speakers, 1, 4);
  const size = Math.min(bp.width, bp.height) * 0.42;

  push(
    ctx,
    part(ctx.id(), "Диффузор", {
      shape: "cylinder",
      role: "detail",
      group: "Акустика",
      position: [0, body.y0 + (body.y1 - body.y0) * 0.6, body.halfL],
      size: [size, size * 0.14, size],
      rotation: [Math.PI / 2, 0, 0],
      sides: 24,
      color: "#26282c",
      material: "Диффузор",
      roughness: 0.9,
      ...(count > 1 ? { repeat: { count, step: [0, -size * 1.15, 0] as Vec3 } } : {}),
    }),
    part(ctx.id(), "Подвес", {
      shape: "torus",
      role: "detail",
      group: "Акустика",
      position: [0, body.y0 + (body.y1 - body.y0) * 0.6, body.halfL + size * 0.06],
      size: [size * 1.06, size * 0.1, size * 1.06],
      rotation: [Math.PI / 2, 0, 0],
      hole: 0.8,
      sides: 24,
      color: "#3a3d42",
      material: "Подвес",
      ...(count > 1 ? { repeat: { count, step: [0, -size * 1.15, 0] as Vec3 } } : {}),
    })
  );
}

function addCannon(ctx: Ctx) {
  const { bp, body } = ctx;
  const turretSize = Math.min(bp.width, bp.length) * 0.55;
  const barrelLength = bp.length * 0.62;

  push(
    ctx,
    part(ctx.id(), "Башня", {
      shape: "cylinder",
      role: "volume",
      group: "Башня",
      position: [0, body.y1 + turretSize * 0.22, -bp.length * 0.04],
      size: [turretSize, turretSize * 0.45, turretSize * 1.15],
      sides: 12,
      color: shade(bp.primary, -0.04),
      material: "Башня",
      metalness: Math.max(bp.metalness, 0.4),
    }),
    part(ctx.id(), "Маска орудия", {
      shape: "box",
      role: "detail",
      group: "Башня",
      position: [0, body.y1 + turretSize * 0.22, turretSize * 0.55],
      size: [turretSize * 0.5, turretSize * 0.36, turretSize * 0.2],
      color: shade(bp.primary, -0.14),
      material: "Маска",
      metalness: 0.5,
    }),
    part(ctx.id(), "Ствол", {
      shape: "cylinder",
      role: "detail",
      group: "Башня",
      position: [0, body.y1 + turretSize * 0.22, turretSize * 0.55 + barrelLength / 2],
      size: [turretSize * 0.16, barrelLength, turretSize * 0.16],
      rotation: [Math.PI / 2, 0, 0],
      sides: 14,
      color: "#4a4f57",
      material: "Ствол",
      metalness: 0.75,
    }),
    part(ctx.id(), "Дульный тормоз", {
      shape: "cylinder",
      role: "detail",
      group: "Башня",
      position: [0, body.y1 + turretSize * 0.22, turretSize * 0.55 + barrelLength * 0.94],
      size: [turretSize * 0.22, barrelLength * 0.1, turretSize * 0.22],
      rotation: [Math.PI / 2, 0, 0],
      sides: 14,
      color: "#3a3d42",
      material: "Дульный тормоз",
      metalness: 0.75,
    })
  );
}

function addMast(ctx: Ctx) {
  const { bp, body } = ctx;
  const height = bp.height * 0.9;

  push(
    ctx,
    part(ctx.id(), "Мачта", {
      shape: "cylinder",
      role: "structure",
      group: "Мачта",
      position: [0, body.y1 + height / 2, bp.length * 0.06],
      size: [bp.width * 0.05, height, bp.width * 0.05],
      sides: 12,
      color: shade(bp.secondary, -0.1),
      material: "Мачта",
    }),
    part(ctx.id(), "Рей", {
      shape: "cylinder",
      role: "structure",
      group: "Мачта",
      position: [0, body.y1 + height * 0.78, bp.length * 0.06],
      size: [bp.width * 0.03, bp.width * 0.7, bp.width * 0.03],
      rotation: [0, 0, Math.PI / 2],
      sides: 10,
      color: shade(bp.secondary, -0.2),
      material: "Рей",
    }),
    part(ctx.id(), "Парус", {
      shape: "box",
      role: "detail",
      group: "Мачта",
      position: [0, body.y1 + height * 0.5, bp.length * 0.06],
      size: [bp.width * 0.66, height * 0.55, bp.length * 0.01],
      color: "#e8e4dc",
      material: "Парус",
      roughness: 0.95,
    })
  );
}

/* ================= finishing ================= */

/**
 * The pass that turns a correct model into a finished one: edge trim on the
 * main mass, panel seams, and fasteners scaled to how detailed the prompt asked
 * for. It runs on whatever geometry exists, so it works for every object.
 */
function addSurfaceDetail(ctx: Ctx) {
  const { bp, body } = ctx;
  if (bp.detail < 0.7) return;

  const span = body.y1 - body.y0;
  if (span <= 0.01) return;

  const seamColor = shade(bp.primary, -0.22);
  const seams = clamp(Math.round(bp.detail * 3), 2, 8);

  push(
    ctx,
    panelSeam({
      id: ctx.id,
      group: "Отделка",
      name: "Шов панели",
      center: [-body.halfW * 0.6, body.y0 + span * 0.5, body.halfL],
      length: span * 0.9,
      facing: "front",
      along: "v",
      color: seamColor,
      thickness: Math.max(0.004, span * 0.012),
    })
  );

  push(
    ctx,
    part(ctx.id(), "Верхний кант", {
      shape: "box",
      role: "detail",
      group: "Отделка",
      position: [0, body.y1, 0],
      size: [body.halfW * 2 + span * 0.01, Math.max(0.006, span * 0.022), body.halfL * 2 + span * 0.01],
      color: shade(bp.trim, 0.18),
      material: "Кант",
      metalness: Math.max(bp.metalness, 0.25),
    }),
    part(ctx.id(), "Нижний кант", {
      shape: "box",
      role: "detail",
      group: "Отделка",
      position: [0, body.y0 + Math.max(0.005, span * 0.012), 0],
      size: [body.halfW * 2 + span * 0.014, Math.max(0.006, span * 0.024), body.halfL * 2 + span * 0.014],
      color: shade(bp.trim, -0.05),
      material: "Кант",
    })
  );

  if (bp.detail > 1.1) {
    const boltSize = Math.max(0.005, Math.min(body.halfW, body.halfL) * 0.05);
    push(
      ctx,
      part(ctx.id(), "Крепёж", {
        shape: "cylinder",
        role: "detail",
        group: "Отделка",
        position: [-body.halfW * 0.8, body.y0 + span * 0.12, body.halfL + boltSize * 0.2],
        size: [boltSize, boltSize * 0.4, boltSize],
        rotation: [Math.PI / 2, 0, 0],
        sides: 6,
        color: shade(bp.trim, 0.3),
        material: "Крепёж",
        metalness: 0.8,
        roughness: 0.3,
        repeat: { count: seams, step: [(body.halfW * 1.6) / Math.max(1, seams - 1), 0, 0] },
      })
    );
  }

  if (bp.emissiveAccent) {
    push(
      ctx,
      part(ctx.id(), "Световая линия", {
        shape: "box",
        role: "light",
        group: "Отделка",
        position: [0, body.y0 + span * 0.82, body.halfL + Math.max(0.003, span * 0.008)],
        size: [body.halfW * 1.5, Math.max(0.005, span * 0.018), Math.max(0.005, span * 0.012)],
        color: bp.accent,
        material: "Подсветка",
        emissive: 0.9,
      })
    );
  }
}
