import {compileHouseLayout} from "./house-layout";
import {checkGeneratedHouse} from "./house-generation";
import {generateLocalModel} from "./local-model";
import {buildHouse} from "@/shared/house/document";
import {dimensionsOf, structureFromGroups} from "@/shared/geometry";
import {DesignError} from "@/shared/design/validation";
import type {ReadyBrief} from "@/shared/design/brief";
import type {LocalModelResult} from "@/shared/design/result";
import {furnishHouse} from "@/shared/house/furnishing";
import {houseFittings} from "@/shared/house/fittings";
import {houseFacade} from "@/shared/house/facade";
import {houseArchitecture} from "./house-architecture";

/** The room program is compiled into walls, rather than appended to a facade's label. */
export function buildBriefModel(brief: ReadyBrief, variant = ""): LocalModelResult {
  if (!brief.house) return {...generateLocalModel(brief.prompt, variant), brief: brief.understood, notes: brief.assumptions};
  const supplied = brief.house, proposed = houseArchitecture(supplied.description ?? brief.prompt, supplied.width, supplied.depth, variant);
  const h = {...supplied, architecture: proposed.architecture,
    roof: supplied.automaticRoof ? proposed.roof as typeof supplied.roof : supplied.roof,
    wallColor: supplied.automaticWallColor ? proposed.wallColor : supplied.wallColor};
  const floors = Array.from({length: h.floors}, () => ({rooms: [] as {name: string; share: number}[]}));
  // Day rooms go first; bedrooms follow on upper floors. Every requested room occurs once.
  const rooms = [...h.rooms].sort((a,b) => Number(/спальн|детск/i.test(a)) - Number(/спальн|детск/i.test(b)));
  for (let i = 0; i < rooms.length; i++) {
    const floor = Math.min(h.floors - 1, Math.floor(i * h.floors / rooms.length));
    const name = rooms[i];
    floors[floor].rooms.push({name, share: /гостин/i.test(name) ? 26 : /спальн|детск|кабинет/i.test(name) ? 16 : /сануз/i.test(name) ? 13 : /прихож|коридор|кладов/i.test(name) ? 11 : 14});
  }
  let document;
  try {
    document = compileHouseLayout({...h, wallThickness: .2, floorHeight: 2.8, floors});
    const issues = checkGeneratedHouse(document);
    if (issues.length) throw new Error(issues.join(" "));
  } catch {
    throw new DesignError("Не удалось разместить все помещения с дверными проходами. Увеличьте размеры дома или сократите число комнат в описании.", 422, "HOUSE_NO_SPACE");
  }
  const geometry = buildHouse(document), parts = geometry.parts.map(p => ({...p, position: [p.position[0], p.position[1] + .2, p.position[2]] as [number,number,number]}));
  const interior = furnishHouse(document, h);
  parts.push(...interior.parts, ...houseFittings(document), ...houseFacade(document, parts));
  const warnings = ["Концепт без инженерных расчётов. Двери показаны закрытыми; открывание и инженерные сети пока не моделируются.", ...(document.floors.length>1?["Лестницы между этажами пока не моделируются."]:[])];
  const description = `${h.width} × ${h.depth} м, этажей: ${h.floors}, помещений: ${h.rooms.length}. ${h.rooms.join(", ")}.`;
  const roofNames={flat:"плоская",gable:"двускатная",hip:"вальмовая",shed:"односкатная",mansard:"мансардная"};
  const facadeNames={modern:"Современный дом",scandinavian:"Скандинавский дом",chalet:"Дом в стиле шале",classic:"Классический дом",brick:"Кирпичный дом"};
  const actual=[...brief.understood.filter(s=>!s.startsWith("Фасад:")),`Контур: ${document.footprint==="l-shaped"?"Г-образный":"прямоугольный"}`,`${facadeNames[h.architecture.style]}; крыша: ${roofNames[h.roof]}`,`${document.floors.flatMap(f=>f.openings).filter(o=>o.kind==="window").length} окон; входная дверь на первом этаже`];
  return {kind: "model", source: "procedural", document, interiors: interior.rooms, recognized: [...actual, `${interior.rooms.reduce((n,r)=>n+r.scene.objects.length,0)} предметов внутри`], brief: actual,
    notes: [...brief.assumptions, ...warnings, "Площади, расположение комнат и базовая обстановка предложены автоматически. Проверьте план."], missing: interior.warnings,
    concept: {name: facadeNames[h.architecture.style], description, units: "m", dimensions: dimensionsOf(parts), parts, structure: structureFromGroups(parts),
      materials: [], equipment: [], requirements: brief.understood, assemblySteps: [],
      costEstimate: {currency: "KGS", minimum: 0, maximum: 0, breakdown: [], note: "Стоимость не рассчитывалась"},
      advantages: [], disadvantages: [], risks: [], engineeringNotes: warnings,
      disclaimer: "Архитектурный концепт, не строительный проект", category: "building", source: "procedural"}};
}
