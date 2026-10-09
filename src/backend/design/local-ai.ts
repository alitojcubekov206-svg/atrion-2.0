import {ASSETS} from "@/shared/interior/catalog";
import {compositionParts, compositionIssues, compositionSchema, parseComposition, settleComposition, type Composition} from "@/shared/design/composition";
import {check, DesignError, list, record, text} from "@/shared/design/validation";
import {dimensionsOf, structureFromGroups} from "@/shared/geometry";
import type {BriefAnswer, Clarification} from "@/shared/design/brief";
import type {LocalModelResult} from "@/shared/design/result";

export function localDesignEndpoint(env: Record<string, string | undefined> = process.env): string | null {
  if (!env.LOCAL_DESIGN_AI_URL) return null;
  const url = new URL(env.LOCAL_DESIGN_AI_URL);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new DesignError("Локальный AI должен слушать HTTP на loopback-адресе", 503, "LOCAL_AI_CONFIG");
  return url.origin;
}
export function parseCompositionRequest(raw: unknown) {
  const body = record(raw, "Запрос"), prompt = text(body.prompt, "Описание", 1500);
  const answers: BriefAnswer[] = list(body.answers ?? [], "Ответы", 12).map(v => {
    const a = record(v, "Ответ");
    return {questionId: text(a.questionId, "ID вопроса", 80), question: text(a.question, "Вопрос", 500), answer: text(a.answer, "Ответ", 500)};
  });
  check(prompt.length + answers.reduce((n, a) => n + a.answer.length + (a.question?.length ?? 0), 0) <= 6500, "Диалог слишком длинный");
  const previous = body.previous === undefined ? undefined : parseComposition(body.previous);
  check(!previous?.question, "Предыдущая сцена не завершена");
  return {prompt, answers, previous};
}

const SYSTEM = `You are Atrion, a text-to-3D scene designer. Understand the complete request, including multiple objects, counts, negation, colours, positions and spatial relationships. Never choose a stock scene by a keyword. Reply in Russian with JSON only.
The requested PLACE is part of the scene, not just a label. For a room/interior, create its floor and enclosing wall geometry at the requested dimensions, then its furniture inside those boundaries. A room with furniture must not become furniture floating in empty space. Use a cutaway: omit the ceiling and the two walls facing the viewer, and state that visibility choice. A standalone object or explicitly wall-free arrangement does not need a room. Design each layout from the request; never copy a fixed room plan.
FIRST decide action: "clarify" if key requirements are missing, "create" if the request is specific or the user said to decide yourself. For action="clarify" do NOT generate any nodes: nodes=[], question is your short question, options are 2-3 answers. For action="create", question="" and nodes contains the scene. A bare "дом" MUST yield action="clarify", nodes=[] and a question about rooms. Do not invent a house before learning what is needed.
Exact output fields: {"action":"clarify or create","title":"short title","question":"question or empty string","options":[],"assumptions":[],"limitations":[],"nodes":[{"name":"Russian name","shape":"primitive or catalog id","p":[x,y,z],"s":[width,height,depth],"r":[rx,ry,rz],"color":"#RRGGBB"}]}. Empty nodes when asking a question. Keep text fields brief.
If a significant ambiguity changes the result, ask ONE specific question with 2-3 short options; nodes must be []. Do not repeat answered questions. For a bare house request ask room program, floors, then dimensions unless given. When the user delegates decisions, choose reasonable defaults and list them in assumptions. Do not ask for cosmetic details unnecessarily.
When enough is known, question="", options=[]; design the COMPLETE requested scene. If editing, preserve every previous element not changed by the instruction. Include ALL previous elements in your output. No context exists beyond the supplied request, questions/answers and previous scene.
nodes is a composition, NOT a list of prefab scenes. Each node is a primitive or a single catalog item. Invent new objects from several primitives; do not substitute an unrelated known object. For unsupported detail, name the limitation explicitly. No photorealism or engineering claims.
Coordinates: metres, +Y up, +Z front, +X right. p=[x,y,z] is the CENTER of the object's bounding box. s=[width,height,depth] is FULL size, r=[x,y,z] in DEGREES. Ground is y=0, so floor-standing objects have center y=height/2. s must be positive. Each catalog node is one complete item, scaled to s; use catalog dimensions unless asked otherwise. Colors #RRGGBB. Each physical object appears once. No overlap between furniture; maintain room boundaries and access. Do not put a large solid box over an interior! Walls are thin boxes with gaps for doors/windows; floors are thin slabs. Omit roofs/ceilings when interiors must be visible. Name this choice in assumptions. Houses need internal rooms and requested furnishings. Do not add bedrooms to an office, walls around standalone products, or unrequested scene objects. No artificial part-count target. At most 96 nodes; finish the whole JSON.
Before answering, check each node's real meaning against the requested object. A matching adjective does not make different objects interchangeable. If the catalog lacks the requested shape, build it using primitives with correct proportions. Names must be descriptive Russian names, not catalog ids. Check quantities, spacing, grounding and every stated relationship. Assumptions are ONLY choices not specified by the user, not a repetition of their requirements.
Primitive shapes: box, sphere, cylinder (axis Y), cone (axis Y), pyramid, prism, wedge, torus, capsule, tube. A custom object may use several named nodes, e.g. supports and surface. A catalog item needs no extra primitive parts.
Catalog shapes are fixed: table_coffee, table_dining and desk_work have RECTANGULAR tops. Renaming or recolouring them cannot make a round table. A circular tabletop is a thin cylinder with supporting legs/base made from separate primitives. Likewise, choose geometry for the requested form of any other object, not just a similar catalog name.
Catalog (shape id: Russian name, width x height x depth in metres):
${ASSETS.map(a => `${a.id}: ${a.name}, ${a.width}x${a.height}x${a.depth}`).join("\n")}
FINAL CHECK BEFORE OUTPUT: Only nodes are rendered. Mentioning floors, walls, dimensions or shapes in title/assumptions DOES NOT create them. For a room, start nodes with a box floor slab spanning the requested width/depth, then two thin box walls, then place furniture within that floor. For a custom object, include its supporting components. For a clarification, nodes stays empty. Do not claim an element exists unless its geometry is in nodes.`;

/** One local CPU request at a time. A stopped/unavailable model never invokes a paid fallback. */
let active = false;
export async function composeWithLocalAI(raw: unknown, options: {signal?: AbortSignal; transport?: typeof fetch; endpoint?: string} = {}): Promise<LocalModelResult | Clarification> {
  const input = parseCompositionRequest(raw);
  const endpoint = options.endpoint ?? localDesignEndpoint();
  if (!endpoint) throw new DesignError("Локальная модель не подключена. Запустите npm run design:ai и укажите LOCAL_DESIGN_AI_URL=http://127.0.0.1:8081", 503, "LOCAL_AI_OFFLINE");
  if (active) throw new DesignError("Локальная модель уже обрабатывает запрос. Дождитесь результата.", 429, "LOCAL_AI_BUSY");
  active = true;
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(600_000)]) : AbortSignal.timeout(600_000);
  try {
    const messages = [{role: "system", content: SYSTEM}, {role: "user", content: JSON.stringify({request: input.prompt, dialogue: input.answers, previous: input.previous})}];
    async function request(): Promise<Composition> {
      const response = await (options.transport ?? fetch)(`${endpoint}/v1/chat/completions`, {
        method: "POST", redirect: "error", signal, headers: {"Content-Type": "application/json"},
        body: JSON.stringify({model: "atrion-local", temperature: .4, max_tokens: 6500, stream: false,
          chat_template_kwargs: {enable_thinking: false}, response_format: {type: "json_object", schema: compositionSchema},
          messages}),
      });
      if (!response.ok) throw new DesignError("Локальная модель недоступна или ещё загружается. Проверьте npm run design:ai.", 503, "LOCAL_AI_OFFLINE");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty response");
      const chunks: Uint8Array[] = []; let size = 0;
      try {while (true) {const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > 300_000) throw new Error("Response too large"); chunks.push(value);}}
      finally {await reader.cancel();}
      const envelope = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (envelope.choices?.[0]?.finish_reason !== "stop") throw new DesignError("Модель не закончила сцену. Сократите описание или разделите проект на части.", 422, "LOCAL_AI_INCOMPLETE");
      return parseComposition(JSON.parse(envelope.choices[0].message.content));
    }
    let composition = await request();
    if (composition.question) {
      if (input.answers.length >= 12) throw new DesignError("Слишком много уточнений. Соберите ответы в одно описание.", 422, "LOCAL_AI_DIALOGUE_LIMIT");
      return {kind: "clarification", source: "local-ai", question: {id: `ai-${input.answers.length + 1}`, text: composition.question, hint: "Можно ответить своими словами или поручить модели выбрать.", options: composition.options}, answers: input.answers, understood: composition.assumptions};
    }
    composition = settleComposition(composition);
    const issues = compositionIssues(composition);
    if (issues.length) {
      messages.push({role: "assistant", content: JSON.stringify(composition)}, {role: "user", content: `Correct your COMPLETE scene. The following geometric errors were measured: ${issues.join(" ")} Also compare each object's meaning to the original request, and fix substitutions. Preserve every correctly fulfilled requirement. Return the full corrected JSON, not a patch.`});
      composition = settleComposition(await request());
      if (composition.question) throw new DesignError("Модель не смогла исправить размещение. Уточните размеры или состав сцены.", 422, "LOCAL_AI_LAYOUT");
    }
    return compositionResult(composition);
  } catch (e) {
    if (e instanceof DesignError) throw e;
    if (signal.aborted) throw new DesignError("Обработка остановлена или превысила 10 минут. Попробуйте более короткий запрос.", 504, "LOCAL_AI_TIMEOUT");
    throw new DesignError("Локальная модель не вернула корректную сцену. Проверьте, что она запущена, и попробуйте уточнить описание.", 502, "LOCAL_AI_INVALID");
  } finally {active = false;}
}

export function compositionResult(composition: Composition): LocalModelResult {
  const parts = compositionParts(composition);
  return {kind: "model", source: "local-ai", composition, recognized: composition.nodes.map(n => n.name), missing: [...composition.limitations, ...compositionIssues(composition)],
    notes: [...composition.assumptions.map(a => `Принято при построении: ${a}`), "Сцену составила локальная текстовая модель. Проверьте размеры, количество, проходы и соответствие описанию. Это 3D-концепт, не BIM-проект."],
    concept: {name: composition.title, description: composition.title, source: "ai", units: "m", dimensions: dimensionsOf(parts), parts, structure: structureFromGroups(parts),
      materials: [], equipment: [], requirements: [], assemblySteps: [], costEstimate: {currency: "KGS", minimum: 0, maximum: 0, breakdown: [], note: "Не рассчитывалась"},
      advantages: [], disadvantages: [], risks: [], engineeringNotes: [], disclaimer: "AI-концепт требует проверки"}};
}
