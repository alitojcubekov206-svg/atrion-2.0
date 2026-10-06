/**
 * Text → reference picture for image-to-3D.
 *
 * Cloudflare Workers AI runs FLUX.1 [schnell] inside the account's free daily
 * allocation. The picture is only an intermediate: the browser hands it to a
 * free image-to-3D Space, so it is framed for that — one object, centred, on a
 * plain background.
 */

const CLOUDFLARE_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export function imageProviderConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.CLOUDFLARE_API_TOKEN?.trim() && env.CLOUDFLARE_ACCOUNT_ID?.trim());
}

/** Wrap a subject so the picture suits image-to-3D: one object, whole, on white. */
export function referenceImagePrompt(subject: string): string {
  return `${subject.trim()}, single subject, full body, whole object fully in frame, centered, plain white background, 3D render, soft even studio lighting, three-quarter front view, no text, no shadow`;
}

export async function generateReferenceImage(
  subject: string,
  options: { signal?: AbortSignal; seed?: number } = {}
): Promise<Buffer> {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!token || !account) throw new Error("Image provider is not configured");
  if (!/^[a-f0-9]{32}$/i.test(account)) throw new Error("Invalid Cloudflare account configuration");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${CLOUDFLARE_IMAGE_MODEL}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: referenceImagePrompt(subject).slice(0, 2048),
        steps: 4,
        ...(options.seed !== undefined ? { seed: options.seed } : {}),
      }),
      signal: options.signal,
    }
  );
  if (!res.ok) throw new Error(`Image provider responded ${res.status}`);
  const body = (await res.json()) as { result?: { image?: unknown }; image?: unknown };
  const image = body.result?.image ?? body.image;
  if (typeof image !== "string" || !image) throw new Error("Image provider returned no image");
  return Buffer.from(image, "base64");
}
