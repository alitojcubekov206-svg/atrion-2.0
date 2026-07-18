import OpenAI from "openai";
import type { Blueprint, InterviewQuestion } from "./types";

const hasKey = () => Boolean(process.env.OPENAI_API_KEY);

function client() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // Allows OpenAI-compatible providers (Groq, Gemini, OpenRouter, etc.)
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
}

const MODEL = () => process.env.OPENAI_MODEL || "gpt-4o-mini";

async function chatJSON<T>(system: string, user: string): Promise<T> {
  const res = await client().chat.completions.create({
    model: MODEL(),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  let text = res.choices[0]?.message?.content ?? "{}";
  // Some providers wrap JSON in markdown fences despite json mode
  text = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  return JSON.parse(text) as T;
}

// ---------- Interview ----------

export async function generateInterview(idea: string): Promise<InterviewQuestion[]> {
  if (!hasKey()) return mockInterview(idea);

  const data = await chatJSON<{ questions: InterviewQuestion[] }>(
    `You are a senior software architect conducting a discovery interview.
Given a product idea, produce exactly 5 short clarifying questions that materially change the technical plan.
Each question has 3-4 concise answer options.
Respond in the same language as the idea.
Return JSON: {"questions":[{"id":"q1","question":"...","options":["...","..."]}]}`,
    `Product idea: ${idea}`
  );
  return data.questions.slice(0, 6);
}

function mockInterview(idea: string): InterviewQuestion[] {
  const ru = /[а-яА-ЯёЁ]/.test(idea);
  return ru
    ? [
        { id: "q1", question: "Кто ваша основная аудитория?", options: ["Дети", "Студенты", "Взрослые профессионалы", "Бизнес (B2B)"] },
        { id: "q2", question: "На каких платформах будет работать продукт?", options: ["Web", "Mobile (iOS/Android)", "Desktop", "Web + Mobile"] },
        { id: "q3", question: "Какая модель монетизации?", options: ["Подписка", "Freemium", "Разовая покупка", "Реклама"] },
        { id: "q4", question: "Насколько важен AI в продукте?", options: ["Ядро продукта", "Важная фича", "Дополнение", "Пока не нужен"] },
        { id: "q5", question: "Какой срок до первого запуска (MVP)?", options: ["2–4 недели", "1–2 месяца", "3–6 месяцев", "Без жёстких сроков"] },
      ]
    : [
        { id: "q1", question: "Who is your primary audience?", options: ["Kids", "Students", "Professionals", "Businesses (B2B)"] },
        { id: "q2", question: "Which platforms should it run on?", options: ["Web", "Mobile (iOS/Android)", "Desktop", "Web + Mobile"] },
        { id: "q3", question: "What is the monetization model?", options: ["Subscription", "Freemium", "One-time purchase", "Ads"] },
        { id: "q4", question: "How central is AI to the product?", options: ["Core of the product", "Major feature", "Nice-to-have", "Not needed yet"] },
        { id: "q5", question: "Target timeline for the MVP?", options: ["2–4 weeks", "1–2 months", "3–6 months", "No hard deadline"] },
      ];
}

// ---------- Blueprint ----------

export async function generateBlueprint(
  idea: string,
  answers: { question: string; answer: string }[]
): Promise<Blueprint> {
  if (!hasKey()) return mockBlueprint(idea, answers);

  const schemaHint = `{
  "overview": {"name":"","tagline":"","description":"","audience":"","problem":"","solution":""},
  "discovery": {"productType":"","targetUsers":"","problemSolved":"","competitors":[{"name":"","description":"","strengths":[""],"weaknesses":[""]}],"potential":""},
  "architecture": [{"layer":"Frontend","technologies":[""],"reason":""}],
  "database": [{"name":"users","fields":[{"name":"id","type":"uuid","note":""}]}],
  "api": [{"method":"POST","path":"/api/...","description":""}],
  "roadmap": [{"phase":"Phase 1","title":"MVP","duration":"2 weeks","tasks":[""]}],
  "score": {"innovation":0,"difficulty":0,"market":0,"cost":"","risk":"Medium","explanation":""},
  "critique": [""],
  "risks": [{"risk":"","severity":"Medium","mitigation":""}]
}`;

  return chatJSON<Blueprint>(
    `You are a senior software architect. You transform product ideas into complete technical plans.
Be honest and critical — do not just agree. In "critique", point out real problems: saturated markets, features that bloat the MVP, technical risks.
Scores are integers 0-100. Include 4-6 database tables, 8-14 API endpoints, 3-4 roadmap phases, 2-4 competitors, 3-5 critique points, 3-5 risks.
Respond in the same language as the idea. Return ONLY valid JSON matching exactly this shape:
${schemaHint}`,
    `Product idea: ${idea}

Discovery interview answers:
${answers.map((a) => `- ${a.question} → ${a.answer}`).join("\n")}`
  );
}

function mockBlueprint(idea: string, answers: { question: string; answer: string }[]): Blueprint {
  const ru = /[а-яА-ЯёЁ]/.test(idea);
  const platform = answers.find((a) => /платформ|platform/i.test(a.question))?.answer ?? "Web";
  const audience = answers.find((a) => /аудитор|audience/i.test(a.question))?.answer ?? (ru ? "Взрослые" : "Professionals");
  const shortIdea = idea.length > 60 ? idea.slice(0, 57) + "..." : idea;

  return {
    overview: {
      name: shortIdea,
      tagline: ru ? "От идеи к работающему продукту" : "From idea to working product",
      description: idea,
      audience,
      problem: ru
        ? "Пользователям не хватает удобного и доступного решения этой задачи: существующие инструменты либо слишком сложные, либо не покрывают ключевой сценарий."
        : "Users lack a convenient, accessible solution: existing tools are either too complex or miss the key scenario.",
      solution: ru
        ? `Продукт для платформы «${platform}», сфокусированный на одном ключевом сценарии с простым интерфейсом и быстрым стартом.`
        : `A ${platform} product focused on one key scenario with a simple interface and fast onboarding.`,
    },
    discovery: {
      productType: ru ? `Приложение (${platform})` : `Application (${platform})`,
      targetUsers: audience,
      problemSolved: ru
        ? "Экономия времени и снижение порога входа для целевой аудитории."
        : "Saves time and lowers the entry barrier for the target audience.",
      competitors: [
        {
          name: ru ? "Крупный игрок рынка" : "Established market leader",
          description: ru ? "Известный продукт с большой базой пользователей." : "Well-known product with a large user base.",
          strengths: ru ? ["Бренд", "Большое комьюнити"] : ["Brand", "Large community"],
          weaknesses: ru ? ["Перегруженный интерфейс", "Дорогая подписка"] : ["Bloated UI", "Expensive subscription"],
        },
        {
          name: ru ? "Нишевый стартап" : "Niche startup",
          description: ru ? "Молодой продукт, закрывающий часть сценариев." : "Young product covering part of the scenarios.",
          strengths: ru ? ["Простота"] : ["Simplicity"],
          weaknesses: ru ? ["Мало функций", "Нет мобильной версии"] : ["Few features", "No mobile version"],
        },
      ],
      potential: ru
        ? "Потенциал средний-высокий: рынок конкурентный, но есть место для продукта с чётким фокусом на MVP-сценарии."
        : "Medium-high potential: the market is competitive, but there is room for a sharply focused MVP.",
    },
    architecture: [
      { layer: "Frontend", technologies: ["Next.js", "React", "TypeScript", "Tailwind CSS"], reason: ru ? "Быстрая разработка, SSR, единая кодовая база." : "Fast development, SSR, single codebase." },
      { layer: "Backend", technologies: ["Next.js API Routes", "Node.js"], reason: ru ? "Для MVP отдельный бэкенд не нужен — меньше инфраструктуры." : "No separate backend needed for MVP — less infrastructure." },
      { layer: "Database", technologies: ["PostgreSQL", "Prisma ORM"], reason: ru ? "Надёжная реляционная БД, типобезопасный доступ." : "Reliable relational DB with type-safe access." },
      { layer: "AI", technologies: ["OpenAI API"], reason: ru ? "Готовый LLM API вместо собственной модели — быстрее и дешевле." : "Managed LLM API instead of a custom model — faster and cheaper." },
      { layer: "Deployment", technologies: ["Vercel"], reason: ru ? "Нулевая настройка CI/CD, авто-масштабирование." : "Zero-config CI/CD, automatic scaling." },
    ],
    database: [
      { name: "users", fields: [
        { name: "id", type: "uuid" },
        { name: "name", type: "varchar" },
        { name: "email", type: "varchar", note: "unique" },
        { name: "password_hash", type: "varchar" },
        { name: "created_at", type: "timestamp" },
      ]},
      { name: "projects", fields: [
        { name: "id", type: "uuid" },
        { name: "user_id", type: "uuid", note: "FK → users" },
        { name: "title", type: "varchar" },
        { name: "description", type: "text" },
        { name: "status", type: "varchar" },
        { name: "created_at", type: "timestamp" },
      ]},
      { name: "tasks", fields: [
        { name: "id", type: "uuid" },
        { name: "project_id", type: "uuid", note: "FK → projects" },
        { name: "title", type: "varchar" },
        { name: "priority", type: "varchar" },
        { name: "status", type: "varchar" },
      ]},
      { name: "sessions", fields: [
        { name: "id", type: "uuid" },
        { name: "user_id", type: "uuid", note: "FK → users" },
        { name: "token", type: "varchar" },
        { name: "expires_at", type: "timestamp" },
      ]},
    ],
    api: [
      { method: "POST", path: "/api/auth/register", description: ru ? "Регистрация пользователя" : "User registration" },
      { method: "POST", path: "/api/auth/login", description: ru ? "Авторизация" : "Login" },
      { method: "POST", path: "/api/auth/logout", description: ru ? "Выход" : "Logout" },
      { method: "GET", path: "/api/projects", description: ru ? "Список проектов пользователя" : "List user projects" },
      { method: "POST", path: "/api/projects", description: ru ? "Создать проект" : "Create project" },
      { method: "GET", path: "/api/projects/:id", description: ru ? "Получить проект" : "Get project" },
      { method: "PATCH", path: "/api/projects/:id", description: ru ? "Обновить проект" : "Update project" },
      { method: "DELETE", path: "/api/projects/:id", description: ru ? "Удалить проект" : "Delete project" },
      { method: "GET", path: "/api/projects/:id/tasks", description: ru ? "Задачи проекта" : "Project tasks" },
      { method: "POST", path: "/api/projects/:id/tasks", description: ru ? "Создать задачу" : "Create task" },
    ],
    roadmap: [
      { phase: "Phase 1", title: "MVP", duration: ru ? "2 недели" : "2 weeks", tasks: ru
        ? ["Регистрация и вход", "База данных и модели", "Главный интерфейс", "Ключевой сценарий продукта"]
        : ["Registration and login", "Database and models", "Main interface", "Core product scenario"] },
      { phase: "Phase 2", title: ru ? "AI-функции" : "AI features", duration: ru ? "3 недели" : "3 weeks", tasks: ru
        ? ["Интеграция LLM API", "Персонализация", "Умные рекомендации"]
        : ["LLM API integration", "Personalization", "Smart recommendations"] },
      { phase: "Phase 3", title: ru ? "Рост" : "Growth", duration: ru ? "4 недели" : "4 weeks", tasks: ru
        ? ["Аналитика", "Платёжная система", "Мобильная адаптация", "Маркетинговый сайт"]
        : ["Analytics", "Payments", "Mobile adaptation", "Marketing site"] },
    ],
    score: {
      innovation: 68,
      difficulty: 58,
      market: 74,
      cost: "$8k–$20k",
      risk: "Medium",
      explanation: ru
        ? "Идея жизнеспособна, но конкуренция заметная. Сложность умеренная благодаря готовым LLM API. Главный риск — удержание пользователей после первого запуска."
        : "The idea is viable, but competition is notable. Difficulty is moderate thanks to managed LLM APIs. The main risk is user retention after launch.",
    },
    critique: ru
      ? [
          "Рынок конкурентный: без чёткого отличия от лидеров продукт рискует остаться незамеченным.",
          "Не добавляйте все функции сразу — это раздует MVP. Оставьте один ключевой сценарий.",
          "AI-функции стоит подключать во второй фазе: сначала докажите, что базовый продукт нужен людям.",
          "Продумайте удержание: большинство подобных продуктов теряют 80% пользователей в первую неделю.",
        ]
      : [
          "The market is competitive: without clear differentiation the product risks going unnoticed.",
          "Do not add every feature at once — it will bloat the MVP. Keep one key scenario.",
          "Ship AI features in phase 2: first prove people need the core product.",
          "Plan for retention: most similar products lose 80% of users in the first week.",
        ],
    risks: [
      { risk: ru ? "Высокая конкуренция" : "High competition", severity: "High", mitigation: ru ? "Узкое позиционирование и фокус на одной аудитории." : "Narrow positioning and focus on one audience." },
      { risk: ru ? "Стоимость LLM API при росте" : "LLM API costs at scale", severity: "Medium", mitigation: ru ? "Кэширование ответов, лимиты запросов, дешёвые модели для простых задач." : "Response caching, rate limits, cheaper models for simple tasks." },
      { risk: ru ? "Низкое удержание пользователей" : "Low user retention", severity: "Medium", mitigation: ru ? "Онбординг, уведомления, быстрая ценность в первые 5 минут." : "Onboarding, notifications, fast time-to-value." },
    ],
  };
}

export const isDemoMode = () => !hasKey();
