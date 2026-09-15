export const FREE_PROJECT_LIMIT = 5;
export const FREE_3D_LIMIT = 5;
export const PRO_DURATION_DAYS = 30;
export const AI_DAILY_LIMIT = { free: 25, pro: 300 } as const;

export const PLANS = {
  free: {
    name: "Free",
    price: "$0",
    limit: FREE_PROJECT_LIMIT,
    features: [
      `До ${FREE_PROJECT_LIMIT} проектов`,
      `${FREE_3D_LIMIT} генераций 3D (всего)`,
      `До ${AI_DAILY_LIMIT.free} AI-запросов в день`,
      "AI-интервью и генерация плана",
      "Архитектура, БД, API, Roadmap",
      "Экспорт в Markdown / JSON / PDF",
    ],
  },
  pro: {
    name: "Pro",
    price: "200 сом",
    limit: Infinity,
    features: [
      "Безлимитные проекты",
      "Безлимитные генерации 3D",
      `До ${AI_DAILY_LIMIT.pro} AI-запросов в день`,
      "Всё из Free",
      "Приоритетная генерация",
      "Новые функции раньше всех",
    ],
  },
} as const;

export function canCreateProject(plan: string, currentCount: number): boolean {
  return plan === "pro" || currentCount < FREE_PROJECT_LIMIT;
}
