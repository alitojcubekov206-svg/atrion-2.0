// Furniture from the user-supplied FORMA project. See docs/FORMA_INTEGRATION.md.
import {MeshStandardMaterial,Group,Shape,ExtrudeGeometry,BoxGeometry,Mesh,CylinderGeometry,SphereGeometry,Vector2,LatheGeometry,TorusGeometry} from "three";
// public/forma/furniture-data.js
var furnitureCatalog = [
  ["sofa", "\u0414\u0438\u0432\u0430\u043D", "\u041C\u044F\u0433\u043A\u0430\u044F \u043C\u0435\u0431\u0435\u043B\u044C", 2.4, 0.95, 1, 45e3, "\u0434\u0438\u0432\u0430\u043D|sofa"],
  ["armchair", "\u041A\u0440\u0435\u0441\u043B\u043E", "\u041C\u044F\u0433\u043A\u0430\u044F \u043C\u0435\u0431\u0435\u043B\u044C", 0.9, 0.95, 0.92, 18e3, "\u043A\u0440\u0435\u0441\u043B|armchair"],
  ["ottoman", "\u041F\u0443\u0444", "\u041C\u044F\u0433\u043A\u0430\u044F \u043C\u0435\u0431\u0435\u043B\u044C", 0.62, 0.43, 0.62, 6500, "\u043F\u0443\u0444|ottoman"],
  ["bench", "\u0411\u0430\u043D\u043A\u0435\u0442\u043A\u0430", "\u041C\u044F\u0433\u043A\u0430\u044F \u043C\u0435\u0431\u0435\u043B\u044C", 1.3, 0.46, 0.45, 11e3, "\u0431\u0430\u043D\u043A\u0435\u0442|\u0441\u043A\u0430\u043C\u044C|bench"],
  ["bed", "\u041A\u0440\u043E\u0432\u0430\u0442\u044C", "\u041C\u044F\u0433\u043A\u0430\u044F \u043C\u0435\u0431\u0435\u043B\u044C", 1.8, 1.05, 2.15, 38e3, "\u043A\u0440\u043E\u0432\u0430\u0442|bed"],
  ["table", "\u041E\u0431\u0435\u0434\u0435\u043D\u043D\u044B\u0439 \u0441\u0442\u043E\u043B", "\u0421\u0442\u043E\u043B\u044B \u0438 \u0441\u0442\u0443\u043B\u044C\u044F", 1.5, 0.76, 0.85, 21e3, "\u043E\u0431\u0435\u0434\u0435\u043D\u043D.*\u0441\u0442\u043E\u043B|\u0441\u0442\u043E\u043B.*\u043E\u0431\u0435\u0434\u0435\u043D\u043D|dining"],
  ["coffee", "\u0416\u0443\u0440\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u0441\u0442\u043E\u043B\u0438\u043A", "\u0421\u0442\u043E\u043B\u044B \u0438 \u0441\u0442\u0443\u043B\u044C\u044F", 0.9, 0.42, 0.65, 9500, "\u0436\u0443\u0440\u043D\u0430\u043B\u044C\u043D|\u043A\u043E\u0444\u0435\u0439\u043D.*\u0441\u0442\u043E\u043B|\u0441\u0442\u043E\u043B\u0438\u043A|coffee"],
  ["desk", "\u041F\u0438\u0441\u044C\u043C\u0435\u043D\u043D\u044B\u0439 \u0441\u0442\u043E\u043B", "\u0421\u0442\u043E\u043B\u044B \u0438 \u0441\u0442\u0443\u043B\u044C\u044F", 1.35, 0.76, 0.62, 16e3, "\u043F\u0438\u0441\u044C\u043C\u0435\u043D\u043D|\u0440\u0430\u0431\u043E\u0447.*\u0441\u0442\u043E\u043B|desk"],
  ["chair", "\u0421\u0442\u0443\u043B", "\u0421\u0442\u043E\u043B\u044B \u0438 \u0441\u0442\u0443\u043B\u044C\u044F", 0.5, 0.88, 0.55, 5200, "\u0441\u0442\u0443\u043B|chair"],
  ["cabinet", "\u0428\u043A\u0430\u0444\u0447\u0438\u043A", "\u0425\u0440\u0430\u043D\u0435\u043D\u0438\u0435", 1, 1.1, 0.43, 14e3, "\u0448\u043A\u0430\u0444\u0447\u0438\u043A|\u043A\u043E\u043C\u043E\u0434|cabinet"],
  ["wardrobe", "\u0428\u043A\u0430\u0444", "\u0425\u0440\u0430\u043D\u0435\u043D\u0438\u0435", 1.6, 2.3, 0.6, 42e3, "\u0448\u043A\u0430\u0444|\u0433\u0430\u0440\u0434\u0435\u0440\u043E\u0431|wardrobe"],
  ["nightstand", "\u0422\u0443\u043C\u0431\u0430", "\u0425\u0440\u0430\u043D\u0435\u043D\u0438\u0435", 0.5, 0.55, 0.42, 6500, "\u0442\u0443\u043C\u0431|nightstand"],
  ["bookcase", "\u0421\u0442\u0435\u043B\u043B\u0430\u0436", "\u0425\u0440\u0430\u043D\u0435\u043D\u0438\u0435", 1.1, 1.9, 0.35, 17e3, "\u0441\u0442\u0435\u043B\u043B\u0430\u0436|\u043A\u043D\u0438\u0436\u043D.*\u043F\u043E\u043B\u043A|bookcase"],
  ["console", "\u041A\u043E\u043D\u0441\u043E\u043B\u044C", "\u0425\u0440\u0430\u043D\u0435\u043D\u0438\u0435", 1.4, 0.78, 0.35, 12500, "\u043A\u043E\u043D\u0441\u043E\u043B\u044C|console"],
  ["lamp", "\u0422\u043E\u0440\u0448\u0435\u0440", "\u0421\u0432\u0435\u0442 \u0438 \u0434\u0435\u043A\u043E\u0440", 0.46, 1.65, 0.46, 7500, "\u0442\u043E\u0440\u0448\u0435\u0440|\u043D\u0430\u043F\u043E\u043B\u044C\u043D.*\u043B\u0430\u043C\u043F|floor lamp"],
  ["plant", "\u0420\u0430\u0441\u0442\u0435\u043D\u0438\u0435", "\u0421\u0432\u0435\u0442 \u0438 \u0434\u0435\u043A\u043E\u0440", 0.65, 1.4, 0.65, 3800, "\u0440\u0430\u0441\u0442\u0435\u043D\u0438|\u0444\u0438\u043A\u0443\u0441|\u043F\u0430\u043B\u044C\u043C|plant"],
  ["rug", "\u041A\u043E\u0432\u0451\u0440", "\u0421\u0432\u0435\u0442 \u0438 \u0434\u0435\u043A\u043E\u0440", 2, 0.018, 1.5, 8500, "\u043A\u043E\u0432\u0435\u0440|\u043A\u043E\u0432\u0451\u0440|\u043A\u043E\u0432\u0440|rug"],
  ["vase", "\u0412\u0430\u0437\u0430", "\u041F\u0440\u0435\u0434\u043C\u0435\u0442\u044B", 0.22, 0.38, 0.22, 1200, "\u0432\u0430\u0437|vase"],
  ["books", "\u041A\u043D\u0438\u0433\u0438", "\u041F\u0440\u0435\u0434\u043C\u0435\u0442\u044B", 0.3, 0.13, 0.22, 1500, "\u043A\u043D\u0438\u0433|books"],
  ["cup", "\u041A\u0440\u0443\u0436\u043A\u0430", "\u041F\u0440\u0435\u0434\u043C\u0435\u0442\u044B", 0.12, 0.13, 0.1, 450, "\u043A\u0440\u0443\u0436\u043A|\u0447\u0430\u0448\u043A|cup"],
  ["bowl", "\u0427\u0430\u0448\u0430", "\u041F\u0440\u0435\u0434\u043C\u0435\u0442\u044B", 0.25, 0.1, 0.25, 650, "\u0447\u0430\u0448[\u0430\u0443]|\u043C\u0438\u0441|bowl"],
  ["bottle", "\u0411\u0443\u0442\u044B\u043B\u043A\u0430", "\u041F\u0440\u0435\u0434\u043C\u0435\u0442\u044B", 0.09, 0.28, 0.09, 800, "\u0431\u0443\u0442\u044B\u043B|bottle"],
  ["candle", "\u0421\u0432\u0435\u0447\u0430", "\u041F\u0440\u0435\u0434\u043C\u0435\u0442\u044B", 0.1, 0.18, 0.1, 550, "\u0441\u0432\u0435\u0447|candle"],
  ["radio", "\u0420\u0430\u0434\u0438\u043E", "\u041F\u0440\u0435\u0434\u043C\u0435\u0442\u044B", 0.3, 0.2, 0.12, 4200, "\u0440\u0430\u0434\u0438\u043E|radio"]
].map(([id, name, category, w, h, d, price, pattern]) => ({ id, name, category, w, h, d, price, pattern, small: category === "\u041F\u0440\u0435\u0434\u043C\u0435\u0442\u044B" }));
var furnitureColors = [["\u041E\u043B\u0438\u0432\u043A\u043E\u0432\u044B\u0439", "#758260", "\u0437\u0435\u043B\u0435\u043D|\u0437\u0435\u043B\u0451\u043D|\u043E\u043B\u0438\u0432|green"], ["\u041A\u0440\u0435\u043C\u043E\u0432\u044B\u0439", "#e6dfcd", "\u043A\u0440\u0435\u043C|\u0431\u0435\u0436|cream"], ["\u0422\u0435\u0440\u0440\u0430\u043A\u043E\u0442\u043E\u0432\u044B\u0439", "#b77959", "\u0442\u0435\u0440\u0440\u0430\u043A|\u043E\u0440\u0430\u043D\u0436"], ["\u0413\u043E\u043B\u0443\u0431\u043E\u0439", "#73999f", "\u0433\u043E\u043B\u0443\u0431|\u0441\u0438\u043D|blue"], ["\u0413\u0440\u0430\u0444\u0438\u0442", "#3d4643", "\u0447\u0435\u0440\u043D|\u0447\u0451\u0440\u043D|\u0433\u0440\u0430\u0444\u0438\u0442|black"], ["\u0411\u0435\u043B\u044B\u0439", "#eeeae0", "\u0431\u0435\u043B|white"], ["\u041E\u0440\u0435\u0445", "#866446", "\u043E\u0440\u0435\u0445|\u043A\u043E\u0440\u0438\u0447\u043D|\u0434\u0435\u0440\u0435\u0432|brown"], ["\u0411\u043E\u0440\u0434\u043E\u0432\u044B\u0439", "#86545c", "\u0431\u043E\u0440\u0434\u043E\u0432|\u043A\u0440\u0430\u0441\u043D|red"]];
function parseFurniture(text) {
  const q = String(text).trim().toLowerCase();
  if (!q) return { error: "\u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043F\u0440\u0435\u0434\u043C\u0435\u0442 \u0438 \u0446\u0432\u0435\u0442, \u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \xAB\u0417\u0435\u043B\u0451\u043D\u044B\u0439 \u0434\u0438\u0432\u0430\u043D \u0443 \u043E\u043A\u043D\u0430\xBB." };
  const item = furnitureCatalog.find((x) => new RegExp(x.pattern, "i").test(q));
  if (!item) return { error: "\u041D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0442\u0430\u043A\u043E\u0439 \u043F\u0440\u0435\u0434\u043C\u0435\u0442. \u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u043E\u0434\u0435\u043B\u044C \u0438\u0437 \u043A\u0430\u0442\u0430\u043B\u043E\u0433\u0430 \u043D\u0438\u0436\u0435 \u0438\u043B\u0438 \u0443\u0442\u043E\u0447\u043D\u0438\u0442\u0435 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435." };
  const color = furnitureColors.find((x) => new RegExp(x[2], "i").test(q)) || furnitureColors[1];
  const place = /окн|window/.test(q) ? "window" : /стен|wall/.test(q) ? "wall" : /центр|center/.test(q) ? "center" : "free";
  const room = /спальн/.test(q) ? "bedroom" : /кухн|столов/.test(q) ? "kitchen" : /кабинет/.test(q) ? "office" : /ванн/.test(q) ? "bath" : /террас|балкон/.test(q) ? "terrace" : /гостин/.test(q) ? "living" : null;
  const scale = /маленьк|компактн|небольш/.test(q) ? 0.75 : /больш|огром/.test(q) ? 1.2 : 1;
  return { item, color: color[1], colorName: color[0], place, room, scale };
}
function calculateBudget({ items, prices, area: area3, wallArea, rates, reserve }) {
  const valid = (n) => Math.min(1e9, Math.max(0, Number(n) || 0));
  const lines = items.map((x) => ({ ...x, total: valid(x.quantity) * valid(prices[x.id]) }));
  const renovation = valid(area3) * (valid(rates.floor) + valid(rates.ceiling) + valid(rates.labor)) + valid(wallArea) * valid(rates.walls);
  const furniture = lines.reduce((s, x) => s + x.total, 0), subtotal = furniture + renovation, contingency = subtotal * Math.min(50, valid(reserve)) / 100;
  return { lines, furniture, renovation, subtotal, contingency, total: subtotal + contingency };
}

// public/forma/furniture-models.js
var material = (color, roughness = 0.72) => new MeshStandardMaterial({ color, roughness });
function createFurniture(id, color = "#e6dfcd") {
  const spec = furnitureCatalog.find((x) => x.id === id);
  if (!spec) throw Error("Unknown furniture");
  const root = new Group(), doors = [];
  const main = material(color), wood = material("#97764f"), dark = material("#343d36"), linen = material("#e9e1d0"), brass = new MeshStandardMaterial({ color: "#af9566", metalness: 0.7, roughness: 0.3 });
  function box(w2, h2, d2, x, y, z, m = main, parent = root, soft = 0) {
    let g;
    if (soft) {
      const s = new Shape(), r = Math.min(soft, w2 / 4, h2 / 4, d2 / 4);
      s.moveTo(-w2 / 2 + r, -h2 / 2);
      s.lineTo(w2 / 2 - r, -h2 / 2);
      s.quadraticCurveTo(w2 / 2, -h2 / 2, w2 / 2, -h2 / 2 + r);
      s.lineTo(w2 / 2, h2 / 2 - r);
      s.quadraticCurveTo(w2 / 2, h2 / 2, w2 / 2 - r, h2 / 2);
      s.lineTo(-w2 / 2 + r, h2 / 2);
      s.quadraticCurveTo(-w2 / 2, h2 / 2, -w2 / 2, h2 / 2 - r);
      s.lineTo(-w2 / 2, -h2 / 2 + r);
      s.quadraticCurveTo(-w2 / 2, -h2 / 2, -w2 / 2 + r, -h2 / 2);
      g = new ExtrudeGeometry(s, { depth: d2 - 2 * r, bevelEnabled: true, bevelSegments: 3, bevelSize: r, bevelThickness: r, curveSegments: 5 });
      g.translate(0, 0, -d2 / 2 + r);
    } else g = new BoxGeometry(w2, h2, d2);
    const o = new Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function cyl(r, h2, x, y, z, m = main, top = r) {
    const o = new Mesh(new CylinderGeometry(top, r, h2, 28), m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    root.add(o);
    return o;
  }
  function ell(x, y, z, a, b, c, m = main) {
    const o = new Mesh(new SphereGeometry(1, 18, 12), m);
    o.scale.set(a, b, c);
    o.position.set(x, y, z);
    o.castShadow = true;
    root.add(o);
    return o;
  }
  function legs(w2, d2, h2) {
    for (const x of [-w2 / 2, w2 / 2]) for (const z of [-d2 / 2, d2 / 2]) box(0.045, h2, 0.045, x, h2 / 2, z, wood);
  }
  const { w, h, d } = spec;
  if (["sofa", "armchair"].includes(id)) {
    legs(w - 0.3, d - 0.25, 0.19);
    box(w, 0.32, d, 0, 0.36, 0, main, root, 0.1);
    box(w, 0.54, 0.2, 0, 0.68, -d / 2 + 0.08, main, root, 0.08);
    for (const side of [-1, 1]) box(0.18, 0.45, d, side * (w / 2 - 0.08), 0.57, 0, main, root, 0.065);
    const n = id === "sofa" ? 3 : 1;
    for (let i = 0; i < n; i++) {
      box((w - 0.4) / n - 0.025, 0.15, d - 0.25, (i - (n - 1) / 2) * (w - 0.4) / n, 0.58, 0.045, main, root, 0.045);
      const p = box(0.35, 0.31, 0.12, (i - (n - 1) / 2) * (w - 0.4) / n, 0.79, -0.25, linen, root, 0.035);
      p.rotation.z = (i % 2 ? 1 : -1) * 0.1;
    }
  } else if (id === "bed") {
    legs(w - 0.2, d - 0.2, 0.14);
    box(w, 0.27, d, 0, 0.27, 0, wood, root, 0.04);
    box(w - 0.05, 0.23, d - 0.08, 0, 0.51, 0, linen, root, 0.075);
    box(w + 0.08, 1, 0.12, 0, 0.55, -d / 2, main, root, 0.05);
    box(w, 0.1, d * 0.65, 0, 0.68, d * 0.16, main, root, 0.03);
    for (const x of [-w / 4, w / 4]) box(w * 0.42, 0.16, 0.45, x, 0.74, -d * 0.32, linen, root, 0.05);
  } else if (["ottoman", "bench"].includes(id)) {
    legs(w - 0.15, d - 0.15, 0.15);
    box(w, h - 0.1, d, 0, h / 2 + 0.05, 0, main, root, 0.1);
  } else if (["table", "desk", "coffee", "console"].includes(id)) {
    legs(w - 0.2, d - 0.18, h - 0.07);
    box(w, 0.075, d, 0, h - 0.035, 0, main, root, 0.025);
    if (id === "desk") box(0.4, 0.14, d - 0.05, w / 2 - 0.28, h - 0.15, 0, wood);
  } else if (id === "chair") {
    legs(0.39, 0.39, 0.44);
    box(0.48, 0.11, 0.47, 0, 0.48, 0, main, root, 0.04);
    box(0.46, 0.35, 0.09, 0, 0.71, -0.225, main, root, 0.04);
  } else if (["cabinet", "wardrobe", "nightstand"].includes(id)) {
    box(w, 0.06, d, 0, 0.04, 0, wood);
    box(w, 0.045, d, 0, h, 0, wood);
    box(0.035, h, d, -w / 2, h / 2, 0, wood);
    box(0.035, h, d, w / 2, h / 2, 0, wood);
    box(w, h, 0.03, 0, h / 2, -d / 2, wood);
    for (let y = 0.34; y < h - 0.15; y += 0.39) {
      box(w - 0.07, 0.025, d - 0.04, 0, y, 0, wood);
      for (let i = 0; i < 3; i++) box(0.07, 0.19, 0.16, -w * 0.28 + i * 0.09, y + 0.11, -0.06, i % 2 ? linen : main);
    }
    for (const side of [-1, 1]) {
      const pivot = new Group();
      pivot.position.set(side * w / 2, 0, d / 2);
      root.add(pivot);
      box(w / 2 - 0.015, h - 0.055, 0.035, -side * w / 4, h / 2 + 0.02, 0, main, pivot);
      box(0.022, 0.12, 0.035, -side * (w / 2 - 0.075), h * 0.58, 0.04, brass, pivot);
      doors.push({ pivot, angle: side * Math.PI * 0.54 });
    }
  } else if (id === "bookcase") {
    for (const x of [-w / 2, w / 2]) box(0.045, h, d, x, h / 2, 0, wood);
    for (let y = 0.1; y < h; y += 0.43) {
      box(w, 0.04, d, 0, y, 0, wood);
      for (let j = 0; j < 6; j++) box(0.075, 0.25, 0.22, -w / 2 + 0.14 + j * 0.1, y + 0.15, 0, j % 2 ? main : linen);
    }
  } else if (id === "lamp") {
    cyl(0.23, 0.035, 0, 0.03, 0, dark);
    cyl(0.018, 1.4, 0, 0.72, 0, brass);
    cyl(0.24, 0.3, 0, 1.5, 0, main, 0.16);
    cyl(0.13, 0.015, 0, 1.35, 0, material("#fff0c3"));
  } else if (id === "plant") {
    cyl(0.18, 0.33, 0, 0.17, 0, wood, 0.22);
    cyl(0.015, 0.9, 0, 0.77, 0, wood);
    for (let i = 0; i < 15; i++) {
      const a = i * 2.4;
      const leaf = ell(Math.sin(a) * 0.23, 0.65 + i % 5 * 0.15, Math.cos(a) * 0.23, 0.1, 0.24, 0.04, material(i % 2 ? "#61784d" : "#849264"));
      leaf.rotation.set(Math.cos(a) * 0.7, a, Math.sin(a) * 0.7);
    }
  } else if (id === "rug") {
    box(w, 0.015, d, 0, 0.012, 0, main);
    for (let i = 0; i < 5; i++) box(w - 0.06, 2e-3, 8e-3, 0, 0.021, -d / 2 + 0.07 + i * 0.025, linen);
  } else if (id === "vase") {
    const points = [[0.06, 0], [0.1, 0.05], [0.11, 0.16], [0.07, 0.3], [0.065, 0.38]].map((p) => new Vector2(...p));
    const o = new Mesh(new LatheGeometry(points, 32), main);
    o.castShadow = true;
    root.add(o);
  } else if (id === "books") {
    for (let i = 0; i < 3; i++) {
      const b = box(0.3 - i * 0.013, 0.037, 0.22, 0, 0.022 + i * 0.04, 0, i % 2 ? linen : main);
      b.rotation.y = i * 0.08;
    }
  } else if (id === "cup") {
    cyl(0.05, 0.12, 0, 0.06, 0, main);
    cyl(0.043, 2e-3, 0, 0.122, 0, material("#59452f"));
    const handle = new Mesh(new TorusGeometry(0.039, 9e-3, 8, 20), main);
    handle.position.set(0.065, 0.064, 0);
    root.add(handle);
  } else if (id === "bowl") {
    const o = new Mesh(new SphereGeometry(0.125, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), main);
    o.position.y = 0.115;
    root.add(o);
    for (let i = 0; i < 3; i++) ell(Math.sin(i * 2.1) * 0.045, 0.1, Math.cos(i * 2.1) * 0.045, 0.04, 0.04, 0.04, material("#b58b4f"));
  } else if (id === "bottle") {
    cyl(0.045, 0.2, 0, 0.1, 0, main);
    cyl(0.023, 0.08, 0, 0.24, 0, main);
    cyl(0.026, 0.02, 0, 0.29, 0, brass);
  } else if (id === "candle") {
    cyl(0.052, 0.17, 0, 0.085, 0, main);
    cyl(0.048, 3e-3, 0, 0.172, 0, linen);
    cyl(3e-3, 0.017, 0, 0.18, 0, dark);
  } else if (id === "radio") {
    box(0.3, 0.2, 0.12, 0, 0.1, 0, wood, root, 0.02);
    const speaker = cyl(0.062, 9e-3, -0.055, 0.1, 0.064, dark);
    speaker.rotation.x = Math.PI / 2;
    box(0.08, 0.035, 0.012, 0.077, 0.145, 0.07, main);
    for (const x of [0.055, 0.1]) {
      const knob = cyl(0.012, 0.014, x, 0.065, 0.08, brass);
      knob.rotation.x = Math.PI / 2;
    }
  }
  return { root, doors, spec };
}
function registerFurniture(scene, model, name, small = false) {
  const { root, doors, spec } = model;
  const list = scene.userData.interactives;
  {
    const item = { object: root, name: name || spec.name, kind: doors.length ? "cabinet" : "object", description: spec.name + " \xB7 " + Math.round(spec.h * 100) + " \u0441\u043C", doors, open: false, portable: true };
    root.userData.interaction = list.length;
    list.push(item);
    return item;
  }
}


export {furnitureCatalog, createFurniture};
