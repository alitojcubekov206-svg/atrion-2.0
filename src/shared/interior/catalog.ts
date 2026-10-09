export const STYLES = {
  modern: {name: "Современный", wall: "#eeeae4", floor: "#bda88d", accent: "#536d78", density: "medium"},
  minimalism: {name: "Минимализм", wall: "#ffffff", floor: "#c8b79e", accent: "#e8e8e8", density: "low"},
  loft: {name: "Лофт", wall: "#b5aaa0", floor: "#887564", accent: "#42484b", density: "medium"},
  scandinavian: {name: "Скандинавский", wall: "#f3f1eb", floor: "#d0b997", accent: "#8da5a0", density: "low"},
  classic: {name: "Классический", wall: "#eae0cf", floor: "#9c7452", accent: "#806557", density: "medium"},
  neoclassic: {name: "Неоклассика", wall: "#eee7de", floor: "#b49d80", accent: "#8a8790", density: "medium"},
  industrial: {name: "Индустриальный", wall: "#a9a9a6", floor: "#83847f", accent: "#465055", density: "medium"},
  japandi: {name: "Джапанди", wall: "#e7e0d2", floor: "#bca887", accent: "#827a63", density: "low"},
  "high-tech": {name: "Хай-тек", wall: "#e6eaed", floor: "#a2abb0", accent: "#354c62", density: "low"},
} as const;
export type InteriorStyle = keyof typeof STYLES;
export const CATEGORIES = ["bed", "sofa", "table", "chair", "wardrobe", "lamp", "plant", "decor", "kitchen", "bathroom"] as const;
export type AssetCategory = typeof CATEGORIES[number];
/** `price` is an editable demonstration price in KGS, as in FORMA's catalog — not a supplier quote. */
export type Asset = {id: string; name: string; category: AssetCategory; width: number; height: number; depth: number; tags: string[]; styles: InteriorStyle[]; modelUrl: string; template?: string; price: number};
/** FORMA's seed prices (furniture-data.js) where FORMA had the item; the rest are in the same range. */
const PRICES_KGS: Record<string, number> = {
  bed_double: 38000, bed_single: 24000, sofa_compact: 45000, desk_work: 16000, table_dining: 21000, chair_simple: 5200,
  wardrobe_double: 42000, lamp_floor: 7500, plant_pot: 3800, decor_cube: 6500, armchair_soft: 18000, ottoman_round: 6500,
  bench_soft: 11000, table_coffee: 9500, cabinet_low: 14000, bookcase_open: 17000, console_slim: 12500, rug_floor: 8500,
  tv_stand: 52000, kitchen_run: 120000, fridge_tall: 55000, toilet_compact: 14000, vanity_sink: 18000, shower_square: 38000,
};
const asset = (id: string, name: string, category: AssetCategory, width: number, height: number, depth: number, tags: string[]): Asset =>
  ({id, name, category, width, height, depth, tags, styles: Object.keys(STYLES) as InteriorStyle[], modelUrl: `/api/design/assets/${id}/model`, price: PRICES_KGS[id] ?? 0});
/** Lies on the floor: furniture may stand on it, and it never blocks a walkway. */
export const isFlatAsset = (asset: Asset) => asset.height < 0.05;
/** Parametric library; detailed templates are adapted from the supplied FORMA source. */
export const ASSETS: Asset[] = [
  asset("bed_double", "Двуспальная кровать", "bed", 1.6, 1, 2.1, ["двуспальная", "кровать", "double"]),
  asset("bed_single", "Односпальная кровать", "bed", .95, .85, 2, ["односпальная", "кровать", "single"]),
  asset("sofa_compact", "Двухместный диван", "sofa", 1.7, .85, .85, ["диван", "sofa"]),
  asset("desk_work", "Рабочий стол", "table", 1.2, .75, .6, ["стол", "desk", "рабочий"]),
  asset("table_dining", "Обеденный стол", "table", 1.4, .75, .8, ["обеденный", "dining"]),
  asset("chair_simple", "Стул", "chair", .45, .85, .5, ["стул", "chair"]),
  asset("wardrobe_double", "Шкаф", "wardrobe", 1.2, 2.1, .6, ["шкаф", "wardrobe"]),
  asset("lamp_floor", "Торшер", "lamp", .3, 1.55, .3, ["светильник", "торшер", "лампа", "lamp"]),
  asset("plant_pot", "Растение в кашпо", "plant", .4, .9, .4, ["растение", "цветок", "plant"]),
  asset("decor_cube", "Приставная тумба", "decor", .45, .5, .4, ["тумба", "decor"]),
  {...asset("armchair_soft", "Мягкое кресло", "chair", .92, .9, .88, ["кресло", "armchair"]), template: "armchair"},
  {...asset("ottoman_round", "Пуф", "decor", .65, .44, .55, ["пуф", "ottoman"]), template: "ottoman"},
  {...asset("bench_soft", "Банкетка", "decor", 1.2, .46, .42, ["банкетка", "скамья", "bench"]), template: "bench"},
  {...asset("table_coffee", "Журнальный стол", "table", 1.05, .4, .6, ["журнальный", "coffee table"]), template: "coffee"},
  {...asset("cabinet_low", "Комод", "wardrobe", 1.1, .95, .43, ["комод", "sideboard"]), template: "cabinet"},
  {...asset("bookcase_open", "Книжный стеллаж", "wardrobe", 1.1, 1.9, .35, ["стеллаж", "bookcase"]), template: "bookcase"},
  {...asset("console_slim", "Консоль", "table", 1.4, .78, .35, ["консоль", "console"]), template: "console"},
  asset("kitchen_run", "Кухня с мойкой и плитой", "kitchen", 2.4, 1.18, .65, ["кухня", "гарнитур", "плита", "мойка"]),
  asset("fridge_tall", "Холодильник", "kitchen", .65, 1.85, .65, ["холодильник", "fridge"]),
  asset("toilet_compact", "Унитаз", "bathroom", .4, .78, .68, ["унитаз", "toilet"]),
  asset("vanity_sink", "Тумба с раковиной", "bathroom", .7, .95, .5, ["раковина", "умывальник", "vanity"]),
  asset("shower_square", "Душевая кабина", "bathroom", .9, 2.05, .9, ["душ", "shower"]),
  // From FORMA's catalog: the rug geometry was ported but never offered.
  {...asset("rug_floor", "Ковёр", "decor", 2, .018, 1.5, ["ковёр", "ковер", "rug", "carpet"]), template: "rug"},
  asset("tv_stand", "Телевизор с тумбой", "decor", 1.6, 1.25, .45, ["телевизор", "тв", "tv"]),
];
export function findAsset(id: string): Asset {
  const found = ASSETS.find(a => a.id === id);
  if (!found) throw new Error("Unknown catalog asset");
  return found;
}
export function searchAssets(input: {category?: string; style?: string; maxWidth?: number; query?: string; limit?: number}) {
  const query = input.query?.toLocaleLowerCase().trim();
  return ASSETS.filter(a => (!input.category || a.category === input.category) && (!input.style || a.styles.includes(input.style as InteriorStyle)) &&
    (input.maxWidth === undefined || a.width <= input.maxWidth) && (!query || `${a.name} ${a.tags.join(" ")}`.toLocaleLowerCase().includes(query)))
    .slice(0, Math.max(1, Math.min(20, input.limit ?? 12)));
}
