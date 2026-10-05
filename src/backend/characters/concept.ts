import OpenAI from "openai";
import { DesignError } from "../design/validation";
import { characterImageFormat, MAX_CHARACTER_IMAGE_BYTES } from "../../shared/characters";

export const IMAGE_TIMEOUT_MS = 150_000;
export const MAX_IMAGE_BYTES = MAX_CHARACTER_IMAGE_BYTES;
const MODELS = ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"] as const;

export function imageConfiguration(env: Record<string, string | undefined> = process.env) {
  // A text-provider key may belong to Groq or another compatible service.
  // Never send it to OpenAI when a custom text endpoint is configured.
  const officialTextEndpoint = !env.OPENAI_BASE_URL?.trim() ||
    /^https:\/\/api\.openai\.com\/v1\/?$/.test(env.OPENAI_BASE_URL.trim());
  const apiKey = env.OPENAI_IMAGE_API_KEY?.trim() ||
    (officialTextEndpoint ? env.OPENAI_API_KEY?.trim() : undefined);
  const model = env.OPENAI_IMAGE_MODEL?.trim() || MODELS[0];
  if (!MODELS.some((item) => item === model)) {
    throw new DesignError("Модель генерации изображений не настроена корректно", 503, "IMAGE_MODEL_NOT_CONFIGURED");
  }
  return { apiKey, model };
}

export function characterPrompt(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 10 || value.length > 1500) {
    throw new DesignError("Опишите персонажа: от 10 до 1500 символов", 400, "INVALID_CHARACTER_PROMPT");
  }
  return value.trim();
}

export function imageRequest(prompt: string, model: string) {
  return {
    model,
    n: 1,
    size: "1024x1536" as const,
    quality: "high" as const,
    background: "transparent" as const,
    output_format: "webp" as const,
    output_compression: 90,
    prompt: `Create a polished, highly detailed 2D character concept illustration from the brief below.
Honor the described identity, clothing, colors and art style. If no style is specified, use refined illustrated character art.
Show the entire character, front view, centered with generous margins; do not crop hair, hands or feet.
Use a relaxed symmetrical A-pose with arms separated from the torso and clearly readable joints.
Keep facial features, hair strands, clothing details and accessories clean and coherent.
Transparent background. No text, labels, diagram, bone overlay, contact sheet or multiple views.
This output is a single concept illustration for later layer preparation, not an already rigged model.
Character brief:\n${prompt}`,
  };
}

export function validateImagePayload(value: unknown, mime: unknown = "image/webp"): string {
  if (typeof value !== "string" || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
      value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new DesignError("Провайдер вернул некорректное или слишком большое изображение", 502, "INVALID_IMAGE_RESPONSE");
  }
  const bytes = Buffer.from(value, "base64");
  const validHeader = mime === "image/webp"
    ? bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
    : mime === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
      bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  if (bytes.length < 16 || bytes.length > MAX_IMAGE_BYTES || !validHeader) {
    throw new DesignError("Формат изображения не соответствует ответу провайдера", 502, "INVALID_IMAGE_RESPONSE");
  }
  return value;
}

type QuotaResult = {ok:true} | {ok:false;error:string;code:string};
type ConceptDependencies = {
  configured: boolean;
  reserve: () => Promise<QuotaResult>;
  refund: () => Promise<void>;
  generate: (prompt: string, signal?: AbortSignal) => Promise<{mime:unknown;base64:unknown}>;
};

export async function createCharacterConcept(input: unknown, deps: ConceptDependencies, signal?: AbortSignal) {
  const prompt = characterPrompt(input);
  if (!deps.configured) throw new DesignError("Сервис генерации рисунков ещё не настроен на сервере", 503, "IMAGE_PROVIDER_NOT_CONFIGURED");
  if(signal?.aborted)throw new DesignError("Генерация отменена",499,"IMAGE_GENERATION_CANCELLED");
  const quota = await deps.reserve();
  if (!quota.ok) throw new DesignError(quota.error, 429, quota.code);
  try {
    signal?.throwIfAborted();
    const generated = await deps.generate(prompt, signal);
    const format = characterImageFormat(generated?.mime);
    if (!format) throw new DesignError("Провайдер вернул неизвестный формат изображения", 502, "INVALID_IMAGE_RESPONSE");
    const base64 = validateImagePayload(generated.base64, format.mime);
    signal?.throwIfAborted();
    return {stage:"concept" as const, rigReady:false as const, image:{mime:format.mime, base64}};
  } catch (error) {
    await deps.refund();
    if (error instanceof DesignError) throw error;
    if (signal?.aborted) throw new DesignError("Генерация отменена", 499, "IMAGE_GENERATION_CANCELLED");
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "moderation_blocked" || code === "content_policy_violation") {
      throw new DesignError("Провайдер отклонил описание. Измените запрос.", 422, "IMAGE_PROMPT_REJECTED");
    }
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      throw new DesignError("Генерация заняла слишком много времени. Квота возвращена.", 504, "IMAGE_GENERATION_TIMEOUT");
    }
    // Provider errors can contain credentials or the user's prompt. Return neither.
    throw new DesignError("Сервис не вернул рисунок. Квота возвращена; попробуйте позже.", 502, "IMAGE_GENERATION_FAILED");
  }
}

export function openAIImageGenerator(config: ReturnType<typeof imageConfiguration>) {
  return async (prompt: string, signal?: AbortSignal) => {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: "https://api.openai.com/v1",
      maxRetries: 0,
      timeout: IMAGE_TIMEOUT_MS,
    });
    const result = await client.images.generate(imageRequest(prompt, config.model), {signal});
    return {mime:"image/webp" as const,base64:result.data?.[0]?.b64_json};
  };
}
