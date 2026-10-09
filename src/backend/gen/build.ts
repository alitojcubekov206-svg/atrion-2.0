/**
 * Blueprint → geometry.
 *
 * One builder for everything. It lays down a mass, stands it on whatever it has
 * to stand on, grows the limbs and openings the blueprint asked for, mounts the
 * surface hardware, and finishes with a detail pass. Living anatomy has its
 * own proportional meshes; the remaining feature passes still compose wheels,
 * windows, roofs, wings and hardware from the blueprint.
 *
 * Axes: x = width (side to side), y = up, z = length (+z is the front).
 */
import type { ModelPart, ThreeDConcept } from "@/shared/types";
import {
  part,
  partsBounds,
  shade,
  translateParts,
  wrapConcept,
  type Rng,
} from "@/shared/geometry";
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
import { describeBlueprint, planFromPrompt, type Blueprint } from "@/backend/gen/blueprint";
import { buildLivingAnatomy, fitLivingDimensions, hasLivingAnatomy } from "./living-anatomy";
import {rocketParts} from "./rocket";

/** The main mass, once it exists — everything else anchors to this. */
type Body = {
  halfW: number;
  halfL: number;
  y0: number;
  y1: number;
};

/** The raised volume of a vehicle — glazing and doors are laid out on it. */
type Cabin = {
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  halfW: number;
};

type Ctx = {
  bp: Blueprint;
  rng: Rng;
  id: () => string;
  parts: ModelPart[];
  body: Body;
  /** True when the thing stands on end (people, robots, buildings). */
  upright: boolean;
  cabin?: Cabin;
  /** Where a lamp's shade hangs, set by the radial mass. */
  lampHead?: { at: Vec3; tilt: number };
  /** Free floor area inside a hollow building — where its furniture stands. */
  interior?: { halfW: number; halfL: number; floorY: number };
  /** Top of the floor slab inside a room shell. */
  floorY?: number;
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
  let parts = buildParts(bp, "p");

  // "три стула" — the same object again, side by side.
  if (bp.copies > 1) {
    const { min, max } = partsBounds(parts);
    const step = (max[0] - min[0]) * 1.25;
    const single = parts;
    parts = [];
    for (let i = 0; i < bp.copies; i++) {
      const dx = (i - (bp.copies - 1) / 2) * step;
      parts.push(...translateParts(single, [dx, 0, 0], `c${i}-`));
    }
  }

  return wrapConcept({
    name: titleFromPrompt(bp.prompt, "Модель Atrion"),
    description: describeModel(bp),
    category: bp.kind,
    seed: bp.seed,
    parts,
    engineeringNotes: [
      `Разбор запроса: ${describeBlueprint(bp)}`,
      `Найденные признаки: ${bp.matched.join(", ")}`,
      `Собрано деталей: ${parts.length}`,
    ],
  });
}

/** Geometry for one blueprint, before grounding — reused for room furniture. */
function buildParts(bp: Blueprint, prefix: string): ModelPart[] {
  if(bp.kind==="aircraft"&&bp.matched.includes("ракета")&&/ракет|rocket|носител|баллистич/i.test(bp.prompt))return rocketParts(bp);
  const ctx: Ctx = {
    bp,
    rng: bp.rng,
    id: ids(prefix),
    parts: [],
    body: { halfW: bp.width / 2, halfL: bp.length / 2, y0: 0, y1: bp.height },
    upright: bp.legs === 2 || bp.massPlan === "stacked" || bp.massPlan === "shell",
  };

  // A bridge has its own anatomy — deck, lanes, piers, pylons — not a body.
  if (bp.bridge) {
    buildBridge(ctx);
    return ctx.parts;
  }

  // A sword on its own is the whole object, not a detail on a body.
  if (bp.kind === "weapon" && bp.arms === 0) {
    addStandaloneBlade(ctx);
    return ctx.parts;
  }

  const clearance = groundClearance(ctx);
  ctx.body.y0 = clearance;
  ctx.body.y1 = Math.max(clearance + bp.height * 0.12, bp.height - topReserve(ctx));

  const living = hasLivingAnatomy(bp);
  if (living) buildLivingAnatomy(ctx);
  else buildMass(ctx);

  // Ground contact
  if (bp.wheels > 0) addWheels(ctx);
  if (bp.trailer) addTrailer(ctx);
  if (bp.tracks) addTracks(ctx);
  if (bp.legs > 0 && !living) addLegs(ctx);
  if (bp.furnitureLegs > 0) addFurnitureLegs(ctx);
  if (bp.hull) addHull(ctx);
  if (bp.skids) addSkids(ctx);

  // Anatomy
  if (bp.head > 0 && !living) addHead(ctx);
  if (bp.arms > 0 && (!living || bp.kind !== "character")) addArms(ctx);
  if (bp.armour && bp.head > 0 && ctx.upright) addArmour(ctx);
  if (bp.blade) addHeldBlade(ctx);
  if (bp.wings > 0) addWings(ctx);
  if (bp.tail > 0 && (!living || bp.kind === "character")) addTail(ctx);
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
  if (bp.storefront) addStorefront(ctx);
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
  if (bp.furnishings.length && (bp.massPlan === "shell" || ctx.interior)) furnishRoom(ctx);

  // Hardware
  if (bp.screens > 0) addScreens(ctx);
  if (bp.keyboard) addKeyboard(ctx);
  if (bp.buttons > 0) addButtons(ctx);
  if (bp.lenses > 0) addLenses(ctx);
  if (bp.antennas > 0) addAntennas(ctx);
  if (bp.vents > 0) addVents(ctx);
  if (bp.slots > 0) addSlots(ctx);
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
  if (living) fitLivingDimensions(ctx.parts, bp);
  return ctx.parts;
}

function describeModel(bp: Blueprint): string {
  const bits: string[] = [];
  if (bp.floors > 0) bits.push(`${bp.floors} эт.`);
  if (bp.wheels) bits.push(`${bp.wheels} колёс`);
  if (bp.legs) bits.push(`${bp.legs} опор`);
  if (bp.wings) bits.push(`${bp.wings} крыла`);
  if (bp.windows) bits.push(`${bp.windows} окон`);
  if (bp.screens) bits.push("экран");
  if (bp.roof !== "none") bits.push(`крыша ${bp.roof}`);
  if (bp.furnishings.length) bits.push(`мебель: ${bp.furnishings.join(", ")}`);
  if (bp.copies > 1) bits.push(`${bp.copies} шт.`);
  return `Модель по описанию «${bp.prompt}». ${bits.length ? `Состав: ${bits.join(", ")}.` : ""} Габарит ${bp.width.toFixed(2)} × ${bp.length.toFixed(2)} × ${bp.height.toFixed(2)} м.`;
}

/* ================= mass ================= */

/** Wheel diameter: a house on wheels rolls on trailer wheels, not on wheels as tall as its walls. */
function wheelDiameter(bp: Blueprint): number {
  const diameter = bp.height * bp.wheelSize;
  return bp.kind === "vehicle" || bp.kind === "aircraft" ? diameter : Math.min(diameter, 0.9);
}

function groundClearance(ctx: Ctx): number {
  const { bp } = ctx;
  if (bp.wheels > 0) return wheelDiameter(bp) * 0.55;
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
  const single = bp.kind === "appliance" || bp.kind === "furniture" || bp.kind === "device";
  const levels = clamp(
    bp.floors > 0 ? bp.floors : single ? Math.max(1, bp.bodySegments) : Math.max(2, bp.bodySegments),
    1,
    40
  );
  const profile = stackProfile(ctx, levels);
  const total = body.y1 - body.y0;
  const step = total / levels;

  // A furnished house is built as slabs and walls instead of solid storeys, so
  // the section view has rooms to show.
  if (bp.kind === "building" && bp.furnishings.length && levels <= 3) {
    massHollow(ctx, levels, step);
    return;
  }

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

  // A tall building is a few massed volumes, not one box per storey. Emitting
  // forty boxes made the model heavy to edit and read as a stack of crates;
  // this groups the storeys into a podium and two-to-four shafts and lets one
  // repeated part draw every floor band.
  if (levels > 4) {
    const shafts = clamp(Math.round(levels / 9) + 1, 2, 4);
    const podium = levels >= 10 ? Math.min(2, levels - 2) : 0;
    const blocks: { from: number; to: number; k: number; label: string }[] = [];

    if (podium > 0) blocks.push({ from: 0, to: podium, k: 1.16, label: "Стилобат" });
    const remaining = levels - podium;
    const perShaft = Math.ceil(remaining / shafts);
    for (let i = 0; i < shafts; i++) {
      const from = podium + i * perShaft;
      const to = Math.min(levels, from + perShaft);
      if (to <= from) break;
      blocks.push({ from, to, k: 1 - i * 0.09, label: `Объём ${i + 1}` });
    }

    for (const block of blocks) {
      const count = block.to - block.from;
      const centre = body.y0 + step * (block.from + count / 2);
      push(
        ctx,
        part(ctx.id(), `${block.label} · этажи ${block.from + 1}–${block.to}`, {
          shape: bp.bodyShape === "prism" ? "box" : bp.bodyShape,
          role: "volume",
          group: "Этажи",
          position: [0, centre, 0],
          size: [bp.width * block.k, step * count, bp.length * block.k],
          color: block.k >= 1 ? shade(bp.primary, -0.06) : bp.primary,
          material: "Основной объём",
          metalness: bp.metalness,
          roughness: bp.roughness,
          ...(bp.glassy ? { opacity: 0.72 } : {}),
        }),
        part(ctx.id(), `Межэтажный пояс · ${block.label}`, {
          shape: "box",
          role: "detail",
          group: "Фасад",
          position: [0, body.y0 + step * (block.from + 1), 0],
          size: [
            bp.width * block.k + bp.width * 0.025,
            step * 0.08,
            bp.length * block.k + bp.length * 0.025,
          ],
          color: bp.trim,
          material: "Пояс",
          roughness: 0.8,
          repeat: { count, step: [0, step, 0] },
        })
      );
    }

    const base = blocks[0]?.k ?? 1;
    body.halfW = (bp.width * base) / 2;
    body.halfL = (bp.length * base) / 2;
    return;
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

/** Storeys as floor slabs and four walls — the shell of a house with an interior. */
function massHollow(ctx: Ctx, levels: number, step: number) {
  const { bp, body } = ctx;
  const wall = clamp(Math.min(bp.width, bp.length) * 0.025, 0.12, 0.3);
  const slab = Math.max(0.12, step * 0.06);

  for (let i = 0; i < levels; i++) {
    const y0 = body.y0 + step * i;
    const wallH = step - slab;
    const wallY = y0 + slab + wallH / 2;
    const tone = i % 2 === 0 ? bp.primary : shade(bp.primary, -0.05);
    push(
      ctx,
      part(ctx.id(), i === 0 ? "Пол первого этажа" : `Перекрытие ${i + 1} этажа`, {
        shape: "box",
        role: i === 0 ? "foundation" : "structure",
        group: "Перекрытия",
        position: [0, y0 + slab / 2, 0],
        size: [bp.width, slab, bp.length],
        color: shade(bp.secondary, -0.08),
        material: "Перекрытие",
        roughness: 0.85,
      }),
      part(ctx.id(), `Стена фасада · этаж ${i + 1}`, {
        shape: "box",
        role: "wall",
        group: "Стены",
        position: [0, wallY, bp.length / 2 - wall / 2],
        size: [bp.width, wallH, wall],
        color: tone,
        material: "Стена",
        metalness: bp.metalness,
        roughness: bp.roughness,
        mirror: "z",
      }),
      part(ctx.id(), `Боковая стена · этаж ${i + 1}`, {
        shape: "box",
        role: "wall",
        group: "Стены",
        position: [bp.width / 2 - wall / 2, wallY, 0],
        size: [wall, wallH, bp.length - wall * 2],
        color: shade(tone, -0.03),
        material: "Стена",
        metalness: bp.metalness,
        roughness: bp.roughness,
        mirror: "x",
      })
    );
  }

  ctx.interior = { halfW: bp.width / 2 - wall, halfL: bp.length / 2 - wall, floorY: body.y0 + slab };
  body.halfW = bp.width / 2;
  body.halfL = bp.length / 2;
}

function massElongated(ctx: Ctx) {
  const { bp, body } = ctx;
  const segments = clamp(Math.max(2, bp.bodySegments), 1, 6);
  const total = body.y1 - body.y0;
  const step = bp.length / segments;

  // Cars, trucks and boats carry a raised cabin. It has to fit inside the
  // requested height: stacking it on top made a 1.5 m sports car 2.1 m tall.
  const cabin =
    (bp.wheels > 2 || bp.tracks || bp.hull) && !bp.cannon && bp.kind !== "aircraft";
  const truck = cabin && bp.wheels > 0 && (bp.wheels >= 6 || bp.length >= 7);
  const lowerShare = !cabin ? 1 : truck ? 0.4 : bp.hull ? 0.62 : 0.56;
  const lower = total * lowerShare;
  const lowerTop = body.y0 + lower;

  for (let i = 0; i < segments; i++) {
    const t = segments === 1 ? 0 : i / (segments - 1);
    const shrink = 1 - t * bp.taper * 0.6;
    const z = -bp.length / 2 + step * (i + 0.5);
    const height = cabin ? lower : total * (0.9 + 0.1 * shrink);
    push(
      ctx,
      part(ctx.id(), cabin ? (truck ? `Рама ${i + 1}` : `Кузов ${i + 1}`) : `Корпус ${i + 1}`, {
        shape: bp.bodyShape === "prism" ? "box" : bp.bodyShape,
        role: "volume",
        group: "Корпус",
        position: [0, body.y0 + (cabin ? lower / 2 : total * 0.5), z],
        size: [bp.width * shrink, height, step * 1.04],
        color: i === 0 ? shade(bp.primary, -0.04) : bp.primary,
        material: "Корпус",
        metalness: bp.metalness,
        roughness: bp.roughness,
      })
    );
  }

  body.halfW = bp.width / 2;
  body.halfL = bp.length / 2;
  if (!cabin) return;

  const upper = body.y1 - lowerTop;
  if (truck) {
    // Cab up front, cargo box behind it.
    const cabL = bp.length * 0.26;
    const cabZ = bp.length / 2 - cabL / 2;
    const cargoL = bp.length - cabL - bp.length * 0.04;
    push(
      ctx,
      part(ctx.id(), "Кабина", {
        shape: "box",
        role: "volume",
        group: "Кабина",
        position: [0, lowerTop + upper / 2 - upper * 0.02, cabZ],
        size: [bp.width * 0.94, upper * 1.04, cabL],
        color: shade(bp.primary, 0.05),
        material: "Кабина",
        metalness: bp.metalness,
        roughness: bp.roughness,
      }),
      part(ctx.id(), "Грузовой отсек", {
        shape: "box",
        role: "volume",
        group: "Кузов",
        position: [0, lowerTop + (upper * 0.96) / 2 - upper * 0.02, -bp.length / 2 + cargoL / 2],
        size: [bp.width * 0.98, upper * 0.96, cargoL],
        color: shade(bp.secondary, 0.08),
        material: "Фургон",
        roughness: 0.7,
      })
    );
    ctx.cabin = { y0: lowerTop, y1: body.y1, z0: bp.length / 2 - cabL, z1: bp.length / 2, halfW: bp.width * 0.47 };
  } else {
    const cabinL = bp.length * (bp.hull ? 0.36 : 0.46);
    const cabinZ = -bp.length * (bp.hull ? 0.08 : 0.04);
    push(
      ctx,
      part(ctx.id(), bp.hull ? "Надстройка" : "Кабина", {
        shape: "box",
        role: "volume",
        group: "Кабина",
        position: [0, lowerTop + upper / 2 - upper * 0.03, cabinZ],
        size: [bp.width * 0.84, upper * 1.06, cabinL],
        color: shade(bp.primary, 0.06),
        material: bp.hull ? "Надстройка" : "Кабина",
        metalness: bp.metalness,
        roughness: bp.roughness,
      }),
      // Hood and trunk slope into the cabin instead of meeting it at a step.
      part(ctx.id(), "Капот", {
        shape: "wedge",
        role: "detail",
        group: "Кузов",
        position: [0, lowerTop + upper * 0.12, cabinZ + cabinL / 2 + bp.length * 0.05],
        size: [bp.length * 0.1, upper * 0.24, bp.width * 0.84],
        rotation: [0, Math.PI / 2, 0],
        color: shade(bp.primary, -0.02),
        material: "Капот",
        metalness: bp.metalness,
        roughness: bp.roughness,
      })
    );
    ctx.cabin = {
      y0: lowerTop,
      y1: body.y1,
      z0: cabinZ - cabinL / 2,
      z1: cabinZ + cabinL / 2,
      halfW: bp.width * 0.42,
    };
  }

  // From here on "the body" is the lower hull — lights, trim and doors sit on it.
  body.y1 = lowerTop;
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

/** Point `length` along a direction tilted `angle` radians from +y toward +z. */
function along(start: Vec3, angle: number, length: number): Vec3 {
  return [start[0], start[1] + Math.cos(angle) * length, start[2] + Math.sin(angle) * length];
}

/** A lamp: weighted base, a stem or a jointed arm, and the head the shade hangs from. */
function massLamp(ctx: Ctx) {
  const { bp, body } = ctx;
  const total = body.y1 - body.y0;
  const baseD = Math.max(bp.width * 0.75, total * 0.32);
  const baseH = total * 0.05;
  const stemD = Math.max(0.012, total * 0.035);
  const metal = { metalness: Math.max(bp.metalness, 0.55), roughness: 0.35 };

  push(
    ctx,
    part(ctx.id(), "Основание", {
      shape: "cylinder",
      role: "foundation",
      group: "База",
      position: [0, body.y0 + baseH / 2, 0],
      size: [baseD, baseH, baseD],
      sides: 32,
      color: shade(bp.trim, 0.08),
      material: "Утяжелённое основание",
      ...metal,
    }),
    part(ctx.id(), "Выключатель", {
      shape: "box",
      role: "detail",
      group: "База",
      position: [baseD * 0.28, body.y0 + baseH + total * 0.008, baseD * 0.12],
      size: [baseD * 0.12, total * 0.016, baseD * 0.08],
      color: bp.accent,
      material: "Выключатель",
    })
  );

  const baseTop = body.y0 + baseH;
  if (!bp.lampArm) {
    const stemH = total * 0.8;
    push(
      ctx,
      part(ctx.id(), "Стойка", {
        shape: "cylinder",
        role: "structure",
        group: "Стойка",
        position: [0, baseTop + stemH / 2, 0],
        size: [stemD, stemH, stemD],
        sides: 16,
        color: bp.primary,
        material: "Стойка",
        ...metal,
      })
    );
    ctx.lampHead = { at: [0, baseTop + stemH, 0], tilt: 0 };
  } else {
    // Two arms and two joints — the silhouette that says "desk lamp".
    const lowerAngle = -0.3;
    const upperAngle = 1.15;
    const lowerL = total * 0.62;
    const upperL = total * 0.42;
    const start: Vec3 = [0, baseTop, -baseD * 0.12];
    const elbow = along(start, lowerAngle, lowerL);
    const wrist = along(elbow, upperAngle, upperL);
    const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

    push(
      ctx,
      part(ctx.id(), "Нижнее плечо", {
        shape: "cylinder",
        role: "structure",
        group: "Стойка",
        position: mid(start, elbow),
        size: [stemD, lowerL, stemD],
        rotation: [lowerAngle, 0, 0],
        sides: 14,
        color: bp.primary,
        material: "Плечо",
        ...metal,
      }),
      part(ctx.id(), "Пружина", {
        shape: "cylinder",
        role: "detail",
        group: "Стойка",
        position: mid(start, elbow),
        size: [stemD * 0.45, lowerL * 0.7, stemD * 0.45],
        rotation: [lowerAngle, 0, 0],
        sides: 8,
        color: "#b6bcc4",
        material: "Пружина",
        metalness: 0.85,
        roughness: 0.25,
      }),
      part(ctx.id(), "Локтевой шарнир", {
        shape: "sphere",
        role: "detail",
        group: "Стойка",
        position: elbow,
        size: [stemD * 2.2, stemD * 2.2, stemD * 2.2],
        color: shade(bp.trim, -0.05),
        material: "Шарнир",
        ...metal,
      }),
      part(ctx.id(), "Верхнее плечо", {
        shape: "cylinder",
        role: "structure",
        group: "Стойка",
        position: mid(elbow, wrist),
        size: [stemD * 0.9, upperL, stemD * 0.9],
        rotation: [upperAngle, 0, 0],
        sides: 14,
        color: bp.primary,
        material: "Плечо",
        ...metal,
      }),
      part(ctx.id(), "Шарнир плафона", {
        shape: "sphere",
        role: "detail",
        group: "Стойка",
        position: wrist,
        size: [stemD * 1.8, stemD * 1.8, stemD * 1.8],
        color: shade(bp.trim, -0.05),
        material: "Шарнир",
        ...metal,
      })
    );
    ctx.lampHead = { at: wrist, tilt: 0.55 };
  }

  body.halfW = baseD / 2;
  body.halfL = baseD / 2;
  body.y1 = baseTop;
}

function massRadial(ctx: Ctx) {
  const { bp, body } = ctx;
  if (bp.kind === "lighting") {
    massLamp(ctx);
    return;
  }
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
    // Back and left walls only: the default camera looks in from the front
    // right, and a right-hand wall would hide the whole interior.
    part(ctx.id(), "Боковая стена", {
      shape: "box",
      role: "wall",
      group: "Стены",
      position: [-bp.width / 2 + wall / 2, body.y0 + h / 2, 0],
      size: [wall, h, bp.length],
      color: shade(bp.primary, -0.04),
      material: "Стена",
      roughness: 0.9,
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
      position: [-bp.width / 2 + wall * 1.4, body.y0 + wall + h * 0.03, 0],
      size: [wall * 0.6, h * 0.045, bp.length * 0.98],
      color: bp.trim,
      material: "Плинтус",
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
  ctx.floorY = body.y0 + wall;
}

/* ================= ground contact ================= */

function addWheels(ctx: Ctx) {
  const { bp, body } = ctx;
  const diameter = wheelDiameter(bp);
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

/** Shoulder, reach and limb thickness — shared by the arms and whatever they hold. */
function armFrame(ctx: Ctx) {
  const { body } = ctx;
  const span = body.y1 - body.y0;
  const shoulderY = body.y1 - span * 0.12;
  const armLength = span * 0.92;
  const thickness = Math.min(body.halfW * 0.34, armLength * 0.16);
  const x = body.halfW * 1.02;
  return { span, shoulderY, armLength, thickness, x, hand: [x + thickness * 0.34, shoulderY - armLength * 0.98, 0] as Vec3 };
}

function addArms(ctx: Ctx) {
  const { bp } = ctx;
  const count = clamp(bp.arms, 1, 8);
  const pairs = Math.max(1, Math.round(count / 2));
  const { span, shoulderY, armLength, thickness, x } = armFrame(ctx);
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

/**
 * Glazing for a whole facade.
 *
 * `repeat` is one-dimensional, so a grid of windows is either one part per
 * storey repeated across, or one part per column repeated upward. Picking the
 * cheaper axis is what makes tall buildings viable: a 20-storey block used to
 * cost 160 parts and stopped glazing at floor 12; column-major it is a couple
 * of dozen parts and every storey is glazed.
 */
function addWindows(ctx: Ctx) {
  const { bp, body } = ctx;
  if (ctx.cabin) {
    addVehicleGlazing(ctx);
    return;
  }
  if (bp.massPlan === "shell") {
    addRoomWindows(ctx);
    return;
  }
  const levels = Math.max(1, bp.floors || 1);
  const span = body.y1 - body.y0;
  const levelHeight = span / levels;
  const frameColor = shade(bp.trim, 0.35);
  const glass = bp.glassy ? "#a7d8f5" : "#8ecbf0";

  // Bay spacing follows the building, not an arbitrary window count: a 200 m
  // mall gets a rhythm of bays instead of six lonely openings.
  const bay = bp.sizeClass === "structure" || bp.sizeClass === "landmark" ? 3.6 : 1.6;

  const facade = (
    label: string,
    facing: "front" | "right",
    facadeWidth: number,
    axis: "x" | "z",
    offsetOut: number
  ) => {
    // Bay rhythm decides the count, unless the prompt named one outright.
    const maxColumns = bp.windowsExplicit
      ? clamp(Math.ceil(bp.windows / levels), 2, 20)
      : 20;
    const columns = clamp(Math.round((facadeWidth * 0.86) / bay), 2, maxColumns);
    const usable = facadeWidth * 0.86;
    const stepAcross = usable / columns;
    const windowWidth = stepAcross * (bp.windowStyle === "curtain" ? 0.9 : 0.6);
    const windowHeight = levelHeight * (bp.windowStyle === "curtain" ? 0.74 : 0.48);
    const columnMajor = levels > columns;

    const positionFor = (index: number, level: number): Vec3 => {
      const across = -usable / 2 + stepAcross * (index + 0.5);
      const y = body.y0 + levelHeight * (level + 0.55);
      return axis === "x" ? [across, y, offsetOut] : [offsetOut, y, across];
    };

    const shared = {
      id: ctx.id,
      group: "Фасад",
      width: windowWidth,
      height: windowHeight,
      facing,
      frameColor,
      glassColor: glass,
      mullions: bp.windowStyle === "curtain" ? 2 : 1,
      transom: bp.windowStyle !== "punched",
      sill: bp.windowStyle === "punched",
      ...(facing === "right" ? { mirror: "x" as const } : {}),
    };

    if (columnMajor) {
      for (let column = 0; column < columns; column++) {
        push(
          ctx,
          windowUnit({
            ...shared,
            name: `${label} · ось ${column + 1}`,
            center: positionFor(column, 0),
            repeat: { count: levels, step: [0, levelHeight, 0] },
          })
        );
      }
      return;
    }

    for (let level = 0; level < levels; level++) {
      const stepVector: Vec3 = axis === "x" ? [stepAcross, 0, 0] : [0, 0, stepAcross];
      push(
        ctx,
        windowUnit({
          ...shared,
          name: `${label} · этаж ${level + 1}`,
          center: positionFor(0, level),
          shutters: bp.detail > 1.3 && bp.windowStyle === "punched" && levels <= 2,
          repeat: { count: columns, step: stepVector },
        })
      );
    }
  };

  facade("Окно", "front", bp.width, "x", body.halfL);
  if (bp.detail > 0.9) facade("Окно бок", "right", bp.length, "z", body.halfW);
}

/**
 * Shop frontage: a glazed entrance atrium with a lit sign, canopies over the
 * shop windows, plant on the roof and a forecourt with parking. Without them
 * a shopping centre reads as an office block.
 */
function addStorefront(ctx: Ctx) {
  const { bp, body } = ctx;
  const front = body.halfL;
  const ground = body.y0;
  const tall = body.y1 - body.y0;
  const atriumW = clamp(bp.width * 0.24, 8, 26);
  const atriumH = clamp(tall + 2, 6, tall + 4);
  const atriumD = 6;
  const frame = shade(bp.trim, -0.25);
  const plazaD = 8;
  const parkD = 26;
  const parkZ = front + plazaD + parkD / 2;
  const stalls = clamp(Math.floor((bp.width * 0.85) / 2.7), 4, 40);
  const lamps = clamp(Math.round(bp.width / 25), 2, 6);
  const plant = clamp(Math.round(bp.width / 20), 2, 6);
  const canopyW = Math.max(2, (bp.width * 0.92 - atriumW) / 2);

  push(
    ctx,
    part(ctx.id(), "Входной атриум", {
      shape: "box",
      role: "window",
      group: "Вход",
      position: [0, ground + atriumH / 2, front + atriumD / 2],
      size: [atriumW, atriumH, atriumD],
      color: "#9fd3ee",
      material: "Стекло",
      opacity: 0.55,
      metalness: 0.4,
      roughness: 0.1,
    }),
    part(ctx.id(), "Импост атриума", {
      shape: "box",
      role: "structure",
      group: "Вход",
      position: [-atriumW / 2, ground + atriumH / 2, front + atriumD + 0.05],
      size: [0.18, atriumH, 0.18],
      color: frame,
      material: "Алюминий",
      metalness: 0.7,
      repeat: { count: 7, step: [atriumW / 6, 0, 0] },
    }),
    part(ctx.id(), "Ригель атриума", {
      shape: "box",
      role: "structure",
      group: "Вход",
      position: [0, ground + atriumH / 3, front + atriumD + 0.05],
      size: [atriumW, 0.15, 0.15],
      color: frame,
      material: "Алюминий",
      metalness: 0.7,
      repeat: { count: 2, step: [0, atriumH / 3, 0] },
    }),
    part(ctx.id(), "Кровля атриума", {
      shape: "box",
      role: "roof",
      group: "Вход",
      position: [0, ground + atriumH + 0.15, front + atriumD / 2],
      size: [atriumW + 0.4, 0.3, atriumD + 0.4],
      color: frame,
      material: "Алюминий",
      metalness: 0.6,
    }),
    part(ctx.id(), "Вывеска", {
      shape: "box",
      role: "light",
      group: "Вывеска",
      position: [0, ground + atriumH - 1.3, front + atriumD + 0.3],
      size: [atriumW * 0.8, 1.6, 0.3],
      color: bp.accent,
      material: "Световой короб",
      emissive: 0.6,
    }),
    part(ctx.id(), "Буквы вывески", {
      shape: "box",
      role: "light",
      group: "Вывеска",
      position: [-atriumW * 0.3, ground + atriumH - 1.3, front + atriumD + 0.5],
      size: [atriumW * 0.07, 1, 0.12],
      color: "#fff8e6",
      material: "Световые буквы",
      emissive: 0.9,
      repeat: { count: 6, step: [atriumW * 0.12, 0, 0] },
    }),
    part(ctx.id(), "Навес над витринами", {
      shape: "box",
      role: "roof",
      group: "Фасад",
      position: [atriumW / 2 + canopyW / 2, ground + 4.2, front + 1.2],
      size: [canopyW, 0.25, 2.4],
      color: bp.trim,
      material: "Навес",
      mirror: "x",
    }),
    part(ctx.id(), "Вентиляционная установка", {
      shape: "box",
      role: "detail",
      group: "Крыша",
      position: [-bp.width / 2 + bp.width / (plant + 1), body.y1 + 0.09 + 0.9, -bp.length * 0.2],
      size: [3.2, 1.8, 2.4],
      color: "#b8bcc2",
      material: "Оцинкованная сталь",
      metalness: 0.5,
      mirror: "z",
      repeat: { count: plant, step: [bp.width / (plant + 1), 0, 0] },
    }),
    part(ctx.id(), "Площадь перед входом", {
      shape: "box",
      role: "foundation",
      group: "Территория",
      position: [0, ground + 0.075, front + plazaD / 2],
      size: [bp.width * 0.9, 0.15, plazaD],
      color: "#cfc8bb",
      material: "Плитка",
      roughness: 0.9,
    }),
    part(ctx.id(), "Парковка", {
      shape: "box",
      role: "foundation",
      group: "Территория",
      position: [0, ground + 0.05, parkZ],
      size: [bp.width * 0.9, 0.1, parkD],
      color: "#3a3d42",
      material: "Асфальт",
      roughness: 0.95,
    }),
    part(ctx.id(), "Разметка парковки", {
      shape: "box",
      role: "detail",
      group: "Территория",
      position: [-((stalls - 1) * 2.7) / 2, ground + 0.11, front + plazaD + 3],
      size: [0.12, 0.02, 5],
      color: "#f2f0e8",
      material: "Разметка",
      repeat: { count: stalls, step: [2.7, 0, 0] },
    }),
    part(ctx.id(), "Разметка парковки, дальний ряд", {
      shape: "box",
      role: "detail",
      group: "Территория",
      position: [-((stalls - 1) * 2.7) / 2, ground + 0.11, front + plazaD + parkD - 3],
      size: [0.12, 0.02, 5],
      color: "#f2f0e8",
      material: "Разметка",
      repeat: { count: stalls, step: [2.7, 0, 0] },
    }),
    part(ctx.id(), "Опора освещения парковки", {
      shape: "cylinder",
      role: "structure",
      group: "Территория",
      position: [-bp.width * 0.35, ground + 4, parkZ],
      size: [0.2, 8, 0.2],
      sides: 10,
      color: "#4a4f57",
      material: "Сталь",
      metalness: 0.7,
      repeat: { count: lamps, step: [(bp.width * 0.7) / Math.max(1, lamps - 1), 0, 0] },
    }),
    part(ctx.id(), "Светильник парковки", {
      shape: "box",
      role: "light",
      group: "Территория",
      position: [-bp.width * 0.35, ground + 8.1, parkZ],
      size: [1.2, 0.2, 0.5],
      color: "#fff3cf",
      material: "Светильник",
      emissive: 0.85,
      repeat: { count: lamps, step: [(bp.width * 0.7) / Math.max(1, lamps - 1), 0, 0] },
    })
  );
}

function addDoors(ctx: Ctx) {
  const { bp, body } = ctx;
  const span = body.y1 - body.y0;
  const height = Math.min(span * 0.72, bp.height * 0.3);
  const width = Math.min(bp.width * 0.2, height * 0.62);

  if (ctx.cabin && bp.kind === "vehicle") {
    addVehicleDoors(ctx);
    return;
  }

  if (bp.massPlan === "shell") {
    // A room door on the side wall, opening inward.
    const doorH = Math.min(2.05, span * 0.78);
    push(
      ctx,
      doorUnit({
        id: ctx.id,
        group: "Вход",
        center: [-body.halfW, (ctx.floorY ?? body.y0) + doorH / 2, body.halfL * 0.45],
        width: Math.min(0.9, bp.length * 0.25),
        height: doorH,
        facing: "right",
        leafColor: shade(bp.accent, -0.1),
        frameColor: shade(bp.trim, 0.3),
      })
    );
    return;
  }

  if (bp.shelves > 0 || bp.drawers > 0 || bp.kind === "appliance" || bp.kind === "furniture") {
    // Cabinet doors: full-height leaves on the front of the carcass. When there
    // are drawers too, the doors take the left part and the drawers the right.
    const leaves = clamp(bp.doors, 1, 4);
    const share = bp.drawers > 0 ? 0.6 : 0.96;
    const leafWidth = (bp.width * share) / leaves;
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
  // Doors take the left of the front when both are present (see addDoors).
  const frontW = bp.doors > 0 ? bp.width * 0.34 : bp.width * 0.9;
  const frontX = bp.doors > 0 ? bp.width * 0.3 : 0;

  push(
    ctx,
    part(ctx.id(), "Фасад ящика", {
      shape: "box",
      role: "furniture",
      group: "Ящики",
      position: [frontX, body.y0 + span * 0.05 + height / 2, body.halfL + bp.length * 0.015],
      size: [frontW, height * 0.9, bp.length * 0.03],
      color: shade(bp.primary, 0.08),
      material: "Фасад",
      roughness: bp.roughness,
      repeat: { count, step: [0, height, 0] },
    }),
    part(ctx.id(), "Ручка ящика", {
      shape: "cylinder",
      role: "detail",
      group: "Ящики",
      position: [frontX, body.y0 + span * 0.05 + height / 2, body.halfL + bp.length * 0.04],
      size: [bp.width * 0.018, frontW * 0.34, bp.width * 0.018],
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

  const appliance = bp.kind === "appliance";
  push(
    ctx,
    screenPanel({
      id: ctx.id,
      ...(appliance ? { name: "Дверца со стеклом" } : {}),
      center: [appliance ? -bp.width * 0.12 : 0, body.y0 + (body.y1 - body.y0) * 0.5, body.halfL + bp.length * 0.02],
      width: appliance ? bp.width * 0.62 : width,
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
  const span = body.y1 - body.y0;

  if (bp.kind === "appliance" && (bp.screens > 0 || bp.bodyShape === "cylinder")) {
    // Microwave: a column beside the door. Robot vacuum: buttons on the lid.
    const top = bp.bodyShape === "cylinder";
    push(
      ctx,
      part(ctx.id(), "Кнопка", {
        shape: "cylinder",
        role: "detail",
        group: "Управление",
        position: top
          ? [-size * 0.8, body.y1 + size * 0.1, size * 1.6]
          : [bp.width * 0.37, body.y0 + span * 0.78, body.halfL + size * 0.2],
        size: [size, size * 0.4, size],
        ...(top ? {} : { rotation: [Math.PI / 2, 0, 0] as Vec3 }),
        sides: 14,
        color: bp.accent,
        material: "Кнопка",
        metalness: 0.3,
        roughness: 0.4,
        repeat: { count, step: top ? [size * 1.6, 0, 0] : [0, -span * 0.12, 0] },
      })
    );
    return;
  }
  const y = body.y0 + span * (bp.kind === "appliance" && bp.lenses > 0 ? 0.9 : 0.24);

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
  if (bp.kind === "appliance") {
    // A washing-machine porthole: ring, glass and a hinge.
    const span = body.y1 - body.y0;
    const d = Math.min(bp.width, span) * 0.62;
    const y = body.y0 + span * 0.45;
    push(
      ctx,
      part(ctx.id(), "Люк", {
        shape: "torus",
        role: "door",
        group: "Люк",
        position: [0, y, body.halfL + d * 0.05],
        size: [d, d * 0.14, d],
        rotation: [Math.PI / 2, 0, 0],
        hole: 0.78,
        sides: 36,
        color: "#c9ced6",
        material: "Обод люка",
        metalness: 0.75,
        roughness: 0.25,
      }),
      part(ctx.id(), "Стекло люка", {
        shape: "cylinder",
        role: "window",
        group: "Люк",
        position: [0, y, body.halfL + d * 0.03],
        size: [d * 0.82, d * 0.04, d * 0.82],
        rotation: [Math.PI / 2, 0, 0],
        sides: 36,
        color: "#3a5670",
        material: "Стекло",
        opacity: 0.55,
        roughness: 0.05,
      }),
      part(ctx.id(), "Петля люка", {
        shape: "box",
        role: "detail",
        group: "Люк",
        position: [-d * 0.52, y, body.halfL + d * 0.05],
        size: [d * 0.08, d * 0.2, d * 0.06],
        color: "#9aa3ad",
        material: "Петля",
        metalness: 0.7,
      })
    );
    return;
  }
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

  // Vehicles get handles on their doors; buildings and rooms have none to carry.
  if (ctx.cabin || ["vehicle", "building", "landmark", "room"].includes(bp.kind)) return;

  if (bp.kind === "furniture" || bp.kind === "appliance" || bp.doors > 0) {
    // Pull bars on the front, at the meeting edge of the leaves.
    const span = body.y1 - body.y0;
    const barH = Math.min(span * 0.35, 0.4);
    const barD = Math.max(0.008, Math.min(bp.width, bp.length) * 0.03);
    const paired = bp.doors >= 2 && bp.drawers === 0;
    const x = paired ? bp.width * 0.05 : bp.drawers > 0 ? bp.width * 0.06 : bp.screens > 0 ? bp.width * 0.22 : bp.width * 0.36;
    const y = body.y0 + span * (bp.kind === "appliance" ? 0.62 : 0.5);
    const z = body.halfL + bp.length * 0.04;
    push(
      ctx,
      part(ctx.id(), "Ручка", {
        shape: "cylinder",
        role: "detail",
        group: "Ручка",
        position: [x, y, z + barD * 1.6],
        size: [barD, barH, barD],
        sides: 12,
        color: "#c9ced6",
        material: "Ручка",
        metalness: 0.8,
        roughness: 0.25,
        ...(paired ? { mirror: "x" as const } : {}),
      }),
      part(ctx.id(), "Крепление ручки", {
        shape: "box",
        role: "detail",
        group: "Ручка",
        position: [x, y - barH * 0.38, z + barD * 0.6],
        size: [barD * 0.8, barD * 0.8, barD * 2],
        color: "#9aa3ad",
        material: "Крепление",
        metalness: 0.7,
        repeat: { count: 2, step: [0, barH * 0.76, 0] },
        ...(paired ? { mirror: "x" as const } : {}),
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
  if (bp.kind === "appliance") {
    // Robot vacuum: the lidar turret and a bumper ring.
    push(
      ctx,
      part(ctx.id(), "Лидар", {
        shape: "cylinder",
        role: "detail",
        group: "Датчики",
        position: [0, body.y1 + bp.height * 0.12, -size * 0.12],
        size: [size * 0.26, bp.height * 0.26, size * 0.26],
        sides: 24,
        color: shade(bp.trim, -0.05),
        material: "Лидар",
        metalness: 0.4,
        roughness: 0.3,
      }),
      part(ctx.id(), "Бампер", {
        shape: "tube",
        role: "detail",
        group: "Корпус",
        position: [0, body.y0 + (body.y1 - body.y0) * 0.45, 0],
        size: [size * 1.07, (body.y1 - body.y0) * 0.42, size * 1.07],
        hole: 0.94,
        sides: 40,
        color: "#2a2c31",
        material: "Бампер",
        roughness: 0.7,
      })
    );
    return;
  }
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

function addLampShade(ctx: Ctx) {
  const { bp } = ctx;
  const { at, tilt } = ctx.lampHead!;
  const total = bp.height;
  const desk = bp.lampArm;
  const shadeD = desk ? Math.max(bp.width * 0.8, total * 0.3) : Math.max(bp.width * 0.9, total * 0.24);
  const shadeH = shadeD * (desk ? 0.75 : 0.7);
  // A desk shade hangs off the wrist with its apex on the joint; a floor lamp
  // carries a drum shade centred over the stem.
  const t = desk ? -tilt : 0;
  const center: Vec3 = desk
    ? [at[0], at[1] - Math.cos(t) * shadeH * 0.42, at[2] - Math.sin(t) * shadeH * 0.42]
    : [at[0], at[1] + shadeH * 0.3, at[2]];
  const rim: Vec3 = [0, -Math.cos(t) * shadeH * 0.5, -Math.sin(t) * shadeH * 0.5];

  push(
    ctx,
    part(ctx.id(), desk ? "Плафон" : "Абажур", {
      shape: desk ? "cone" : "tube",
      role: "light",
      group: "Плафон",
      position: center,
      size: [shadeD, shadeH, shadeD],
      rotation: [t, 0, 0],
      sides: 32,
      ...(desk ? {} : { hole: 0.94, opacity: 0.92 }),
      color: desk ? bp.accent : "#efe6d2",
      material: desk ? "Плафон" : "Абажур",
      metalness: desk ? 0.5 : 0,
      roughness: desk ? 0.35 : 0.9,
    }),
    part(ctx.id(), "Лампочка", {
      shape: "sphere",
      role: "light",
      group: "Плафон",
      position: [center[0] + rim[0] * 0.5, center[1] + rim[1] * 0.5, center[2] + rim[2] * 0.5],
      size: [shadeD * 0.32, shadeD * 0.36, shadeD * 0.32],
      color: "#fff2c0",
      material: "Стекло лампы",
      emissive: 0.95,
      opacity: 0.9,
      roughness: 0.1,
    }),
    part(ctx.id(), "Провод", {
      shape: "cylinder",
      role: "detail",
      group: "База",
      position: [0, Math.max(0.004, total * 0.008), -bp.width * 0.4 - total * 0.15],
      size: [Math.max(0.005, total * 0.012), total * 0.3, Math.max(0.005, total * 0.012)],
      rotation: [Math.PI / 2, 0, 0],
      sides: 8,
      color: "#1c1e22",
      material: "Провод",
      roughness: 0.8,
    })
  );
  if (desk) {
    push(
      ctx,
      part(ctx.id(), "Свечение", {
        shape: "cylinder",
        role: "light",
        group: "Плафон",
        position: [center[0] + rim[0] * 0.96, center[1] + rim[1] * 0.96, center[2] + rim[2] * 0.96],
        size: [shadeD * 0.9, shadeH * 0.03, shadeD * 0.9],
        rotation: [t, 0, 0],
        sides: 32,
        color: "#fff7d6",
        material: "Рассеиватель",
        emissive: 0.7,
        opacity: 0.85,
      })
    );
  }
}

function addLights(ctx: Ctx) {
  const { bp, body } = ctx;
  if (bp.kind === "lighting" && ctx.lampHead) {
    addLampShade(ctx);
    return;
  }
  const count = clamp(bp.lights, 1, 8);
  const size = Math.min(bp.width, bp.height) * 0.16;
  const y = body.y0 + (body.y1 - body.y0) * (bp.wheels > 0 ? 0.45 : 0.7);
  const vehicle = bp.kind === "vehicle" || bp.wheels > 0 || bp.tracks;

  push(
    ctx,
    part(ctx.id(), vehicle ? "Фара" : "Световой модуль", {
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

/* ================= bridges ================= */

/**
 * A straight member between two points — a cable, a hanger, a strut. Cylinders
 * are authored along +y; this finds the XYZ euler that points them along
 * `to - from` (Rz first, then Rx, with no yaw needed).
 */
function strut(
  ctx: Ctx,
  name: string,
  from: Vec3,
  to: Vec3,
  thickness: number,
  style: { group: string; color: string; material: string; role?: string; metalness?: number; roughness?: number }
): ModelPart {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(d[0], d[1], d[2]) || 1e-3;
  const [dx, dy, dz] = [d[0] / length, d[1] / length, d[2] / length];
  const gamma = -Math.asin(clamp(dx, -1, 1));
  const alpha = Math.atan2(dz, dy);
  return part(ctx.id(), name, {
    shape: "cylinder",
    role: style.role ?? "structure",
    group: style.group,
    position: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
    size: [thickness, length, thickness],
    rotation: [alpha, 0, gamma],
    sides: 8,
    color: style.color,
    material: style.material,
    metalness: style.metalness ?? 0.7,
    roughness: style.roughness ?? 0.35,
  });
}

/** Evenly spaced positions along a length, kept under the repeat cap. */
function spacing(length: number, wanted: number, cap = 60): { count: number; step: number; start: number } {
  const count = clamp(Math.round(length / wanted), 1, cap);
  const step = length / count;
  return { count, step, start: -length / 2 + step / 2 };
}

/**
 * A bridge people and cars can actually use: a road deck with lanes and
 * markings, sidewalks with kerbs and railings, street lamps, piers on
 * footings, abutments with approach embankments — and, by type, pylons with
 * stay cables, towers with main cables and hangers, or an arch.
 */
function buildBridge(ctx: Ctx) {
  const { bp, rng } = ctx;
  const type = bp.bridge ?? "beam";
  const foot = type === "foot";
  const L = bp.length;
  const W = foot ? Math.min(bp.width, bp.params.width ?? 4) : bp.width;
  const deckTop = bp.explicitAxes.height && type === "beam"
    ? bp.height
    : clamp(L * (foot ? 0.03 : 0.045), foot ? 3 : 6, 30);
  const girder = clamp(L * 0.008, foot ? 0.4 : 0.9, 3.5);
  const deckBottom = deckTop - 0.1 - girder;
  const sidewalk = foot ? 0 : clamp(W * 0.14, 1.5, 3);
  const carriage = W - sidewalk * 2;
  // 3–3.5 m per lane, as on real roads; "8 полос" gets eight when they fit.
  const lanes = foot ? 0 : bp.lanes ? clamp(bp.lanes, 1, Math.max(1, Math.floor(carriage / 3))) : carriage >= 12 ? 4 : 2;
  const median = lanes >= 6;

  const concrete = rng.pick(["#b9b6ae", "#a9aaa5", "#c4bfb4"]);
  const steel = rng.pick(["#c94b3c", "#8f9aa6", "#d8d4cb", "#3f6fa8"]);
  const asphalt = "#2f3136";
  const deckColor = foot && /дерев|wood/i.test(bp.prompt) ? "#8a6a4a" : concrete;
  const cable = { group: "Ванты", color: "#c9ced6", material: "Стальной канат", metalness: 0.85, roughness: 0.3 };

  // Deck, road surface, sidewalks.
  push(
    ctx,
    part(ctx.id(), "Пролётное строение", {
      shape: "box",
      role: "structure",
      group: "Пролёт",
      position: [0, deckBottom + girder / 2, 0],
      size: [W, girder, L],
      color: deckColor,
      material: foot ? "Настил" : "Железобетонная балка",
      roughness: 0.85,
    }),
    part(ctx.id(), foot ? "Настил" : "Проезжая часть", {
      shape: "box",
      role: "foundation",
      group: "Дорога",
      position: [0, deckTop - 0.05, 0],
      size: [foot ? W : carriage, 0.1, L],
      color: foot ? shade(deckColor, 0.08) : asphalt,
      material: foot ? "Настил" : "Асфальт",
      roughness: 0.95,
    })
  );
  if (!foot) {
    push(
      ctx,
      part(ctx.id(), "Тротуар", {
        shape: "box",
        role: "foundation",
        group: "Тротуары",
        position: [W / 2 - sidewalk / 2, deckTop + 0.1, 0],
        size: [sidewalk, 0.3, L],
        color: shade(concrete, 0.08),
        material: "Тротуарная плитка",
        roughness: 0.9,
        mirror: "x",
      }),
      part(ctx.id(), "Бордюр", {
        shape: "box",
        role: "detail",
        group: "Тротуары",
        position: [carriage / 2 + 0.1, deckTop + 0.12, 0],
        size: [0.2, 0.34, L],
        color: "#d8d4cb",
        material: "Бордюрный камень",
        mirror: "x",
      }),
      part(ctx.id(), "Краевая разметка", {
        shape: "box",
        role: "detail",
        group: "Разметка",
        position: [carriage / 2 - 0.35, deckTop + 0.005, 0],
        size: [0.15, 0.02, L],
        color: "#f2f0e8",
        material: "Разметка",
        mirror: "x",
      })
    );
    const dashes = spacing(L, 9);
    for (let k = 1; k < lanes; k++) {
      const x = -carriage / 2 + (carriage / lanes) * k;
      const centre = Math.abs(x) < 0.01;
      if (centre && median) {
        // Six lanes and up: a concrete barrier between the directions.
        push(
          ctx,
          part(ctx.id(), "Разделительный барьер", {
            shape: "box",
            role: "structure",
            group: "Дорога",
            position: [0, deckTop + 0.4, 0],
            size: [0.6, 0.8, L],
            color: "#c9c6be",
            material: "Бетонный барьер",
            roughness: 0.85,
          })
        );
        continue;
      }
      push(
        ctx,
        part(ctx.id(), centre ? "Осевая разметка" : `Разделительная разметка ${k}`, {
          shape: "box",
          role: "detail",
          group: "Разметка",
          position: [x, deckTop + 0.005, centre ? 0 : dashes.start],
          size: centre ? [0.15, 0.02, L] : [0.15, 0.02, 3],
          color: centre ? "#e8c547" : "#f2f0e8",
          material: "Разметка",
          ...(centre ? {} : { repeat: { count: dashes.count, step: [0, 0, dashes.step] as Vec3 } }),
        })
      );
    }
  }

  // Railings on both edges.
  const posts = spacing(L, 2.5);
  const railX = W / 2 - 0.08;
  const railBase = deckTop + (foot ? 0 : 0.25);
  push(
    ctx,
    part(ctx.id(), "Стойка ограждения", {
      shape: "box",
      role: "structure",
      group: "Ограждение",
      position: [railX, railBase + 0.55, posts.start],
      size: [0.1, 1.1, 0.1],
      color: steel,
      material: "Сталь",
      metalness: 0.6,
      mirror: "x",
      repeat: { count: posts.count, step: [0, 0, posts.step] },
    }),
    part(ctx.id(), "Поручень", {
      shape: "box",
      role: "structure",
      group: "Ограждение",
      position: [railX, railBase + 1.1, 0],
      size: [0.12, 0.1, L],
      color: steel,
      material: "Сталь",
      metalness: 0.6,
      mirror: "x",
    }),
    part(ctx.id(), "Средний ригель", {
      shape: "box",
      role: "detail",
      group: "Ограждение",
      position: [railX, railBase + 0.55, 0],
      size: [0.06, 0.06, L],
      color: shade(steel, -0.1),
      material: "Сталь",
      metalness: 0.6,
      mirror: "x",
    })
  );

  // Street lamps along the sidewalks.
  const lamps = spacing(L, foot ? 15 : 30, 24);
  const poleH = foot ? 3.5 : 8;
  push(
    ctx,
    part(ctx.id(), "Опора освещения", {
      shape: "cylinder",
      role: "structure",
      group: "Освещение",
      // On a footbridge the pole stands in the railing line, off the walkway.
      position: [foot ? railX : W / 2 - 0.4, railBase + poleH / 2, lamps.start],
      size: [0.18, poleH, 0.18],
      sides: 10,
      color: "#4a4f57",
      material: "Сталь",
      metalness: 0.7,
      mirror: "x",
      repeat: { count: lamps.count, step: [0, 0, lamps.step] },
    }),
    part(ctx.id(), "Фонарь", {
      shape: "box",
      role: "light",
      group: "Освещение",
      position: [W / 2 - (foot ? 0.6 : 1.4), railBase + poleH, lamps.start],
      size: [foot ? 0.5 : 2, 0.2, 0.45],
      color: "#fff3cf",
      material: "Светильник",
      emissive: 0.85,
      mirror: "x",
      repeat: { count: lamps.count, step: [0, 0, lamps.step] },
    })
  );

  // Abutments and approach embankments, so the road meets the ground.
  const ramp = Math.max(deckTop * 3, 12);
  push(
    ctx,
    part(ctx.id(), "Устой", {
      shape: "box",
      role: "foundation",
      group: "Опоры",
      position: [0, deckBottom / 2, L / 2 + 2],
      size: [W * 1.08, deckBottom, 4],
      color: shade(concrete, -0.08),
      material: "Бетон",
      roughness: 0.9,
      mirror: "z",
    }),
    part(ctx.id(), "Подходная насыпь", {
      shape: "wedge",
      role: "foundation",
      group: "Подходы",
      position: [0, deckTop / 2, L / 2 + 4 + ramp / 2],
      size: [ramp, deckTop, W],
      rotation: [0, Math.PI / 2, 0],
      color: "#6f7a5e",
      material: "Насыпь",
      roughness: 0.95,
      mirror: "z",
    })
  );

  // Piers under the deck; pylons and towers stand on their own footings.
  const reserved: number[] = [];
  const towers = buildBridgeTowers(ctx, type, { L, W, carriage, deckTop, deckBottom, steel, concrete, cable, reserved });
  // Real girders span 25–50 m between piers; a long viaduct gets many.
  const spans = clamp(Math.round(L / (foot ? 25 : 45)), 1, 60);
  const step = L / spans;
  // Consecutive piers become one repeated row, broken where a pylon or an
  // arch already carries the deck.
  const rows: { z: number; count: number }[] = [];
  for (let k = 1; k < spans; k++) {
    const z = -L / 2 + step * k;
    if (reserved.some((r) => Math.abs(r - z) < step / 2)) continue;
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.z + last.count * step - z) < 1e-6) last.count++;
    else rows.push({ z, count: 1 });
  }
  const pierD = clamp(L * 0.006, foot ? 0.35 : 1.1, 3);
  for (const { z, count } of rows) {
    const repeat = count > 1 ? { repeat: { count, step: [0, 0, step] as Vec3 } } : {};
    push(
      ctx,
      part(ctx.id(), "Столб опоры", {
        shape: "cylinder",
        role: "structure",
        group: "Опоры",
        position: [W * 0.3, deckBottom / 2, z],
        size: [pierD, deckBottom, pierD],
        sides: 16,
        color: concrete,
        material: "Бетон",
        roughness: 0.85,
        mirror: "x",
        ...repeat,
      }),
      part(ctx.id(), "Ригель опоры", {
        shape: "box",
        role: "structure",
        group: "Опоры",
        position: [0, deckBottom - pierD * 0.4, z],
        size: [W * 0.92, pierD * 0.8, pierD * 1.3],
        color: shade(concrete, -0.05),
        material: "Бетон",
        roughness: 0.85,
        ...repeat,
      }),
      part(ctx.id(), "Фундамент опоры", {
        shape: "box",
        role: "foundation",
        group: "Опоры",
        position: [0, 0.4, z],
        size: [W * 0.85, 0.8, pierD * 2.6],
        color: shade(concrete, -0.15),
        material: "Бетон",
        roughness: 0.9,
        ...repeat,
      })
    );
  }

  if (bp.water) {
    push(
      ctx,
      part(ctx.id(), "Река", {
        shape: "box",
        role: "detail",
        group: "Окружение",
        position: [0, 0.05, 0],
        size: [Math.max(W * 8, L * 0.4), 0.1, L * 0.75],
        color: "#3f7fa8",
        material: "Вода",
        opacity: 0.8,
        roughness: 0.1,
      })
    );
  }
  void towers;
}

/** Pylons and stay cables, suspension towers and main cables, or an arch. */
function buildBridgeTowers(
  ctx: Ctx,
  type: NonNullable<Blueprint["bridge"]>,
  g: {
    L: number;
    W: number;
    carriage: number;
    deckTop: number;
    deckBottom: number;
    steel: string;
    concrete: string;
    cable: { group: string; color: string; material: string; metalness: number; roughness: number };
    reserved: number[];
  }
): number {
  const { rng } = ctx;
  const { L, W, carriage, deckTop, deckBottom, steel, concrete, cable, reserved } = g;

  if (type === "cable") {
    const count = L > 180 ? 2 : 1;
    const zs = count === 1 ? [0] : [-L * 0.22, L * 0.22];
    const half = count === 1 ? L / 2 : L * 0.22;
    const aShape = rng.chance(0.4);
    const stays = rng.int(7, 11);
    let height = clamp(half * 0.45, 15, 140);
    if (aShape) {
      // Stays from an A-pylon's apex cross the outer lane on their way to the
      // deck edge, so the pylon must be tall enough for its lowest stay to
      // pass over a 4.5 m truck there.
      const edge = W / 2 - 0.25;
      const slack = (edge - carriage / 2 - 0.2) / (edge - 0.4);
      const lowest = 1 - 0.04 - (0.28 * (stays - 1)) / stays;
      height = clamp(Math.max(height, (4.5 / Math.max(slack, 0.05) + 0.3) / lowest), 15, 140);
    }
    const top = deckTop + height;
    const legX = W / 2 + 0.9;
    const leg = clamp(height * 0.05, 1.2, 4);
    for (const z of zs) {
      reserved.push(z);
      if (aShape) {
        const knee = deckTop + 3;
        const style = { group: "Пилоны", color: concrete, material: "Бетон", metalness: 0.05, roughness: 0.85 };
        push(
          ctx,
          part(ctx.id(), "Нижняя стойка пилона", {
            shape: "box",
            role: "structure",
            group: "Пилоны",
            position: [legX, knee / 2, z],
            size: [leg, knee, leg * 1.4],
            color: concrete,
            material: "Бетон",
            roughness: 0.85,
            mirror: "x",
          }),
          { ...strut(ctx, "Верхняя нога пилона", [legX, knee, z], [0.6, top, z], leg, style), mirror: "x" },
          part(ctx.id(), "Ригель под настилом", {
            shape: "box",
            role: "structure",
            group: "Пилоны",
            position: [0, deckBottom - leg * 0.4, z],
            size: [legX * 2 + leg, leg * 0.8, leg],
            color: shade(concrete, -0.05),
            material: "Бетон",
          })
        );
      } else {
        push(
          ctx,
          part(ctx.id(), "Стойка пилона", {
            shape: "box",
            role: "structure",
            group: "Пилоны",
            position: [legX, top / 2, z],
            size: [leg, top, leg * 1.4],
            color: concrete,
            material: "Бетон",
            roughness: 0.85,
            mirror: "x",
          }),
          part(ctx.id(), "Ригель пилона", {
            shape: "box",
            role: "structure",
            group: "Пилоны",
            position: [0, top - height * 0.08, z],
            size: [legX * 2 + leg, leg * 0.8, leg],
            color: shade(concrete, -0.05),
            material: "Бетон",
          }),
          part(ctx.id(), "Ригель под настилом", {
            shape: "box",
            role: "structure",
            group: "Пилоны",
            position: [0, deckBottom - leg * 0.4, z],
            size: [legX * 2 + leg, leg * 0.8, leg],
            color: shade(concrete, -0.05),
            material: "Бетон",
          })
        );
      }
      // Fan of stays from the pylon head to the deck edges, both directions.
      const reach = half * 0.92;
      for (let k = 1; k <= stays; k++) {
        const anchorY = top - height * 0.04 - (height * 0.28 * (k - 1)) / stays;
        const along = (reach * k) / stays;
        for (const dir of [1, -1]) {
          const from: Vec3 = aShape ? [0.4, anchorY, z] : [legX - leg * 0.3, anchorY, z];
          const to: Vec3 = [W / 2 - 0.25, deckTop + 0.3, z + dir * along];
          const stay = strut(ctx, "Вант", from, to, clamp(L * 0.0006, 0.08, 0.3), cable);
          push(ctx, { ...stay, mirror: "x" });
        }
      }
    }
    return count;
  }

  if (type === "suspension") {
    const zs = [-L * 0.3, L * 0.3];
    const main = L * 0.6;
    const height = clamp(main * 0.12, 18, 160);
    const top = deckTop + height;
    const legX = W / 2 + 1;
    const leg = clamp(height * 0.06, 1.2, 5);
    const sagLow = deckTop + 2;
    for (const z of zs) {
      reserved.push(z);
      push(
        ctx,
        part(ctx.id(), "Стойка башни", {
          shape: "box",
          role: "structure",
          group: "Башни",
          position: [legX, top / 2, z],
          size: [leg, top, leg * 1.5],
          color: steel,
          material: "Окрашенная сталь",
          metalness: 0.5,
          mirror: "x",
        }),
        part(ctx.id(), "Портал башни", {
          shape: "box",
          role: "structure",
          group: "Башни",
          position: [0, top - height * 0.1, z],
          size: [legX * 2 + leg, leg, leg],
          color: steel,
          material: "Окрашенная сталь",
          metalness: 0.5,
          repeat: { count: 2, step: [0, -height * 0.4, 0] },
        })
      );
    }
    // Main cables: a parabola across the main span, backstays to the ends.
    const segments = 16;
    const cableAt = (t: number): Vec3 => {
      const z = -main / 2 + main * t;
      const y = sagLow + (top - sagLow) * (2 * t - 1) ** 2;
      return [legX, y, z];
    };
    for (let s = 0; s < segments; s++) {
      push(ctx, { ...strut(ctx, "Несущий кабель", cableAt(s / segments), cableAt((s + 1) / segments), 0.6, cable), mirror: "x" });
    }
    for (const dir of [1, -1]) {
      push(
        ctx,
        { ...strut(ctx, "Оттяжка кабеля", [legX, top, (dir * main) / 2], [legX, deckTop, (dir * L) / 2], 0.6, cable), mirror: "x" }
      );
    }
    const hangers = 14;
    for (let h = 1; h < hangers; h++) {
      const [x, y, z] = cableAt(h / hangers);
      push(ctx, { ...strut(ctx, "Подвеска", [x, y, z], [W / 2 - 0.2, deckTop, z], 0.12, cable), mirror: "x" });
    }
    return 2;
  }

  if (type === "arch") {
    const span = L > 120 ? L * 0.6 : L * 0.85;
    const rise = span * 0.2;
    const segments = 18;
    const ribX = W / 2 - 0.2;
    const ribAt = (t: number): Vec3 => [ribX, deckTop + Math.sin(Math.PI * t) * rise, -span / 2 + span * t];
    for (let s = 0; s < segments; s++) {
      push(ctx, { ...strut(ctx, "Арка", ribAt(s / segments), ribAt((s + 1) / segments), clamp(span * 0.012, 0.5, 2.5), { ...cable, group: "Арка", color: steel, material: "Окрашенная сталь" }), mirror: "x" });
    }
    const hangers = 12;
    for (let h = 1; h < hangers; h++) {
      const [x, y, z] = ribAt(h / hangers);
      push(ctx, { ...strut(ctx, "Подвеска", [x, y, z], [x, deckTop, z], 0.12, cable), mirror: "x" });
    }
    push(
      ctx,
      part(ctx.id(), "Связь арки", {
        shape: "box",
        role: "structure",
        group: "Арка",
        position: [0, deckTop + rise * 0.95, -span * 0.12],
        size: [ribX * 2, 0.5, 0.5],
        color: steel,
        material: "Окрашенная сталь",
        repeat: { count: 3, step: [0, 0, span * 0.12] },
      })
    );
    reserved.push(-span / 2, span / 2);
    return 1;
  }

  return 0;
}

/* ================= vehicles ================= */

function addVehicleGlazing(ctx: Ctx) {
  const { bp } = ctx;
  const c = ctx.cabin!;
  const h = c.y1 - c.y0;
  const len = c.z1 - c.z0;
  const pane = Math.max(0.008, h * 0.03);
  const glass = {
    color: bp.glassy ? "#a7d8f5" : "#6f9fc4",
    material: "Стекло",
    opacity: 0.55,
    metalness: 0.1,
    roughness: 0.05,
  };

  push(
    ctx,
    part(ctx.id(), "Лобовое стекло", {
      shape: "box",
      role: "window",
      group: "Остекление",
      position: [0, c.y0 + h * 0.56, c.z1 + pane * 0.4],
      size: [c.halfW * 2 * 0.88, h * 0.62, pane],
      ...glass,
    }),
    part(ctx.id(), "Заднее стекло", {
      shape: "box",
      role: "window",
      group: "Остекление",
      position: [0, c.y0 + h * 0.58, c.z0 - pane * 0.4],
      size: [c.halfW * 2 * 0.8, h * 0.5, pane],
      ...glass,
    }),
    part(ctx.id(), "Боковое стекло", {
      shape: "box",
      role: "window",
      group: "Остекление",
      position: [c.halfW + pane * 0.4, c.y0 + h * 0.56, (c.z0 + c.z1) / 2],
      size: [pane, h * 0.56, len * 0.84],
      mirror: "x",
      ...glass,
    }),
    part(ctx.id(), "Стойка кузова", {
      shape: "box",
      role: "structure",
      group: "Кузов",
      position: [c.halfW + pane * 0.9, c.y0 + h * 0.56, (c.z0 + c.z1) / 2],
      size: [pane * 1.2, h * 0.6, Math.max(0.04, len * 0.05)],
      color: shade(bp.trim, -0.1),
      material: "Стойка",
      mirror: "x",
    }),
    part(ctx.id(), "Дворник", {
      shape: "box",
      role: "detail",
      group: "Остекление",
      position: [c.halfW * 0.3, c.y0 + h * 0.28, c.z1 + pane * 1.4],
      size: [c.halfW * 0.75, h * 0.03, pane],
      rotation: [0, 0, 0.12],
      color: "#1c1e22",
      material: "Дворник",
      mirror: "x",
    }),
    part(ctx.id(), "Зеркало", {
      shape: "box",
      role: "detail",
      group: "Кузов",
      position: [c.halfW + bp.width * 0.06, c.y0 + h * 0.3, c.z1 - len * 0.08],
      size: [bp.width * 0.09, h * 0.14, bp.width * 0.035],
      color: shade(bp.primary, -0.08),
      material: "Зеркало",
      mirror: "x",
    })
  );
}

function addVehicleDoors(ctx: Ctx) {
  const { bp, body } = ctx;
  const c = ctx.cabin!;
  const perSide = clamp(Math.round(bp.doors / 2), 1, 2);
  const len = (c.z1 - c.z0) / perSide;
  const skin = Math.max(0.006, bp.width * 0.008);
  // A truck cab carries its doors up on the cab; a car's sit on the lower body.
  const onCab = c.z1 >= bp.length / 2 - 1e-6;
  const x = (onCab ? c.halfW : body.halfW) + skin / 2;
  const y0 = onCab ? c.y0 : body.y0 + (body.y1 - body.y0) * 0.12;
  const y1 = onCab ? c.y1 - (c.y1 - c.y0) * 0.08 : body.y1 - (body.y1 - body.y0) * 0.04;
  const repeat = perSide > 1 ? { repeat: { count: perSide, step: [0, 0, -len] as Vec3 } } : {};

  push(
    ctx,
    part(ctx.id(), "Дверь", {
      shape: "box",
      role: "door",
      group: "Двери",
      position: [x, (y0 + y1) / 2, c.z1 - len / 2],
      size: [skin, y1 - y0, len * 0.94],
      color: shade(bp.primary, 0.03),
      material: "Дверь",
      metalness: bp.metalness,
      roughness: bp.roughness,
      mirror: "x",
      ...repeat,
    }),
    part(ctx.id(), "Ручка двери", {
      shape: "box",
      role: "detail",
      group: "Двери",
      position: [x + skin * 1.5, y0 + (y1 - y0) * 0.78, c.z1 - len * 0.8],
      size: [skin * 2, Math.max(0.015, (y1 - y0) * 0.07), len * 0.16],
      color: "#c9ced6",
      material: "Ручка",
      metalness: 0.8,
      roughness: 0.25,
      mirror: "x",
      ...repeat,
    })
  );
}

function addTrailer(ctx: Ctx) {
  const { bp, body } = ctx;
  const diameter = wheelDiameter(bp);
  const trailerL = bp.length * 0.7;
  const gap = bp.length * 0.06;
  const z = -bp.length / 2 - gap - trailerL / 2;
  const y0 = diameter * 0.55;
  const h = Math.max(bp.height * 0.4, (bp.height - y0) * 0.9);

  push(
    ctx,
    part(ctx.id(), "Прицеп", {
      shape: "box",
      role: "volume",
      group: "Прицеп",
      position: [0, y0 + h / 2, z],
      size: [bp.width * 0.98, h, trailerL],
      color: shade(bp.secondary, 0.1),
      material: "Прицеп",
      roughness: 0.7,
    }),
    part(ctx.id(), "Рама прицепа", {
      shape: "box",
      role: "structure",
      group: "Прицеп",
      position: [0, y0 - diameter * 0.04, z],
      size: [bp.width * 0.7, diameter * 0.12, trailerL * 1.02],
      color: "#3a3d42",
      material: "Рама",
      metalness: 0.6,
    }),
    part(ctx.id(), "Сцепка", {
      shape: "cylinder",
      role: "structure",
      group: "Прицеп",
      position: [0, y0, -bp.length / 2 - gap / 2],
      size: [diameter * 0.12, gap * 1.6, diameter * 0.12],
      rotation: [Math.PI / 2, 0, 0],
      sides: 10,
      color: "#4a4f57",
      material: "Сцепка",
      metalness: 0.7,
    })
  );
  for (const offset of [-0.25, 0.25]) {
    push(
      ctx,
      wheelUnit({
        id: ctx.id,
        center: [body.halfW * 0.94, diameter / 2, z + trailerL * offset],
        diameter,
        width: diameter * 0.34,
        axis: "x",
        rimColor: "#b6bcc4",
        spokes: 5,
        mirror: "x",
        name: "Колесо прицепа",
      })
    );
  }
}

/* ================= rooms ================= */

function addRoomWindows(ctx: Ctx) {
  const { bp, body } = ctx;
  const span = body.y1 - body.y0;
  const count = clamp(bp.windowsExplicit ? bp.windows : Math.round(bp.width / 2.6), 1, 4);
  const step = (bp.width * 0.8) / count;
  push(
    ctx,
    windowUnit({
      id: ctx.id,
      group: "Окна",
      name: "Окно",
      center: [-bp.width * 0.4 + step / 2, body.y0 + span * 0.56, -body.halfL],
      width: Math.min(1.4, step * 0.7),
      height: Math.min(1.5, span * 0.5),
      facing: "front",
      frameColor: shade(bp.trim, 0.35),
      glassColor: "#a9d6f2",
      mullions: 1,
      transom: true,
      sill: true,
      ...(count > 1 ? { repeat: { count, step: [step, 0, 0] as Vec3 } } : {}),
    })
  );
}

const BIG_FURNITURE = new Set(["кровать", "диван", "шкаф", "кухонный гарнитур"]);

/**
 * Build each named piece as its own object, then stand it in the room: big
 * pieces against the back wall, the rest in a row in front, a chair tucked
 * behind its table so it faces it.
 */
function furnishRoom(ctx: Ctx) {
  const { bp, body } = ctx;
  const room = ctx.interior ?? { halfW: body.halfW, halfL: body.halfL, floorY: ctx.floorY ?? body.y0 };
  const floor = room.floorY;
  const margin = 0.06;

  const pieces = bp.furnishings.slice(0, 6).map((word, index) => {
    const plan = planFromPrompt(word);
    plan.kind = "furniture";
    const parts = buildParts(plan, `f${index}`);
    const { min, max } = partsBounds(parts);
    return {
      word,
      parts,
      w: max[0] - min[0],
      d: max[2] - min[2],
      cx: (min[0] + max[0]) / 2,
      cz: (min[2] + max[2]) / 2,
      minY: min[1],
    };
  });
  type Piece = (typeof pieces)[number];
  const placed: { piece: Piece; x: number; z: number }[] = [];

  let cursor = -room.halfW + margin;
  const front: Piece[] = [];
  for (const piece of pieces) {
    if (BIG_FURNITURE.has(piece.word) && cursor + piece.w <= room.halfW - margin) {
      placed.push({ piece, x: cursor + piece.w / 2, z: -room.halfL + margin + piece.d / 2 });
      cursor += piece.w + margin * 3;
    } else {
      front.push(piece);
    }
  }

  const backDepth = Math.max(0, ...placed.map((item) => item.piece.d));
  const table = front.find((piece) => piece.word === "стол" || piece.word === "журнальный столик");
  const chair = table ? front.find((piece) => piece.word === "стул") : undefined;
  const row = front.filter((piece) => piece !== chair);
  const walkway = chair ? chair.d + 0.25 : 0.55;
  const rowWidth = row.reduce((sum, piece) => sum + piece.w, 0) + margin * 4 * Math.max(0, row.length - 1);
  let x = -Math.min(rowWidth, room.halfW * 2 - margin * 2) / 2;

  for (const piece of row) {
    if (x + piece.w > room.halfW - margin) break;
    const z = Math.min(
      room.halfL - margin - piece.d / 2,
      -room.halfL + margin + backDepth + walkway + piece.d / 2
    );
    placed.push({ piece, x: x + piece.w / 2, z });
    if (piece === table && chair) {
      placed.push({ piece: chair, x: x + piece.w / 2, z: z - piece.d / 2 - chair.d / 2 + 0.14 });
    }
    x += piece.w + margin * 4;
  }

  for (const { piece, x: px, z: pz } of placed) {
    const label = piece.word.charAt(0).toUpperCase() + piece.word.slice(1);
    const moved = translateParts(piece.parts, [px - piece.cx, floor - piece.minY, pz - piece.cz]);
    push(
      ctx,
      moved.map((item) => ({ ...item, group: label }))
    );
  }
}

/* ================= armour ================= */

/** Plate over a standing figure: helmet with visor, breastplate, belt, greaves. */
function addArmour(ctx: Ctx) {
  const { bp, body } = ctx;
  const { center, size } = headAnchor(ctx);
  const span = body.y1 - body.y0;
  const steel = { color: "#9aa3ad", material: "Сталь", metalness: 0.85, roughness: 0.28 };
  const dark = { color: "#4a4f57", material: "Сталь", metalness: 0.8, roughness: 0.35 };
  const legX = body.halfW * 0.45;
  const legLength = body.y0;

  push(
    ctx,
    part(ctx.id(), "Шлем", {
      shape: "sphere",
      role: "head",
      group: "Доспехи",
      position: [center[0], center[1] + size * 0.06, center[2] - size * 0.02],
      size: [size * 1.16, size * 1.14, size * 1.16],
      ...steel,
    }),
    part(ctx.id(), "Забрало", {
      shape: "box",
      role: "detail",
      group: "Доспехи",
      position: [center[0], center[1] + size * 0.04, center[2] + size * 0.52],
      size: [size * 0.62, size * 0.1, size * 0.12],
      ...dark,
    }),
    part(ctx.id(), "Гребень шлема", {
      shape: "box",
      role: "detail",
      group: "Доспехи",
      position: [center[0], center[1] + size * 0.6, center[2] - size * 0.05],
      size: [size * 0.08, size * 0.18, size * 0.9],
      color: bp.accent,
      material: "Плюмаж",
      roughness: 0.8,
    }),
    part(ctx.id(), "Кираса", {
      shape: "capsule",
      role: "detail",
      group: "Доспехи",
      position: [0, body.y0 + span * 0.62, 0],
      size: [body.halfW * 2.08, span * 0.62, body.halfL * 2.1],
      ...steel,
    }),
    part(ctx.id(), "Пояс", {
      shape: "torus",
      role: "detail",
      group: "Доспехи",
      position: [0, body.y0 + span * 0.3, 0],
      size: [body.halfW * 2.12, span * 0.06, body.halfL * 2.12],
      hole: 0.8,
      sides: 28,
      color: "#3b2a20",
      material: "Кожа",
      roughness: 0.8,
    }),
    part(ctx.id(), "Пряжка", {
      shape: "box",
      role: "detail",
      group: "Доспехи",
      position: [0, body.y0 + span * 0.3, body.halfL * 1.06],
      size: [body.halfW * 0.3, span * 0.07, body.halfL * 0.1],
      color: "#c9973f",
      material: "Латунь",
      metalness: 0.8,
    })
  );

  if (legLength > 0.05) {
    push(
      ctx,
      part(ctx.id(), "Поножи", {
        shape: "cylinder",
        role: "limb",
        group: "Доспехи",
        position: [legX, legLength * 0.3, 0],
        size: [body.halfW * 0.5, legLength * 0.42, body.halfW * 0.5],
        sides: 16,
        mirror: "x",
        ...steel,
      }),
      part(ctx.id(), "Наколенник", {
        shape: "sphere",
        role: "limb",
        group: "Доспехи",
        position: [legX, legLength * 0.5, body.halfW * 0.12],
        size: [body.halfW * 0.4, body.halfW * 0.36, body.halfW * 0.3],
        mirror: "x",
        ...dark,
      })
    );
  }
}

/* ================= blades ================= */

/** A sword in the right hand, point down along the leg. */
function addHeldBlade(ctx: Ctx) {
  const { bp } = ctx;
  if (bp.arms === 0) return;
  const { hand, thickness } = armFrame(ctx);
  const grip = thickness * 1.6;
  const x = hand[0] + thickness * 0.1;
  const z = thickness * 0.5;
  const guardY = hand[1] - grip / 2 - thickness * 0.15;
  const bladeLen = Math.max(thickness * 4, Math.min(guardY - 0.05, bp.height * 0.5));
  const steel = { color: "#c9ced6", material: "Сталь", metalness: 0.85, roughness: 0.2 };

  push(
    ctx,
    part(ctx.id(), "Рукоять меча", {
      shape: "cylinder",
      role: "detail",
      group: "Оружие",
      position: [x, hand[1], z],
      size: [thickness * 0.35, grip, thickness * 0.35],
      sides: 10,
      color: "#3b2a20",
      material: "Кожа",
      roughness: 0.8,
    }),
    part(ctx.id(), "Навершие", {
      shape: "sphere",
      role: "detail",
      group: "Оружие",
      position: [x, hand[1] + grip / 2 + thickness * 0.18, z],
      size: [thickness * 0.5, thickness * 0.5, thickness * 0.5],
      color: "#c9973f",
      material: "Латунь",
      metalness: 0.8,
    }),
    part(ctx.id(), "Гарда", {
      shape: "box",
      role: "detail",
      group: "Оружие",
      position: [x, guardY, z],
      size: [thickness * 2.2, thickness * 0.3, thickness * 0.5],
      color: "#c9973f",
      material: "Латунь",
      metalness: 0.8,
    }),
    part(ctx.id(), "Клинок", {
      shape: "box",
      role: "detail",
      group: "Оружие",
      position: [x, guardY - bladeLen / 2, z],
      size: [thickness * 0.55, bladeLen, thickness * 0.1],
      ...steel,
    }),
    part(ctx.id(), "Острие", {
      shape: "pyramid",
      role: "detail",
      group: "Оружие",
      position: [x, guardY - bladeLen - thickness * 0.35, z],
      size: [thickness * 0.55, thickness * 0.7, thickness * 0.1],
      rotation: [Math.PI, 0, 0],
      ...steel,
    })
  );
}

/** The weapon as the whole object, standing point up. */
function addStandaloneBlade(ctx: Ctx) {
  const { bp } = ctx;
  const H = bp.height;
  const steel = { color: "#c9ced6", material: "Сталь", metalness: 0.85, roughness: 0.2 };
  const brass = { color: "#c9973f", material: "Латунь", metalness: 0.8, roughness: 0.3 };

  if (/топор|axe/i.test(bp.params.raw)) {
    push(
      ctx,
      part(ctx.id(), "Топорище", {
        shape: "cylinder",
        role: "structure",
        group: "Рукоять",
        position: [0, H * 0.475, 0],
        size: [H * 0.045, H * 0.95, H * 0.045],
        sides: 12,
        color: "#7a543a",
        material: "Дерево",
        roughness: 0.8,
      }),
      part(ctx.id(), "Обух", {
        shape: "box",
        role: "detail",
        group: "Топор",
        position: [0, H * 0.86, 0],
        size: [H * 0.12, H * 0.13, H * 0.06],
        ...steel,
      }),
      part(ctx.id(), "Лезвие топора", {
        shape: "wedge",
        role: "detail",
        group: "Топор",
        position: [H * 0.14, H * 0.86, 0],
        size: [H * 0.2, H * 0.22, H * 0.025],
        ...steel,
      })
    );
    return;
  }

  push(
    ctx,
    part(ctx.id(), "Навершие", {
      shape: "sphere",
      role: "detail",
      group: "Рукоять",
      position: [0, H * 0.028, 0],
      size: [H * 0.055, H * 0.055, H * 0.055],
      ...brass,
    }),
    part(ctx.id(), "Рукоять", {
      shape: "cylinder",
      role: "structure",
      group: "Рукоять",
      position: [0, H * 0.145, 0],
      size: [H * 0.035, H * 0.18, H * 0.035],
      sides: 12,
      color: "#3b2a20",
      material: "Кожа",
      roughness: 0.85,
    }),
    part(ctx.id(), "Обмотка", {
      shape: "torus",
      role: "detail",
      group: "Рукоять",
      position: [0, H * 0.075, 0],
      size: [H * 0.04, H * 0.008, H * 0.04],
      hole: 0.7,
      sides: 14,
      color: "#2a1d16",
      material: "Кожа",
      repeat: { count: 5, step: [0, H * 0.034, 0] },
    }),
    part(ctx.id(), "Гарда", {
      shape: "box",
      role: "detail",
      group: "Гарда",
      position: [0, H * 0.245, 0],
      size: [bp.width, H * 0.03, H * 0.05],
      ...brass,
    }),
    part(ctx.id(), "Наконечник гарды", {
      shape: "sphere",
      role: "detail",
      group: "Гарда",
      position: [bp.width / 2, H * 0.245, 0],
      size: [H * 0.04, H * 0.04, H * 0.04],
      mirror: "x",
      ...brass,
    }),
    part(ctx.id(), "Клинок", {
      shape: "box",
      role: "volume",
      group: "Клинок",
      position: [0, H * 0.57, 0],
      size: [H * 0.055, H * 0.62, H * 0.009],
      ...steel,
    }),
    part(ctx.id(), "Дол", {
      shape: "box",
      role: "detail",
      group: "Клинок",
      position: [0, H * 0.53, 0],
      size: [H * 0.012, H * 0.48, H * 0.0115],
      color: "#9aa3ad",
      material: "Дол",
      metalness: 0.85,
      roughness: 0.3,
    }),
    part(ctx.id(), "Острие", {
      shape: "pyramid",
      role: "detail",
      group: "Клинок",
      position: [0, H * 0.93, 0],
      size: [H * 0.055, H * 0.1, H * 0.009],
      ...steel,
    })
  );
}

/* ================= appliances ================= */

function addSlots(ctx: Ctx) {
  const { bp, body } = ctx;
  const count = clamp(bp.slots, 1, 4);
  const span = body.y1 - body.y0;
  const depth = Math.max(0.004, bp.height * 0.03);
  const gap = (bp.length * 0.62) / count;

  push(
    ctx,
    part(ctx.id(), "Слот для хлеба", {
      shape: "box",
      role: "detail",
      group: "Слоты",
      position: [0, body.y1 + depth * 0.2, -bp.length * 0.31 + gap / 2],
      size: [bp.width * 0.72, depth, bp.length * 0.12],
      color: "#1b1d21",
      material: "Слот",
      roughness: 0.9,
      ...(count > 1 ? { repeat: { count, step: [0, 0, gap] as Vec3 } } : {}),
    }),
    part(ctx.id(), "Рычаг", {
      shape: "box",
      role: "detail",
      group: "Управление",
      position: [body.halfW + bp.width * 0.03, body.y0 + span * 0.62, 0],
      size: [bp.width * 0.06, span * 0.07, bp.length * 0.2],
      color: bp.trim,
      material: "Рычаг",
      metalness: 0.4,
    }),
    part(ctx.id(), "Ножка", {
      shape: "cylinder",
      role: "foundation",
      group: "Корпус",
      position: [body.halfW * 0.8, body.y0 + span * 0.015, body.halfL * 0.75],
      size: [bp.width * 0.06, span * 0.03, bp.width * 0.06],
      sides: 10,
      color: "#1b1d21",
      material: "Резина",
      mirror: "xz",
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
  // Lamps are all stem and shade; rooms have their own plinths and an open
  // front; bolts and trim plates on a cat or a girl only make them look boxed.
  if (bp.detail < 0.7 || bp.kind === "lighting" || bp.massPlan === "shell") return;
  if (bp.kind === "character" || bp.kind === "animal") return;

  const span = body.y1 - body.y0;
  if (span <= 0.01) return;
  // A round body gets round trim — a square plate on a robot vacuum reads as a lid.
  const round = bp.bodyShape === "cylinder" || bp.bodyShape === "sphere" || bp.bodyShape === "capsule";
  if (round && bp.massPlan === "elongated") return;
  const trimShape = round ? ("cylinder" as const) : ("box" as const);

  const seamColor = shade(bp.primary, -0.22);
  const seams = clamp(Math.round(bp.detail * 3), 2, 8);

  // A flat seam only sits on a flat front.
  if (!round) {
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
  }

  push(
    ctx,
    part(ctx.id(), "Верхний кант", {
      shape: trimShape,
      ...(round ? { sides: 40 } : {}),
      role: "detail",
      group: "Отделка",
      position: [0, body.y1, 0],
      size: [body.halfW * 2 + span * 0.01, Math.max(0.006, span * 0.022), body.halfL * 2 + span * 0.01],
      color: shade(bp.trim, 0.18),
      material: "Кант",
      metalness: Math.max(bp.metalness, 0.25),
    }),
    part(ctx.id(), "Нижний кант", {
      shape: trimShape,
      ...(round ? { sides: 40 } : {}),
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
        size: [body.halfW * (round ? 0.7 : 1.5), Math.max(0.005, span * 0.018), Math.max(0.005, span * 0.012)],
        color: bp.accent,
        material: "Подсветка",
        emissive: 0.9,
      })
    );
  }
}
