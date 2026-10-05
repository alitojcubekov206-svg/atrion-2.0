import { DesignError } from "../design/validation";
import { imageConfiguration, openAIImageGenerator, IMAGE_TIMEOUT_MS, MAX_IMAGE_BYTES } from "./concept";

const FLUX_MODEL = "@cf/black-forest-labs/flux-1-schnell";
export const MAX_IMAGE_RESPONSE_BYTES = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 16_384;

export function characterImageConfiguration(env: Record<string, string | undefined> = process.env) {
  const provider = env.CHARACTER_IMAGE_PROVIDER?.trim() || "cloudflare";
  if (provider === "openai") return {provider, ...imageConfiguration(env)} as const;
  if (provider !== "cloudflare") {
    throw new DesignError("Неизвестный сервис генерации рисунков", 503, "IMAGE_PROVIDER_NOT_CONFIGURED");
  }
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (accountId && !/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new DesignError("Аккаунт Cloudflare настроен некорректно", 503, "IMAGE_PROVIDER_NOT_CONFIGURED");
  }
  return {provider, accountId, apiKey:env.CLOUDFLARE_API_TOKEN?.trim(), model:FLUX_MODEL} as const;
}

type ImageConfiguration = ReturnType<typeof characterImageConfiguration>;
type CloudflareConfiguration = Extract<ImageConfiguration, {provider:"cloudflare"}>;

/** Only non-secret capabilities cross the HTTP boundary. Presence is not a live credential check. */
export function characterImageStatus(config: ImageConfiguration) {
  return {
    configured:Boolean(config.apiKey && (config.provider === "openai" || config.accountId)),
    provider:config.provider,
    imageMime:config.provider === "cloudflare" ? "image/jpeg" as const : "image/webp" as const,
    stage:"concept" as const,
    rigReady:false as const,
  };
}

export function cloudflareImageRequest(prompt: string) {
  // FLUX accepts at most 2048 characters including this prefix. User input is capped at 1500.
  return {steps:4, prompt:`One original character, ENTIRE BODY from hair to soles inside frame, white margins above head and below feet. Front view, symmetrical A-pose, arms extended diagonally outward, visible elbows and open hands separated from torso. Legs apart, both feet visible. Figure fills 80% of canvas height. Detailed illustration, plain pure white background, no shadows, no text or props. Honor the brief: ${prompt}`};
}

async function readImageResponse(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_IMAGE_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new DesignError("Ответ генератора слишком большой",502,"INVALID_IMAGE_RESPONSE");
  }
  if (!response.body) throw new DesignError("Генератор вернул пустой ответ",502,"INVALID_IMAGE_RESPONSE");
  const reader=response.body.getReader();
  const decoder=new TextDecoder("utf-8",{fatal:true});
  let size=0,raw="";
  try {
    while (true) {
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_IMAGE_RESPONSE_BYTES){await reader.cancel();throw new DesignError("Ответ генератора слишком большой",502,"INVALID_IMAGE_RESPONSE");}
      raw+=decoder.decode(value,{stream:true});
    }
    return JSON.parse(raw+decoder.decode());
  } finally {
    await reader.cancel().catch(()=>undefined);
    reader.releaseLock();
  }
}

export function cloudflareImageGenerator(config: CloudflareConfiguration, transport: typeof fetch = fetch, timeoutMs=IMAGE_TIMEOUT_MS) {
  return async (prompt: string, signal?: AbortSignal) => {
    if (!characterImageStatus(config).configured) {
      throw new DesignError("Cloudflare ещё не настроен на сервере",503,"IMAGE_PROVIDER_NOT_CONFIGURED");
    }
    const timeout=new AbortController();
    const timer=setTimeout(()=>timeout.abort(),timeoutMs);
    const requestSignal=signal?AbortSignal.any([signal,timeout.signal]):timeout.signal;
    try {
      requestSignal.throwIfAborted();
      const response=await transport(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${FLUX_MODEL}`,{
        method:"POST",headers:{Authorization:`Bearer ${config.apiKey}`,"Content-Type":"application/json"},
        body:JSON.stringify(cloudflareImageRequest(prompt)),signal:requestSignal,redirect:"error",cache:"no-store",
      });
      if (!response.ok) {
        await response.body?.cancel();
        if(response.status===429)throw new DesignError("Лимит Cloudflare достигнут. Квота Atrion возвращена; попробуйте позже.",429,"IMAGE_PROVIDER_LIMIT_REACHED");
        if(response.status===401||response.status===403)throw new DesignError("Cloudflare отклонил доступ. Проверьте серверный токен и аккаунт.",503,"IMAGE_PROVIDER_AUTH_FAILED");
        throw new DesignError("Cloudflare не вернул рисунок. Квота Atrion возвращена.",502,"IMAGE_GENERATION_FAILED");
      }
      const data=await readImageResponse(response);
      if(!data||typeof data!=="object"||!("success" in data)||data.success!==true||!("result" in data)||
          !data.result||typeof data.result!=="object"||!("image" in data.result)) {
        throw new DesignError("Cloudflare вернул некорректный ответ",502,"INVALID_IMAGE_RESPONSE");
      }
      return {mime:"image/jpeg" as const,base64:data.result.image};
    } catch(error) {
      if(timeout.signal.aborted&&!signal?.aborted)throw new DesignError("Генерация заняла слишком много времени. Квота Atrion возвращена.",504,"IMAGE_GENERATION_TIMEOUT");
      throw error;
    } finally {clearTimeout(timer);}
  };
}

export function characterImageGenerator(config: ImageConfiguration) {
  return config.provider === "cloudflare" ? cloudflareImageGenerator(config) : openAIImageGenerator(config);
}
