export const FREE_PROJECT_LIMIT = 5;

export const PLANS = {
  free: {
    name: "Free",
    price: "$0",
    limit: FREE_PROJECT_LIMIT,
    features: [
      `До ${FREE_PROJECT_LIMIT} проектов`,
      "AI-интервью и генерация плана",
      "Архитектура, БД, API, Roadmap",
      "Project Score и AI-критика",
      "Экспорт в Markdown / JSON / PDF",
    ],
  },
  pro: {
    name: "Pro",
    price: "200 сом",
    limit: Infinity,
    features: [
      "Безлимитные проекты",
      "Всё из Free",
      "Приоритетная генерация",
      "Новые функции раньше всех",
      "Поддержка автора",
    ],
  },
} as const;

export function canCreateProject(plan: string, currentCount: number): boolean {
  return plan === "pro" || currentCount < FREE_PROJECT_LIMIT;
}
