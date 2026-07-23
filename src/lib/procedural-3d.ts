import type { ModelPart, ThreeDConcept } from "@/lib/types";

function part(
  id: string,
  name: string,
  opts: {
    shape?: "box" | "cylinder";
    role: string;
    group: string;
    parentId?: string | null;
    position: [number, number, number];
    size: [number, number, number];
    rotation?: [number, number, number];
    color: string;
    material: string;
    quantity?: number;
  }
): ModelPart {
  return {
    id,
    name,
    shape: opts.shape ?? "box",
    role: opts.role,
    group: opts.group,
    parentId: opts.parentId ?? null,
    position: opts.position,
    size: opts.size,
    rotation: opts.rotation ?? [0, 0, 0],
    color: opts.color,
    material: opts.material,
    quantity: opts.quantity ?? 1,
  };
}

function wrap(
  name: string,
  description: string,
  dimensions: ThreeDConcept["dimensions"],
  structure: NonNullable<ThreeDConcept["structure"]>,
  parts: ModelPart[]
): ThreeDConcept {
  return {
    name,
    description,
    units: "m",
    dimensions,
    structure,
    parts,
    materials: [
      {
        name: "Основные материалы",
        specification: "По концепции",
        estimatedQuantity: "По расчёту",
        reason: "Силуэт объекта",
      },
    ],
    equipment: [{ name: "Инструмент / техника", purpose: "Монтаж", access: "specialist" }],
    requirements: ["Замеры", "Проверка инженера"],
    assemblySteps: structure.map((g) => g.label),
    costEstimate: {
      currency: "KGS",
      minimum: 100000,
      maximum: 800000,
      breakdown: [{ item: "Концепт", quantity: "1", estimatedCost: 250000 }],
      note: "Ориентир Atrion. Бесплатная procedural-модель.",
    },
    advantages: ["Цельный силуэт", "Разборка Explode", "Без платного mesh API"],
    disadvantages: ["Концепт, не фотореализм Meshy"],
    risks: [
      {
        risk: "Не точные нагрузки",
        severity: "High",
        mitigation: "Инженерный расчёт",
      },
    ],
    engineeringNotes: ["Это визуальный концепт Atrion Free"],
    disclaimer: "Концептуальная модель Atrion. Не BIM.",
  };
}

export function buildHouse(prompt: string): ThreeDConcept {
  const name = prompt.length > 4 && prompt.length <= 55 ? prompt : "Двухэтажный дом";
  const parts = [
    part("plinth", "Цоколь", {
      role: "foundation",
      group: "Base",
      position: [0, -0.25, 0],
      size: [12.4, 0.5, 9.3],
      color: "#5b5368",
      material: "Бетон",
    }),
    part("body", "Основной объём", {
      role: "volume",
      group: "Volume",
      parentId: "plinth",
      position: [-0.6, 2.6, 0],
      size: [10.5, 5.6, 8.2],
      color: "#d4c6b0",
      material: "Штукатурка",
    }),
    part("garage", "Гараж", {
      role: "volume",
      group: "Volume",
      parentId: "body",
      position: [5.6, 1.5, 1.2],
      size: [3.6, 3.4, 5.5],
      color: "#c4b49a",
      material: "Штукатурка",
    }),
    part("roof-l", "Скат крыши L", {
      role: "roof",
      group: "Roof",
      parentId: "body",
      position: [-0.6, 5.95, -1.55],
      size: [11.2, 0.28, 5.4],
      rotation: [0.42, 0, 0],
      color: "#9a7a3a",
      material: "Черепица",
    }),
    part("roof-r", "Скат крыши R", {
      role: "roof",
      group: "Roof",
      parentId: "body",
      position: [-0.6, 5.95, 1.55],
      size: [11.2, 0.28, 5.4],
      rotation: [-0.42, 0, 0],
      color: "#9a7a3a",
      material: "Черепица",
    }),
    part("chimney", "Дымоход", {
      shape: "cylinder",
      role: "detail",
      group: "Roof",
      position: [2.2, 7.2, -0.8],
      size: [0.28, 1.4, 0.28],
      color: "#7a6a5a",
      material: "Кирпич",
    }),
    part("win-1", "Окно 1эт", {
      role: "window",
      group: "Facade",
      parentId: "body",
      position: [-3.2, 1.8, 4.15],
      size: [1.6, 1.5, 0.1],
      color: "#7ec8ff",
      material: "Стекло",
    }),
    part("win-2", "Окно 1эт B", {
      role: "window",
      group: "Facade",
      parentId: "body",
      position: [0.4, 1.8, 4.15],
      size: [1.6, 1.5, 0.1],
      color: "#7ec8ff",
      material: "Стекло",
    }),
    part("win-3", "Окно 2эт", {
      role: "window",
      group: "Facade",
      parentId: "body",
      position: [-3.2, 4.1, 4.15],
      size: [1.6, 1.4, 0.1],
      color: "#7ec8ff",
      material: "Стекло",
    }),
    part("win-4", "Окно 2эт B", {
      role: "window",
      group: "Facade",
      parentId: "body",
      position: [0.4, 4.1, 4.15],
      size: [2.4, 1.4, 0.1],
      color: "#7ec8ff",
      material: "Стекло",
    }),
    part("door", "Вход", {
      role: "door",
      group: "Facade",
      parentId: "body",
      position: [2.6, 1.2, 4.16],
      size: [1.2, 2.2, 0.12],
      color: "#5c4030",
      material: "Дерево",
    }),
    part("steps", "Крыльцо", {
      role: "detail",
      group: "Base",
      parentId: "plinth",
      position: [2.6, 0.15, 5.1],
      size: [2.4, 0.35, 1.6],
      color: "#6b7788",
      material: "Камень",
    }),
    part("balcony", "Балкон", {
      role: "detail",
      group: "Facade",
      parentId: "body",
      position: [0.4, 3.2, 4.55],
      size: [3.2, 0.15, 1.1],
      color: "#8a8070",
      material: "Бетон",
    }),
  ];
  return wrap(
    name,
    "Цельный дом: объём, крыша, окна, вход — не куча коробок.",
    { width: 12, height: 8.2, depth: 9 },
    [
      { id: "base", label: "Base", partIds: ["plinth", "steps"] },
      { id: "volume", label: "Volume", partIds: ["body", "garage"] },
      { id: "roof", label: "Roof", partIds: ["roof-l", "roof-r", "chimney"] },
      {
        id: "facade",
        label: "Facade",
        partIds: ["win-1", "win-2", "win-3", "win-4", "door", "balcony"],
      },
    ],
    parts
  );
}

export function buildSchool(prompt: string): ThreeDConcept {
  const name = prompt.length > 4 && prompt.length <= 55 ? prompt : "Школа";
  const parts = [
    part("plinth", "Цоколь", {
      role: "foundation",
      group: "Foundation",
      position: [0, -0.35, 0],
      size: [36.5, 0.7, 16.4],
      color: "#7a8796",
      material: "Железобетон",
    }),
    part("main", "Главный блок", {
      role: "volume",
      group: "Mass",
      parentId: "plinth",
      position: [-4, 4.2, 0],
      size: [24, 9.5, 14],
      color: "#c5d0dc",
      material: "Штукатурка",
    }),
    part("wing", "Крыло", {
      role: "volume",
      group: "Mass",
      parentId: "main",
      position: [14, 3.4, 1.5],
      size: [10, 7.8, 11],
      color: "#b0bec9",
      material: "Штукатурка",
    }),
    part("entrance", "Вход", {
      role: "volume",
      group: "Mass",
      parentId: "main",
      position: [-4, 2.6, 8.2],
      size: [8, 5.8, 3.2],
      color: "#9eb0c0",
      material: "Штукатурка",
    }),
    part("roof-m", "Кровля", {
      role: "roof",
      group: "Roof",
      parentId: "main",
      position: [-4, 9.2, 0],
      size: [25, 0.45, 15],
      color: "#5a6574",
      material: "Мембрана",
    }),
    part("roof-w", "Кровля крыла", {
      role: "roof",
      group: "Roof",
      parentId: "wing",
      position: [14, 7.55, 1.5],
      size: [10.6, 0.4, 11.6],
      color: "#5a6574",
      material: "Мембрана",
    }),
    part("canopy", "Козырёк", {
      role: "detail",
      group: "Roof",
      parentId: "entrance",
      position: [-4, 5.7, 10.3],
      size: [9, 0.18, 2.4],
      color: "#f5c518",
      material: "Сталь",
    }),
    part("w1", "Окна 1", {
      role: "window",
      group: "Facade",
      parentId: "main",
      position: [-4, 2.2, 7.08],
      size: [20, 1.4, 0.12],
      color: "#5ec8ff",
      material: "Стекло",
    }),
    part("w2", "Окна 2", {
      role: "window",
      group: "Facade",
      parentId: "main",
      position: [-4, 5.1, 7.08],
      size: [20, 1.4, 0.12],
      color: "#5ec8ff",
      material: "Стекло",
    }),
    part("w3", "Окна 3", {
      role: "window",
      group: "Facade",
      parentId: "main",
      position: [-4, 7.9, 7.08],
      size: [20, 1.4, 0.12],
      color: "#5ec8ff",
      material: "Стекло",
    }),
    part("door", "Двери", {
      role: "door",
      group: "Facade",
      parentId: "entrance",
      position: [-4, 1.4, 9.85],
      size: [2.4, 2.8, 0.15],
      color: "#3a6f8a",
      material: "Алюминий",
    }),
    part("steps", "Крыльцо", {
      role: "detail",
      group: "Facade",
      parentId: "entrance",
      position: [-4, 0.15, 10.6],
      size: [6, 0.35, 2.2],
      color: "#6b7788",
      material: "Бетон",
    }),
  ];
  return wrap(
    name,
    "Школа с узнаваемым силуэтом: блок + крыло + вход.",
    { width: 36, height: 12.5, depth: 16 },
    [
      { id: "foundation", label: "Foundation", partIds: ["plinth"] },
      { id: "mass", label: "Mass", partIds: ["main", "wing", "entrance"] },
      { id: "roof", label: "Roof", partIds: ["roof-m", "roof-w", "canopy"] },
      { id: "facade", label: "Facade", partIds: ["w1", "w2", "w3", "door", "steps"] },
    ],
    parts
  );
}

export function buildBridge(prompt: string): ThreeDConcept {
  const name = prompt.length > 4 && prompt.length <= 55 ? prompt : "Пешеходный мост";
  const parts = [
    part("deck", "Настил", {
      role: "volume",
      group: "Deck",
      position: [0, 2.2, 0],
      size: [18, 0.35, 3.2],
      color: "#8b7355",
      material: "Дерево / сталь",
    }),
    part("pylon-l", "Опора L", {
      role: "foundation",
      group: "Supports",
      position: [-7, 0.9, 0],
      size: [1.2, 2.2, 2.4],
      color: "#5a6570",
      material: "Бетон",
    }),
    part("pylon-r", "Опора R", {
      role: "foundation",
      group: "Supports",
      position: [7, 0.9, 0],
      size: [1.2, 2.2, 2.4],
      color: "#5a6570",
      material: "Бетон",
    }),
    part("arch", "Арка", {
      role: "detail",
      group: "Structure",
      position: [0, 4.2, 0],
      size: [16, 0.35, 0.35],
      color: "#f5c518",
      material: "Сталь",
    }),
    part("rail-f", "Перила перёд", {
      role: "detail",
      group: "Rails",
      position: [0, 2.85, 1.45],
      size: [17.5, 0.9, 0.12],
      color: "#c0c8d0",
      material: "Сталь",
    }),
    part("rail-b", "Перила зад", {
      role: "detail",
      group: "Rails",
      position: [0, 2.85, -1.45],
      size: [17.5, 0.9, 0.12],
      color: "#c0c8d0",
      material: "Сталь",
    }),
    part("cable-l", "Трос L", {
      shape: "cylinder",
      role: "detail",
      group: "Structure",
      position: [-4, 3.4, 0],
      size: [0.06, 2.2, 0.06],
      rotation: [0, 0, 0.35],
      color: "#dde3ea",
      material: "Трос",
    }),
    part("cable-r", "Трос R", {
      shape: "cylinder",
      role: "detail",
      group: "Structure",
      position: [4, 3.4, 0],
      size: [0.06, 2.2, 0.06],
      rotation: [0, 0, -0.35],
      color: "#dde3ea",
      material: "Трос",
    }),
  ];
  return wrap(
    name,
    "Мост: настил, опоры, арка, перила.",
    { width: 18, height: 5, depth: 3.5 },
    [
      { id: "supports", label: "Supports", partIds: ["pylon-l", "pylon-r"] },
      { id: "deck", label: "Deck", partIds: ["deck"] },
      { id: "structure", label: "Structure", partIds: ["arch", "cable-l", "cable-r"] },
      { id: "rails", label: "Rails", partIds: ["rail-f", "rail-b"] },
    ],
    parts
  );
}

export function buildDesk(prompt: string): ThreeDConcept {
  const name = prompt.length > 4 && prompt.length <= 55 ? prompt : "Стол";
  const parts = [
    part("top", "Столешница", {
      role: "volume",
      group: "Top",
      position: [0, 0.75, 0],
      size: [1.4, 0.05, 0.7],
      color: "#b8956c",
      material: "Дерево",
    }),
    part("leg-fl", "Ножка FL", {
      role: "detail",
      group: "Legs",
      position: [-0.6, 0.35, 0.28],
      size: [0.06, 0.7, 0.06],
      color: "#666666",
      material: "Металл",
    }),
    part("leg-fr", "Ножка FR", {
      role: "detail",
      group: "Legs",
      position: [0.6, 0.35, 0.28],
      size: [0.06, 0.7, 0.06],
      color: "#666666",
      material: "Металл",
    }),
    part("leg-bl", "Ножка BL", {
      role: "detail",
      group: "Legs",
      position: [-0.6, 0.35, -0.28],
      size: [0.06, 0.7, 0.06],
      color: "#666666",
      material: "Металл",
    }),
    part("leg-br", "Ножка BR", {
      role: "detail",
      group: "Legs",
      position: [0.6, 0.35, -0.28],
      size: [0.06, 0.7, 0.06],
      color: "#666666",
      material: "Металл",
    }),
    part("shelf", "Полка", {
      role: "detail",
      group: "Top",
      position: [0, 0.25, -0.15],
      size: [1.1, 0.03, 0.35],
      color: "#a88860",
      material: "Дерево",
    }),
  ];
  return wrap(
    name,
    "Стол: столешница, ножки, полка.",
    { width: 1.4, height: 0.8, depth: 0.7 },
    [
      { id: "top", label: "Top", partIds: ["top", "shelf"] },
      { id: "legs", label: "Legs", partIds: ["leg-fl", "leg-fr", "leg-bl", "leg-br"] },
    ],
    parts
  );
}

export function buildTower(prompt: string): ThreeDConcept {
  const floors = Math.min(40, Math.max(8, Number(prompt.match(/(\d+)\s*(?:этаж|floor|storey)/i)?.[1]) || 18));
  const h = floors * 3.2;
  const name = prompt.length > 4 && prompt.length <= 55 ? prompt : `Башня ${floors} этажей`;
  const parts: ModelPart[] = [
    part("plinth", "Цоколь", {
      role: "foundation",
      group: "Base",
      position: [0, -0.4, 0],
      size: [14, 0.8, 14],
      color: "#6a7380",
      material: "Бетон",
    }),
    part("core", "Ствол", {
      role: "volume",
      group: "Mass",
      parentId: "plinth",
      position: [0, h / 2, 0],
      size: [10, h, 10],
      color: "#c8d0d8",
      material: "Стекло / фасад",
    }),
    part("crown", "Корона", {
      role: "roof",
      group: "Roof",
      parentId: "core",
      position: [0, h + 1.2, 0],
      size: [8, 2.2, 8],
      color: "#f5c518",
      material: "Сталь",
    }),
    part("spire", "Шпиль", {
      shape: "cylinder",
      role: "detail",
      group: "Roof",
      position: [0, h + 4, 0],
      size: [0.25, 4.5, 0.25],
      color: "#e8e8e8",
      material: "Сталь",
    }),
  ];
  for (let i = 0; i < Math.min(12, floors); i++) {
    const y = 2 + i * (h / Math.min(12, floors));
    parts.push(
      part(`band-${i}`, `Пояс ${i + 1}`, {
        role: "window",
        group: "Facade",
        parentId: "core",
        position: [0, y, 5.08],
        size: [9.2, 1.2, 0.12],
        color: "#6ec8ff",
        material: "Стекло",
      })
    );
  }
  return wrap(
    name,
    `Башня ${floors} этажей — цельный силуэт.`,
    { width: 14, height: h + 6, depth: 14 },
    [
      { id: "base", label: "Base", partIds: ["plinth"] },
      { id: "mass", label: "Mass", partIds: ["core"] },
      { id: "roof", label: "Roof", partIds: ["crown", "spire"] },
      {
        id: "facade",
        label: "Facade",
        partIds: parts.filter((p) => p.id.startsWith("band-")).map((p) => p.id),
      },
    ],
    parts
  );
}

export function buildOffice(prompt: string): ThreeDConcept {
  const name = prompt.length > 4 && prompt.length <= 55 ? prompt : "Офисное здание";
  const parts = [
    part("plinth", "Цоколь", {
      role: "foundation",
      group: "Base",
      position: [0, -0.3, 0],
      size: [28, 0.6, 16],
      color: "#7a8494",
      material: "Бетон",
    }),
    part("block-a", "Корпус A", {
      role: "volume",
      group: "Mass",
      position: [-6, 6, 0],
      size: [14, 12, 14],
      color: "#b8c4d0",
      material: "Фасад",
    }),
    part("block-b", "Корпус B", {
      role: "volume",
      group: "Mass",
      position: [9, 4.5, 1],
      size: [10, 9, 12],
      color: "#a8b4c0",
      material: "Фасад",
    }),
    part("roof-a", "Кровля A", {
      role: "roof",
      group: "Roof",
      position: [-6, 12.3, 0],
      size: [14.6, 0.4, 14.6],
      color: "#5a6572",
      material: "Мембрана",
    }),
    part("roof-b", "Кровля B", {
      role: "roof",
      group: "Roof",
      position: [9, 9.2, 1],
      size: [10.5, 0.35, 12.5],
      color: "#5a6572",
      material: "Мембрана",
    }),
    part("glass-a", "Витраж A", {
      role: "window",
      group: "Facade",
      position: [-6, 6, 7.08],
      size: [12, 10, 0.12],
      color: "#5ec8ff",
      material: "Стекло",
    }),
    part("glass-b", "Витраж B", {
      role: "window",
      group: "Facade",
      position: [9, 4.5, 7.08],
      size: [8, 7, 0.12],
      color: "#5ec8ff",
      material: "Стекло",
    }),
    part("lobby", "Лобби", {
      role: "volume",
      group: "Mass",
      position: [-6, 1.8, 8.2],
      size: [8, 3.6, 3],
      color: "#9aa8b8",
      material: "Стекло / сталь",
    }),
    part("door", "Вход", {
      role: "door",
      group: "Facade",
      position: [-6, 1.2, 9.75],
      size: [2.4, 2.6, 0.15],
      color: "#4a6078",
      material: "Стекло",
    }),
  ];
  return wrap(
    name,
    "Офис: два корпуса, витражи, лобби.",
    { width: 28, height: 13, depth: 16 },
    [
      { id: "base", label: "Base", partIds: ["plinth"] },
      { id: "mass", label: "Mass", partIds: ["block-a", "block-b", "lobby"] },
      { id: "roof", label: "Roof", partIds: ["roof-a", "roof-b"] },
      { id: "facade", label: "Facade", partIds: ["glass-a", "glass-b", "door"] },
    ],
    parts
  );
}

export function buildCar(prompt: string): ThreeDConcept {
  const name = prompt.length > 4 && prompt.length <= 55 ? prompt : "Автомобиль";
  const parts = [
    part("body", "Кузов", {
      role: "volume",
      group: "Body",
      position: [0, 0.55, 0],
      size: [4.2, 0.7, 1.8],
      color: "#c0392b",
      material: "Металл",
    }),
    part("cabin", "Кабина", {
      role: "volume",
      group: "Body",
      position: [-0.2, 1.15, 0],
      size: [2.2, 0.7, 1.7],
      color: "#a93226",
      material: "Металл",
    }),
    part("glass", "Стекло", {
      role: "window",
      group: "Glass",
      position: [-0.15, 1.2, 0],
      size: [1.9, 0.55, 1.72],
      color: "#7ec8ff",
      material: "Стекло",
    }),
    part("w-fl", "Колесо FL", {
      shape: "cylinder",
      role: "detail",
      group: "Wheels",
      position: [1.3, 0.35, 0.95],
      size: [0.35, 0.25, 0.35],
      rotation: [Math.PI / 2, 0, 0],
      color: "#444444",
      material: "Резина",
    }),
    part("w-fr", "Колесо FR", {
      shape: "cylinder",
      role: "detail",
      group: "Wheels",
      position: [1.3, 0.35, -0.95],
      size: [0.35, 0.25, 0.35],
      rotation: [Math.PI / 2, 0, 0],
      color: "#444444",
      material: "Резина",
    }),
    part("w-bl", "Колесо BL", {
      shape: "cylinder",
      role: "detail",
      group: "Wheels",
      position: [-1.3, 0.35, 0.95],
      size: [0.35, 0.25, 0.35],
      rotation: [Math.PI / 2, 0, 0],
      color: "#444444",
      material: "Резина",
    }),
    part("w-br", "Колесо BR", {
      shape: "cylinder",
      role: "detail",
      group: "Wheels",
      position: [-1.3, 0.35, -0.95],
      size: [0.35, 0.25, 0.35],
      rotation: [Math.PI / 2, 0, 0],
      color: "#444444",
      material: "Резина",
    }),
  ];
  return wrap(
    name,
    "Авто: кузов, кабина, колёса.",
    { width: 4.2, height: 1.6, depth: 1.9 },
    [
      { id: "body", label: "Body", partIds: ["body", "cabin"] },
      { id: "glass", label: "Glass", partIds: ["glass"] },
      { id: "wheels", label: "Wheels", partIds: ["w-fl", "w-fr", "w-bl", "w-br"] },
    ],
    parts
  );
}

/** Any unknown prompt → multi-part massing (never a single cube) */
export function buildGenericMassing(prompt: string): ThreeDConcept {
  const floors = Math.min(20, Math.max(2, Number(prompt.match(/(\d+)\s*(?:этаж|floor)/i)?.[1]) || 3));
  const width = Math.min(80, Math.max(8, Number(prompt.match(/(?:ширин[аеы]?\s*)(\d+)/i)?.[1]) || 16));
  const depth = Math.min(60, Math.max(6, Number(prompt.match(/(?:длин[аеы]?\s*|глубин[аеы]?\s*|length\s*)(\d+)/i)?.[1]) || width * 0.65));
  const storey = 3.1;
  const h = floors * storey;
  const name = prompt.length > 4 && prompt.length <= 60 ? prompt : "3D-объект";

  const parts: ModelPart[] = [
    part("plinth", "Основание", {
      role: "foundation",
      group: "Base",
      position: [0, -0.3, 0],
      size: [width + 1.2, 0.6, depth + 1.2],
      color: "#7a8494",
      material: "Бетон",
    }),
    part("body", "Основной объём", {
      role: "volume",
      group: "Mass",
      parentId: "plinth",
      position: [0, h / 2, 0],
      size: [width, h, depth],
      color: "#c5cdd6",
      material: "Фасад",
    }),
    part("wing", "Пристройка", {
      role: "volume",
      group: "Mass",
      parentId: "body",
      position: [width * 0.42, h * 0.35, depth * 0.08],
      size: [width * 0.28, h * 0.7, depth * 0.72],
      color: "#b0bac4",
      material: "Фасад",
    }),
    part("roof", "Кровля", {
      role: "roof",
      group: "Roof",
      parentId: "body",
      position: [0, h + 0.25, 0],
      size: [width + 0.8, 0.4, depth + 0.8],
      color: "#5a6572",
      material: "Кровля",
    }),
    part("canopy", "Козырёк", {
      role: "detail",
      group: "Roof",
      parentId: "body",
      position: [0, storey * 0.95, depth / 2 + 1],
      size: [Math.min(10, width * 0.45), 0.15, 2.2],
      color: "#f5c518",
      material: "Сталь",
    }),
    part("door", "Вход", {
      role: "door",
      group: "Facade",
      parentId: "body",
      position: [0, 1.2, depth / 2 + 0.08],
      size: [2.2, 2.4, 0.12],
      color: "#4a6078",
      material: "Дверь",
    }),
    part("steps", "Крыльцо", {
      role: "detail",
      group: "Base",
      parentId: "plinth",
      position: [0, 0.1, depth / 2 + 1.4],
      size: [4, 0.3, 2],
      color: "#6b7788",
      material: "Камень",
    }),
  ];

  for (let i = 0; i < floors; i++) {
    const y = storey * (i + 0.55);
    parts.push(
      part(`win-row-${i}`, `Окна эт.${i + 1}`, {
        role: "window",
        group: "Facade",
        parentId: "body",
        position: [0, y, depth / 2 + 0.06],
        size: [width * 0.82, 1.35, 0.1],
        color: "#5ec8ff",
        material: "Стекло",
      })
    );
  }

  return wrap(
    name,
    `Цельный силуэт (${floors} ур.) — не куча коробок.`,
    { width, height: h + 1.5, depth: depth + 3 },
    [
      { id: "base", label: "Base", partIds: ["plinth", "steps"] },
      { id: "mass", label: "Mass", partIds: ["body", "wing"] },
      { id: "roof", label: "Roof", partIds: ["roof", "canopy"] },
      {
        id: "facade",
        label: "Facade",
        partIds: ["door", ...parts.filter((p) => p.id.startsWith("win-")).map((p) => p.id)],
      },
    ],
    parts
  );
}

export function buildStadium(prompt: string): ThreeDConcept {
  const name = prompt.length > 4 && prompt.length <= 55 ? prompt : "Стадион";
  const parts = [
    part("field", "Поле", {
      role: "foundation",
      group: "Field",
      position: [0, -0.15, 0],
      size: [28, 0.25, 18],
      color: "#3d9a4a",
      material: "Газон",
    }),
    part("stand-n", "Трибуна N", {
      role: "volume",
      group: "Stands",
      position: [0, 3.2, -11],
      size: [30, 6.5, 4],
      color: "#c8d0d8",
      material: "Бетон",
    }),
    part("stand-s", "Трибуна S", {
      role: "volume",
      group: "Stands",
      position: [0, 3.2, 11],
      size: [30, 6.5, 4],
      color: "#c8d0d8",
      material: "Бетон",
    }),
    part("stand-e", "Трибуна E", {
      role: "volume",
      group: "Stands",
      position: [16, 2.8, 0],
      size: [4, 5.8, 18],
      color: "#b8c4d0",
      material: "Бетон",
    }),
    part("stand-w", "Трибуна W", {
      role: "volume",
      group: "Stands",
      position: [-16, 2.8, 0],
      size: [4, 5.8, 18],
      color: "#b8c4d0",
      material: "Бетон",
    }),
    part("roof-ring", "Козырёк", {
      role: "roof",
      group: "Roof",
      position: [0, 7.2, 0],
      size: [34, 0.35, 24],
      color: "#f5c518",
      material: "Сталь / мембрана",
    }),
    part("light-1", "Прожектор 1", {
      shape: "cylinder",
      role: "detail",
      group: "Lights",
      position: [14, 9, 10],
      size: [0.2, 3.5, 0.2],
      color: "#eeeeee",
      material: "Сталь",
    }),
    part("light-2", "Прожектор 2", {
      shape: "cylinder",
      role: "detail",
      group: "Lights",
      position: [-14, 9, -10],
      size: [0.2, 3.5, 0.2],
      color: "#eeeeee",
      material: "Сталь",
    }),
  ];
  return wrap(
    name,
    "Стадион: поле, трибуны, козырёк.",
    { width: 36, height: 11, depth: 26 },
    [
      { id: "field", label: "Field", partIds: ["field"] },
      { id: "stands", label: "Stands", partIds: ["stand-n", "stand-s", "stand-e", "stand-w"] },
      { id: "roof", label: "Roof", partIds: ["roof-ring"] },
      { id: "lights", label: "Lights", partIds: ["light-1", "light-2"] },
    ],
    parts
  );
}

export function buildProduct(prompt: string): ThreeDConcept {
  const name = prompt.length > 4 && prompt.length <= 55 ? prompt : "Изделие";
  const parts = [
    part("base", "Основание", {
      role: "foundation",
      group: "Base",
      position: [0, 0.08, 0],
      size: [1.4, 0.16, 1.0],
      color: "#8a9098",
      material: "Пластик / металл",
    }),
    part("body", "Корпус", {
      role: "volume",
      group: "Body",
      parentId: "base",
      position: [0, 0.55, 0],
      size: [1.1, 0.75, 0.75],
      color: "#d0d6de",
      material: "Корпус",
    }),
    part("screen", "Панель / экран", {
      role: "window",
      group: "Face",
      parentId: "body",
      position: [0, 0.6, 0.4],
      size: [0.85, 0.5, 0.05],
      color: "#5ec8ff",
      material: "Стекло",
    }),
    part("cap", "Верх", {
      role: "roof",
      group: "Body",
      parentId: "body",
      position: [0, 1.0, 0],
      size: [0.95, 0.12, 0.65],
      color: "#f5c518",
      material: "Акцент",
    }),
    part("leg-l", "Опора L", {
      role: "detail",
      group: "Base",
      position: [-0.45, 0.28, 0.3],
      size: [0.1, 0.4, 0.1],
      color: "#555555",
      material: "Металл",
    }),
    part("leg-r", "Опора R", {
      role: "detail",
      group: "Base",
      position: [0.45, 0.28, 0.3],
      size: [0.1, 0.4, 0.1],
      color: "#555555",
      material: "Металл",
    }),
    part("antenna", "Элемент", {
      shape: "cylinder",
      role: "detail",
      group: "Face",
      position: [0.4, 1.25, 0],
      size: [0.04, 0.35, 0.04],
      color: "#cccccc",
      material: "Металл",
    }),
  ];
  return wrap(
    name,
    "Изделие: корпус, панель, опоры — цельный силуэт.",
    { width: 1.5, height: 1.5, depth: 1.1 },
    [
      { id: "base", label: "Base", partIds: ["base", "leg-l", "leg-r"] },
      { id: "body", label: "Body", partIds: ["body", "cap"] },
      { id: "face", label: "Face", partIds: ["screen", "antenna"] },
    ],
    parts
  );
}

export function buildSofa(prompt: string): ThreeDConcept {
  const name = prompt.length > 4 && prompt.length <= 55 ? prompt : "Диван";
  const parts = [
    part("seat", "Сиденье", {
      role: "volume",
      group: "Seat",
      position: [0, 0.35, 0],
      size: [2.0, 0.35, 0.9],
      color: "#6b8cae",
      material: "Ткань",
    }),
    part("back", "Спинка", {
      role: "volume",
      group: "Seat",
      position: [0, 0.75, -0.35],
      size: [2.0, 0.7, 0.22],
      color: "#5a7a9a",
      material: "Ткань",
    }),
    part("arm-l", "Подлокотник L", {
      role: "detail",
      group: "Arms",
      position: [-1.05, 0.5, 0],
      size: [0.22, 0.45, 0.9],
      color: "#5a7a9a",
      material: "Ткань",
    }),
    part("arm-r", "Подлокотник R", {
      role: "detail",
      group: "Arms",
      position: [1.05, 0.5, 0],
      size: [0.22, 0.45, 0.9],
      color: "#5a7a9a",
      material: "Ткань",
    }),
    part("leg-1", "Ножка 1", {
      role: "detail",
      group: "Legs",
      position: [-0.85, 0.1, 0.35],
      size: [0.08, 0.2, 0.08],
      color: "#8b6914",
      material: "Дерево",
    }),
    part("leg-2", "Ножка 2", {
      role: "detail",
      group: "Legs",
      position: [0.85, 0.1, 0.35],
      size: [0.08, 0.2, 0.08],
      color: "#8b6914",
      material: "Дерево",
    }),
    part("leg-3", "Ножка 3", {
      role: "detail",
      group: "Legs",
      position: [-0.85, 0.1, -0.35],
      size: [0.08, 0.2, 0.08],
      color: "#8b6914",
      material: "Дерево",
    }),
    part("leg-4", "Ножка 4", {
      role: "detail",
      group: "Legs",
      position: [0.85, 0.1, -0.35],
      size: [0.08, 0.2, 0.08],
      color: "#8b6914",
      material: "Дерево",
    }),
  ];
  return wrap(
    name,
    "Диван: сиденье, спинка, подлокотники.",
    { width: 2.3, height: 1.1, depth: 1.0 },
    [
      { id: "seat", label: "Seat", partIds: ["seat", "back"] },
      { id: "arms", label: "Arms", partIds: ["arm-l", "arm-r"] },
      { id: "legs", label: "Legs", partIds: ["leg-1", "leg-2", "leg-3", "leg-4"] },
    ],
    parts
  );
}

export function buildHospital(prompt: string): ThreeDConcept {
  const name = prompt.length > 4 && prompt.length <= 55 ? prompt : "Больница";
  const base = buildGenericMassing(`5 этажей ширина 40 длина 22 ${prompt}`);
  return {
    ...base,
    name,
    description: "Медкомплекс: корпус, крыло, входная группа.",
    parts: base.parts.map((p) =>
      p.id === "canopy" ? { ...p, color: "#e8f4ff" } : p.id === "body" ? { ...p, color: "#e8eef4" } : p
    ),
  };
}

/** Stylized humanoid / anime figure — readable as a person, not a building */
export function buildCharacter(prompt: string): ThreeDConcept {
  const lower = prompt.toLowerCase();
  const feminine =
    /девуш|девоч|женщин|girl|woman|waifu|тян|школьниц|maid|idol|princess|аниме.?девуш/i.test(
      lower
    );
  const anime = /аниме|anime|manga|waifu|тян|кун|семпай/i.test(lower);
  const hairColor = anime ? "#6b4cff" : feminine ? "#2a1a12" : "#1a1a1a";
  const skin = "#f0c9a8";
  const outfit = feminine ? (anime ? "#ff6bb5" : "#7c5cff") : "#3d4a6b";
  const name =
    prompt.length > 4 && prompt.length <= 60
      ? prompt.slice(0, 60)
      : feminine
        ? anime
          ? "Аниме-девушка"
          : "Девушка"
        : "Персонаж";

  const parts = [
    part("pelvis", "Таз", {
      role: "volume",
      group: "Body",
      position: [0, 0.72, 0],
      size: [0.34, 0.18, 0.22],
      color: outfit,
      material: "Одежда",
    }),
    part("torso", "Торс", {
      role: "volume",
      group: "Body",
      parentId: "pelvis",
      position: [0, 1.05, 0],
      size: [0.38, 0.42, 0.22],
      color: outfit,
      material: "Одежда",
    }),
    part("chest", "Грудь / верх", {
      role: "detail",
      group: "Body",
      parentId: "torso",
      position: [0, 1.18, 0.04],
      size: feminine ? [0.34, 0.16, 0.18] : [0.36, 0.14, 0.2],
      color: feminine ? "#ff8ec8" : outfit,
      material: "Одежда",
    }),
    part("neck", "Шея", {
      shape: "cylinder",
      role: "detail",
      group: "Head",
      parentId: "torso",
      position: [0, 1.32, 0],
      size: [0.07, 0.1, 0.07],
      color: skin,
      material: "Кожа",
    }),
    part("head", "Голова", {
      shape: "cylinder",
      role: "volume",
      group: "Head",
      parentId: "neck",
      position: [0, 1.5, 0],
      size: [0.16, 0.22, 0.16],
      color: skin,
      material: "Кожа",
    }),
    part("hair-top", "Волосы верх", {
      role: "detail",
      group: "Hair",
      parentId: "head",
      position: [0, 1.62, -0.02],
      size: [0.22, 0.12, 0.2],
      color: hairColor,
      material: "Волосы",
    }),
    part("hair-back", "Волосы сзади", {
      role: "detail",
      group: "Hair",
      parentId: "head",
      position: [0, 1.45, -0.12],
      size: [0.2, 0.35, 0.1],
      color: hairColor,
      material: "Волосы",
    }),
    ...(anime
      ? [
          part("tail-l", "Хвостик L", {
            role: "detail",
            group: "Hair",
            parentId: "head",
            position: [-0.18, 1.55, -0.05],
            size: [0.08, 0.35, 0.08],
            color: hairColor,
            material: "Волосы",
          }),
          part("tail-r", "Хвостик R", {
            role: "detail",
            group: "Hair",
            parentId: "head",
            position: [0.18, 1.55, -0.05],
            size: [0.08, 0.35, 0.08],
            color: hairColor,
            material: "Волосы",
          }),
        ]
      : []),
    part("eye-l", "Глаз L", {
      role: "detail",
      group: "Face",
      parentId: "head",
      position: [-0.06, 1.5, 0.14],
      size: [0.05, anime ? 0.07 : 0.04, 0.02],
      color: anime ? "#5ec8ff" : "#222222",
      material: "Глаза",
    }),
    part("eye-r", "Глаз R", {
      role: "detail",
      group: "Face",
      parentId: "head",
      position: [0.06, 1.5, 0.14],
      size: [0.05, anime ? 0.07 : 0.04, 0.02],
      color: anime ? "#5ec8ff" : "#222222",
      material: "Глаза",
    }),
    part("arm-l", "Рука L", {
      shape: "cylinder",
      role: "detail",
      group: "Arms",
      parentId: "torso",
      position: [-0.28, 1.0, 0],
      size: [0.06, 0.45, 0.06],
      color: skin,
      material: "Кожа",
    }),
    part("arm-r", "Рука R", {
      shape: "cylinder",
      role: "detail",
      group: "Arms",
      parentId: "torso",
      position: [0.28, 1.0, 0],
      size: [0.06, 0.45, 0.06],
      color: skin,
      material: "Кожа",
    }),
    part("skirt", feminine ? "Юбка / низ" : "Шорты", {
      role: "volume",
      group: "Body",
      parentId: "pelvis",
      position: [0, 0.55, 0],
      size: feminine ? [0.42, 0.28, 0.28] : [0.34, 0.22, 0.24],
      color: feminine ? (anime ? "#9b5cff" : "#4a3a8a") : "#2a3348",
      material: "Одежда",
    }),
    part("leg-l", "Нога L", {
      shape: "cylinder",
      role: "detail",
      group: "Legs",
      parentId: "pelvis",
      position: [-0.1, 0.28, 0],
      size: [0.08, 0.5, 0.08],
      color: skin,
      material: "Кожа",
    }),
    part("leg-r", "Нога R", {
      shape: "cylinder",
      role: "detail",
      group: "Legs",
      parentId: "pelvis",
      position: [0.1, 0.28, 0],
      size: [0.08, 0.5, 0.08],
      color: skin,
      material: "Кожа",
    }),
    part("shoe-l", "Обувь L", {
      role: "detail",
      group: "Legs",
      parentId: "leg-l",
      position: [-0.1, 0.04, 0.04],
      size: [0.12, 0.08, 0.2],
      color: "#222222",
      material: "Обувь",
    }),
    part("shoe-r", "Обувь R", {
      role: "detail",
      group: "Legs",
      parentId: "leg-r",
      position: [0.1, 0.04, 0.04],
      size: [0.12, 0.08, 0.2],
      color: "#222222",
      material: "Обувь",
    }),
  ];

  return wrap(
    name,
    feminine
      ? anime
        ? "Аниме-персонаж: голова, волосы, торс, руки, ноги — цельный силуэт фигуры."
        : "Персонаж-девушка: читаемый humanoid силуэт."
      : "Персонаж: humanoid силуэт для Explode / Orbit.",
    { width: 0.9, height: 1.7, depth: 0.5 },
    [
      {
        id: "head",
        label: "Head",
        partIds: parts.filter((p) => p.group === "Head" || p.group === "Hair" || p.group === "Face").map((p) => p.id),
      },
      {
        id: "body",
        label: "Body",
        partIds: parts.filter((p) => p.group === "Body").map((p) => p.id),
      },
      {
        id: "arms",
        label: "Arms",
        partIds: parts.filter((p) => p.group === "Arms").map((p) => p.id),
      },
      {
        id: "legs",
        label: "Legs",
        partIds: parts.filter((p) => p.group === "Legs").map((p) => p.id),
      },
    ],
    parts
  );
}

/** Interior room box — walls + floor, not an exterior building */
export function buildRoom(prompt: string): ThreeDConcept {
  const name = prompt.length > 4 && prompt.length <= 55 ? prompt : "Комната";
  const parts = [
    part("floor", "Пол", {
      role: "foundation",
      group: "Shell",
      position: [0, 0, 0],
      size: [6, 0.12, 5],
      color: "#8b6914",
      material: "Дерево / плитка",
    }),
    part("wall-back", "Задняя стена", {
      role: "wall",
      group: "Shell",
      parentId: "floor",
      position: [0, 1.4, -2.45],
      size: [6, 2.8, 0.12],
      color: "#e8e0d4",
      material: "Штукатурка",
    }),
    part("wall-l", "Стена L", {
      role: "wall",
      group: "Shell",
      parentId: "floor",
      position: [-2.95, 1.4, 0],
      size: [0.12, 2.8, 5],
      color: "#ddd5c8",
      material: "Штукатурка",
    }),
    part("wall-r", "Стена R", {
      role: "wall",
      group: "Shell",
      parentId: "floor",
      position: [2.95, 1.4, 0],
      size: [0.12, 2.8, 5],
      color: "#ddd5c8",
      material: "Штукатурка",
    }),
    part("ceiling", "Потолок", {
      role: "roof",
      group: "Shell",
      parentId: "wall-back",
      position: [0, 2.85, 0],
      size: [6, 0.1, 5],
      color: "#f5f2ea",
      material: "Гипсокартон",
    }),
    part("window", "Окно", {
      role: "window",
      group: "Facade",
      parentId: "wall-back",
      position: [0, 1.5, -2.38],
      size: [2.2, 1.4, 0.08],
      color: "#7ec8ff",
      material: "Стекло",
    }),
    part("door", "Дверь", {
      role: "door",
      group: "Facade",
      parentId: "wall-l",
      position: [-2.88, 1.05, 1.2],
      size: [0.08, 2.1, 0.9],
      color: "#6b4423",
      material: "Дерево",
    }),
    part("bed", "Кровать / зона", {
      role: "volume",
      group: "Furniture",
      parentId: "floor",
      position: [1.4, 0.35, -0.8],
      size: [1.6, 0.5, 2.2],
      color: "#6b8cae",
      material: "Мебель",
    }),
    part("desk", "Стол", {
      role: "volume",
      group: "Furniture",
      parentId: "floor",
      position: [-1.6, 0.4, -1.5],
      size: [1.4, 0.08, 0.7],
      color: "#a08060",
      material: "Дерево",
    }),
    part("lamp", "Лампа", {
      shape: "cylinder",
      role: "detail",
      group: "Furniture",
      parentId: "desk",
      position: [-1.1, 0.75, -1.5],
      size: [0.08, 0.55, 0.08],
      color: "#f5e6a3",
      material: "Металл",
    }),
  ];
  return wrap(
    name,
    "Интерьер комнаты: пол, стены, окно, мебель — не фасад здания.",
    { width: 6.2, height: 3, depth: 5.2 },
    [
      { id: "shell", label: "Shell", partIds: ["floor", "wall-back", "wall-l", "wall-r", "ceiling"] },
      { id: "openings", label: "Openings", partIds: ["window", "door"] },
      { id: "furniture", label: "Furniture", partIds: ["bed", "desk", "lamp"] },
    ],
    parts
  );
}

export function buildAnimal(prompt: string): ThreeDConcept {
  const name = prompt.length > 4 && prompt.length <= 55 ? prompt : "Животное";
  const parts = [
    part("body", "Туловище", {
      role: "volume",
      group: "Body",
      position: [0, 0.55, 0],
      size: [0.9, 0.45, 0.5],
      color: "#c4a574",
      material: "Шерсть",
    }),
    part("head", "Голова", {
      shape: "cylinder",
      role: "volume",
      group: "Head",
      parentId: "body",
      position: [0.55, 0.7, 0],
      size: [0.22, 0.28, 0.22],
      color: "#d4b584",
      material: "Шерсть",
    }),
    part("ear-l", "Ухо L", {
      role: "detail",
      group: "Head",
      parentId: "head",
      position: [0.5, 0.95, -0.12],
      size: [0.08, 0.16, 0.06],
      color: "#b8956a",
      material: "Шерсть",
    }),
    part("ear-r", "Ухо R", {
      role: "detail",
      group: "Head",
      parentId: "head",
      position: [0.5, 0.95, 0.12],
      size: [0.08, 0.16, 0.06],
      color: "#b8956a",
      material: "Шерсть",
    }),
    part("leg-1", "Лапа 1", {
      shape: "cylinder",
      role: "detail",
      group: "Legs",
      position: [-0.3, 0.2, 0.15],
      size: [0.08, 0.35, 0.08],
      color: "#a88858",
      material: "Шерсть",
    }),
    part("leg-2", "Лапа 2", {
      shape: "cylinder",
      role: "detail",
      group: "Legs",
      position: [-0.3, 0.2, -0.15],
      size: [0.08, 0.35, 0.08],
      color: "#a88858",
      material: "Шерсть",
    }),
    part("leg-3", "Лапа 3", {
      shape: "cylinder",
      role: "detail",
      group: "Legs",
      position: [0.25, 0.2, 0.15],
      size: [0.08, 0.35, 0.08],
      color: "#a88858",
      material: "Шерсть",
    }),
    part("leg-4", "Лапа 4", {
      shape: "cylinder",
      role: "detail",
      group: "Legs",
      position: [0.25, 0.2, -0.15],
      size: [0.08, 0.35, 0.08],
      color: "#a88858",
      material: "Шерсть",
    }),
    part("tail", "Хвост", {
      shape: "cylinder",
      role: "detail",
      group: "Body",
      parentId: "body",
      position: [-0.55, 0.65, 0],
      size: [0.06, 0.4, 0.06],
      rotation: [0, 0, 0.8],
      color: "#c4a574",
      material: "Шерсть",
    }),
  ];
  return wrap(
    name,
    "Животное: туловище, голова, лапы — силуэт, не здание.",
    { width: 1.3, height: 1.0, depth: 0.7 },
    [
      { id: "body", label: "Body", partIds: ["body", "tail"] },
      { id: "head", label: "Head", partIds: ["head", "ear-l", "ear-r"] },
      { id: "legs", label: "Legs", partIds: ["leg-1", "leg-2", "leg-3", "leg-4"] },
    ],
    parts
  );
}

export type ConceptCategory =
  | "character"
  | "animal"
  | "vehicle"
  | "furniture"
  | "product"
  | "room"
  | "house"
  | "school"
  | "bridge"
  | "tower"
  | "office"
  | "stadium"
  | "hospital"
  | "building";

/**
 * Detect category from USER prompt only.
 * Order matters: schoolgirl ≠ school, room ≠ office building.
 */
export function detectCategory(prompt: string): ConceptCategory {
  const lower = prompt.toLowerCase();

  // People / anime FIRST (before school/house)
  if (
    /девуш|девоч|парен|мальчик|женщин|мужчина|человек|персонаж|аниме|anime|manga|waifu|girl|boy|woman|man\b|character|humanoid|avatar|фигур[аыу]|hero|герой|idol|воин|маг|школьниц|schoolgirl|семпай|тян|кун|npc|скин/i.test(
      lower
    )
  ) {
    return "character";
  }

  if (
    /кот\b|кошк|собак|пёс|пес\b|лошад|конь|птиц|dragon|дракон|звер|animal|wolf|лис[аы]|медвед|кролик|bunny|cat\b|dog\b/i.test(
      lower
    )
  ) {
    return "animal";
  }

  if (/машин|автомоб|car\b|vehicle|спорткар|джип|truck|грузовик|мото|bike|велосипед/i.test(lower)) {
    return "vehicle";
  }

  if (
    /комнат|спальн|кухн|гостиная|ванн|санузел|интерьер|interior|\broom\b|bedroom|kitchen|living.?room|офисная.?комнат|кабинет/i.test(
      lower
    )
  ) {
    return "room";
  }

  if (/диван|sofa|couch|кресл/i.test(lower)) return "furniture";
  if (/стол|desk|table|стул|chair|шкаф|shelf|мебел/i.test(lower)) return "furniture";

  if (
    /телефон|phone|ноутбук|laptop|робот|robot|лампа|lamp|часы|гаджет|устройство|прибор|дрон|drone|колонк|наушник|игрушк|предмет|издели/i.test(
      lower
    )
  ) {
    return "product";
  }

  // Architecture only with clear building words (schoolgirl already handled)
  if (/школ|school|лицей|гимназ|образоват|универ|колледж|садик|детсад/i.test(lower)) return "school";
  if (/мост|bridge|эстакад|переход|виадук/i.test(lower)) return "bridge";
  if (/башн|tower|небоскреб|skyscraper|высотк/i.test(lower)) return "tower";
  if (/офис|office|бизнес.?центр|бц\b|коворкинг/i.test(lower)) return "office";
  if (/стадион|stadium|арены|спорткомплекс/i.test(lower)) return "stadium";
  if (/больниц|hospital|клиник|поликлиник|медцентр/i.test(lower)) return "hospital";
  if (/дом|house|коттедж|вилл|особняк|cottage|жилкомплекс|жк\b/i.test(lower)) return "house";
  if (
    /завод|factory|склад|цех|ангар|магазин|молл|mall|тц\b|здан|строен|корпус|комплекс|павильон|музей|театр|гостиниц|отель|hotel|небоскр/i.test(
      lower
    )
  ) {
    return "building";
  }

  // Default: product / abstract object — NEVER dump unknown prompts into a building
  return "product";
}

/** Pick best free procedural template — matches what the user asked for */
export function buildFromPrompt(prompt: string): ThreeDConcept {
  const category = detectCategory(prompt);
  switch (category) {
    case "character":
      return buildCharacter(prompt);
    case "animal":
      return buildAnimal(prompt);
    case "vehicle":
      return buildCar(prompt);
    case "room":
      return buildRoom(prompt);
    case "furniture":
      return /диван|sofa|couch|кресл/i.test(prompt) ? buildSofa(prompt) : buildDesk(prompt);
    case "product":
      return buildProduct(prompt);
    case "school":
      return buildSchool(prompt);
    case "bridge":
      return buildBridge(prompt);
    case "tower":
      return buildTower(prompt);
    case "office":
      return buildOffice(prompt);
    case "stadium":
      return buildStadium(prompt);
    case "hospital":
      return buildHospital(prompt);
    case "house":
      return buildHouse(prompt);
    case "building":
      return buildGenericMassing(prompt);
    default:
      return buildProduct(prompt);
  }
}

/** True if parts look like a connected object (not a random pile) */
export function isCoherentConcept(concept: ThreeDConcept): boolean {
  if (!concept.parts?.length || concept.parts.length < 4) return false;
  const centers = concept.parts.map((p) => p.position);
  let nearPairs = 0;
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      const dx = centers[i][0] - centers[j][0];
      const dy = centers[i][1] - centers[j][1];
      const dz = centers[i][2] - centers[j][2];
      const dist = Math.hypot(dx, dy, dz);
      const reach =
        (Math.max(...concept.parts[i].size) + Math.max(...concept.parts[j].size)) * 0.85;
      if (dist < reach + 1.2) nearPairs++;
    }
  }
  return nearPairs >= Math.max(3, concept.parts.length - 2);
}
