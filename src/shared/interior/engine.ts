import {ASSETS, STYLES, defaultColor, findAsset, isFlatAsset, type InteriorStyle} from "@/shared/interior/catalog";
import {color, footprint, layoutIssues, parseScene, validateLayout, vec, type InteriorScene, type SceneObject} from "@/shared/interior/scene";
import {check, choice, id, list, number, record, text, DesignError} from "@/shared/design/validation";

/**
 * A TV goes on the wall across from the sofa and turns to face it; in a row beside
 * the sofa nobody could watch it. Assets face +z at rotation 0.
 */
function facingRank(x: number, z: number, angle: number, sofa: SceneObject, wallDistance: number) {
  const dx = sofa.position.x - x, dz = sofa.position.z - z, length = Math.hypot(dx, dz) || 1;
  const facing = (Math.sin(angle) * dx + Math.cos(angle) * dz) / length;
  return (facing < .7 ? 100 : 0) - length * 2 + wallDistance * 20;
}

export function placeObject(scene: InteriorScene, object: SceneObject, variant = 0, nearWindow = false, skip = 0): SceneObject {
  const positions: {x: number; z: number; y: number; angle: number; rank: number}[] = [];
  const tv = object.assetId === "tv_stand", sofa = scene.objects.find(o => findAsset(o.assetId).category === "sofa");
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const bounds = footprint({...object, rotation: {x: 0, y: angle, z: 0}});
    for (let x = bounds.width / 2 + .06; x <= scene.width - bounds.width / 2 - .05; x += .25) {
      for (let z = bounds.depth / 2 + .06; z <= scene.length - bounds.depth / 2 - .05; z += .25) {
        const wallDistance = Math.min(x - bounds.width / 2, scene.width - x - bounds.width / 2, z - bounds.depth / 2, scene.length - z - bounds.depth / 2);
        const windowDistance = Math.min(...scene.openings.filter(o => o.kind === "window").map(o => Math.hypot(x - (o.wall === "west" ? 0 : o.wall === "east" ? scene.width : o.offset + o.width / 2), z - (o.wall === "north" ? 0 : o.wall === "south" ? scene.length : o.offset + o.width / 2))));
        const corner = variant % 3 === 0 ? x + z : variant % 3 === 1 ? scene.width - x + z : x + scene.length - z;
        // A rug belongs in the open middle of the room, under the seating — not against a wall.
        const centre = Math.hypot(x - scene.width / 2, z - scene.length / 2);
        positions.push({x, z, y: 0, angle, rank: isFlatAsset(findAsset(object.assetId)) ? centre : tv && sofa ? facingRank(x, z, angle, sofa, wallDistance) : nearWindow ? windowDistance : wallDistance * 20 + corner});
      }
    }
  }
  for (const p of positions.sort((a, b) => a.rank - b.rank)) {
    const candidate = {...object, position: {x: +p.x.toFixed(3), y: 0, z: +p.z.toFixed(3)}, rotation: {x: 0, y: p.angle, z: 0}};
    if (!layoutIssues({...scene, objects: [...scene.objects, candidate]}).length && skip-- <= 0) return candidate;
  }
  throw new DesignError(`Не удалось разместить «${findAsset(object.assetId).name}» с проходом. Уменьшите набор мебели или измените размеры.`, 422, "DESIGN_NO_SPACE");
}

/**
 * Moves and turns the user makes by hand. They may narrow a walkway — the drag
 * used to snap back without a word whenever one did — but never overlap a
 * wall, a door or other furniture.
 */
export function isManualPlacement(actions: unknown): boolean {
  return Array.isArray(actions) && actions.length > 0 &&
    actions.every(a => a && typeof a === "object" && ["MOVE_OBJECT", "ROTATE_OBJECT"].includes((a as {type?: unknown}).type as string));
}

export function applyActions(input: InteriorScene, raw: unknown, variant = 0, choices: number[] = []): InteriorScene {
  let scene = structuredClone(parseScene(input));
  const actions = list(record(raw, "План действий").actions, "actions", 80, 1);
  let added = 0;
  for (const value of actions) {
    const a = record(value, "action"), type = text(a.type, "action.type");
    const objectId = typeof a.objectId === "string" ? a.objectId : "";
    const object = scene.objects.find(o => o.id === objectId);
    const editable = () => {check(object, "Предмет не найден"); check(!object.locked, "Предмет закреплён"); return object;};
    if (type === "ADD_OBJECT") {
      const assetId = text(a.assetId, "assetId");
      check(ASSETS.some(item => item.id === assetId), "AI выбрал неизвестный предмет");
      const object: SceneObject = {id: id(a.id, "id"), assetId, position: {x: 0, y: 0, z: 0}, rotation: {x: 0, y: 0, z: 0}, scale: {x: 1, y: 1, z: 1}, locked: false, color: a.color === undefined ? defaultColor(scene.style, findAsset(assetId), variant) : color(a.color)};
      check(!scene.objects.some(o => o.id === object.id), "Повтор ID предмета");
      scene.objects.push(a.position ? {...object, position: vec(a.position, "position"), rotation: {x: 0, y: a.angle === undefined ? 0 : number(a.angle, "angle", -Math.PI * 2, Math.PI * 2), z: 0}} : placeObject(scene, object, variant, a.nearWindow === true, choices[added] ?? 0));
      added++;
    } else if (type === "REMOVE_OBJECT") {editable(); scene.objects = scene.objects.filter(o => o.id !== objectId);}
    else if (type === "MOVE_OBJECT") {editable().position = vec(a.position, "position");}
    else if (type === "MOVE_NEAR_WINDOW") {
      const current = editable(); check(scene.openings.some(o => o.kind === "window"), "В комнате нет окна");
      scene.objects = scene.objects.filter(o => o.id !== objectId);
      scene.objects.push(placeObject(scene, current, variant, true));
    } else if (type === "ROTATE_OBJECT") {editable().rotation.y = number(a.angle, "angle", -Math.PI * 2, Math.PI * 2);}
    else if (type === "SCALE_OBJECT") {editable().scale = vec(a.scale, "scale", .5, 2);}
    else if (type === "LOCK_OBJECT") {check(object && typeof a.locked === "boolean", "Некорректное закрепление"); object.locked = a.locked;}
    else if (type === "CHANGE_MATERIAL") {editable().color = color(a.color);}
    else if (type === "CHANGE_WALL_MATERIAL") scene.wallColor = color(a.color);
    else if (type === "CHANGE_FLOOR_MATERIAL") scene.floorColor = color(a.color);
    else if (type === "SET_ROOM_TYPE") scene.roomType = choice(a.roomType, ["bedroom", "living", "office", "kids", "kitchen", "bathroom", "dining", "hall", "other"] as const, "Тип комнаты");
    else if (type === "APPLY_STYLE") {
      scene.style = choice(a.style, Object.keys(STYLES) as InteriorStyle[], "Стиль");
      scene.wallColor = STYLES[scene.style].wall; scene.floorColor = STYLES[scene.style].floor;
      scene.objects.forEach(o => {if (!o.locked) o.color = STYLES[scene.style].accent;});
    } else if (type === "ADD_LIGHT") scene.lights.push({id: id(a.id, "light.id"), position: vec(a.position, "light.position"), color: color(a.color), intensity: number(a.intensity, "intensity", 0, 5)});
    else if (type === "REMOVE_LIGHT") {check(scene.lights.some(l => l.id === a.lightId), "Светильник не найден"); scene.lights = scene.lights.filter(l => l.id !== a.lightId);}
    else if (type === "CHANGE_LIGHT") {const light = scene.lights.find(l => l.id === a.lightId); check(light, "Светильник не найден"); light.intensity = number(a.intensity, "intensity", 0, 5); light.color = color(a.color);}
    else if (type === "UPDATE_ROOM") {
      scene.width = number(a.width, "width", 2, 30); scene.length = number(a.length, "length", 2, 30); scene.height = number(a.height, "height", 2, 6);
    } else throw new DesignError("Неподдерживаемое действие", 422, "DESIGN_ACTION_UNSUPPORTED");
    scene = parseScene(scene);
  }
  return validateLayout(scene, !isManualPlacement(actions));
}

const TERMS: [RegExp, string][] = [[/журнальн\S*\s+стол\S*|coffee\s+table/i, "table_coffee"], [/кресл|\barmchair\b/i, "armchair_soft"], [/пуф|ottoman/i, "ottoman_round"], [/банкетк|скамь|\bbench\b/i, "bench_soft"], [/комод|sideboard/i, "cabinet_low"], [/стеллаж|книжн\S*\s+(?:шкаф|полк)\S*|bookcase|bookshelf/i, "bookcase_open"],
  [/ков(?:ёр|ер|р)\S*|\brug\b|carpet/i, "rug_floor"], [/телевизор\S*|(?<![а-яё])тв(?![а-яё])|\btv\b/i, "tv_stand"], [/кухонн\S*\s+гарнитур\S*|гарнитур\S*|плит[аыу](?![а-яё])|мойк\S*/i, "kitchen_run"], [/холодильник\S*|\bfridge\b/i, "fridge_tall"],
  [/унитаз\S*|\btoilet\b/i, "toilet_compact"], [/раковин\S*|умывальник\S*|\bsink\b/i, "vanity_sink"], [/душ(?:ев\S*|[ае])?(?![а-яё])|\bshower\b/i, "shower_square"], [/консол|console/i, "console_slim"], [/кроват|\bbed\b/i, "bed_double"], [/диван|\bsofa\b/i, "sofa_compact"], [/шкаф|wardrobe/i, "wardrobe_double"], [/стол(?!ов(?:ая|ую|ой|ые))|\bdesk\b|\btable\b/i, "desk_work"], [/стул|\bchair\b/i, "chair_simple"], [/светильник|торшер|ламп|\blamp/i, "lamp_floor"], [/растени|цветок|\bplant/i, "plant_pot"], [/тумб(?!\S*\s+(?:с|под)\s+раковин)|прикроватн/i, "decor_cube"]];
const STYLE_TERMS: [RegExp, InteriorStyle][] = [[/неокласс|neoclassic/i, "neoclassic"], [/классичес|\bclassic\b/i, "classic"], [/современн|\bmodern\b/i, "modern"], [/минимал|minimal/i, "minimalism"], [/лофт|\bloft\b/i, "loft"], [/скандинав|scandinavian/i, "scandinavian"], [/индустриал|industrial/i, "industrial"], [/джапанди|japandi/i, "japandi"], [/хай[ -]?тек|high[ -]?tech/i, "high-tech"]];
const COLORS: [RegExp, string][] = [[/#[\da-f]{6}\b/i, ""], [/бел|\bwhite/i, "#ffffff"], [/черн|чёрн|\bblack/i, "#252529"], [/красн|\bred/i, "#b94339"], [/син|\bblue/i, "#3d6599"], [/зел[её]н|\bgreen/i, "#5b7d58"], [/беж|\bbeige/i, "#d5c5a7"], [/сер(?:ый|ая|ое|ые|ым|ой|ыми)|\bgr[ae]y/i, "#929496"], [/коричнев|\bbrown/i, "#795c43"], [/ж[её]лт|\byellow/i, "#d6b94b"], [/розов|\bpink/i, "#c9899e"], [/фиолет|\bpurple/i, "#8b6eaa"]];
function requestedColor(clause: string) {
  const entry = COLORS.find(([pattern]) => pattern.test(clause));
  return entry ? entry[1] || entry[0].exec(clause)![0] : undefined;
}
// Kids' rooms come before bedrooms: "детская спальня" is a child's room with a single bed.
const ROOM_DEFAULTS: [RegExp, string, string[]][] = [
  [/детск|nursery|kids?\s*room|children/i, "kids", ["bed_single", "desk_work", "chair_simple", "bookcase_open", "rug_floor"]],
  [/спальн|bedroom/i, "bedroom", ["bed_double", "wardrobe_double"]],
  [/гостин|living\s*room/i, "living", ["sofa_compact", "table_coffee", "rug_floor", "tv_stand", "lamp_floor"]],
  [/кухн|kitchen/i, "kitchen", ["kitchen_run", "fridge_tall", "table_dining", "chair_simple", "chair_simple"]],
  [/ванн|санузел|туалет|bath|\bwc\b/i, "bathroom", ["toilet_compact", "vanity_sink", "shower_square"]],
  [/столов|dining/i, "dining", ["table_dining", "chair_simple", "chair_simple", "chair_simple", "chair_simple"]],
  [/прихож|коридор|hallway|entrance/i, "hall", ["wardrobe_double", "bench_soft"]],
  [/офис|кабинет|\boffice\b/i, "office", ["desk_work", "chair_simple", "bookcase_open", "plant_pot"]],
];
/** What a room is not without, even when the request lists only extras ("спальня с двумя тумбами"). */
const ROOM_ESSENTIALS: Record<string, string[]> = {kids: ["bed_single"], bedroom: ["bed_double"], living: ["sofa_compact"], kitchen: ["kitchen_run"], bathroom: ["toilet_compact", "vanity_sink"], dining: ["table_dining"], office: ["desk_work"]};
const DEFAULT_DECISION = /^(?:на\s+(?:твой|ваш|свой)\s+вкус|(?:выбери|реши|подбери|придумай|решай)\s+сам(?:а|остоятельно)?|на\s+усмотрение|не\s+знаю|you\s+decide)$/i;
/** Explicit, limited offline commands; unsupported language must not look successful. */
/**
 * The wording picks a size ("трёхместный диван", "шкаф-купе", "двухместный"); otherwise a wide
 * room may get the larger piece on alternate generations, so rooms do not all look alike.
 */
function sizedVariant(assetId: string, clause: string, scene: InteriorScene, variant: number): string {
  if (assetId === "sofa_compact") {
    if (/тр[её]хместн|больш\S*\s+диван|three.?seat|large sofa/i.test(clause)) return "sofa_large";
    if (/двухместн|компактн|маленьк|small sofa/i.test(clause)) return "sofa_compact";
    return scene.width >= 4.5 && variant % 2 === 1 ? "sofa_large" : "sofa_compact";
  }
  if (assetId === "wardrobe_double") {
    if (/купе|широк|больш\S*\s+шкаф|wide wardrobe/i.test(clause)) return "wardrobe_wide";
    return scene.width >= 4.2 && variant % 2 === 1 && !/узк|маленьк/i.test(clause) ? "wardrobe_wide" : "wardrobe_double";
  }
  return assetId;
}

export function localPlan(prompt: string, scene: InteriorScene, editing: boolean, variant = 0) {
  const actions: Record<string, unknown>[] = [];
  const style = STYLE_TERMS.find(([pattern]) => pattern.test(prompt))?.[1];
  if (style) actions.push({type: "APPLY_STYLE", style});
  const room = ROOM_DEFAULTS.find(([pattern]) => pattern.test(prompt));
  if (!editing && room) actions.push({type: "SET_ROOM_TYPE", roomType: room[1]});
  let serial = 1;
  const nextId = () => {while (scene.objects.some(o => o.id === `item_${serial}`)) serial++; return `item_${serial++}`;};
  let intent = "add", excluding = false, namedFurniture = false;
  // Do not split decimal measurements. Carry a verb across a coordinated list.
  for (const clause of prompt.split(/[!?;\n]|(?<!\d)\.(?!\d)|,(?!\d)|\s+(?:и|and)\s+/i).filter(s => s.trim())) {
    if (DEFAULT_DECISION.test(clause.trim())) continue;
    if (/убер|удал|remove|delete/i.test(clause)) intent = "remove";
    else if (/перестав|передвин|перемест|\bmove/i.test(clause)) intent = "move";
    else if (/поверн|rotate/i.test(clause)) intent = "rotate";
    else if (/перекрас|сделай|измени|change|paint/i.test(clause)) intent = "change";
    else if (/добав|постав|add/i.test(clause)) {intent = "add"; excluding = false;}
    if (/(?:^|\s)(?:без|without|не добавляй|не ставь)\s/i.test(clause)) excluding = true;
    if (/(?:^|\s)(?:с|with)\s/i.test(clause)) excluding = false;
    const tint = requestedColor(clause);
    const matched: {start: number; end: number}[] = [];
    for (const [pattern, genericId] of TERMS) {
      const match = pattern.exec(clause); if (!match) continue;
      const start = match.index, end = start + match[0].length;
      if (matched.some(m => start < m.end && end > m.start)) continue;
      matched.push({start, end});
      namedFurniture = true;
      const assetId = genericId === "desk_work" && /обеденн|dining/i.test(clause) ? "table_dining" : genericId === "bed_double" && (/односпальн|single|детск/i.test(clause) || room?.[1] === "kids") ? "bed_single" : sizedVariant(genericId, clause, scene, variant);
      const existing = scene.objects.filter(o => o.assetId === assetId);
      if (editing && (intent !== "add" || excluding)) {
        const all = /все|всю|\ball\b/i.test(clause);
        check(existing.length > 0, "Такого предмета в комнате нет");
        check(all || existing.length === 1, "Найдено несколько таких предметов. Укажите «все» или выберите нужный в списке.");
        for (const item of existing) {
          if (intent === "remove" || excluding) actions.push({type: "REMOVE_OBJECT", objectId: item.id});
          else if (intent === "rotate") {const degrees = /(-?\d+(?:[.,]\d+)?)\s*(?:°|градус|degree)/i.exec(clause);check(degrees, "Укажите поворот в градусах");actions.push({type: "ROTATE_OBJECT", objectId: item.id, angle: (item.rotation.y + Number(degrees[1].replace(",", ".")) * Math.PI / 180) % (Math.PI * 2)});}
          else if (intent === "move" && /окн|window/i.test(clause)) actions.push({type: "MOVE_NEAR_WINDOW", objectId: item.id});
          else if (tint) actions.push({type: "CHANGE_MATERIAL", objectId: item.id, color: tint});
          else throw new DesignError("Для этой правки задайте цвет, угол или перемещение к окну. Координаты можно изменить в свойствах предмета.", 422, "DESIGN_ACTION_UNSUPPORTED");
        }
      } else if (!editing || intent === "add") {
        // "спальня без кровати с двумя креслами": the "с" later in the clause must not undo this "без".
        if (excluding || /(?:без|without|не добавляй|не ставь)\s+(?:\S+\s+)?$/i.test(clause.slice(Math.max(0, start - 30), start))) continue;
        const prefix = clause.slice(Math.max(0, match.index - 80), match.index);
        const countText = /(?:^|\s)(\d+|один|одна|одно|одним|одной|два|две|двумя|двух|три|тремя|трёх|трех|четыре|четырьмя|четырёх|четырех|пять|пятью|пяти|шесть|шестью|шести|семь|семью|восемь|восемью|восьмью|one|two|three|four|five|six)\s+(?:(?:красн|син|бел|ч[её]рн|зел[её]н|сер|деревянн|мягк|обеденн|журнальн|рабоч|письменн|офисн|кухонн|книжн|напольн|односпальн|двуспальн)[а-яё]*\s+){0,2}$/i.exec(prefix)?.[1];
        const count = countText ? ({один: 1, одна: 1, одно: 1, одним: 1, одной: 1, два: 2, две: 2, двумя: 2, двух: 2, три: 3, тремя: 3, трёх: 3, трех: 3, четыре: 4, четырьмя: 4, четырёх: 4, четырех: 4, пять: 5, пятью: 5, пяти: 5, шесть: 6, шестью: 6, шести: 6, семь: 7, семью: 7, восемь: 8, восемью: 8, восьмью: 8, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6}[countText.toLowerCase()] ?? Number(countText)) : 1;
        check(Number.isInteger(count) && count >= 1 && count <= 10, "За один запрос можно добавить до 10 одинаковых предметов");
        const needed = editing ? count : Math.max(0, count - existing.filter(o => o.locked).length);
        for (let i = 0; i < needed; i++) actions.push({type: "ADD_OBJECT", id: nextId(), assetId, ...(tint ? {color: tint} : {}), nearWindow: /окн|window/i.test(clause)});
      }
    }
    if (/стен|\bwalls?\b/i.test(clause) && tint) actions.push({type: "CHANGE_WALL_MATERIAL", color: tint});
    if (/пол(?:а|ом|ы)?(?:\s|$)|\bfloor\b/i.test(clause) && tint) actions.push({type: "CHANGE_FLOOR_MATERIAL", color: tint});
    if (!matched.length && !tint && !STYLE_TERMS.some(([p]) => p.test(clause)) && !/спальн|гостин|кабинет|офис|комнат|интерьер|кухн|ванн|санузел|туалет|детск|столов|прихож|коридор|bedroom|living|office|room|interior|kitchen|bath|dining|hallway|nursery|свет|освещ|light|\d\s*(?:м|метр|[x×*]|на)|ширин|длин|высот/i.test(clause)) {
      throw new DesignError(`Не распознана часть запроса: «${clause.trim()}». Уточните предмет или действие.`, 422, "DESIGN_ACTION_UNSUPPORTED");
    }
  }
  const emptyRoom = /пуст|без мебел|empty|unfurnished/i.test(prompt);
  if (!editing && room && !namedFurniture && !emptyRoom) for (const assetId of room[2]) {
    if (!scene.objects.some(o => o.locked && o.assetId === assetId)) actions.push({type: "ADD_OBJECT", id: nextId(), assetId: sizedVariant(assetId, prompt, scene, variant)});
  }
  // A bedroom with "two nightstands" still needs its bed, unless the request rules it out.
  if (!editing && room && namedFurniture && !emptyRoom) for (const assetId of ROOM_ESSENTIALS[room[1]] ?? []) {
    const asset = findAsset(assetId), excluded = new RegExp(`(?:без|without)\\s+(?:\\S+\\s+)?(?:${asset.tags.map(t => t.slice(0, 5)).join("|")})`, "i").test(prompt);
    const sameKind = (id: unknown) => typeof id === "string" && findAsset(id).category === asset.category;
    if (!excluded && !actions.some(a => a.type === "ADD_OBJECT" && sameKind(a.assetId)) && !scene.objects.some(o => findAsset(o.assetId).category === asset.category))
      actions.unshift({type: "ADD_OBJECT", id: nextId(), assetId});
  }
  if (!editing && !actions.length && /комнат|интерьер|\broom\b|interior/i.test(prompt)) actions.push({type: "SET_ROOM_TYPE", roomType: "other"});
  const warm = /т[её]пл\S*\s+(?:свет|освещ)|warm\s+light/i.test(prompt);
  const brighter = /больше\s+(?:света|освещ)|ярче|more\s+light/i.test(prompt);
  if (warm || brighter) {
    if (scene.lights.length) for (const light of scene.lights) actions.push({type: "CHANGE_LIGHT", lightId: light.id, color: warm ? "#ffdfb0" : light.color, intensity: brighter ? Math.min(5, light.intensity + .5) : light.intensity});
    else actions.push({type: "ADD_LIGHT", id: "ceiling_light", position: {x: scene.width / 2, y: scene.height - .2, z: scene.length / 2}, color: warm ? "#ffdfb0" : "#ffffff", intensity: 1.5});
  }
  if (!actions.length) throw new DesignError("Не удалось распознать команду. Назовите мебель из библиотеки или включите текстовый AI на сервере.", 422, "DESIGN_ACTION_UNSUPPORTED");
  return {actions};
}

function validateRequestedInventory(original: InteriorScene, result: InteriorScene, prompt: string) {
  // Independently check explicitly named catalog categories/counts. Abstract
  // wishes still rely on the planner; this does not claim general NLP coverage.
  let plan: ReturnType<typeof localPlan>;
  try {plan = localPlan(prompt, {...original, objects: []}, false);}
  catch {return;}
  const counts = new Map<string, number>();
  for (const a of plan.actions) if (a.type === "ADD_OBJECT") {
    const assetId = a.assetId as string;
    counts.set(assetId, (counts.get(assetId) ?? 0) + 1);
  }
  for (const [assetId, requested] of counts) {
    const locked = original.objects.filter(o => o.locked && o.assetId === assetId).length;
    const actual = result.objects.filter(o => o.assetId === assetId).length;
    if (actual !== Math.max(requested, locked)) throw new DesignError(`Количество ${assetId} не соответствует запросу: нужно ${Math.max(requested, locked)}, получено ${actual}`, 422, "DESIGN_INVENTORY_MISMATCH");
  }
}

export async function designWithPlanner(scene: InteriorScene, prompt: string, editing: boolean, variant: number,
  request?: (system: string, user: string) => Promise<unknown>): Promise<{scene: InteriorScene; source: "ai" | "local"}> {
  if (!request) {
    const plan = localPlan(prompt, scene, editing, variant);
    // Bounded backtracking of early furniture choices preserves the inventory
    // when a greedy placement blocks a later item. Existing objects never move.
    const alternatives = editing ? [[]] : [[], [1], [4], [12], [24], [0, 4], [0, 12], [4, 4], [12, 4], [24, 8]];
    for (let attempt = 0; attempt < alternatives.length; attempt++) {
      try {return {scene: applyActions(scene, plan, variant, alternatives[attempt]), source: "local"};}
      catch (e) {if (!(e instanceof DesignError) || e.code !== "DESIGN_NO_SPACE" || attempt === alternatives.length - 1) throw e;}
    }
  }
  if (!request) throw new DesignError("Не удалось разместить мебель", 422, "DESIGN_NO_SPACE");
  const system = `You plan interiors. Return JSON {"actions": [...]} only. Never access storage.
Allowed actions: ADD_OBJECT {id,assetId,position?:{x,y,z},angle?:radians}, REMOVE_OBJECT {objectId}, MOVE_OBJECT {objectId,position}, MOVE_NEAR_WINDOW {objectId}, ROTATE_OBJECT {objectId,angle}, SCALE_OBJECT {objectId,scale:{x,y,z}}, CHANGE_MATERIAL {objectId,color}, CHANGE_WALL_MATERIAL {color}, CHANGE_FLOOR_MATERIAL {color}, APPLY_STYLE {style}, ADD_LIGHT {id,position,color,intensity}, REMOVE_LIGHT {lightId}, CHANGE_LIGHT {lightId,intensity,color}.
Only use supplied asset IDs. Preserve exact counts, named objects and locked objects. During edits change ONLY requested objects. No geometry or made-up assets. Omit position for new furniture to let the validated layout engine find room. Coordinates metres, y up, furniture y=0, x/z at footprint centre. Hex colors #RRGGBB. Existing stable IDs must be preserved. Unsupported request: {"actions":[]}.
Do not remove existing furniture to make room unless asked. Walls, dimensions and openings are fixed. A variation may vary placement, never required furniture or dimensions.`;
  let correction = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await request(system, JSON.stringify({prompt, editing, variant, scene, availableAssets: ASSETS, correction}));
    try {
      const result = applyActions(scene, raw, variant);
      if (!editing) validateRequestedInventory(scene, result, prompt);
      if (editing && JSON.stringify(result) === JSON.stringify(scene)) throw new DesignError("Команда не изменила сцену", 422, "DESIGN_NO_CHANGE");
      return {scene: result, source: "ai"};
    }
    catch (error) {if (!(error instanceof DesignError) || attempt === 1) throw error; correction = error.message;}
  }
  throw new DesignError("Не удалось составить план действий", 502, "DESIGN_GENERATION_FAILED");
}
