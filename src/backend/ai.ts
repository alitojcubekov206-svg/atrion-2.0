import OpenAI from "openai";
import type {
  Blueprint,
  ExpertReply,
  ExpertRole,
  InterviewQuestion,
  StarterKit,
  ThreeDConcept,
} from "@/shared/types";
import { buildFromPrompt, detectCategory } from "@/backend/procedural-3d";
import { generateAIGeometry, pickBetterGeometry } from "@/backend/gen/ai-geometry";
import { dimensionsOf, primitiveCount, structureFromGroups } from "@/shared/geometry";
import { sanitizeParts, scoreParts, validateAndRepair } from "@/backend/gen/validate";

type AIProvider = {
  apiKey: string;
  baseURL?: string;
  model: string;
  name: "primary" | "fallback";
};

const hasKey = () =>
  Boolean(
    process.env.OPENAI_API_KEY?.trim() ||
      process.env.GROQ_API_KEY?.trim() ||
      process.env.AI_API_KEY?.trim()
  );

function primaryProvider(): AIProvider | null {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.GROQ_API_KEY?.trim() ||
    process.env.AI_API_KEY?.trim();
  if (!apiKey) return null;

  // Groq-compatible if only GROQ_API_KEY is set
  const isGroqOnly = !process.env.OPENAI_API_KEY?.trim() && Boolean(process.env.GROQ_API_KEY?.trim());
  return {
    apiKey,
    baseURL:
      process.env.OPENAI_BASE_URL ||
      (isGroqOnly ? "https://api.groq.com/openai/v1" : undefined),
    model:
      process.env.OPENAI_MODEL ||
      (isGroqOnly ? "llama-3.3-70b-versatile" : "gpt-4o"),
    name: "primary",
  };
}

function fallbackProvider(): AIProvider | null {
  const apiKey = process.env.AI_FALLBACK_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseURL: process.env.AI_FALLBACK_BASE_URL || undefined,
    model: process.env.AI_FALLBACK_MODEL || "gpt-4o-mini",
    name: "fallback",
  };
}

function errorSummary(error: unknown) {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    status:
      error && typeof error === "object" && "status" in error
        ? String((error as { status?: unknown }).status ?? "")
        : undefined,
  };
}

function isProviderFailure(error: unknown) {
  return (
    error instanceof OpenAI.APIError ||
    error instanceof SyntaxError ||
    error instanceof TypeError ||
    (error instanceof Error &&
      ["AbortError", "APIConnectionError", "APIConnectionTimeoutError"].includes(error.name))
  );
}

async function requestJSON<T>(
  provider: AIProvider,
  system: string,
  user: string
): Promise<T> {
  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseURL,
    maxRetries: 0,
    timeout: 60_000,
  });
  const res = await client.chat.completions.create({
    model: provider.model,
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

async function chatJSON<T>(system: string, user: string): Promise<T> {
  const primary = primaryProvider();
  if (!primary) throw new Error("Primary AI provider is not configured");

  try {
    return await requestJSON<T>(primary, system, user);
  } catch (error) {
    const fallback = fallbackProvider();
    if (!fallback || !isProviderFailure(error)) throw error;

    console.warn(
      "Atrion AI Pro primary provider failed; trying fallback",
      errorSummary(error)
    );
    try {
      return await requestJSON<T>(fallback, system, user);
    } catch (fallbackError) {
      console.warn(
        "Atrion AI Pro fallback provider failed; using local fallback",
        errorSummary(fallbackError)
      );
      throw fallbackError;
    }
  }
}

function localFallback<T>(label: string, error: unknown, value: () => T): T {
  console.warn(`Atrion AI Pro ${label} unavailable; using local fallback`, errorSummary(error));
  return value();
}

// ---------- Interview ----------

export async function generateInterview(idea: string): Promise<InterviewQuestion[]> {
  if (!hasKey()) return mockInterview(idea);

  try {
    const data = await chatJSON<{ questions: InterviewQuestion[] }>(
      `You are a senior software architect conducting a discovery interview.
Given a product idea, produce exactly 5 short clarifying questions that materially change the technical plan.
Each question has 3-4 concise answer options.
Respond in the same language as the idea.
Return JSON: {"questions":[{"id":"q1","question":"...","options":["...","..."]}]}`,
      `Product idea: ${idea}`
    );
    return data.questions.slice(0, 6);
  } catch (error) {
    return localFallback("interview", error, () => mockInterview(idea));
  }
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

  try {
    return await chatJSON<Blueprint>(
      `You are a senior software architect. You transform product ideas into complete technical plans.
Be honest and critical — do not just agree. In "critique", point out real problems: saturated markets, features that bloat the MVP, technical risks.
Scores are integers 0-100. Include 4-6 database tables, 8-14 API endpoints, 3-4 roadmap phases, 2-4 competitors, 3-5 critique points, 3-5 risks.
Respond in the same language as the idea. Return ONLY valid JSON matching exactly this shape:
${schemaHint}`,
      `Product idea: ${idea}

Discovery interview answers:
${answers.map((a) => `- ${a.question} → ${a.answer}`).join("\n")}`
    );
  } catch (error) {
    return localFallback("blueprint", error, () => mockBlueprint(idea, answers));
  }
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

// ---------- Expert Team ----------

const EXPERT_PROMPTS: Record<ExpertRole, string> = {
  architect: "You are a principal software architect. Focus on system boundaries, scalability, data and trade-offs.",
  programmer: "You are a staff-level programmer. Give concrete implementation guidance, file structure, code-level decisions and tests.",
  product: "You are a senior product manager. Focus on users, MVP scope, metrics, positioning and monetization.",
  security: "You are a security engineer. Identify realistic threats, privacy issues, abuse cases and practical mitigations.",
  critic: "You are a skeptical technical reviewer. Challenge assumptions, remove unnecessary scope and explain what may fail.",
};

export async function consultProjectExpert(
  role: ExpertRole,
  idea: string,
  blueprint: Blueprint,
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = []
): Promise<ExpertReply> {
  const mock = (): ExpertReply => ({
    answer: `Как ${role}, я рекомендую сначала проверить главный сценарий проекта «${blueprint.overview.name}» на небольшой группе пользователей, а затем усложнять архитектуру.`,
    actionItems: ["Зафиксировать один MVP-сценарий", "Добавить измеримую метрику успеха", "Проверить главный риск до разработки"],
    warnings: ["Ответ создан в демонстрационном режиме"],
  });
  if (!hasKey()) return mock();

  try {
    return await chatJSON<ExpertReply>(
      `${EXPERT_PROMPTS[role]}
Be concise but specific. Do not blindly agree. Reply in the user's language.
Return JSON: {"answer":"...","actionItems":["..."],"warnings":["..."]}`,
      `Project idea: ${idea}
Blueprint: ${JSON.stringify(blueprint)}
Recent conversation:
${history.slice(-6).map((item) => `${item.role}: ${item.content}`).join("\n")}
User question: ${question}`
    );
  } catch (error) {
    return localFallback("expert", error, mock);
  }
}

export async function generateStarterKit(
  idea: string,
  blueprint: Blueprint
): Promise<StarterKit> {
  const mock = (): StarterKit => ({
    summary: "Минимальный стартовый набор для реализации MVP.",
    files: [
      {
        path: "README.md",
        language: "markdown",
        content: `# ${blueprint.overview.name}\n\n${blueprint.overview.description}\n\n## MVP\n${blueprint.roadmap[0]?.tasks.map((task) => `- ${task}`).join("\n") ?? ""}`,
      },
      {
        path: ".env.example",
        language: "dotenv",
        content: "DATABASE_URL=\nAUTH_SECRET=\nAI_API_KEY=\n",
      },
    ],
    nextSteps: ["Создать репозиторий", "Настроить окружение", "Реализовать первую фазу roadmap"],
  });
  if (!hasKey()) return mock();

  try {
    const rawResult = await chatJSON<unknown>(
      `You are a staff software engineer creating a small but runnable starter kit from a project blueprint.
Generate at most 8 essential text files. Prefer a minimal vertical slice over boilerplate.
Never include real secrets. Keep total output concise. Return the code in the user's language where appropriate.
Return JSON:
{"summary":"...","files":[{"path":"...","language":"...","content":"..."}],"nextSteps":["..."]}`,
      `Idea: ${idea}\nBlueprint: ${JSON.stringify(blueprint)}`
    );

    if (!rawResult || typeof rawResult !== "object") {
      throw new Error("AI returned an invalid starter kit");
    }
    const result = rawResult as Partial<StarterKit>;
    return {
      summary: typeof result.summary === "string" ? result.summary : "Generated starter kit",
      files: Array.isArray(result.files)
        ? result.files
            .filter(
              (file) =>
                file &&
                typeof file.path === "string" &&
                typeof file.language === "string" &&
                typeof file.content === "string"
            )
            .slice(0, 8)
        : [],
      nextSteps: Array.isArray(result.nextSteps)
        ? result.nextSteps.filter((step): step is string => typeof step === "string").slice(0, 10)
        : [],
    };
  } catch (error) {
    return localFallback("starter kit", error, mock);
  }
}

// ---------- 3D Concept Studio ----------

export async function generate3DInterview(prompt: string): Promise<InterviewQuestion[]> {
  const category = detectCategory(prompt);
  if (!hasKey()) return mock3DInterview(category);

  try {
    const data = await chatJSON<{ questions: InterviewQuestion[] }>(
      `You are a 3D concept designer. Detected category: ${category}.
Ask exactly 5 concise questions that fit THIS category (not buildings if category is character/room/product/animal).
Examples:
- character: pose, outfit, hair, style (anime/realistic), scale
- room: size, style, furniture, lighting, purpose
- house/school: floors, size, materials, budget
Provide 3 practical options per question. Same language as user.
Return JSON: {"questions":[{"id":"q1","question":"...","options":["..."]}]}`,
      `User request: ${prompt}`
    );

    if (!data || typeof data !== "object" || !("questions" in data)) {
      return mock3DInterview(category);
    }
    const rawQuestions = (data as { questions?: unknown }).questions;
    if (!Array.isArray(rawQuestions)) return mock3DInterview(category);
    const questionItems: unknown[] = rawQuestions;
    const questions = questionItems
      .filter((item): item is { id: string; question: string; options: unknown[] } => {
        if (!item || typeof item !== "object") return false;
        const candidate = item as Record<string, unknown>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.question === "string" &&
          Array.isArray(candidate.options)
        );
      })
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        question: item.question,
        options: item.options
          .filter((option: unknown): option is string => typeof option === "string")
          .slice(0, 4),
      }))
      .filter((item) => item.options.length > 0);
    return questions.length > 0 ? questions : mock3DInterview(category);
  } catch (error) {
    return localFallback("3D interview", error, () => mock3DInterview(category));
  }
}

function mock3DInterview(category = "product"): InterviewQuestion[] {
  if (category === "character") {
    return [
      { id: "style", question: "Какой стиль персонажа?", options: ["Аниме", "Реализм", "Стилизованный"] },
      { id: "pose", question: "Какая поза?", options: ["Стоя", "Динамичная", "Сидеть"] },
      { id: "outfit", question: "Одежда / образ?", options: ["Повседневная", "Школьная форма", "Фэнтези"] },
      { id: "hair", question: "Волосы?", options: ["Короткие", "Длинные", "Хвостики"] },
      { id: "scale", question: "Масштаб модели?", options: ["Фигурка ~20 см", "Рост человека", "Крупный герой"] },
    ];
  }
  if (category === "room") {
    return [
      { id: "size", question: "Размер комнаты?", options: ["Маленькая", "Средняя 4×5 м", "Просторная"] },
      { id: "style", question: "Стиль интерьера?", options: ["Минимализм", "Уютный", "Современный"] },
      { id: "furniture", question: "Мебель?", options: ["Кровать+стол", "Гостиная", "Минимум"] },
      { id: "light", question: "Свет?", options: ["Дневной", "Тёплый", "Неон"] },
      { id: "purpose", question: "Назначение?", options: ["Спальня", "Кабинет", "Игровая"] },
    ];
  }
  if (category === "animal") {
    return [
      { id: "species", question: "Кто это ближе?", options: ["Кошка", "Собака", "Фэнтези-зверь"] },
      { id: "pose", question: "Поза?", options: ["Стоит", "Сидит", "Бежит"] },
      { id: "style", question: "Стиль?", options: ["Милый", "Реализм", "Аниме"] },
      { id: "size", question: "Размер?", options: ["Маленький", "Средний", "Крупный"] },
      { id: "detail", question: "Детали?", options: ["Простой силуэт", "Больше деталей", "С аксессуаром"] },
    ];
  }
  if (["house", "school", "office", "hospital", "tower", "stadium", "bridge", "building"].includes(category)) {
    return [
      { id: "dimensions", question: "Какая основная длина объекта нужна?", options: ["12 м", "30 м", "60 м"] },
      { id: "floors", question: "Сколько этажей / уровней?", options: ["1–2", "3–5", "Высотное"] },
      { id: "material", question: "Материалы?", options: ["Бетон", "Стекло+сталь", "Дерево"] },
      { id: "budget", question: "Бюджет ориентир?", options: ["До 200 000", "200к–1млн", "Более 1 млн"] },
      { id: "detail", question: "Уровень детализации?", options: ["Силуэт", "Средний", "Максимум"] },
    ];
  }
  return [
    { id: "size", question: "Размер объекта?", options: ["Карманный", "Настольный", "Крупный"] },
    { id: "usage", question: "Для чего?", options: ["Декор", "Функциональный", "Прототип"] },
    { id: "material", question: "Материалы?", options: ["Пластик", "Металл", "Смешанные"] },
    { id: "style", question: "Стиль?", options: ["Минимализм", "Техно", "Органика"] },
    { id: "color", question: "Цвета?", options: ["Нейтральные", "Яркие", "Тёмные"] },
  ];
}

export type ConceptGeneration = {
  concept: ThreeDConcept;
  /** Where the geometry that actually shipped came from. */
  source: "ai" | "procedural";
  /** 0–1 coherence/detail score of the shipped geometry. */
  score: number;
  /** Rendered primitive count after repeat and mirror expansion. */
  primitives: number;
  /** Human-readable notes about what happened, for the studio UI. */
  notes: string[];
};

/**
 * Text → geometry.
 *
 * Two independent attempts race for the result: a parametric generator seeded
 * from the prompt, and the model authoring primitives itself against the
 * geometry DSL. Both are validated and repaired, and the better one ships —
 * so a missing or failing AI provider degrades to a real model instead of an error.
 */
export async function generate3DModel(
  prompt: string,
  answers: { question: string; answer: string }[] = []
): Promise<ConceptGeneration> {
  const category = detectCategory(prompt);
  const baseline = withAnswers(buildFromPrompt(prompt), answers);
  const notes: string[] = [];

  if (!hasKey()) {
    return {
      concept: baseline,
      source: "procedural",
      score: scoreParts(baseline.parts),
      primitives: primitiveCount(baseline.parts),
      notes: ["Демо-режим: ключ AI не задан — параметрическая модель"],
    };
  }

  let geometry: Awaited<ReturnType<typeof generateAIGeometry>> = null;
  try {
    geometry = await generateAIGeometry({
      prompt,
      answers,
      baseline,
      category,
      request: chatJSON,
    });
  } catch (error) {
    console.warn("AI geometry unavailable", errorSummary(error));
  }

  const picked = pickBetterGeometry(baseline, geometry);
  if (geometry) {
    notes.push(
      picked.source === "ai"
        ? `AI-геометрия принята (оценка ${geometry.score} против ${picked.baseScore} у шаблона, проходов: ${geometry.passes})`
        : `AI-геометрия отклонена (оценка ${geometry.score} против ${picked.baseScore}) — оставлена параметрическая модель`
    );
    notes.push(...geometry.issues);
  }

  let concept = picked.concept;

  // Metadata is a separate, cheaper call — geometry never depends on it.
  try {
    const meta = normalize3DConcept(
      await chatJSON<unknown>(
        `You are Atrion, an engineering assistant. Return ONLY JSON metadata for a 3D concept.
The geometry already exists — do NOT return parts, structure or dimensions.
Answer in the user's language.
Fill: name, description, materials, equipment, requirements, assemblySteps,
costEstimate (currency KGS), advantages, disadvantages, risks, engineeringNotes, disclaimer.
Base the material quantities and costs on the stated dimensions.`,
        `Object: ${concept.name}
Request: ${prompt}
Dimensions: ${concept.dimensions.width} × ${concept.dimensions.depth} × ${concept.dimensions.height} м
Sections: ${(concept.structure ?? []).map((group) => `${group.label} (${group.partIds.length})`).join(", ")}
Clarifications:
${answers.map((item) => `- ${item.question}: ${item.answer}`).join("\n") || "- нет"}`
      )
    );

    concept = {
      ...concept,
      name: meta.name && meta.name !== "Untitled 3D Concept" ? meta.name : concept.name,
      description: meta.description || concept.description,
      materials: meta.materials.length ? meta.materials : concept.materials,
      equipment: meta.equipment.length ? meta.equipment : concept.equipment,
      requirements: meta.requirements.length ? meta.requirements : concept.requirements,
      assemblySteps: meta.assemblySteps.length ? meta.assemblySteps : concept.assemblySteps,
      costEstimate: meta.costEstimate.maximum ? meta.costEstimate : concept.costEstimate,
      advantages: meta.advantages.length ? meta.advantages : concept.advantages,
      disadvantages: meta.disadvantages.length ? meta.disadvantages : concept.disadvantages,
      risks: meta.risks.length ? meta.risks : concept.risks,
      engineeringNotes: meta.engineeringNotes.length
        ? meta.engineeringNotes
        : concept.engineeringNotes,
      disclaimer: meta.disclaimer || concept.disclaimer,
    };
  } catch (error) {
    notes.push("Метаданные сгенерированы локально");
    console.warn("3D metadata unavailable", errorSummary(error));
  }

  return {
    concept,
    source: picked.source,
    score: picked.source === "ai" ? picked.aiScore : picked.baseScore,
    primitives: primitiveCount(concept.parts),
    notes,
  };
}

export async function generate3DConcept(
  prompt: string,
  answers: { question: string; answer: string }[] = []
): Promise<ThreeDConcept> {
  return (await generate3DModel(prompt, answers)).concept;
}

function withAnswers(
  concept: ThreeDConcept,
  answers: { question: string; answer: string }[]
): ThreeDConcept {
  if (!answers.length) return concept;
  return {
    ...concept,
    description: `${concept.description} Уточнения: ${answers.map((item) => item.answer).join("; ")}.`,
  };
}

export async function chatAboutConcept(input: {
  message: string;
  prompt: string;
  concept: {
    name?: string;
    description?: string;
    parts?: { name: string }[];
    dimensions?: { width: number; height: number; depth: number };
  } | null;
}): Promise<{ reply: string; shouldRefine: boolean; refineInstruction?: string }> {
  const fallback = () => {
    const name = input.concept?.name || "модель";
    const lower = input.message.toLowerCase();
    if (/привет|здравств|hello|hi\b/i.test(lower)) {
      return {
        reply: `Привет. Я Atrion. Сейчас перед нами «${name}». Скажи, что изменить, или опиши новый объект.`,
        shouldRefine: false as boolean,
      };
    }
    if (/что это|расскажи|опиши|что за/i.test(lower)) {
      return {
        reply:
          input.concept?.description?.slice(0, 280) ||
          `Это концепт «${name}». Могу Explode или править по голосу.`,
        shouldRefine: false,
      };
    }
    const wantsEdit = /сделай|поменя|добав|убери|цвет|увелич|уменш|больше|меньше/i.test(lower);
    return {
      reply: wantsEdit
        ? `Ок, применяю к «${name}»: ${input.message.slice(0, 100)}`
        : `По «${name}» услышал. Уточни, что поменять — или спроси про модель.`,
      shouldRefine: wantsEdit,
      refineInstruction: wantsEdit ? input.message : undefined,
    };
  };

  if (!hasKey()) return fallback();

  try {
    const data = await chatJSON<{
      reply?: string;
      shouldRefine?: boolean;
      refineInstruction?: string;
    }>(
      `You are Atrion voice co-pilot (ChatGPT-style voice) for a 3D design studio.
Reply in the user's language. Keep reply SHORT for speech: 1-3 sentences, no markdown.
Discuss the current 3D concept. If user asks to change the model, shouldRefine=true and refineInstruction=clear edit.
If greeting/question only, shouldRefine=false.
Return JSON: {"reply":"...","shouldRefine":false,"refineInstruction":""}`,
      `Original prompt: ${input.prompt || "—"}
Current: ${
        input.concept
          ? JSON.stringify({
              name: input.concept.name,
              description: input.concept.description,
              dimensions: input.concept.dimensions,
              parts: input.concept.parts?.slice(0, 16).map((p) => p.name),
            })
          : "none"
      }
User said: ${input.message}`
    );

    const reply =
      typeof data.reply === "string" && data.reply.trim()
        ? data.reply.trim().slice(0, 500)
        : fallback().reply;
    return {
      reply,
      shouldRefine: Boolean(data.shouldRefine),
      refineInstruction:
        typeof data.refineInstruction === "string" && data.refineInstruction.trim()
          ? data.refineInstruction.trim().slice(0, 400)
          : data.shouldRefine
            ? input.message
            : undefined,
    };
  } catch (error) {
    return localFallback("voice chat", error, fallback);
  }
}

/**
 * Apply a natural-language edit to an existing model.
 *
 * "Сделай мне вместо этого башню" rebuilds from scratch; "добавь балкон" edits
 * the geometry in place. The edited parts are validated and only accepted when
 * they do not collapse the model — otherwise the local heuristic edit stands.
 */
export async function refine3DConcept(
  concept: ThreeDConcept,
  instruction: string,
  selectedPartId?: string | null
): Promise<ThreeDConcept> {
  const rebuild =
    /построй|замени на|вместо (этого|него)|новый объект|переделай в|сделай вместо/i.test(
      instruction
    ) && instruction.trim().length > 12;

  if (rebuild) {
    const rebuilt = await generate3DModel(instruction);
    return { ...rebuilt.concept, description: `${rebuilt.concept.description} · ${instruction}` };
  }

  const local = localRefine(concept, instruction, selectedPartId);
  if (!hasKey()) return local;

  const selected = selectedPartId
    ? concept.parts.find((item) => item.id === selectedPartId)
    : undefined;

  try {
    const result = await chatJSON<{ parts?: unknown; name?: unknown; description?: unknown }>(
      `You edit an existing 3D model made of primitives.
Return the COMPLETE parts list after the edit — every part that should remain, not a patch.
Keep untouched parts byte-identical. Keep the object standing on y = 0 and centred on x/z.
"size" is always the full bounding box [width, height, depth] — never a radius.
Available shapes: box, plane, cylinder, sphere, cone, pyramid, prism, wedge, torus, capsule, tube.
A part may carry "repeat": {"count":n,"step":[x,y,z]} and "mirror": "x" | "z" | "xz".
Answer in the user's language.
Return JSON: {"name":"...","description":"...","parts":[...]}`,
      `Model: ${concept.name}
Dimensions: ${concept.dimensions.width} × ${concept.dimensions.depth} × ${concept.dimensions.height} м
Edit requested: ${instruction}
${selected ? `The user has selected the part "${selected.name}" (id ${selected.id}) — apply the edit there unless the instruction says otherwise.` : "No part is selected — apply the edit where it makes sense."}

Current parts:
${JSON.stringify(
  concept.parts.map((item) => ({
    id: item.id,
    name: item.name,
    shape: item.shape,
    position: item.position,
    size: item.size,
    ...(item.rotation.some(Boolean) ? { rotation: item.rotation } : {}),
    color: item.color,
    material: item.material,
    role: item.role,
    group: item.group,
    ...(item.repeat ? { repeat: item.repeat } : {}),
    ...(item.mirror ? { mirror: item.mirror } : {}),
  }))
)}`
    );

    const targetMaxSize = Math.max(
      concept.dimensions.width,
      concept.dimensions.height,
      concept.dimensions.depth
    );
    const repaired = validateAndRepair(result?.parts, { targetMaxSize });

    // An edit that shreds the model is worse than no edit at all.
    if (repaired.parts.length >= 4 && repaired.score >= scoreParts(concept.parts) * 0.8) {
      return {
        ...concept,
        name:
          typeof result?.name === "string" && result.name.trim()
            ? result.name.trim().slice(0, 70)
            : concept.name,
        description:
          typeof result?.description === "string" && result.description.trim()
            ? result.description.trim().slice(0, 400)
            : `${concept.description} · ${instruction}`,
        parts: repaired.parts,
        structure: structureFromGroups(repaired.parts),
        dimensions: dimensionsOf(repaired.parts),
        source: "ai",
      };
    }
    return local;
  } catch (error) {
    return localFallback("3D refine", error, () => local);
  }
}

function normalize3DConcept(value: unknown): ThreeDConcept {
  if (!value || typeof value !== "object") return mock3DConcept("3D concept");
  const raw = value as Partial<ThreeDConcept>;
  const safeNumber = (n: unknown, fallback = 1) =>
    typeof n === "number" && Number.isFinite(n) ? Math.max(-80, Math.min(80, n)) : fallback;
  const safeMoney = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  const safeText = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;

  const parts = sanitizeParts(raw.parts);
  const partIds = new Set(parts.map((part) => part.id));
  const structure = Array.isArray(raw.structure)
    ? raw.structure
        .filter((item) => item && typeof item === "object")
        .slice(0, 20)
        .map((item, index) => ({
          id: safeText((item as { id?: unknown }).id, `group-${index + 1}`),
          label: safeText((item as { label?: unknown }).label, `Group ${index + 1}`),
          partIds: Array.isArray((item as { partIds?: unknown }).partIds)
            ? ((item as { partIds: unknown[] }).partIds.filter(
                (id): id is string => typeof id === "string" && partIds.has(id)
              ) as string[])
            : [],
        }))
        .filter((item) => item.partIds.length > 0)
    : [];

  const fallbackStructure = structure.length > 0 ? structure : structureFromGroups(parts);

  return {
    name: typeof raw.name === "string" ? raw.name : "Untitled 3D Concept",
    description:
      typeof raw.description === "string" ? raw.description : "AI-generated conceptual model.",
    units: raw.units && ["m", "cm", "mm"].includes(raw.units) ? raw.units : "m",
    dimensions: {
      width: Math.max(0.1, Math.abs(safeNumber(raw.dimensions?.width, 1))),
      height: Math.max(0.1, Math.abs(safeNumber(raw.dimensions?.height, 1))),
      depth: Math.max(0.1, Math.abs(safeNumber(raw.dimensions?.depth, 1))),
    },
    parts:
      parts.length > 0
        ? parts
        : mock3DConcept(safeText(raw.name, "3D concept")).parts,
    structure: fallbackStructure,
    materials: Array.isArray(raw.materials)
      ? raw.materials
          .filter((item) => item && typeof item === "object")
          .slice(0, 12)
          .map((item, index) => ({
            name: safeText(item.name, `Material ${index + 1}`),
            specification: safeText(item.specification, "Уточняется инженером"),
            estimatedQuantity: safeText(item.estimatedQuantity, "По расчёту"),
            reason: safeText(item.reason, "Конструктивный элемент"),
          }))
      : [],
    equipment: Array.isArray(raw.equipment)
      ? raw.equipment
          .filter((item) => item && typeof item === "object")
          .slice(0, 15)
          .map((item) => ({
            name: safeText(item.name, "Оборудование"),
            purpose: safeText(item.purpose, "Для сборки конструкции"),
            access:
              item.access === "rent" || item.access === "specialist"
                ? item.access
                : ("buy" as const),
          }))
      : [],
    requirements: Array.isArray(raw.requirements)
      ? raw.requirements.filter((item): item is string => typeof item === "string").slice(0, 15)
      : [],
    assemblySteps: Array.isArray(raw.assemblySteps)
      ? raw.assemblySteps.filter((item): item is string => typeof item === "string").slice(0, 12)
      : [],
    costEstimate: {
      currency: safeText(raw.costEstimate?.currency, "KGS"),
      minimum: safeMoney(raw.costEstimate?.minimum),
      maximum: safeMoney(raw.costEstimate?.maximum),
      breakdown: Array.isArray(raw.costEstimate?.breakdown)
        ? raw.costEstimate.breakdown
            .filter((item) => item && typeof item === "object")
            .slice(0, 15)
            .map((item) => ({
              item: safeText(item.item, "Материалы и работа"),
              quantity: safeText(item.quantity, "По расчёту"),
              estimatedCost: safeMoney(item.estimatedCost),
            }))
        : [],
      note: safeText(
        raw.costEstimate?.note,
        "Ориентировочная оценка. Уточните цены у местных поставщиков."
      ),
    },
    advantages: Array.isArray(raw.advantages)
      ? raw.advantages.filter((item): item is string => typeof item === "string").slice(0, 10)
      : [],
    disadvantages: Array.isArray(raw.disadvantages)
      ? raw.disadvantages.filter((item): item is string => typeof item === "string").slice(0, 10)
      : [],
    risks: Array.isArray(raw.risks)
      ? raw.risks
          .filter((item) => item && typeof item === "object")
          .slice(0, 12)
          .map((item) => ({
            risk: safeText(item.risk, "Неопределённый инженерный риск"),
            severity:
              item.severity === "Low" || item.severity === "High"
                ? item.severity
                : ("Medium" as const),
            mitigation: safeText(item.mitigation, "Проверить с квалифицированным инженером"),
          }))
      : [],
    engineeringNotes: Array.isArray(raw.engineeringNotes)
      ? raw.engineeringNotes.filter((item): item is string => typeof item === "string").slice(0, 12)
      : [],
    disclaimer:
      (typeof raw.disclaimer === "string" && raw.disclaimer) ||
      "Концептуальная модель. Размеры, материалы и нагрузки должен проверить квалифицированный инженер.",
  };
}

function mock3DConcept(prompt: string): ThreeDConcept {
  return buildFromPrompt(prompt);
}

function localRefine(
  concept: ThreeDConcept,
  instruction: string,
  selectedPartId?: string | null
): ThreeDConcept {
  const lower = instruction.toLowerCase();
  const scale =
    lower.includes("увелич") || lower.includes("больше") || lower.includes("30%")
      ? 1.2
      : lower.includes("уменш") || lower.includes("меньше")
        ? 0.85
        : 1;
  const wood = lower.includes("дерев") || lower.includes("wood");
  const parts = concept.parts.map((part) => {
    const targeted = !selectedPartId || part.id === selectedPartId;
    if (!targeted) return part;
    return {
      ...part,
      size: [part.size[0] * scale, part.size[1] * scale, part.size[2] * scale] as [
        number,
        number,
        number,
      ],
      material: wood ? "Дерево" : part.material,
      color: wood ? "#b45309" : part.color,
    };
  });
  return {
    ...concept,
    description: `${concept.description} · правка: ${instruction}`,
    parts,
  };
}
