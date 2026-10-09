import {compileHouseLayout} from "./house-layout";
import {checkGeneratedHouse} from "./house-generation";
import {generateLocalModel} from "./local-model";
import {buildHouse} from "@/shared/house/document";
import {dimensionsOf, hashString, Rng, structureFromGroups} from "@/shared/geometry";
import {DesignError} from "@/shared/design/validation";
import type {HouseBrief, ReadyBrief} from "@/shared/design/brief";
import type {LocalModelResult} from "@/shared/design/result";
import {furnishHouse} from "@/shared/house/furnishing";
import {houseFittings} from "@/shared/house/fittings";

const AUTO_SIZES: [number, number][] = [[10, 8], [11, 9], [12, 9], [12, 10], [13, 10], [14, 10], [15, 12]];
const WALL_COLORS = ["#e4ddd1", "#efe7da", "#d9d4cc", "#e8e1d3", "#cfc6b8", "#f1ece4", "#d8cbb8"];
const shareOf = (name: string) => /гостин/i.test(name) ? 26 : /спальн|детск|кабинет/i.test(name) ? 16 : /прихож|сануз|коридор|кладов/i.test(name) ? 9 : 14;

function shuffled<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {const j = rng.int(0, i); [out[i], out[j]] = [out[j], out[i]];}
  return out;
}

/**
 * The room program is compiled into walls, rather than appended to a facade's label.
 * Choices the user left to Atrion (size, roof, wall colour) and the room proportions
 * follow the request variant: "Подбери сам" used to return the same 12 × 9 m house every time.
 */
export function buildBriefModel(brief: ReadyBrief, variant = ""): LocalModelResult {
  if (!brief.house) return {...generateLocalModel(brief.prompt, variant), brief: brief.understood, notes: brief.assumptions};
  const base = brief.house, auto = base.auto ?? {};
  const rng = variant ? new Rng(hashString(variant)) : null;
  const roof: HouseBrief["roof"] = rng && auto.roof && rng.chance(0.3) ? "flat" : base.roof;
  const wallColor = rng && auto.color ? rng.pick(WALL_COLORS) : base.wallColor;
  const perFloor = Math.ceil(base.rooms.length / base.floors);
  const sizes: [number, number][] = rng && auto.size
    ? [...shuffled(AUTO_SIZES.filter(([w, d]) => w * d >= perFloor * 14), rng), [base.width, base.depth]]
    : [[base.width, base.depth]];
  // Day rooms go first; bedrooms follow on upper floors. Every requested room occurs once.
  const day = base.rooms.filter(r => !/спальн|детск/i.test(r)), night = base.rooms.filter(r => /спальн|детск/i.test(r));
  const entrance = day.filter(r => /прихож/i.test(r)), rest = day.filter(r => !/прихож/i.test(r));
  const rooms = rng ? [...entrance, ...shuffled(rest, rng), ...shuffled(night, rng)] : [...base.rooms].sort((a,b) => Number(/спальн|детск/i.test(a)) - Number(/спальн|детск/i.test(b)));

  let document, h: HouseBrief = base;
  for (const [width, depth] of sizes) {
    const floors = Array.from({length: base.floors}, () => ({rooms: [] as {name: string; share: number}[]}));
    for (let i = 0; i < rooms.length; i++) {
      const floor = Math.min(base.floors - 1, Math.floor(i * base.floors / rooms.length));
      floors[floor].rooms.push({name: rooms[i], share: Math.round(shareOf(rooms[i]) * (rng ? rng.float(0.8, 1.25) : 1))});
    }
    const candidate: HouseBrief = {...base, width, depth, roof, wallColor};
    try {
      const compiled = compileHouseLayout({...candidate, wallThickness: .2, floorHeight: 2.8, floors});
      const issues = checkGeneratedHouse(compiled);
      if (issues.length) throw new Error(issues.join(" "));
      document = compiled; h = candidate;
      break;
    } catch {
      // Try the next footprint; the user's own size is always the last attempt.
    }
  }
  if (!document) throw new DesignError("Не удалось разместить все помещения с дверными проходами. Увеличьте размеры дома или сократите число комнат в описании.", 422, "HOUSE_NO_SPACE");
  const assumptions = brief.assumptions.map(note => /^Выбран габарит/.test(note) ? `Выбран габарит ${h.width} × ${h.depth} м` : /^Крыша двускатная/.test(note) && h.roof === "flat" ? "Крыша плоская; высота этажа 2,8 м" : note);
  const understood = brief.understood.map(note => /^Габариты:/.test(note) ? `Габариты: ${h.width} × ${h.depth} м` : note);
  brief = {...brief, assumptions, understood};
  const geometry = buildHouse(document), parts = geometry.parts.map(p => ({...p, position: [p.position[0], p.position[1] + .2, p.position[2]] as [number,number,number]}));
  const interior = furnishHouse(document, h);
  parts.push(...interior.parts, ...houseFittings(document));
  const warnings = ["Концепт без инженерных расчётов. Дверные проёмы открытые; дверные полотна и инженерные сети не моделируются.", ...(document.floors.length>1?["Лестницы между этажами пока не моделируются."]:[])];
  const description = `${h.width} × ${h.depth} м, этажей: ${h.floors}, помещений: ${h.rooms.length}. ${h.rooms.join(", ")}.`;
  return {kind: "model", source: "procedural", document, interiors: interior.rooms, recognized: [...brief.understood, `${interior.rooms.reduce((n,r)=>n+r.scene.objects.length,0)} предметов внутри`], brief: brief.understood,
    notes: [...brief.assumptions, ...warnings, "Площади, расположение комнат и базовая обстановка предложены автоматически. Проверьте план."], missing: interior.warnings,
    concept: {name: "Дом по вашему описанию", description, units: "m", dimensions: dimensionsOf(parts), parts, structure: structureFromGroups(parts),
      materials: [], equipment: [], requirements: brief.understood, assemblySteps: [],
      costEstimate: {currency: "KGS", minimum: 0, maximum: 0, breakdown: [], note: "Стоимость не рассчитывалась"},
      advantages: [], disadvantages: [], risks: [], engineeringNotes: warnings,
      disclaimer: "Архитектурный концепт, не строительный проект", category: "building", source: "procedural"}};
}
