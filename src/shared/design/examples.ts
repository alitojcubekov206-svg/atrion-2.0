export type DesignExample = {
  id: string;
  name: string;
  description: string;
  image: string;
  prompt: string;
  templateId?: "living" | "bedroom";
};

/** Previews are rendered from Atrion scenes, not illustrations of an imagined result. */
export const DESIGN_EXAMPLES: readonly DesignExample[] = [
  {
    id: "modern-house", name: "Дом с панорамными окнами",
    description: "Г-образный · 2 этажа · интерьер внутри",
    image: "/design-examples/modern-house-facade.png",
    prompt: "Современный Г-образный дом 12×9 м, 2 этажа, плоская крыша, белые стены, панорамные окна. Прихожая, кухня-гостиная, две спальни, кабинет и санузел. Реши сам.",
  },
  {
    id: "chalet", name: "Деревянное шале",
    description: "12×9 м · скатная крыша · 5 помещений",
    image: "/design-examples/chalet-facade.png",
    prompt: "Деревянный дом в стиле шале 12×9 м, один этаж, двускатная крыша. Гостиная, кухня, две спальни и санузел. Реши сам.",
  },
  {
    id: "living-room", name: "Скандинавская гостиная",
    description: "Диван, кресло, стеллаж и мягкий свет",
    image: "/design-examples/living-room-preview.png",
    prompt: "Скандинавская гостиная 5.6×5.2 м: диван, кресло, журнальный стол, стеллаж, консоль, торшер и растение.",
    templateId: "living",
  },
  {
    id: "bedroom", name: "Спальня в стиле джапанди",
    description: "Кровать, шкаф и рабочее место",
    image: "/design-examples/bedroom-preview.png",
    prompt: "Спальня в стиле джапанди 4.8×5.6 м: двуспальная кровать, шкаф, рабочий стол, кресло, торшер и растение.",
    templateId: "bedroom",
  },
];

export function findDesignExample(id: string | null): DesignExample | undefined {
  return DESIGN_EXAMPLES.find(example => example.id === id);
}
