/**
 * Regression check for the 3D generator — every case here was a real bug.
 * Exits non-zero when any expectation fails, so it can gate a deploy.
 *
 *   npx tsx scripts/gen-check.ts
 */
import { buildFromPlan, planFor } from "@/backend/procedural-3d";
import { matchParts } from "@/backend/gen/match";
import { builderOwnsGeometry, generateAIGeometry, pickBetterGeometry, type JsonRequester } from "@/backend/gen/ai-geometry";
import type { Blueprint } from "@/backend/gen/blueprint";
import { interiorCutHeight, partsBounds } from "@/shared/geometry";
import { connectedGroups, sanitizeParts } from "@/backend/gen/validate";

let failures = 0;
let passed = 0;

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    return;
  }
  failures++;
  console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
}

type Case = {
  prompt: string;
  kind?: Blueprint["kind"];
  plan?: (b: Blueprint) => string | true;
  /** Built model: width (x), depth (z), height (y) in metres. */
  dims?: (d: { width: number; depth: number; height: number }) => string | true;
};

const CASES: Case[] = [
  // What the object is comes from the head noun.
  { prompt: "Аниме девушка с длинными волосами в платье", kind: "character", plan: (b) => b.length < 1.2 || `stretched to ${b.length}` },
  { prompt: "Кот сидит", kind: "animal" },
  { prompt: "Офисный стол", kind: "furniture", plan: (b) => b.roof === "none" || "table got a roof" },
  { prompt: "Робот-пылесос", kind: "appliance", plan: (b) => (b.legs === 0 && b.arms === 0 && b.head === 0) || "humanoid vacuum" },
  { prompt: "Стиральная машина", kind: "appliance", plan: (b) => b.wheels === 0 || "washing machine on wheels" },
  { prompt: "Хрустальный тостер", kind: "appliance", plan: (b) => (b.glassy && b.slots > 0) || "no glass or slots", dims: (d) => d.height < 0.4 || `toaster ${d.height} m tall` },
  { prompt: "Настольная лампа с гибкой стойкой", kind: "lighting", plan: (b) => b.lampArm || "no arm" },
  { prompt: "Меч", kind: "weapon", dims: (d) => (d.height > 0.7 && d.height < 1.4) || `sword ${d.height} m` },

  // Add-ons attach to the object instead of redefining it.
  { prompt: "Летающий дом на колёсах с трубой", kind: "building", plan: (b) => (b.wheels > 0 && b.chimneys > 0) || "wheels or chimney lost" },
  { prompt: "Робот-паук на 8 ногах с прожектором", kind: "robot", plan: (b) => (b.legs === 8 && b.sizeClass !== "handheld") || `legs=${b.legs} size=${b.sizeClass}` },
  { prompt: "Двухэтажный дом с башней, куполом и аркадой из 6 арок", kind: "building", plan: (b) => (b.floors === 2 && b.towers > 0 && b.arches === 6 && b.windows < 20) || `floors=${b.floors} arches=${b.arches} windows=${b.windows}` },
  { prompt: "Рыцарь в доспехах с мечом", kind: "character", plan: (b) => (b.blade && b.armour) || "no sword or armour" },
  { prompt: "Одноэтажный деревянный домик 6 на 5 метров с террасой и крыльцом", plan: (b) => b.wings === 0 || "крыльцо read as wings" },
  { prompt: "Белый дом с красной крышей", plan: (b) => b.primary === "#eeeae2" || `primary ${b.primary}` },
  { prompt: "Дом без окон", plan: (b) => b.windows === 0 || `windows=${b.windows}` },
  { prompt: "Дом из кирпича с металлической крышей", plan: (b) => (b.roughness > 0.85 && b.metalness < 0.3) || `metalness=${b.metalness}` },
  { prompt: "Красный спорткар с большими колёсами", kind: "vehicle", plan: (b) => (b.wheelSize > 0.4 && b.length < 5.5) || "car scaled instead of wheels", dims: (d) => d.height <= 1.6 || `car ${d.height} m tall` },
  { prompt: "Синий грузовик с прицепом", kind: "vehicle", plan: (b) => b.trailer || "no trailer" },

  // Sizes the user gave land exactly.
  { prompt: "Двухэтажный дом 12×9 м", plan: (b) => (b.width === 12 && b.length === 9) || `${b.width}×${b.length}` },
  { prompt: "Деревянный обеденный стол на 6 персон", plan: (b) => (b.width >= 1.7 && b.legs === 0) || `width=${b.width} legs=${b.legs}` },
  { prompt: "Кожаный диван трёхместный", plan: (b) => b.cushions === 3 || `cushions=${b.cushions}` },

  // Rooms are furnished, not turned into the furniture.
  { prompt: "Уютная спальня 4×5 м с кроватью и столом", kind: "room", plan: (b) => (b.furnishings.includes("кровать") && b.furnishings.includes("стол")) || `furnishings=${b.furnishings}`, dims: (d) => d.height > 2.2 || `room ${d.height} m tall` },
  { prompt: "Кухня 3 на 4 метра", kind: "room", plan: (b) => b.furnishings.includes("кухонный гарнитур") || `furnishings=${b.furnishings}` },
  { prompt: "Три деревянных стула", kind: "furniture", plan: (b) => b.copies === 3 || `copies=${b.copies}` },
  { prompt: "3 красных стула", kind: "furniture", plan: (b) => b.copies === 3 || `copies=${b.copies}` },

  // A number completing "этажный" counts floors, not houses.
  { prompt: "3 этажный дом", kind: "building", plan: (b) => (b.copies === 1 && b.floors === 3) || `copies=${b.copies} floors=${b.floors}` },
  { prompt: "создай 8 эажный дом", kind: "building", plan: (b) => (b.copies === 1 && b.floors === 8) || `copies=${b.copies} floors=${b.floors}` },
  { prompt: "8 етажный дом", kind: "building", plan: (b) => (b.copies === 1 && b.floors === 8) || `copies=${b.copies} floors=${b.floors}` },
  { prompt: "восьмиэтажный дом", kind: "building", plan: (b) => (b.copies === 1 && b.floors === 8) || `copies=${b.copies} floors=${b.floors}` },
  { prompt: "5 этажный дом", kind: "building", plan: (b) => (b.copies === 1 && b.floors === 5) || `copies=${b.copies} floors=${b.floors}` },
  { prompt: "три этажный дом", kind: "building", plan: (b) => b.copies === 1 || `copies=${b.copies}` },
  { prompt: "4 местная машина", kind: "vehicle", plan: (b) => b.copies === 1 || `copies=${b.copies}` },

  // A house with furniture is hollow, so the section view has something to show.
  { prompt: "Двухэтажный дом с мебелью", kind: "building", plan: (b) => b.furnishings.length >= 3 || `furnishings=${b.furnishings}` },
  { prompt: "Дом с диваном, кроватью и столом", kind: "building", plan: (b) => (b.furnishings.includes("диван") && b.furnishings.includes("кровать")) || `furnishings=${b.furnishings}` },
];

/* ---------------- bridges are roads, and a new request is a new model ---------------- */
{
  const names = (prompt: string, variant = "") =>
    buildFromPlan(planFor(prompt, variant).blueprint).parts.map((item) => `${item.name} ${item.group ?? ""}`).join(" | ");
  for (const prompt of ["сделай мост", "Вантовый мост длиной 400 метров", "Подвесной мост", "Арочный мост"]) {
    const all = names(prompt);
    for (const piece of ["Проезжая часть", "Тротуар", "Разметка", "Ограждение", "Подходная насыпь"]) {
      check(`${prompt}: has ${piece}`, all.includes(piece));
    }
  }
  check("cable-stayed bridge has pylons and stays", /Пилоны/.test(names("Вантовый мост")) && /Вант/.test(names("Вантовый мост")));
  check("suspension bridge has towers and main cables", /Башни/.test(names("Подвесной мост")) && /Несущий кабель/.test(names("Подвесной мост")));
  check("arch bridge has an arch", /Арка/.test(names("Арочный мост")));
  check("footbridge has no car lanes", !/Проезжая часть/.test(names("Пешеходный мост")));

  // No stay cable may run down the middle of the road.
  const stays = buildFromPlan(planFor("Вантовый мост длиной 300 метров").blueprint).parts.filter((item) => item.name === "Вант");
  const plan = planFor("Вантовый мост длиной 300 метров").blueprint;
  const deckAnchors = stays.every((item) => Math.abs(item.position[0]) > plan.width * 0.15);
  check("stay cables land at the deck edges", stays.length > 0 && deckAnchors, String(stays.length));

  // A truck (4.5 m) in the outer lane must clear every stay, on every variant —
  // a short A-pylon used to drop its lowest stays across the lane.
  // A strut's long axis for rotation [α, 0, γ] (see `strut` in build.ts).
  const axis = ([a, , c]: number[]) => [-Math.sin(c), Math.cos(c) * Math.cos(a), Math.cos(c) * Math.sin(a)];
  let crossings = 0;
  for (let v = 0; v < 40; v++) {
    const parts = buildFromPlan(planFor("Вантовый мост 60 метров", `clear-${v}`).blueprint).parts;
    const road = parts.find((item) => item.name === "Проезжая часть");
    if (!road) continue;
    const deckTop = road.position[1] + road.size[1] / 2;
    for (const item of parts.filter((p) => p.name === "Вант")) {
      const d = axis(item.rotation);
      for (let s = 0; s <= 40; s++) {
        const t = (s / 40 - 0.5) * item.size[1];
        const x = item.position[0] + d[0] * t;
        const y = item.position[1] + d[1] * t;
        if (Math.abs(x) < road.size[0] / 2 && y > deckTop && y < deckTop + 4.5) crossings++;
      }
    }
  }
  check("stays clear a truck in every lane (40 variants)", crossings === 0, `${crossings} points in the lane`);

  const foot = buildFromPlan(planFor("Пешеходный мост").blueprint).parts;
  const poles = foot.filter((item) => item.name === "Опора освещения");
  const walk = foot.find((item) => item.name === "Пролётное строение")?.size[0] ?? 0;
  check("footbridge lamp posts stand off the walkway", poles.length > 0 && poles.every((p) => p.position[0] >= walk / 2 - 0.3));

  // A long viaduct keeps realistic spans, as repeated pier rows.
  const viaduct = buildFromPlan(planFor("Балочный мост 1,5 км").blueprint).parts;
  const pierZ = viaduct
    .filter((item) => item.name === "Ригель опоры")
    .flatMap((item) => Array.from({ length: item.repeat?.count ?? 1 }, (_, k) => item.position[2] + (item.repeat?.step[2] ?? 0) * k))
    .concat([-750, 750])
    .sort((p, q) => p - q);
  const widest = Math.max(...pierZ.slice(1).map((z, k) => z - pierZ[k]));
  check("a 1.5 km viaduct has piers at most 50 m apart", widest <= 50, `${widest.toFixed(0)} m`);
  check("approach ramps do not count against a bridge's size", matchParts(planFor("Подвесной мост через реку", "x").blueprint, buildFromPlan(planFor("Подвесной мост через реку", "x").blueprint).parts).sizeFit > 0.95);

  const a = JSON.stringify(buildFromPlan(planFor("сделай мост", "one").blueprint).parts.map((p) => p.position));
  const b = JSON.stringify(buildFromPlan(planFor("сделай мост", "two").blueprint).parts.map((p) => p.position));
  check("a new request gives a new bridge", a !== b);
  const c = JSON.stringify(buildFromPlan(planFor("сделай мост", "one").blueprint).parts.map((p) => p.position));
  check("the same variant is reproducible", a === c);
}

/* ---------------- bridges ship from their builder, everything else from the AI ---------------- */
{
  const owns = (prompt: string) => builderOwnsGeometry(planFor(prompt, "owner").blueprint);
  for (const prompt of ["сделай мост", "Мост через реку", "мостик через ручей", "виадук", "эстакада", "пешеходный мост", "Golden Gate bridge"]) {
    check(`«${prompt}» is built by the bridge builder`, owns(prompt));
  }
  for (const prompt of ["мостовой кран", "дом у моста", "капитанский мостик корабля", "кот на мосту", "дом", "машина"]) {
    check(`«${prompt}» is left to the AI`, !owns(prompt));
  }
  check("«мостовой кран» is not planned as a bridge", planFor("мостовой кран", "x").blueprint.bridge === null);
}

/* ---------------- building types, lanes, and a new look on every generation ---------------- */
{
  const build = (prompt: string, variant = "type") => {
    const blueprint = planFor(prompt, variant).blueprint;
    return { blueprint, names: buildFromPlan(blueprint).parts.map((item) => item.name).join(" | ") };
  };
  for (const prompt of ["торговый центр", "ТЦ", "супермаркет", "Торговый центр с парковкой"]) {
    const { blueprint, names } = build(prompt);
    check(`«${prompt}» is a shop, not a house`, blueprint.kind === "building" && blueprint.roof === "flat" && blueprint.width >= 40, `${blueprint.roof} ${blueprint.width.toFixed(0)} m`);
    check(`«${prompt}» has a shop front`, /Вывеска/.test(names) && /Входной атриум/.test(names) && /Парковка/.test(names));
  }
  check("«дом рядом с торговым центром» stays a house", !build("дом рядом с торговым центром").blueprint.storefront);
  check("«школа» is not a gable-roofed cottage", build("школа").blueprint.floors >= 3 && build("школа").blueprint.roof === "flat");

  const lanesOf = (prompt: string, variant: string) => {
    const { blueprint, names } = build(prompt, variant);
    const dividers = names.split(" | ").filter((name) => /Разделительная разметка|Осевая разметка|Разделительный барьер/.test(name)).length;
    const road = buildFromPlan(blueprint).parts.find((item) => item.name === "Проезжая часть");
    return { lanes: dividers + 1, laneWidth: (road?.size[0] ?? 0) / (dividers + 1) };
  };
  for (const prompt of ["мост с 8 полосами", "восьмиполосный мост", "bridge with 8 lanes", "мост 6 полос"]) {
    const want = /6/.test(prompt) ? 6 : 8;
    for (const variant of ["l1", "l2", "l3"]) {
      const { lanes, laneWidth } = lanesOf(prompt, variant);
      check(`«${prompt}» [${variant}] has ${want} lanes of at least 3 m`, lanes === want && laneWidth >= 3, `${lanes} × ${laneWidth.toFixed(2)} m`);
    }
  }

  const looks = new Set<string>();
  for (let v = 0; v < 8; v++) {
    const { blueprint: b } = build("дом", `look-${v}`);
    looks.add([b.roof, b.floors, b.garage, b.terrace, b.chimneys, b.balconies].join("|"));
  }
  check("a plain «дом» looks different across generations", looks.size >= 5, `${looks.size} of 8 differ`);
  let respected = true;
  for (let v = 0; v < 12; v++) {
    respected &&= !build("дом без гаража", `n-${v}`).blueprint.garage;
    respected &&= build("одноэтажный дом", `n-${v}`).blueprint.floors === 1;
    respected &&= build("дом с плоской крышей", `n-${v}`).blueprint.roof === "flat";
  }
  check("variety never overrides what the prompt says (без гаража, одноэтажный, плоская крыша)", respected);
}

/* ---------------- a bare "200 метров" is the object's main size ---------------- */
{
  const plan = (prompt: string) => planFor(prompt, "size").blueprint;
  check("«мост через реку 200 метров» is 200 m long", plan("Автомобильный мост через реку 200 метров").length === 200);
  check("«мост 1,5 км» is 1500 m long", plan("мост 1,5 км").length === 1500);
  check("«башня 80 м» is 80 m tall", plan("башня 80 м").height === 80);
  const giraffe = plan("жираф 5 метров");
  check("a 5 m animal grows whole, not into a stick", giraffe.length === 5 && giraffe.height > 1.5, `${giraffe.height.toFixed(2)} m tall`);
  const table = plan("стол 120 см");
  check("a 120 cm table stays table height", table.width === 1.2 && table.height > 0.6 && table.height < 0.9, `${table.height.toFixed(2)} m`);
  check("two bare sizes stay ambiguous", plan("комната 4 м и 5 м").params.size === undefined);
  check("«16 дюймов» is not read as metres", plan("ноутбук 16 дюймов").params.size === undefined);
}

/* ---------------- what the words say, the model has (sweep of 2026-10-09) ---------------- */
{
  const plan = (prompt: string) => planFor(prompt, "words").blueprint;
  const built = (prompt: string, variant = "words") => buildFromPlan(planFor(prompt, variant).blueprint);

  // Spelled-out counts: `\b` never matched before a Cyrillic word.
  check("«дом с тремя окнами» has 3 windows", plan("дом с тремя окнами").windows === 3, `windows=${plan("дом с тремя окнами").windows}`);
  check("«машина с шестью колёсами» has 6 wheels", plan("машина с шестью колёсами").wheels === 6, `wheels=${plan("машина с шестью колёсами").wheels}`);
  check("«робот на шести ногах» has 6 legs", plan("робот на шести ногах").legs === 6, `legs=${plan("робот на шести ногах").legs}`);
  check("«дом с двумя башнями» has 2 towers", plan("дом с двумя башнями").towers === 2, `towers=${plan("дом с двумя башнями").towers}`);
  for (const prompt of ["дом три этажа", "дом из трёх этажей", "дом с тремя этажами"]) {
    const floors = [1, 2, 3, 4].map((i) => planFor(prompt, `f${i}`).blueprint.floors);
    check(`«${prompt}» is always 3 floors`, floors.every((n) => n === 3), floors.join(","));
  }
  check("«мост на шесть полос» has 6 lanes", plan("мост на шесть полос").lanes === 6, `lanes=${plan("мост на шесть полос").lanes}`);

  // Purpose and surroundings never become the object.
  const kindOf = (prompt: string) => plan(prompt).kind;
  check("«дом у моста» is a house, not a bridge", kindOf("дом у моста") === "building" && !plan("дом у моста").bridge, kindOf("дом у моста"));
  check("«машина возле дома» is a car", kindOf("машина возле дома") === "vehicle", kindOf("машина возле дома"));
  check("«лампа над столом» is a lamp", kindOf("лампа над столом") === "lighting", kindOf("лампа над столом"));
  check("«будка для собаки» is a kennel, not a dog", kindOf("будка для собаки") === "building", kindOf("будка для собаки"));
  check("«гараж для машины» is a garage, not a car", kindOf("гараж для машины") === "building", kindOf("гараж для машины"));
  check("«дом под красной крышей» keeps its roof add-on", kindOf("дом под красной крышей") === "building");
  check("«дом с машиной» gets no wheels", plan("дом с машиной").wheels === 0, `wheels=${plan("дом с машиной").wheels}`);
  check("«гараж на две машины» gets no wheels", plan("гараж на две машины").wheels === 0);
  check("«дом на колёсах» still gets wheels", plan("дом на колёсах").wheels > 0);
  // "без X" of a whole-object word removes only its add-on.
  const noGarage = plan("одноэтажный дом без гаража");
  check("«без гаража» keeps the house's windows and doors", !noGarage.garage && noGarage.windows > 0 && noGarage.doors > 0, `windows=${noGarage.windows} doors=${noGarage.doors}`);
  const noTower = plan("дом без башни");
  check("«без башни» keeps the house's floors and windows", noTower.towers === 0 && noTower.windows > 0 && noTower.floors >= 1, `floors=${noTower.floors} windows=${noTower.windows}`);
  check("«робот без рук» has no arms", plan("робот без рук").arms === 0, `arms=${plan("робот без рук").arms}`);
  check("«робот с четырьмя руками» has 4 arms", plan("робот с четырьмя руками").arms === 4);

  // Common nouns that used to fall through to a toy-sized "product".
  const sized: [string, Blueprint["kind"], (b: Blueprint) => boolean][] = [
    ["церковь", "building", (b) => b.height > 8],
    ["castle", "building", (b) => b.width > 20],
    ["сарай", "building", (b) => b.width >= 3 && b.width <= 7],
    ["баня", "building", (b) => b.width >= 3 && b.width <= 8],
    ["юрта", "building", (b) => b.width >= 5],
    ["трехэтажка", "building", (b) => b.floors === 3],
    ["вертолёт", "aircraft", (b) => b.length >= 10],
    ["поезд", "vehicle", (b) => b.length >= 15],
    ["космический корабль", "aircraft", (b) => b.length >= 10 && !b.hull],
    ["дерево", "plant", (b) => b.height >= 4],
    ["ёлка", "plant", (b) => b.height >= 4],
    ["роза", "plant", (b) => b.height < 1],
    ["cup", "container", (b) => b.height < 0.3],
  ];
  for (const [prompt, kind, sane] of sized) {
    const b = plan(prompt);
    check(`«${prompt}» is a ${kind} of a believable size`, b.kind === kind && sane(b), `${b.kind} ${b.width.toFixed(2)}×${b.length.toFixed(2)}×${b.height.toFixed(2)}`);
  }
  check("«три дерева» are three trees", plan("три дерева").copies === 3 && plan("три дерева").kind === "plant");
  check("«пара кресел» are two chairs", plan("пара кресел").copies === 2 && plan("пара кресел").kind === "furniture");
  check("«деревянный стол» is still a table", kindOf("деревянный стол") === "furniture");
  check("«стол из дерева» is still a table", kindOf("стол из дерева") === "furniture");

  // One measured number is the finished size, spire and all.
  for (const [prompt, axis, target] of [["башня высотой 50 метров", 1, 50], ["робот высотой 3 метра", 1, 3], ["маяк высотой 30 м", 1, 30]] as const) {
    const { min, max } = partsBounds(built(prompt).parts);
    const actual = max[axis] - min[axis];
    check(`«${prompt}» is ${target} m`, Math.abs(actual - target) <= target * 0.01, `${actual.toFixed(2)} m`);
  }

  // Nothing floats: upper-floor windows, spires, the tank's gun, the dragon's head.
  for (const prompt of ["храм", "трехэтажка", "дом", "танк", "башня", "маяк", "rocket", "дракон", "дерево", "пальма", "ёлка", "куст", "роза", "юрта", "вертолёт", "автобус", "поезд", "замок", "пикап", "внедорожник", "спорткар", "космический корабль", "нло", "пирамида", "пианино", "рояль", "гитара"]) {
    const groups = connectedGroups(built(prompt, "sweep01").parts, 0.05);
    check(`«${prompt}» is one connected object`, groups.length === 1, `${groups.length} pieces`);
  }

  // Silhouettes the generic body could not make: they have their own builders.
  const names = (prompt: string) => built(prompt).parts.map((p) => p.name).join(" | ");
  check("a yurt is round felt with a tündük crown", /Түндүк/.test(names("юрта")) && built("юрта").parts.some((p) => p.name === "Стена" && p.shape === "cylinder"), names("юрта").slice(0, 200));
  check("a helicopter has a tail boom, main rotor and skids", ["Хвостовая балка", "Лопасть несущего винта", "Полоз"].every((n) => names("вертолёт").includes(n)), names("вертолёт").slice(0, 200));
  check("a bus is one glazed saloon, not a lorry", /Салон/.test(names("автобус")) && !/Грузовой отсек/.test(names("автобус")), names("автобус").slice(0, 200));
  check("a lorry keeps its cab and cargo box", /Грузовой отсек/.test(names("грузовик")));
  check("a castle has walls with battlements, corner towers, a gate and a keep", ["Зубцы фасада", "Угловая башня", "Ворота", "Донжон"].every((n) => names("замок").includes(n)), names("замок").slice(0, 200));
  check("a dragon uses the animal body with claws and bat wings", ["Туловище", "Коготь", "Перепонка 1", "Наконечник хвоста"].every((n) => names("дракон").includes(n)), names("дракон").slice(0, 200));
  check("«зелёный дракон» is green", built("зелёный дракон").parts.some((p) => p.name === "Туловище" && /^#[0-9a-f]{6}$/i.test(p.color) && parseInt(p.color.slice(3, 5), 16) > parseInt(p.color.slice(1, 3), 16)));
  const styles = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((v) => planFor("машина", v).blueprint.carStyle));
  check("«машина» varies its body style between generations", styles.size >= 3, [...styles].join(","));
  check("«пикап» has an open bed", /Борт кузова/.test(names("пикап")));
  check("a spaceship has a canopy, swept wings and glowing engines", ["Кабина", "Крыло", "Сопло"].every((n) => names("космический корабль").includes(n)) && !/Корма|Парус/.test(names("космический корабль")));
  check("a UFO is a disc with a dome and landing legs", ["Диск", "Купол", "Опора 1"].every((n) => names("нло").includes(n)));
  check("a pyramid is a stone pyramid with a capstone", built("пирамида").parts.some((p) => p.name === "Пирамида" && p.shape === "pyramid") && /Навершие/.test(names("пирамида")));
  check("a piano has 52 white keys and black keys in octave groups", built("пианино").parts.some((p) => p.name === "Белые клавиши" && p.repeat?.count === 52) && /Чёрные клавиши 5/.test(names("пианино")));
  check("«рояль» is a grand with a raised lid", /Хвост корпуса/.test(names("рояль")) && /Крышка/.test(names("рояль")));
  check("a guitar has a sound hole, neck and six strings", built("гитара").parts.some((p) => p.name === "Струны" && p.repeat?.count === 6) && /Розетка/.test(names("гитара")));
  check("«спорткар» stays low", planFor("спорткар", "x").blueprint.height < 1.35);

  // Entrance steps climb towards the door.
  const steps = built("дом", "sweep01").parts.find((p) => p.name === "Ступени — проступь");
  check("entrance steps rise towards the facade", !!steps && steps.repeat!.step[1] > 0 && steps.repeat!.step[2] < 0, JSON.stringify(steps?.repeat));
}

/* ---------------- generated meshes keep their texture through validation ---------------- */
{
  const tri = { position: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], index: [0, 1, 2, 2, 1, 3], uv: [0, 0, 1, 0, 0, 1, 1, 1], texture: "data:image/jpeg;base64,AAAA" };
  const [kept] = sanitizeParts([{ id: "scan", name: "Модель", shape: "mesh", position: [0, 0.5, 0], size: [1, 1, 0.01], mesh: tri }]);
  check("mesh keeps its index", kept?.mesh?.index?.length === 6, JSON.stringify(kept?.mesh?.index));
  check("mesh keeps uv and texture", kept?.mesh?.uv?.length === 8 && kept?.mesh?.texture === tri.texture);
  const [broken] = sanitizeParts([{ id: "bad", name: "x", shape: "mesh", position: [0, 0, 0], size: [1, 1, 1], mesh: { ...tri, index: [0, 1, 9] } }]);
  check("an out-of-range index is dropped", broken?.mesh?.index === undefined);
  const coloured = { position: tri.position, index: tri.index, color: [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1] };
  const [painted] = sanitizeParts([{ id: "vc", name: "Модель", shape: "mesh", position: [0, 0.5, 0], size: [1, 1, 0.01], mesh: coloured }]);
  check("mesh keeps its vertex colours", painted?.mesh?.color?.length === 12, JSON.stringify(painted?.mesh?.color));
}

/* ---------------- section view opens covered interiors only ---------------- */
for (const [prompt, expected] of [
  ["Двухэтажный дом с мебелью", true],
  ["Дом с диваном, кроватью и столом", true],
  ["Двухэтажный дом 12×9 м", false],
  ["Уютная спальня 4×5 м с кроватью и столом", false],
  ["Красный спорткар", false],
] as const) {
  const cut = interiorCutHeight(buildFromPlan(planFor(prompt).blueprint));
  check(
    `${prompt}: section view ${expected ? "opens" : "stays off"}`,
    expected ? cut !== null && cut > 1 && cut < 3 : cut === null,
    String(cut)
  );
}

for (const item of CASES) {
  const { blueprint } = planFor(item.prompt);
  if (item.kind) check(`${item.prompt}: kind`, blueprint.kind === item.kind, `got ${blueprint.kind}`);
  if (item.plan) {
    const verdict = item.plan(blueprint);
    check(`${item.prompt}: plan`, verdict === true, verdict === true ? "" : verdict);
  }
  const concept = buildFromPlan(planFor(item.prompt).blueprint);
  if (item.dims) {
    const verdict = item.dims(concept.dimensions);
    check(`${item.prompt}: size`, verdict === true, verdict === true ? "" : verdict);
  }
  const report = matchParts(planFor(item.prompt).blueprint, concept.parts);
  check(`${item.prompt}: has what was asked`, report.missing.length === 0, report.missing.join(", "));
  check(`${item.prompt}: quality`, report.quality >= 0.85, String(report.quality));
}

/* ---------------- AI geometry: ships when valid, missing named parts get repaired ---------------- */

type RawPart = { id: string; name: string; shape: string; position: number[]; size: number[]; color: string; material: string };
const raw = (id: string, name: string, position: number[], size: number[], shape = "box"): RawPart => ({
  id,
  name,
  shape,
  position,
  size,
  color: "#c1462f",
  material: "x",
});

const carBody = [
  raw("body", "Кузов", [0, 0.5, 0], [1.8, 0.6, 4.4]),
  raw("cabin", "Кабина", [0, 1.05, -0.2], [1.5, 0.5, 2]),
  raw("glass", "Лобовое стекло", [0, 1.05, 0.81], [1.4, 0.4, 0.02]),
];
const wheel = (id: string, x: number, z: number) => raw(id, "Колесо", [x, 0.33, z], [0.25, 0.66, 0.66], "cylinder");
const carWithWheels = [...carBody, wheel("w1", 0.8, 1.4), wheel("w2", -0.8, 1.4), wheel("w3", 0.8, -1.4), wheel("w4", -0.8, -1.4)];

async function aiChecks() {
  const prompt = "Красный спорткар с колёсами";
  const { blueprint } = planFor(prompt);
  const baseline = buildFromPlan(planFor(prompt).blueprint);

  // The brief lists what the user named, outside the size budget.
  let brief = "";
  const capture: JsonRequester = async <T>(system: string, user: string) => {
    brief = system + "\n" + user;
    return { parts: carWithWheels } as T;
  };
  await generateAIGeometry({ prompt, baseline, plan: blueprint, category: blueprint.sizeClass, request: capture, singlePass: true });
  check("brief lists the named wheels", /Components the user named[\s\S]*wheels/.test(brief), brief.slice(-400));
  const budget = brief.split("DETAIL BUDGET")[1]?.split("Hard limit:")[0] ?? "";
  check("size budget names no components", !/wheels|roof|window/i.test(budget), budget);

  // Wheels forgotten: the defect is named, a repair pass runs and its fix is kept.
  const calls: string[] = [];
  const repairing: JsonRequester = async <T>(_system: string, user: string) => {
    calls.push(user);
    return { parts: calls.length === 1 ? carBody : carWithWheels } as T;
  };
  const repaired = await generateAIGeometry({ prompt, baseline, plan: blueprint, category: blueprint.sizeClass, request: repairing });
  check("missing wheels trigger one repair pass", calls.length === 2, `calls=${calls.length}`);
  check("repair request names the missing wheels", /Нет запрошенного элемента: колёса/.test(calls[1] ?? ""), calls[1]?.slice(0, 300));
  check("repaired model keeps its wheels", (repaired?.match?.missing.length ?? 1) === 0, repaired?.match?.missing.join(","));

  // Still missing after the repair: the AI model ships anyway, with the gap reported.
  const stubborn: JsonRequester = async <T>() => ({ parts: carBody }) as T;
  const unrepaired = await generateAIGeometry({ prompt, baseline, plan: blueprint, category: blueprint.sizeClass, request: stubborn });
  const choice = pickBetterGeometry(baseline, unrepaired, blueprint);
  check("valid AI geometry ships even when incomplete", choice.source === "ai", choice.source);
  check("the gap is reported", choice.match?.missing.includes("колёса") ?? false, choice.match?.missing.join(","));

  // No AI result: the parametric model is the labelled fallback.
  const fallback = pickBetterGeometry(baseline, null, blueprint);
  check("no AI result falls back to the parametric model", fallback.source === "procedural");
  check("fallback has the named wheels", fallback.match?.missing.length === 0, fallback.match?.missing.join(","));
}

aiChecks().then(() => {
  console.log(`\n${passed} passed, ${failures} failed`);
  if (failures) process.exit(1);
});
