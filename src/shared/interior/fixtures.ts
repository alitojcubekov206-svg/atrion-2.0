import type {ModelPart} from "../types";

/** Original parametric kitchen and sanitary fittings, shared by preview and export. */
export function fixtureParts(id: string, color: string): ModelPart[] | null {
  if (!["kitchen_run", "fridge_tall", "toilet_compact", "vanity_sink", "shower_square"].includes(id)) return null;
  const parts: ModelPart[] = [];
  const add = (name: string, position: [number,number,number], size: [number,number,number], tint = color, shape: ModelPart["shape"] = "box", opacity = 1) => {
    parts.push({id: `${id}_${parts.length}`, name, position, size, shape, color: tint, rotation: [0,0,0], quantity: 1,
      material: opacity < 1 ? "Стекло" : tint === "#adb5b8" ? "Металл" : "Материал интерьера", opacity, roughness: opacity < 1 ? .1 : .5, metalness: tint === "#adb5b8" ? .75 : 0});
  };
  if (id === "kitchen_run") {
    add("Цоколь кухни", [0,.07,0], [2.3,.14,.55], "#4c4944");
    add("Корпус кухни", [0,.49,-.015], [2.4,.74,.6]);
    add("Столешница", [0,.88,0], [2.4,.04,.65], "#d8c4a4");
    for (let i=0;i<4;i++) {
      const x=-.9+i*.6;
      add("Фасад кухни", [x,.49,.302], [.58,.72,.03]);
      add("Ручка кухни", [x,.74,.322], [.2,.02,.006], "#adb5b8");
    }
    add("Духовка", [.9,.51,.322], [.49,.46,.006], "#20272b");
    add("Варочная панель", [.69,.907,0], [.68,.014,.52], "#20272b");
    for (const x of [.51,.87]) for (const z of [-.14,.14]) add("Конфорка", [x,.918,z], [.2,.01,.2], "#51565a", "cylinder");
    add("Мойка", [-.65,.908,0], [.68,.015,.47], "#adb5b8");
    add("Чаша мойки", [-.65,.919,0], [.56,.008,.35], "#485357");
    add("Смеситель", [-.65,1.04,-.23], [.035,.28,.035], "#adb5b8", "cylinder");
    add("Излив", [-.65,1.162,-.13], [.035,.036,.23], "#adb5b8");
  } else if (id === "fridge_tall") {
    add("Корпус холодильника", [0,.925,0], [.65,1.85,.65], "#d7dad8");
    add("Холодильная камера", [0,1.18,.324], [.62,1.3,.002], "#f1f1ec");
    add("Морозильная камера", [0,.26,.324], [.62,.48,.002], "#e1e4e1");
    add("Ручка холодильника", [.25,1.08,.322], [.025,.32,.006], "#adb5b8");
  } else if (id === "toilet_compact") {
    add("Основание унитаза", [0,.16,.07], [.27,.32,.4], "#f4f2ed", "sphere");
    add("Чаша унитаза", [0,.33,.06], [.4,.25,.56], "#f4f2ed", "sphere");
    add("Сиденье унитаза", [0,.445,.07], [.37,.045,.51], "#fcfaf4", "sphere");
    add("Отверстие чаши", [0,.467,.075], [.23,.008,.32], "#b7c4c5", "sphere");
    add("Бачок", [0,.575,-.235], [.38,.41,.21], "#f4f2ed");
    add("Кнопка слива", [0,.779,-.235], [.075,.002,.05], "#adb5b8");
  } else if (id === "vanity_sink") {
    add("Тумба раковины", [0,.4,0], [.7,.8,.5]);
    add("Столешница раковины", [0,.81,0], [.7,.035,.5], "#f4f2ed");
    add("Раковина", [0,.835,.025], [.5,.025,.32], "#9facac", "sphere");
    add("Смеситель раковины", [0,.9,-.19], [.025,.1,.025], "#adb5b8", "cylinder");
    add("Излив раковины", [0,.939,-.13], [.025,.022,.14], "#adb5b8");
    for (const x of [-.175,.175]) add("Дверца тумбы", [x,.43,.249], [.33,.65,.002]);
  } else {
    add("Поддон душа", [0,.055,0], [.9,.11,.9], "#f1efeb");
    add("Слив", [0,.111,0], [.11,.003,.11], "#adb5b8", "cylinder");
    for (const x of [-.435,.435]) add("Стекло душа", [x,1.06,0], [.016,1.98,.88], "#bad6d6", "box", .22);
    add("Задняя стенка душа", [0,1.06,-.435], [.87,1.98,.016], "#b8d0d1", "box", .32);
    for (const x of [-.43,.43]) for (const z of [-.43,.43]) add("Профиль душа", [x,1.06,z], [.028,1.98,.028], "#adb5b8");
    add("Стойка душа", [0,1.35,-.4], [.025,1.2,.025], "#adb5b8", "cylinder");
    add("Лейка душа", [0,1.94,-.26], [.2,.03,.25], "#adb5b8");
  }
  return parts;
}
