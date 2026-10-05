export type CharacterImageProvider = "cloudflare" | "openai";
export type CharacterImageMime = "image/jpeg" | "image/webp";

export const MAX_CHARACTER_IMAGE_BYTES = 3 * 1024 * 1024;
export const CHARACTER_PROVIDER_LABELS: Record<CharacterImageProvider, string> = {
  cloudflare: "Cloudflare · FLUX.1 Schnell",
  openai: "OpenAI Image API",
};

export function characterImageFormat(mime: unknown) {
  if (mime === "image/jpeg") return {mime, extension: "jpg", label: "JPEG"} as const;
  if (mime === "image/webp") return {mime, extension: "webp", label: "WebP"} as const;
  return undefined;
}
