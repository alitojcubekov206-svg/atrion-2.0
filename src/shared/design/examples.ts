export type DesignExample = {
  id: string;
  name: string;
  prompt: string;
  templateId?: "living" | "bedroom";
};

export const DESIGN_EXAMPLES: readonly DesignExample[] = [
  {
    id: "modern-house", name: "Дом с панорамными окнами",
    prompt: "Современный Г-образный дом 12×9 м, 2 этажа, плоская крыша, белые стены, панорамные окна. Прихожая, кухня-гостиная, две спальни, кабинет и санузел. Реши сам.",
  },
  {
    id: "chalet", name: "Деревянное шале",
    prompt: "Деревянный дом в стиле шале 12×9 м, один этаж, двускатная крыша. Гостиная, кухня, две спальни и санузел. Реши сам.",
  },
  {
    id: "living-room", name: "Скандинавская гостиная",
    prompt: "Скандинавская гостиная 5.6×5.2 м: диван, кресло, журнальный стол, стеллаж, консоль, торшер и растение.",
    templateId: "living",
  },
  {
    id: "bedroom", name: "Спальня в стиле джапанди",
    prompt: "Спальня в стиле джапанди 4.8×5.6 м: двуспальная кровать, шкаф, рабочий стол, кресло, торшер и растение.",
    templateId: "bedroom",
  },
];

export function findDesignExample(id: string | null): DesignExample | undefined {
  return DESIGN_EXAMPLES.find(example => example.id === id);
}
