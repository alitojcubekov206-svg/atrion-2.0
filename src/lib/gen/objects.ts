import type { ModelPart, ThreeDConcept } from "@/lib/types";
import { PALETTE, part, pickColor, shade, wrapConcept, type Rng } from "@/lib/gen/kit";
import { parsePromptParams, scaleFactor, titleFromPrompt } from "@/lib/gen/prompt-params";

function idFactory(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${n++}`;
}

/* ---------------- character ---------------- */

const HAIR_STYLES = ["short", "long", "ponytail", "twintails"] as const;

export function buildCharacter(prompt: string): ThreeDConcept {
  const params = parsePromptParams(prompt);
  const rng = params.rng;
  const text = prompt.toLowerCase();
  const anime = /аниме|anime|manga|waifu/i.test(text);
  const height = params.height ?? (/реб[её]н|малыш|kid|child/i.test(text) ? 1.1 : 1.7);
  const skin = pickColor(rng, "skin");
  const hairColor = params.color ?? pickColor(rng, "hair");
  const outfitColor = pickColor(rng, "fabric");
  const female = /девуш|девоч|женщин|girl|woman|героин|школьниц/i.test(text) || (!/парен|мальчик|мужчин|\bboy\b|\bman\b/i.test(text) && rng.chance(0.5));
  const hairStyle = /хвостик|ponytail/i.test(text)
    ? "ponytail"
    : /двух хвостик|twintail|косички/i.test(text)
      ? "twintails"
      : /длинн|long hair/i.test(text)
        ? "long"
        : /коротк|short hair/i.test(text)
          ? "short"
          : rng.pick(HAIR_STYLES);

  const id = idFactory("char");
  const parts: ModelPart[] = [];

  const headSize = height * 0.13;
  const headY = height * 0.93;
  const neckY = height * 0.85;
  const shoulderY = height * 0.82;
  const hipY = height * 0.52;
  const legLength = hipY - height * 0.03;
  const torsoHeight = shoulderY - hipY;
  const eyeStyle = anime ? 0.55 : 0.15;

  parts.push(
    part(id(), "Голова", {
      shape: "sphere",
      role: "head",
      group: "Голова",
      position: [0, headY, 0],
      size: [headSize, headSize * (anime ? 1.08 : 1), headSize * 0.92],
      color: skin,
      material: "Кожа",
    }),
    part(id(), "Шея", {
      shape: "cylinder",
      role: "structure",
      group: "Голова",
      position: [0, neckY, 0],
      size: [headSize * 0.32, height * 0.05, headSize * 0.32],
      color: skin,
      material: "Кожа",
    }),
    part(id(), "Глаз", {
      shape: "sphere",
      role: "detail",
      group: "Голова",
      position: [headSize * 0.24, headY + headSize * 0.05, headSize * 0.42],
      size: [headSize * 0.16, headSize * (0.16 + eyeStyle * 0.1), headSize * 0.08],
      color: /голуб|blue eyes/i.test(text) ? "#6fa8dc" : "#2b1f1a",
      material: "Глаз",
      emissive: anime ? 0.15 : 0,
      mirror: "x",
    }),
    part(id(), "Нос", {
      shape: "cone",
      role: "detail",
      group: "Голова",
      position: [0, headY - headSize * 0.05, headSize * 0.46],
      size: [headSize * 0.08, headSize * 0.12, headSize * 0.08],
      rotation: [Math.PI / 2, 0, 0],
      color: shade(skin, -0.08),
      material: "Кожа",
    })
  );

  if (hairStyle === "long" || hairStyle === "ponytail" || hairStyle === "twintails") {
    parts.push(
      part(id(), "Волосы — основа", {
        shape: "sphere",
        role: "detail",
        group: "Волосы",
        position: [0, headY + headSize * 0.12, -headSize * 0.08],
        size: [headSize * 1.12, headSize * 1.05, headSize * 1.05],
        color: hairColor,
        material: "Волосы",
      })
    );
  } else {
    parts.push(
      part(id(), "Волосы", {
        shape: "sphere",
        role: "detail",
        group: "Волосы",
        position: [0, headY + headSize * 0.18, -headSize * 0.05],
        size: [headSize * 1.06, headSize * 0.7, headSize * 1.02],
        color: hairColor,
        material: "Волосы",
      })
    );
  }
  if (hairStyle === "ponytail") {
    parts.push(
      part(id(), "Хвост волос", {
        shape: "capsule",
        role: "detail",
        group: "Волосы",
        position: [0, headY - headSize * 0.3, -headSize * 0.85],
        size: [headSize * 0.22, headSize * 1.4, headSize * 0.22],
        rotation: [Math.PI * 0.42, 0, 0],
        color: hairColor,
        material: "Волосы",
      })
    );
  } else if (hairStyle === "twintails") {
    parts.push(
      part(id(), "Хвостик", {
        shape: "capsule",
        role: "detail",
        group: "Волосы",
        position: [headSize * 0.75, headY - headSize * 0.1, -headSize * 0.1],
        size: [headSize * 0.18, headSize * 1.1, headSize * 0.18],
        rotation: [0, 0, Math.PI * 0.32],
        color: hairColor,
        material: "Волосы",
        mirror: "x",
      })
    );
  }

  parts.push(
    part(id(), "Торс", {
      shape: "box",
      role: "torso",
      group: "Тело",
      position: [0, hipY + torsoHeight / 2, 0],
      size: [height * (female ? 0.24 : 0.27), torsoHeight, height * 0.15],
      color: outfitColor,
      material: "Одежда",
    }),
    part(id(), "Бёдра", {
      shape: "box",
      role: "torso",
      group: "Тело",
      position: [0, hipY - height * 0.03, 0],
      size: [height * 0.25, height * 0.09, height * 0.15],
      color: shade(outfitColor, -0.15),
      material: "Одежда",
    })
  );

  const shoulderX = height * 0.15;
  const armLength = shoulderY - hipY - height * 0.02;
  parts.push(
    part(id(), "Плечо", {
      shape: "sphere",
      role: "limb",
      group: "Руки",
      position: [shoulderX, shoulderY - headSize * 0.1, 0],
      size: [headSize * 0.4, headSize * 0.4, headSize * 0.4],
      color: skin,
      material: "Кожа",
      mirror: "x",
    }),
    part(id(), "Плечевая часть руки", {
      shape: "capsule",
      role: "limb",
      group: "Руки",
      position: [shoulderX, shoulderY - armLength * 0.28, 0],
      size: [headSize * 0.3, armLength * 0.52, headSize * 0.3],
      color: skin,
      material: "Кожа",
      mirror: "x",
    }),
    part(id(), "Локоть", {
      shape: "sphere",
      role: "limb",
      group: "Руки",
      position: [shoulderX, shoulderY - armLength * 0.55, 0],
      size: [headSize * 0.26, headSize * 0.26, headSize * 0.26],
      color: skin,
      material: "Кожа",
      mirror: "x",
    }),
    part(id(), "Предплечье", {
      shape: "capsule",
      role: "limb",
      group: "Руки",
      position: [shoulderX, shoulderY - armLength * 0.8, 0],
      size: [headSize * 0.24, armLength * 0.46, headSize * 0.24],
      color: skin,
      material: "Кожа",
      mirror: "x",
    }),
    part(id(), "Кисть", {
      shape: "sphere",
      role: "limb",
      group: "Руки",
      position: [shoulderX, shoulderY - armLength * 1.03, 0],
      size: [headSize * 0.22, headSize * 0.3, headSize * 0.2],
      color: skin,
      material: "Кожа",
      mirror: "x",
    })
  );

  const legX = height * 0.07;
  parts.push(
    part(id(), "Бедро", {
      shape: "capsule",
      role: "limb",
      group: "Ноги",
      position: [legX, hipY - legLength * 0.28, 0],
      size: [headSize * 0.36, legLength * 0.52, headSize * 0.36],
      color: female ? shade(outfitColor, -0.2) : skin,
      material: female ? "Одежда" : "Кожа",
      mirror: "x",
    }),
    part(id(), "Колено", {
      shape: "sphere",
      role: "limb",
      group: "Ноги",
      position: [legX, hipY - legLength * 0.55, 0],
      size: [headSize * 0.3, headSize * 0.3, headSize * 0.3],
      color: skin,
      material: "Кожа",
      mirror: "x",
    }),
    part(id(), "Голень", {
      shape: "capsule",
      role: "limb",
      group: "Ноги",
      position: [legX, hipY - legLength * 0.8, 0],
      size: [headSize * 0.26, legLength * 0.46, headSize * 0.26],
      color: skin,
      material: "Кожа",
      mirror: "x",
    }),
    part(id(), "Ступня", {
      shape: "box",
      role: "foot",
      group: "Ноги",
      position: [legX, Math.max(0.05, hipY - legLength * 1.03), headSize * 0.18],
      size: [headSize * 0.3, headSize * 0.16, headSize * 0.5],
      color: "#2a2c31",
      material: "Обувь",
      mirror: "x",
    })
  );

  return wrapConcept({
    name: titleFromPrompt(prompt, female ? "Персонаж" : "Персонаж"),
    description: `${anime ? "Аниме-стиль" : "Стилизованный"} персонаж ростом ${height.toFixed(2)} м, причёска: ${hairStyle}.`,
    category: "character",
    seed: params.seed,
    parts,
  });
}

/* ---------------- animal ---------------- */

export function buildAnimal(prompt: string): ThreeDConcept {
  const params = parsePromptParams(prompt);
  const rng = params.rng;
  const text = prompt.toLowerCase();
  const isBird = /птиц|попуга|орёл|орел\b|голуб/i.test(text);
  const isFish = /рыб[аку]|акул/i.test(text);
  const isLong = /такс|dachshund/i.test(text);
  const large = /медвед|лошад|конь\b|слон|лев\b|тигр/i.test(text);
  const scale = scaleFactor(params.scale) * (large ? 1.6 : 1) * (params.height ? params.height / 0.5 : 1);
  const bodyColor = params.color ?? pickColor(rng, rng.chance(0.5) ? "fabric" : "wood");
  const id = idFactory("animal");
  const parts: ModelPart[] = [];

  if (isFish) {
    const len = 0.5 * scale;
    parts.push(
      part(id(), "Тело", {
        shape: "capsule",
        role: "torso",
        group: "Тело",
        position: [0, len * 0.3, 0],
        size: [len * 0.32, len, len * 0.22],
        rotation: [0, 0, Math.PI / 2],
        color: bodyColor,
        material: "Чешуя",
        metalness: 0.3,
        roughness: 0.3,
      }),
      part(id(), "Хвостовой плавник", {
        shape: "wedge",
        role: "limb",
        group: "Плавники",
        position: [0, len * 0.3, -len * 0.62],
        size: [0.02, len * 0.36, len * 0.34],
        rotation: [0, Math.PI / 2, 0],
        color: shade(bodyColor, -0.2),
        material: "Плавник",
      }),
      part(id(), "Плавник", {
        shape: "wedge",
        role: "limb",
        group: "Плавники",
        position: [len * 0.14, len * 0.24, 0],
        size: [0.02, len * 0.2, len * 0.18],
        rotation: [0, 0, 0],
        color: shade(bodyColor, -0.1),
        material: "Плавник",
        mirror: "x",
      }),
      part(id(), "Глаз", {
        shape: "sphere",
        role: "detail",
        group: "Тело",
        position: [len * 0.11, len * 0.4, len * 0.44],
        size: [0.03, 0.03, 0.03],
        color: "#101418",
        material: "Глаз",
        mirror: "x",
      })
    );
    return wrapConcept({
      name: titleFromPrompt(prompt, "Рыба"),
      description: "Стилизованная модель рыбы.",
      category: "animal",
      seed: params.seed,
      parts,
    });
  }

  if (isBird) {
    const len = 0.28 * scale;
    parts.push(
      part(id(), "Тело", {
        shape: "sphere",
        role: "torso",
        group: "Тело",
        position: [0, len * 1.4, 0],
        size: [len, len * 1.3, len * 1.15],
        color: bodyColor,
        material: "Перья",
      }),
      part(id(), "Голова", {
        shape: "sphere",
        role: "head",
        group: "Голова",
        position: [0, len * 2.3, len * 0.5],
        size: [len * 0.6, len * 0.6, len * 0.6],
        color: bodyColor,
        material: "Перья",
      }),
      part(id(), "Клюв", {
        shape: "cone",
        role: "detail",
        group: "Голова",
        position: [0, len * 2.25, len * 0.95],
        size: [len * 0.16, len * 0.3, len * 0.16],
        rotation: [Math.PI / 2, 0, 0],
        color: "#d1743a",
        material: "Клюв",
      }),
      part(id(), "Крыло", {
        shape: "wedge",
        role: "limb",
        group: "Крылья",
        position: [len * 0.9, len * 1.5, 0],
        size: [len * 0.16, len * 1.2, len * 0.7],
        rotation: [0, 0, -0.2],
        color: shade(bodyColor, -0.15),
        material: "Перья",
        mirror: "x",
      }),
      part(id(), "Хвост", {
        shape: "wedge",
        role: "limb",
        group: "Тело",
        position: [0, len * 1.15, -len * 1.1],
        size: [len * 0.6, len * 0.1, len * 0.7],
        rotation: [0, Math.PI, 0],
        color: shade(bodyColor, -0.1),
        material: "Перья",
      }),
      part(id(), "Лапа", {
        shape: "cylinder",
        role: "limb",
        group: "Ноги",
        position: [len * 0.22, len * 0.35, 0],
        size: [0.02, len * 0.7, 0.02],
        color: "#d1743a",
        material: "Лапы",
        mirror: "x",
      })
    );
    return wrapConcept({
      name: titleFromPrompt(prompt, "Птица"),
      description: "Стилизованная модель птицы.",
      category: "animal",
      seed: params.seed,
      parts,
    });
  }

  const bodyLen = (isLong ? 0.62 : 0.45) * scale;
  const bodyY = 0.28 * scale;
  const legLen = bodyY - 0.02;
  parts.push(
    part(id(), "Тело", {
      shape: "capsule",
      role: "torso",
      group: "Тело",
      position: [0, bodyY, 0],
      size: [0.2 * scale, bodyLen, 0.2 * scale],
      rotation: [Math.PI / 2, 0, 0],
      color: bodyColor,
      material: "Шерсть",
    }),
    part(id(), "Грудь", {
      shape: "sphere",
      role: "torso",
      group: "Тело",
      position: [0, bodyY + 0.02 * scale, bodyLen * 0.42],
      size: [0.19 * scale, 0.19 * scale, 0.16 * scale],
      color: shade(bodyColor, 0.08),
      material: "Шерсть",
    }),
    part(id(), "Шея", {
      shape: "cylinder",
      role: "structure",
      group: "Голова",
      position: [0, bodyY + 0.1 * scale, bodyLen * 0.58],
      size: [0.1 * scale, 0.18 * scale, 0.1 * scale],
      rotation: [0.5, 0, 0],
      color: bodyColor,
      material: "Шерсть",
    }),
    part(id(), "Голова", {
      shape: "sphere",
      role: "head",
      group: "Голова",
      position: [0, bodyY + 0.24 * scale, bodyLen * 0.75],
      size: [0.17 * scale, 0.16 * scale, 0.2 * scale],
      color: bodyColor,
      material: "Шерсть",
    }),
    part(id(), "Морда", {
      shape: "cylinder",
      role: "detail",
      group: "Голова",
      position: [0, bodyY + 0.2 * scale, bodyLen * 0.9],
      size: [0.09 * scale, 0.12 * scale, 0.09 * scale],
      rotation: [Math.PI / 2, 0, 0],
      color: shade(bodyColor, -0.1),
      material: "Шерсть",
    }),
    part(id(), "Нос", {
      shape: "sphere",
      role: "detail",
      group: "Голова",
      position: [0, bodyY + 0.19 * scale, bodyLen * 0.97],
      size: [0.035 * scale, 0.03 * scale, 0.035 * scale],
      color: "#101418",
      material: "Нос",
    }),
    part(id(), "Ухо", {
      shape: "cone",
      role: "detail",
      group: "Голова",
      position: [0.09 * scale, bodyY + 0.36 * scale, bodyLen * 0.72],
      size: [0.06 * scale, 0.12 * scale, 0.03 * scale],
      rotation: [0, 0, 0.3],
      color: shade(bodyColor, -0.15),
      material: "Шерсть",
      mirror: "x",
    }),
    part(id(), "Глаз", {
      shape: "sphere",
      role: "detail",
      group: "Голова",
      position: [0.07 * scale, bodyY + 0.26 * scale, bodyLen * 0.86],
      size: [0.025 * scale, 0.025 * scale, 0.025 * scale],
      color: "#1c1c22",
      material: "Глаз",
      mirror: "x",
    }),
    part(id(), "Лапа передняя", {
      shape: "capsule",
      role: "limb",
      group: "Ноги",
      position: [0.09 * scale, legLen / 2, bodyLen * 0.32],
      size: [0.06 * scale, legLen, 0.06 * scale],
      color: shade(bodyColor, -0.05),
      material: "Шерсть",
      mirror: "xz",
    }),
    part(id(), "Лапа задняя", {
      shape: "capsule",
      role: "limb",
      group: "Ноги",
      position: [0.09 * scale, legLen / 2, -bodyLen * 0.32],
      size: [0.065 * scale, legLen, 0.065 * scale],
      color: shade(bodyColor, -0.05),
      material: "Шерсть",
      mirror: "x",
    }),
    part(id(), "Хвост", {
      shape: "capsule",
      role: "limb",
      group: "Тело",
      position: [0, bodyY + 0.08 * scale, -bodyLen * 0.55],
      size: [0.05 * scale, 0.3 * scale, 0.05 * scale],
      rotation: [1.1, 0, 0],
      color: bodyColor,
      material: "Шерсть",
    })
  );

  return wrapConcept({
    name: titleFromPrompt(prompt, "Животное"),
    description: "Стилизованная четвероногая модель.",
    category: "animal",
    seed: params.seed,
    parts,
  });
}

/* ---------------- vehicle ---------------- */

export function buildVehicle(prompt: string): ThreeDConcept {
  const params = parsePromptParams(prompt);
  const rng = params.rng;
  const text = prompt.toLowerCase();
  const isTruck = /грузовик|truck|фур[аы]/i.test(text);
  const isBike = /мотоцикл|мопед|\bbike\b|велосипед/i.test(text);
  const isPlane = /самолёт|самолет|plane\b|вертолёт|вертолет/i.test(text);
  const isBoat = /корабл|лодк|яхт|катер/i.test(text);
  const scale = scaleFactor(params.scale);
  const bodyColor = params.color ?? pickColor(rng, "accent");
  const id = idFactory("vehicle");
  const parts: ModelPart[] = [];

  if (isBike) {
    const len = 1.8 * scale;
    parts.push(
      part(id(), "Рама", {
        shape: "box",
        role: "structure",
        group: "Рама",
        position: [0, 0.55, 0],
        size: [0.14, 0.3, len * 0.5],
        color: bodyColor,
        material: "Металл",
        metalness: 0.5,
      }),
      part(id(), "Бак", {
        shape: "capsule",
        role: "detail",
        group: "Рама",
        position: [0, 0.72, len * 0.08],
        size: [0.28, 0.45, 0.22],
        rotation: [0, 0, Math.PI / 2],
        color: shade(bodyColor, 0.1),
        material: "Металл",
      }),
      part(id(), "Сиденье", {
        shape: "box",
        role: "detail",
        group: "Рама",
        position: [0, 0.68, -len * 0.16],
        size: [0.24, 0.08, 0.5],
        color: "#1c1c22",
        material: "Кожа",
      }),
      part(id(), "Колесо", {
        shape: "torus",
        role: "wheel",
        group: "Колёса",
        position: [0, 0.32, len * 0.42],
        size: [0.64, 0.16, 0.64],
        rotation: [Math.PI / 2, 0, 0],
        hole: 0.65,
        sides: 24,
        color: "#1c1c22",
        material: "Резина",
        mirror: "z",
      }),
      part(id(), "Руль", {
        shape: "cylinder",
        role: "detail",
        group: "Рама",
        position: [0, 0.95, len * 0.32],
        size: [0.5, 0.04, 0.04],
        rotation: [0, 0, Math.PI / 2],
        color: "#2a2c31",
        material: "Металл",
      }),
      part(id(), "Фара", {
        shape: "sphere",
        role: "light",
        group: "Рама",
        position: [0, 0.78, len * 0.46],
        size: [0.14, 0.14, 0.1],
        color: "#fff7d6",
        material: "Стекло",
        emissive: 0.6,
      })
    );
    return wrapConcept({
      name: titleFromPrompt(prompt, "Мотоцикл"),
      description: "Стилизованный мотоцикл.",
      category: "vehicle",
      seed: params.seed,
      parts,
    });
  }

  if (isPlane) {
    const len = 6 * scale;
    parts.push(
      part(id(), "Фюзеляж", {
        shape: "capsule",
        role: "torso",
        group: "Фюзеляж",
        position: [0, 1.2, 0],
        size: [0.6, len, 0.6],
        rotation: [Math.PI / 2, 0, 0],
        color: bodyColor,
        material: "Дюраль",
        metalness: 0.4,
      }),
      part(id(), "Кабина", {
        shape: "sphere",
        role: "detail",
        group: "Фюзеляж",
        position: [0, 1.35, len * 0.36],
        size: [0.5, 0.35, 0.7],
        color: pickColor(rng, "glass"),
        material: "Стекло",
        opacity: 0.5,
      }),
      part(id(), "Крыло", {
        shape: "wedge",
        role: "limb",
        group: "Крылья",
        position: [len * 0.32, 1.1, -len * 0.02],
        size: [len * 0.6, 0.1, 1.4],
        rotation: [0, Math.PI / 2, 0],
        color: shade(bodyColor, -0.1),
        material: "Дюраль",
        mirror: "x",
      }),
      part(id(), "Хвостовое оперение", {
        shape: "wedge",
        role: "limb",
        group: "Хвост",
        position: [0, 1.7, -len * 0.46],
        size: [0.08, 1.1, 0.9],
        color: shade(bodyColor, -0.1),
        material: "Дюраль",
      }),
      part(id(), "Двигатель", {
        shape: "cylinder",
        role: "detail",
        group: "Крылья",
        position: [len * 0.18, 0.9, -len * 0.02],
        size: [0.4, 0.9, 0.4],
        rotation: [Math.PI / 2, 0, 0],
        sides: 16,
        color: "#2a2c31",
        material: "Металл",
        mirror: "x",
      })
    );
    return wrapConcept({
      name: titleFromPrompt(prompt, "Самолёт"),
      description: "Стилизованная модель самолёта.",
      category: "vehicle",
      seed: params.seed,
      parts,
    });
  }

  if (isBoat) {
    const len = 5 * scale;
    parts.push(
      part(id(), "Корпус", {
        shape: "capsule",
        role: "torso",
        group: "Корпус",
        position: [0, 0.5, 0],
        size: [1.2, len, 0.9],
        rotation: [Math.PI / 2, 0, 0],
        color: bodyColor,
        material: "Стеклопластик",
      }),
      part(id(), "Палуба", {
        shape: "plane",
        role: "detail",
        group: "Корпус",
        position: [0, 0.85, 0],
        size: [1, 0.05, len * 0.7],
        color: pickColor(rng, "wood"),
        material: "Тик",
      }),
      part(id(), "Рубка", {
        shape: "box",
        role: "detail",
        group: "Рубка",
        position: [0, 1.3, -len * 0.12],
        size: [0.9, 0.8, 1.2],
        color: "#e8e6e1",
        material: "Композит",
      }),
      part(id(), "Мачта", {
        shape: "cylinder",
        role: "structure",
        group: "Рубка",
        position: [0, 2.6, -len * 0.12],
        size: [0.05, 2.6, 0.05],
        color: "#8f9299",
        material: "Металл",
      })
    );
    return wrapConcept({
      name: titleFromPrompt(prompt, "Катер"),
      description: "Стилизованная модель катера.",
      category: "vehicle",
      seed: params.seed,
      parts,
    });
  }

  const length = (isTruck ? 6.5 : 4.4) * scale;
  const cabinHeight = isTruck ? 1.9 : 1.1;
  const bodyY = 0.55;
  parts.push(
    part(id(), "Шасси", {
      shape: "box",
      role: "structure",
      group: "Кузов",
      position: [0, bodyY - 0.15, 0],
      size: [1.8, 0.3, length],
      color: "#1c1c22",
      material: "Сталь",
    }),
    part(id(), "Кузов", {
      shape: "box",
      role: "torso",
      group: "Кузов",
      position: [0, bodyY + 0.25, isTruck ? -length * 0.12 : 0],
      size: [1.85, 0.6, isTruck ? length * 0.55 : length * 0.85],
      color: bodyColor,
      material: "Крашеный металл",
    }),
    part(id(), "Кабина", {
      shape: "box",
      role: "detail",
      group: "Кузов",
      position: [0, bodyY + 0.55 + cabinHeight / 2, length * (isTruck ? 0.22 : 0.05)],
      size: [1.75, cabinHeight, length * (isTruck ? 0.32 : 0.55)],
      color: bodyColor,
      material: "Крашеный металл",
    }),
    part(id(), "Лобовое стекло", {
      shape: "box",
      role: "window",
      group: "Кузов",
      position: [0, bodyY + 0.55 + cabinHeight * 0.75, length * (isTruck ? 0.22 : 0.05) + length * (isTruck ? 0.16 : 0.275)],
      size: [1.6, cabinHeight * 0.55, 0.06],
      rotation: [0.3, 0, 0],
      color: pickColor(rng, "glass"),
      material: "Стекло",
      opacity: 0.45,
      metalness: 0.1,
      roughness: 0.05,
    }),
    part(id(), "Боковое окно", {
      shape: "box",
      role: "window",
      group: "Кузов",
      position: [0.9, bodyY + 0.55 + cabinHeight * 0.65, length * (isTruck ? 0.22 : 0.05)],
      size: [0.03, cabinHeight * 0.45, length * (isTruck ? 0.28 : 0.45)],
      color: pickColor(rng, "glass"),
      material: "Стекло",
      opacity: 0.4,
      mirror: "x",
    })
  );

  if (isTruck) {
    parts.push(
      part(id(), "Грузовая платформа", {
        shape: "box",
        role: "detail",
        group: "Кузов",
        position: [0, bodyY + 0.6, -length * 0.36],
        size: [1.9, 1.1, length * 0.42],
        color: "#8f9299",
        material: "Тент",
      })
    );
  }

  const wheelRadius = isTruck ? 0.5 : 0.36;
  parts.push(
    part(id(), "Колесо", {
      shape: "torus",
      role: "wheel",
      group: "Колёса",
      position: [0.95, wheelRadius, length * 0.34],
      size: [wheelRadius * 2, 0.3, wheelRadius * 2],
      rotation: [Math.PI / 2, 0, 0],
      hole: 0.6,
      sides: 24,
      color: "#1c1c22",
      material: "Резина",
      mirror: "xz",
    }),
    part(id(), "Диск", {
      shape: "cylinder",
      role: "detail",
      group: "Колёса",
      position: [0.95, wheelRadius, length * 0.34],
      size: [wheelRadius * 1.1, 0.32, wheelRadius * 1.1],
      rotation: [Math.PI / 2, 0, 0],
      sides: 8,
      color: "#c9cdd3",
      material: "Легкосплавный диск",
      metalness: 0.7,
      roughness: 0.25,
      mirror: "xz",
    }),
    part(id(), "Фара", {
      shape: "box",
      role: "light",
      group: "Кузов",
      position: [0.7, bodyY + 0.3, length / 2 - 0.05],
      size: [0.35, 0.18, 0.06],
      color: "#fff7d6",
      material: "Стекло",
      emissive: 0.7,
      mirror: "x",
    }),
    part(id(), "Задний фонарь", {
      shape: "box",
      role: "light",
      group: "Кузов",
      position: [0.75, bodyY + 0.3, -length / 2 + 0.05],
      size: [0.3, 0.16, 0.05],
      color: "#c1462f",
      material: "Стекло",
      emissive: 0.5,
      mirror: "x",
    }),
    part(id(), "Бампер", {
      shape: "box",
      role: "detail",
      group: "Кузов",
      position: [0, bodyY - 0.05, length / 2 + 0.05],
      size: [1.85, 0.28, 0.14],
      color: "#2a2c31",
      material: "Пластик",
    }),
    part(id(), "Зеркало", {
      shape: "box",
      role: "detail",
      group: "Кузов",
      position: [1.02, bodyY + 0.75, length * 0.18],
      size: [0.05, 0.16, 0.24],
      color: bodyColor,
      material: "Крашеный металл",
      mirror: "x",
    })
  );

  return wrapConcept({
    name: titleFromPrompt(prompt, isTruck ? "Грузовик" : "Автомобиль"),
    description: `Стилизованный ${isTruck ? "грузовик" : "автомобиль"}, длина ${length.toFixed(1)} м.`,
    category: "vehicle",
    seed: params.seed,
    parts,
  });
}

/* ---------------- furniture ---------------- */

export function buildFurniture(prompt: string): ThreeDConcept {
  const params = parsePromptParams(prompt);
  const rng = params.rng;
  const text = prompt.toLowerCase();
  const scale = scaleFactor(params.scale);
  const woodColor = params.color ?? pickColor(rng, "wood");
  const id = idFactory("furniture");
  const parts: ModelPart[] = [];

  const isChair = /стул|кресл|табурет|\bchair\b/i.test(text);
  const isSofa = /диван|sofa|couch/i.test(text);
  const isBed = /кроват|\bbed\b/i.test(text);
  const isShelf = /шкаф|полк|стеллаж|shelf|комод/i.test(text);

  if (isSofa) {
    const width = (params.width ?? 2.0) * scale;
    const depth = (params.depth ?? 0.9) * scale;
    const seatH = 0.42;
    const fabricColor = params.color ?? pickColor(rng, "fabric");
    parts.push(
      part(id(), "Каркас", {
        shape: "box",
        role: "structure",
        group: "Каркас",
        position: [0, seatH * 0.4, 0],
        size: [width, seatH * 0.8, depth],
        color: shade(fabricColor, -0.2),
        material: "Каркас",
      }),
      part(id(), "Сиденье", {
        shape: "box",
        role: "detail",
        group: "Сиденье",
        position: [0, seatH * 0.85, depth * 0.08],
        size: [width * 0.94, 0.22, depth * 0.78],
        color: fabricColor,
        material: "Ткань",
      }),
      part(id(), "Спинка", {
        shape: "box",
        role: "detail",
        group: "Спинка",
        position: [0, seatH * 1.5, -depth * 0.42],
        size: [width * 0.94, seatH * 1.1, 0.22],
        color: fabricColor,
        material: "Ткань",
      }),
      part(id(), "Подлокотник", {
        shape: "box",
        role: "detail",
        group: "Каркас",
        position: [width / 2 - 0.14, seatH * 1.05, 0],
        size: [0.26, seatH * 0.7, depth * 0.9],
        color: shade(fabricColor, -0.1),
        material: "Ткань",
        mirror: "x",
      }),
      part(id(), "Подушка", {
        shape: "box",
        role: "detail",
        group: "Сиденье",
        position: [width * 0.22, seatH * 1.05, -depth * 0.15],
        size: [0.45, 0.16, 0.45],
        rotation: [0, 0.3, 0],
        color: pickColor(rng, "accent"),
        material: "Ткань",
        mirror: "x",
      }),
      part(id(), "Ножка", {
        shape: "cylinder",
        role: "limb",
        group: "Каркас",
        position: [width / 2 - 0.15, 0.06, depth / 2 - 0.15],
        size: [0.05, 0.12, 0.05],
        color: "#2a2c31",
        material: "Металл",
        mirror: "xz",
      })
    );
    return wrapConcept({
      name: titleFromPrompt(prompt, "Диван"),
      description: "Мягкий диван.",
      category: "furniture",
      seed: params.seed,
      parts,
    });
  }

  if (isBed) {
    const width = (params.width ?? 1.6) * scale;
    const length = (params.depth ?? 2.0) * scale;
    parts.push(
      part(id(), "Каркас кровати", {
        shape: "box",
        role: "structure",
        group: "Каркас",
        position: [0, 0.25, 0],
        size: [width, 0.3, length],
        color: woodColor,
        material: "Дерево",
      }),
      part(id(), "Матрас", {
        shape: "box",
        role: "detail",
        group: "Матрас",
        position: [0, 0.48, 0],
        size: [width * 0.96, 0.24, length * 0.96],
        color: "#eeeae2",
        material: "Ткань",
      }),
      part(id(), "Подушка", {
        shape: "box",
        role: "detail",
        group: "Матрас",
        position: [0, 0.63, -length * 0.38],
        size: [width * 0.4, 0.12, 0.4],
        color: "#f4f1ea",
        material: "Ткань",
        repeat: { count: 2, step: [width * 0.42, 0, 0] },
      }),
      part(id(), "Одеяло", {
        shape: "box",
        role: "detail",
        group: "Матрас",
        position: [0, 0.6, length * 0.1],
        size: [width * 0.9, 0.1, length * 0.6],
        color: pickColor(rng, "accent"),
        material: "Ткань",
      }),
      part(id(), "Изголовье", {
        shape: "box",
        role: "detail",
        group: "Каркас",
        position: [0, 0.75, -length / 2 - 0.05],
        size: [width + 0.1, 1.0, 0.1],
        color: woodColor,
        material: "Дерево",
      }),
      part(id(), "Ножка", {
        shape: "box",
        role: "limb",
        group: "Каркас",
        position: [width / 2 - 0.08, 0.06, length / 2 - 0.12],
        size: [0.08, 0.12, 0.08],
        color: shade(woodColor, -0.2),
        material: "Дерево",
        mirror: "xz",
      })
    );
    return wrapConcept({
      name: titleFromPrompt(prompt, "Кровать"),
      description: "Кровать с матрасом и постельным бельём.",
      category: "furniture",
      seed: params.seed,
      parts,
    });
  }

  if (isShelf) {
    const width = (params.width ?? 0.9) * scale;
    const height = (params.height ?? 1.8) * scale;
    const depth = (params.depth ?? 0.35) * scale;
    const shelfCount = 4;
    parts.push(
      part(id(), "Боковина", {
        shape: "box",
        role: "structure",
        group: "Каркас",
        position: [width / 2 - 0.01, height / 2, 0],
        size: [0.02, height, depth],
        color: woodColor,
        material: "Дерево",
        mirror: "x",
      }),
      part(id(), "Задняя стенка", {
        shape: "plane",
        role: "structure",
        group: "Каркас",
        position: [0, height / 2, -depth / 2 + 0.01],
        size: [width, 0.02, height],
        rotation: [Math.PI / 2, 0, 0],
        color: shade(woodColor, -0.1),
        material: "ДСП",
      }),
      part(id(), "Полка", {
        shape: "box",
        role: "detail",
        group: "Полки",
        position: [0, height / (shelfCount + 1), 0],
        size: [width - 0.04, 0.025, depth - 0.02],
        color: woodColor,
        material: "Дерево",
        repeat: { count: shelfCount, step: [0, height / (shelfCount + 1), 0] },
      }),
      part(id(), "Книга", {
        shape: "box",
        role: "detail",
        group: "Полки",
        position: [-width * 0.25, height / (shelfCount + 1) + 0.12, depth * 0.1],
        size: [0.04, 0.22, depth * 0.5],
        color: pickColor(rng, "accent"),
        material: "Бумага",
        repeat: { count: 5, step: [0.055, 0, 0] },
      })
    );
    return wrapConcept({
      name: titleFromPrompt(prompt, "Стеллаж"),
      description: "Книжный стеллаж с полками.",
      category: "furniture",
      seed: params.seed,
      parts,
    });
  }

  const isTable = /\bстол\b|стол[аеуы]\b|столик|\btable\b|\bdesk\b|парт[аы]/i.test(text) && !isChair;

  if (isTable) {
    const width = (params.width ?? 1.4) * scale;
    const depth = (params.depth ?? 0.7) * scale;
    const height = 0.74;
    parts.push(
      part(id(), "Столешница", {
        shape: "box",
        role: "detail",
        group: "Столешница",
        position: [0, height, 0],
        size: [width, 0.04, depth],
        color: woodColor,
        material: "Дерево",
      }),
      part(id(), "Ножка", {
        shape: "box",
        role: "limb",
        group: "Ножки",
        position: [width / 2 - 0.06, height / 2, depth / 2 - 0.06],
        size: [0.06, height - 0.04, 0.06],
        color: shade(woodColor, -0.15),
        material: "Дерево",
        mirror: "xz",
      }),
      part(id(), "Царга", {
        shape: "box",
        role: "structure",
        group: "Ножки",
        position: [0, height - 0.08, depth / 2 - 0.06],
        size: [width - 0.16, 0.08, 0.03],
        color: shade(woodColor, -0.1),
        material: "Дерево",
        mirror: "z",
      })
    );
    return wrapConcept({
      name: titleFromPrompt(prompt, "Стол"),
      description: "Стол на четырёх ножках.",
      category: "furniture",
      seed: params.seed,
      parts,
    });
  }

  // default: chair / stool / armchair
  const seatH = 0.45;
  const fabricColor = params.color ?? pickColor(rng, "fabric");
  const isArmchair = /кресл/i.test(text);
  parts.push(
    part(id(), "Сиденье", {
      shape: "box",
      role: "detail",
      group: "Сиденье",
      position: [0, seatH, 0],
      size: [0.44, 0.05, 0.44],
      color: fabricColor,
      material: "Ткань",
    }),
    part(id(), "Ножка", {
      shape: "cylinder",
      role: "limb",
      group: "Ножки",
      position: [0.18, seatH / 2, 0.18],
      size: [0.03, seatH - 0.03, 0.03],
      color: shade(woodColor, -0.2),
      material: "Дерево",
      mirror: "xz",
    })
  );
  if (!/табурет/i.test(text)) {
    const backrestHeight = 0.55;
    parts.push(
      part(id(), "Спинка", {
        shape: "box",
        role: "detail",
        group: "Спинка",
        position: [0, seatH + backrestHeight / 2, -0.2],
        size: [0.44, backrestHeight, 0.05],
        color: fabricColor,
        material: "Ткань",
      })
    );
  }
  if (isArmchair) {
    parts.push(
      part(id(), "Подлокотник", {
        shape: "box",
        role: "detail",
        group: "Сиденье",
        position: [0.22, seatH + 0.15, 0],
        size: [0.08, 0.2, 0.4],
        color: shade(fabricColor, -0.1),
        material: "Ткань",
        mirror: "x",
      })
    );
  }
  return wrapConcept({
    name: titleFromPrompt(prompt, isArmchair ? "Кресло" : "Стул"),
    description: isArmchair ? "Мягкое кресло." : "Стул на четырёх ножках.",
    category: "furniture",
    seed: params.seed,
    parts,
  });
}

/* ---------------- product ---------------- */

export function buildProduct(prompt: string): ThreeDConcept {
  const params = parsePromptParams(prompt);
  const rng = params.rng;
  const text = prompt.toLowerCase();
  const scale = scaleFactor(params.scale);
  const bodyColor = params.color ?? pickColor(rng, "plastic");
  const id = idFactory("product");
  const parts: ModelPart[] = [];

  const isPhone = /телефон|смартфон|\bphone\b/i.test(text);
  const isLaptop = /ноутбук|laptop/i.test(text);
  const isLamp = /лампа|светильник|\blamp\b/i.test(text);
  const isRobot = /робот|\brobot\b/i.test(text);
  const isDrone = /дрон|drone|квадрокоптер/i.test(text);
  const isSpeaker = /колонк|наушник/i.test(text);
  const isBottle = /бутылк|ваз[аы]|кружк/i.test(text);

  if (isPhone) {
    const h = 0.15 * scale;
    parts.push(
      part(id(), "Корпус", {
        shape: "box",
        role: "volume",
        group: "Корпус",
        position: [0, h / 2, 0],
        size: [h * 0.46, h, 0.008],
        color: bodyColor,
        material: "Алюминий",
        metalness: 0.6,
        roughness: 0.3,
      }),
      part(id(), "Экран", {
        shape: "plane",
        role: "detail",
        group: "Корпус",
        position: [0, h / 2, 0.005],
        size: [h * 0.42, 0.002, h * 0.92],
        color: "#101418",
        material: "Стекло",
        emissive: 0.5,
      }),
      part(id(), "Камера", {
        shape: "cylinder",
        role: "detail",
        group: "Корпус",
        position: [-h * 0.13, h * 0.85, -0.005],
        size: [0.02, 0.006, 0.02],
        rotation: [Math.PI / 2, 0, 0],
        sides: 16,
        color: "#1c1c22",
        material: "Стекло",
        metalness: 0.5,
      }),
      part(id(), "Кнопка громкости", {
        shape: "box",
        role: "detail",
        group: "Корпус",
        position: [-h * 0.235, h * 0.6, 0],
        size: [0.006, 0.03, 0.01],
        color: shade(bodyColor, -0.2),
        material: "Металл",
      })
    );
    return wrapConcept({ name: titleFromPrompt(prompt, "Смартфон"), description: "Смартфон.", category: "product", seed: params.seed, parts });
  }

  if (isLaptop) {
    const w = 0.34 * scale;
    parts.push(
      part(id(), "Основание", {
        shape: "box",
        role: "volume",
        group: "Корпус",
        position: [0, 0.01, 0],
        size: [w, 0.02, w * 0.7],
        color: bodyColor,
        material: "Алюминий",
        metalness: 0.55,
      }),
      part(id(), "Клавиатура", {
        shape: "plane",
        role: "detail",
        group: "Корпус",
        position: [0, 0.021, -0.02],
        size: [w * 0.85, 0.002, w * 0.5],
        color: "#2a2c31",
        material: "Пластик",
      }),
      part(id(), "Крышка", {
        shape: "box",
        role: "detail",
        group: "Экран",
        position: [0, w * 0.34, -w * 0.34],
        size: [w, w * 0.68, 0.015],
        rotation: [-1.2, 0, 0],
        color: bodyColor,
        material: "Алюминий",
        metalness: 0.55,
      }),
      part(id(), "Экран", {
        shape: "plane",
        role: "detail",
        group: "Экран",
        position: [0, w * 0.36, -w * 0.335],
        size: [w * 0.9, 0.002, w * 0.58],
        rotation: [-1.2, 0, 0],
        color: "#1a2a44",
        material: "Стекло",
        emissive: 0.5,
      })
    );
    return wrapConcept({ name: titleFromPrompt(prompt, "Ноутбук"), description: "Ноутбук.", category: "product", seed: params.seed, parts });
  }

  if (isLamp) {
    parts.push(
      part(id(), "Основание", {
        shape: "cylinder",
        role: "foundation",
        group: "База",
        position: [0, 0.015 * scale, 0],
        size: [0.18 * scale, 0.03 * scale, 0.18 * scale],
        color: shade(bodyColor, -0.2),
        material: "Металл",
        metalness: 0.6,
      }),
      part(id(), "Стойка", {
        shape: "cylinder",
        role: "structure",
        group: "Стойка",
        position: [0, 0.2 * scale, 0],
        size: [0.022 * scale, 0.35 * scale, 0.022 * scale],
        color: shade(bodyColor, -0.1),
        material: "Металл",
      }),
      part(id(), "Шарнир", {
        shape: "sphere",
        role: "detail",
        group: "Стойка",
        position: [0, 0.37 * scale, 0],
        size: [0.05 * scale, 0.05 * scale, 0.05 * scale],
        color: shade(bodyColor, -0.3),
        material: "Металл",
      }),
      part(id(), "Плафон", {
        shape: "cone",
        role: "detail",
        group: "Плафон",
        position: [0, 0.42 * scale, 0.05 * scale],
        size: [0.16 * scale, 0.12 * scale, 0.16 * scale],
        rotation: [0.5, 0, 0],
        color: bodyColor,
        material: "Крашеный металл",
      }),
      part(id(), "Лампочка", {
        shape: "sphere",
        role: "light",
        group: "Плафон",
        position: [0, 0.38 * scale, 0.08 * scale],
        size: [0.05 * scale, 0.05 * scale, 0.05 * scale],
        color: "#fff2c0",
        material: "Стекло",
        emissive: 0.9,
        opacity: 0.85,
      })
    );
    return wrapConcept({ name: titleFromPrompt(prompt, "Настольная лампа"), description: "Настольная лампа.", category: "product", seed: params.seed, parts });
  }

  if (isDrone) {
    const arm = 0.22 * scale;
    parts.push(
      part(id(), "Корпус", {
        shape: "box",
        role: "volume",
        group: "Корпус",
        position: [0, 0.05 * scale, 0],
        size: [0.12 * scale, 0.05 * scale, 0.14 * scale],
        color: bodyColor,
        material: "Пластик",
      }),
      part(id(), "Луч", {
        shape: "box",
        role: "structure",
        group: "Лучи",
        position: [arm * 0.6, 0.05 * scale, arm * 0.6],
        size: [arm, 0.02 * scale, 0.02 * scale],
        rotation: [0, Math.PI / 4, 0],
        color: shade(bodyColor, -0.1),
        material: "Карбон",
        mirror: "xz",
      }),
      part(id(), "Мотор", {
        shape: "cylinder",
        role: "detail",
        group: "Лучи",
        position: [arm, 0.06 * scale, arm],
        size: [0.03 * scale, 0.03 * scale, 0.03 * scale],
        color: "#1c1c22",
        material: "Металл",
        mirror: "xz",
      }),
      part(id(), "Пропеллер", {
        shape: "cylinder",
        role: "detail",
        group: "Лучи",
        position: [arm, 0.08 * scale, arm],
        size: [0.18 * scale, 0.004 * scale, 0.02 * scale],
        sides: 3,
        color: "#101418",
        material: "Пластик",
        opacity: 0.7,
        mirror: "xz",
      }),
      part(id(), "Камера", {
        shape: "sphere",
        role: "detail",
        group: "Корпус",
        position: [0, 0.01 * scale, 0.07 * scale],
        size: [0.03 * scale, 0.03 * scale, 0.03 * scale],
        color: "#1c1c22",
        material: "Стекло",
      })
    );
    return wrapConcept({ name: titleFromPrompt(prompt, "Дрон"), description: "Квадрокоптер.", category: "product", seed: params.seed, parts });
  }

  if (isRobot) {
    const h = 0.4 * scale;
    parts.push(
      part(id(), "Голова", {
        shape: "box",
        role: "head",
        group: "Голова",
        position: [0, h * 1.05, 0],
        size: [h * 0.28, h * 0.24, h * 0.24],
        color: bodyColor,
        material: "Пластик",
      }),
      part(id(), "Глаз", {
        shape: "sphere",
        role: "detail",
        group: "Голова",
        position: [0, h * 1.05, h * 0.13],
        size: [h * 0.14, h * 0.08, 0.01],
        color: "#3fa8d9",
        material: "Экран",
        emissive: 0.8,
      }),
      part(id(), "Торс", {
        shape: "box",
        role: "torso",
        group: "Тело",
        position: [0, h * 0.68, 0],
        size: [h * 0.4, h * 0.5, h * 0.28],
        color: shade(bodyColor, -0.05),
        material: "Пластик",
      }),
      part(id(), "Рука", {
        shape: "capsule",
        role: "limb",
        group: "Руки",
        position: [h * 0.28, h * 0.6, 0],
        size: [h * 0.08, h * 0.4, h * 0.08],
        color: bodyColor,
        material: "Пластик",
        mirror: "x",
      }),
      part(id(), "Нога", {
        shape: "capsule",
        role: "limb",
        group: "Ноги",
        position: [h * 0.12, h * 0.2, 0],
        size: [h * 0.1, h * 0.4, h * 0.1],
        color: shade(bodyColor, -0.1),
        material: "Пластик",
        mirror: "x",
      })
    );
    return wrapConcept({ name: titleFromPrompt(prompt, "Робот"), description: "Робот-компаньон.", category: "product", seed: params.seed, parts });
  }

  if (isSpeaker) {
    const h = 0.24 * scale;
    parts.push(
      part(id(), "Корпус", {
        shape: "cylinder",
        role: "volume",
        group: "Корпус",
        position: [0, h / 2, 0],
        size: [h * 0.6, h, h * 0.6],
        sides: 24,
        color: bodyColor,
        material: "Ткань",
      }),
      part(id(), "Динамик", {
        shape: "cylinder",
        role: "detail",
        group: "Корпус",
        position: [0, h * 0.6, h * 0.29],
        size: [h * 0.4, 0.01, h * 0.4],
        rotation: [Math.PI / 2, 0, 0],
        sides: 24,
        color: "#1c1c22",
        material: "Ткань",
      }),
      part(id(), "Индикатор", {
        shape: "sphere",
        role: "light",
        group: "Корпус",
        position: [0, h * 0.95, h * 0.29],
        size: [0.012, 0.012, 0.012],
        color: "#3fa8d9",
        material: "LED",
        emissive: 0.9,
      })
    );
    return wrapConcept({ name: titleFromPrompt(prompt, "Колонка"), description: "Портативная колонка.", category: "product", seed: params.seed, parts });
  }

  if (isBottle) {
    const h = 0.22 * scale;
    parts.push(
      part(id(), "Корпус", {
        shape: "cylinder",
        role: "volume",
        group: "Корпус",
        position: [0, h * 0.4, 0],
        size: [h * 0.4, h * 0.8, h * 0.4],
        sides: 24,
        color: bodyColor,
        material: "Стекло",
        opacity: 0.6,
        roughness: 0.1,
      }),
      part(id(), "Горлышко", {
        shape: "cylinder",
        role: "detail",
        group: "Корпус",
        position: [0, h * 0.9, 0],
        size: [h * 0.16, h * 0.2, h * 0.16],
        sides: 16,
        color: bodyColor,
        material: "Стекло",
        opacity: 0.6,
      }),
      part(id(), "Крышка", {
        shape: "cylinder",
        role: "detail",
        group: "Корпус",
        position: [0, h * 1.02, 0],
        size: [h * 0.18, h * 0.06, h * 0.18],
        sides: 16,
        color: shade(bodyColor, -0.3),
        material: "Пластик",
      })
    );
    return wrapConcept({ name: titleFromPrompt(prompt, "Бутылка"), description: "Стилизованный сосуд.", category: "product", seed: params.seed, parts });
  }

  // generic gadget fallback
  const h = 0.3 * scale;
  parts.push(
    part(id(), "Корпус", {
      shape: "box",
      role: "volume",
      group: "Корпус",
      position: [0, h * 0.25, 0],
      size: [h, h * 0.5, h * 0.7],
      color: bodyColor,
      material: "Пластик",
    }),
    part(id(), "Панель", {
      shape: "plane",
      role: "detail",
      group: "Корпус",
      position: [0, h * 0.5, 0],
      size: [h * 0.7, 0.01, h * 0.4],
      color: shade(bodyColor, -0.3),
      material: "Металл",
    }),
    part(id(), "Кнопка", {
      shape: "cylinder",
      role: "detail",
      group: "Корпус",
      position: [-h * 0.25, h * 0.5 + 0.01, 0],
      size: [0.02 * scale, 0.008 * scale, 0.02 * scale],
      color: "#c1462f",
      material: "Пластик",
      repeat: { count: 3, step: [h * 0.2, 0, 0] },
    }),
    part(id(), "Ножка", {
      shape: "cylinder",
      role: "limb",
      group: "Корпус",
      position: [h * 0.4, 0.01, h * 0.28],
      size: [0.01 * scale, 0.02 * scale, 0.01 * scale],
      color: "#1c1c22",
      material: "Резина",
      mirror: "xz",
    })
  );

  return wrapConcept({
    name: titleFromPrompt(prompt, "Устройство"),
    description: "Концептуальный продукт.",
    category: "product",
    seed: params.seed,
    parts,
  });
}

/* ---------------- room ---------------- */

export function buildRoom(prompt: string): ThreeDConcept {
  const params = parsePromptParams(prompt);
  const rng = params.rng;
  const width = params.width ?? 4.5;
  const depth = params.depth ?? 4;
  const height = params.height ?? 2.8;
  const wallColor = params.color ?? pickColor(rng, "plaster");
  const floorColor = pickColor(rng, "wood");
  const id = idFactory("room");
  const parts: ModelPart[] = [];

  parts.push(
    part(id(), "Пол", {
      shape: "plane",
      role: "foundation",
      group: "Помещение",
      position: [0, 0, 0],
      size: [width, 0.05, depth],
      color: floorColor,
      material: "Паркет",
    }),
    part(id(), "Потолок", {
      shape: "plane",
      role: "detail",
      group: "Помещение",
      position: [0, height, 0],
      size: [width, 0.05, depth],
      color: "#f4f1ea",
      material: "Штукатурка",
    }),
    part(id(), "Задняя стена", {
      shape: "box",
      role: "wall",
      group: "Стены",
      position: [0, height / 2, -depth / 2],
      size: [width, height, 0.12],
      color: wallColor,
      material: "Штукатурка",
    }),
    part(id(), "Боковая стена", {
      shape: "box",
      role: "wall",
      group: "Стены",
      position: [-width / 2, height / 2, 0],
      size: [0.12, height, depth],
      color: shade(wallColor, 0.05),
      material: "Штукатурка",
      mirror: "x",
    }),
    part(id(), "Плинтус", {
      shape: "box",
      role: "detail",
      group: "Стены",
      position: [0, 0.04, -depth / 2 + 0.08],
      size: [width, 0.08, 0.02],
      color: shade(wallColor, -0.3),
      material: "Дерево",
    })
  );

  const winW = Math.min(2.2, width * 0.4);
  parts.push(
    part(id(), "Оконная рама", {
      shape: "box",
      role: "window",
      group: "Стены",
      position: [width * 0.2, height * 0.55, -depth / 2 + 0.02],
      size: [winW + 0.1, height * 0.5 + 0.1, 0.1],
      color: shade(wallColor, -0.35),
      material: "Рама",
    }),
    part(id(), "Стекло", {
      shape: "box",
      role: "window",
      group: "Стены",
      position: [width * 0.2, height * 0.55, -depth / 2 + 0.02],
      size: [winW, height * 0.5, 0.06],
      color: pickColor(rng, "glass"),
      material: "Стеклопакет",
      opacity: 0.4,
      metalness: 0.1,
      roughness: 0.05,
    }),
    part(id(), "Дверь", {
      shape: "box",
      role: "door",
      group: "Стены",
      position: [width / 2 - 0.06, 1.05, depth * 0.15],
      size: [0.08, 2.1, 0.9],
      color: shade(wallColor, -0.4),
      material: "Дерево",
    })
  );

  const purpose = /спальн|bedroom/i.test(prompt.toLowerCase())
    ? "bedroom"
    : /гостин|living/i.test(prompt.toLowerCase())
      ? "living"
      : /кабинет|офис|study/i.test(prompt.toLowerCase())
        ? "study"
        : "living";

  if (purpose === "bedroom") {
    const bedWidth = 1.6;
    const bedLength = 2.0;
    parts.push(
      part(id(), "Кровать — каркас", {
        shape: "box",
        role: "furniture",
        group: "Мебель",
        position: [-width / 4, 0.25, depth / 4],
        size: [bedWidth, 0.3, bedLength],
        color: floorColor,
        material: "Дерево",
      }),
      part(id(), "Матрас", {
        shape: "box",
        role: "furniture",
        group: "Мебель",
        position: [-width / 4, 0.48, depth / 4],
        size: [bedWidth * 0.95, 0.22, bedLength * 0.95],
        color: "#eeeae2",
        material: "Ткань",
      }),
      part(id(), "Стол", {
        shape: "box",
        role: "furniture",
        group: "Мебель",
        position: [width / 2 - 0.5, 0.74, -depth / 2 + 0.5],
        size: [0.9, 0.04, 0.55],
        color: shade(floorColor, -0.1),
        material: "Дерево",
      })
    );
  } else if (purpose === "study") {
    parts.push(
      part(id(), "Рабочий стол", {
        shape: "box",
        role: "furniture",
        group: "Мебель",
        position: [0, 0.74, -depth / 2 + 0.5],
        size: [1.6, 0.04, 0.7],
        color: shade(floorColor, -0.1),
        material: "Дерево",
      }),
      part(id(), "Стул", {
        shape: "box",
        role: "furniture",
        group: "Мебель",
        position: [0, 0.45, -depth / 2 + 1.2],
        size: [0.42, 0.04, 0.42],
        color: pickColor(rng, "fabric"),
        material: "Ткань",
      }),
      part(id(), "Стеллаж", {
        shape: "box",
        role: "furniture",
        group: "Мебель",
        position: [width / 2 - 0.2, height / 2, 0],
        size: [0.35, height * 0.85, 0.9],
        color: floorColor,
        material: "Дерево",
      })
    );
  } else {
    parts.push(
      part(id(), "Диван", {
        shape: "box",
        role: "furniture",
        group: "Мебель",
        position: [0, 0.35, depth / 3],
        size: [2.0, 0.5, 0.85],
        color: pickColor(rng, "fabric"),
        material: "Ткань",
      }),
      part(id(), "Журнальный столик", {
        shape: "box",
        role: "furniture",
        group: "Мебель",
        position: [0, 0.22, depth * 0.05],
        size: [0.8, 0.04, 0.5],
        color: floorColor,
        material: "Дерево",
      }),
      part(id(), "Полка", {
        shape: "box",
        role: "furniture",
        group: "Мебель",
        position: [width / 2 - 0.15, height * 0.4, -depth / 3],
        size: [0.3, height * 0.6, 0.9],
        color: floorColor,
        material: "Дерево",
      })
    );
  }

  parts.push(
    part(id(), "Светильник", {
      shape: "sphere",
      role: "light",
      group: "Помещение",
      position: [0, height - 0.15, 0],
      size: [0.18, 0.12, 0.18],
      color: "#fff2c0",
      material: "Стекло",
      emissive: 0.7,
      opacity: 0.9,
    })
  );

  return wrapConcept({
    name: titleFromPrompt(prompt, "Комната"),
    description: `Интерьер ${width.toFixed(1)}×${depth.toFixed(1)} м.`,
    category: "room",
    seed: params.seed,
    parts,
  });
}
