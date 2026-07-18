import OpenAI from "openai";
import type { Blueprint, InterviewQuestion, ModelPart, ThreeDConcept } from "./types";

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

  const data = await chatJSON<unknown>(
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

// ---------- 3D Concept Studio ----------

export async function generate3DInterview(prompt: string): Promise<InterviewQuestion[]> {
  if (!hasKey()) return mock3DInterview();

  const data = await chatJSON<{ questions: InterviewQuestion[] }>(
    `You are an industrial designer preparing a conceptual 3D model.
Ask exactly 6 concise, project-specific questions before designing.
Questions must clarify dimensions, intended use/load, installation environment,
preferred materials, budget, available equipment or specialists, and other critical unknowns.
Provide 3-4 practical options per question. Respond in the user's language.
Return JSON: {"questions":[{"id":"q1","question":"...","options":["..."]}]}`,
    `Object requested by the user: ${prompt}`
  );

  if (!data || typeof data !== "object" || !("questions" in data)) {
    return mock3DInterview();
  }
  const rawQuestions = (data as { questions?: unknown }).questions;
  if (!Array.isArray(rawQuestions)) return mock3DInterview();
  const questions = rawQuestions
    .filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.question === "string" &&
        Array.isArray(item.options)
    )
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      question: item.question,
      options: item.options.filter((option): option is string => typeof option === "string").slice(0, 4),
    }))
    .filter((item) => item.options.length > 0);
  return questions.length > 0 ? questions : mock3DInterview();
}

function mock3DInterview(): InterviewQuestion[] {
  return [
    { id: "dimensions", question: "Какие примерные размеры нужны?", options: ["Компактный", "Средний", "Крупный", "Укажу своими словами"] },
    { id: "usage", question: "Для чего и кем будет использоваться объект?", options: ["Людьми", "Транспортом", "Для хранения", "Другое назначение"] },
    { id: "location", question: "Где объект будет установлен?", options: ["В помещении", "На улице", "Над водой", "Место пока не выбрано"] },
    { id: "material", question: "Какие материалы предпочтительны?", options: ["Металл", "Дерево", "Бетон", "Пусть AI подберёт"] },
    { id: "budget", question: "Какой ориентировочный бюджет?", options: ["Минимальный", "Средний", "Премиальный", "Бюджет пока неизвестен"] },
    { id: "equipment", question: "Какое оборудование доступно?", options: ["Только ручной инструмент", "Сварка и электроинструмент", "Мастерская", "Будут работать специалисты"] },
  ];
}

export async function generate3DConcept(
  prompt: string,
  answers: { question: string; answer: string }[] = []
): Promise<ThreeDConcept> {
  if (!hasKey()) return mock3DConcept(prompt);

  const result = await chatJSON<unknown>(
    `You are Atrion 3D Studio, a conceptual industrial designer.
Turn the user's idea into a simple 3D concept assembled from at most 24 primitives.
This is visualization only, never construction-ready engineering.
Use the same language as the user. Return only valid JSON.

Shape rules:
- shape is "box" or "cylinder"
- position, size and rotation are arrays of exactly 3 finite numbers
- rotation values are radians
- box size means [width, height, depth]
- cylinder size means [radius, height, radius]
- use a valid six-digit hex color
- keep the whole model centered near [0,0,0] and dimensions between 0.1 and 20

JSON shape:
{
  "name": "...",
  "description": "...",
  "units": "m",
  "dimensions": {"width": 1, "height": 1, "depth": 1},
  "parts": [{
    "id": "part-1", "name": "...", "shape": "box",
    "position": [0,0,0], "size": [1,1,1], "rotation": [0,0,0],
    "color": "#64748b", "material": "...", "quantity": 1
  }],
  "materials": [{
    "name": "...", "specification": "...", "estimatedQuantity": "...", "reason": "..."
  }],
  "equipment": [{"name":"...","purpose":"...","access":"buy"}],
  "requirements": ["site survey, permits, measurements, skills or specialists needed"],
  "assemblySteps": ["..."],
  "costEstimate": {
    "currency": "KGS", "minimum": 0, "maximum": 0,
    "breakdown": [{"item":"...","quantity":"...","estimatedCost":0}],
    "note": "Approximate market estimate; verify with local suppliers."
  },
  "advantages": ["..."],
  "disadvantages": ["..."],
  "risks": [{"risk":"...","severity":"High","mitigation":"..."}],
  "engineeringNotes": ["..."],
  "disclaimer": "Concept only. Dimensions and loads must be verified by a qualified engineer."
}`,
    `Create a detailed 3D concept for: ${prompt}

Discovery answers:
${answers.map((item) => `- ${item.question}: ${item.answer}`).join("\n")}

Include realistic part quantities, required tools/equipment, prerequisites, 5-10 ordered
assembly steps, advantages, disadvantages, risks and a rough cost range in Kyrgyz som (KGS).
Never claim that the model is structurally certified.`
  );

  return normalize3DConcept(result);
}

function normalize3DConcept(value: unknown): ThreeDConcept {
  if (!value || typeof value !== "object") return mock3DConcept("3D concept");
  const raw = value as Partial<ThreeDConcept>;
  const safeNumber = (n: unknown, fallback = 1) =>
    typeof n === "number" && Number.isFinite(n) ? Math.max(-20, Math.min(20, n)) : fallback;
  const safeMoney = (n: unknown) =>
    typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  const safeText = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;
  const vector = (v: unknown, fallback: [number, number, number]): [number, number, number] => {
    if (!Array.isArray(v) || v.length !== 3) return fallback;
    return [safeNumber(v[0], fallback[0]), safeNumber(v[1], fallback[1]), safeNumber(v[2], fallback[2])];
  };

  const sourceParts = Array.isArray(raw.parts)
    ? raw.parts.filter(
        (part): part is ModelPart => Boolean(part && typeof part === "object")
      )
    : [];
  const parts = sourceParts.slice(0, 24).map((part, index) => ({
    id: safeText(part.id, `part-${index + 1}`),
    name: safeText(part.name, `Part ${index + 1}`),
    shape: part.shape === "cylinder" ? ("cylinder" as const) : ("box" as const),
    position: vector(part.position, [0, 0, 0]),
    size: vector(part.size, [1, 1, 1]).map((n) => Math.max(0.05, Math.abs(n))) as [number, number, number],
    rotation: vector(part.rotation, [0, 0, 0]),
    color:
      typeof part.color === "string" && /^#[0-9a-f]{6}$/i.test(part.color)
        ? part.color
        : "#7c6cff",
    material: safeText(part.material, "Unspecified"),
    quantity: Math.max(1, Math.round(safeNumber(part.quantity, 1))),
  }));

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
  return {
    name: prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt,
    description: "Концептуальная модульная конструкция, созданная Atrion 3D Studio.",
    units: "m",
    dimensions: { width: 6, height: 2.5, depth: 2 },
    parts: [
      { id: "deck", name: "Основная платформа", shape: "box", position: [0, 0.8, 0], size: [6, 0.25, 2], rotation: [0, 0, 0], color: "#64748b", material: "Конструкционная сталь", quantity: 1 },
      { id: "support-1", name: "Левая опора", shape: "box", position: [-2.3, -0.1, 0], size: [0.35, 1.8, 1.6], rotation: [0, 0, 0], color: "#334155", material: "Железобетон", quantity: 1 },
      { id: "support-2", name: "Правая опора", shape: "box", position: [2.3, -0.1, 0], size: [0.35, 1.8, 1.6], rotation: [0, 0, 0], color: "#334155", material: "Железобетон", quantity: 1 },
      { id: "rail-1", name: "Ограждение", shape: "box", position: [0, 1.25, -0.9], size: [6, 0.08, 0.08], rotation: [0, 0, 0], color: "#4dd6ff", material: "Оцинкованная сталь", quantity: 2 },
      { id: "rail-2", name: "Ограждение", shape: "box", position: [0, 1.25, 0.9], size: [6, 0.08, 0.08], rotation: [0, 0, 0], color: "#4dd6ff", material: "Оцинкованная сталь", quantity: 2 },
    ],
    materials: [
      { name: "Конструкционная сталь", specification: "S355, антикоррозионное покрытие", estimatedQuantity: "По расчёту инженера", reason: "Основные несущие элементы" },
      { name: "Железобетон", specification: "Класс не ниже C30/37", estimatedQuantity: "По расчёту фундамента", reason: "Опоры конструкции" },
    ],
    equipment: [
      { name: "Сварочный аппарат", purpose: "Соединение стальных элементов", access: "specialist" },
      { name: "Подъёмное оборудование", purpose: "Монтаж платформы и опор", access: "rent" },
      { name: "Измерительный инструмент", purpose: "Разметка и контроль геометрии", access: "buy" },
    ],
    requirements: [
      "Точные замеры места установки",
      "Исследование грунта и основания",
      "Расчёт нагрузок квалифицированным инженером",
      "Согласования и разрешения местных органов",
      "Бригада со сварочными и монтажными допусками",
    ],
    assemblySteps: ["Подготовить основание", "Установить опоры", "Смонтировать платформу", "Установить ограждения"],
    costEstimate: {
      currency: "KGS",
      minimum: 250000,
      maximum: 650000,
      breakdown: [
        { item: "Металл и крепёж", quantity: "По рабочему расчёту", estimatedCost: 180000 },
        { item: "Бетон и основание", quantity: "По геологии участка", estimatedCost: 120000 },
        { item: "Работа и аренда техники", quantity: "1 проект", estimatedCost: 200000 },
      ],
      note: "Грубая ориентировочная оценка. Цена зависит от размеров, участка и поставщиков.",
    },
    advantages: ["Модульная сборка", "Ремонтопригодность", "Защищённые ограждения"],
    disadvantages: ["Нужна защита металла от коррозии", "Требуется спецтехника", "Стоимость зависит от основания"],
    risks: [
      { risk: "Недостаточная несущая способность", severity: "High", mitigation: "Выполнить расчёт нагрузок и испытания" },
      { risk: "Просадка основания", severity: "High", mitigation: "Провести геологическое исследование" },
      { risk: "Коррозия металла", severity: "Medium", mitigation: "Нанести защитное покрытие и проводить осмотры" },
    ],
    engineeringNotes: ["Проверить расчётные нагрузки", "Уточнить геологию основания", "Предусмотреть защиту от коррозии"],
    disclaimer: "Концептуальная модель. Не использовать для строительства без расчётов и проверки квалифицированным инженером.",
  };
}
