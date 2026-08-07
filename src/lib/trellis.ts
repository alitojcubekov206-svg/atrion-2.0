import type { ThreeDConcept } from "@/lib/types";

export function getFalKey(): string | null {
  const raw = process.env.FAL_KEY?.trim() || process.env.FAL_API_KEY?.trim();
  if (!raw) return null;
  return raw.replace(/^["']|["']$/g, "").trim() || null;
}

export function isFalConfigured(): boolean {
  return Boolean(getFalKey());
}

export function isTrellisEnabled(): boolean {
  if (!isFalConfigured()) return false;
  return process.env.TRELLIS_ENABLED !== "false";
}

type FalFile = { url?: string };
type FalResult = {
  model_glb?: FalFile;
  detail?: string;
  error?: string;
};

/** Upload data:image/...;base64,... to fal storage → public URL */
export async function uploadImageToFal(imageDataUrl: string): Promise<string> {
  const key = getFalKey();
  if (!key) throw new Error("FAL_KEY is not set");

  if (imageDataUrl.startsWith("http://") || imageDataUrl.startsWith("https://")) {
    return imageDataUrl;
  }

  const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Нужен data:image/...;base64 URL");

  const contentType = match[1] || "image/png";
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > 8 * 1024 * 1024) {
    throw new Error("Картинка слишком большая (макс ~8MB)");
  }

  const response = await fetch("https://fal.media/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": contentType,
    },
    body: buffer,
  });

  const data = (await response.json().catch(() => ({}))) as {
    access_url?: string;
    url?: string;
    file_url?: string;
    detail?: string;
  };

  if (!response.ok) {
    // Fallback: some fal endpoints accept data URLs directly
    if (imageDataUrl.length < 1_500_000) return imageDataUrl;
    throw new Error(data.detail || `Fal upload HTTP ${response.status}`);
  }

  const url = data.access_url || data.url || data.file_url;
  if (!url) {
    if (imageDataUrl.length < 1_500_000) return imageDataUrl;
    throw new Error("Fal upload: URL missing");
  }
  return url;
}

/**
 * Image URL → Trellis 2 GLB via fal.ai
 * Auth: Authorization: Key $FAL_KEY
 */
export async function generateTrellisGlb(imageUrl: string): Promise<{
  url: string;
  needsClientBlob: boolean;
}> {
  const key = getFalKey();
  if (!key) throw new Error("FAL_KEY is not set");

  const response = await fetch("https://fal.run/fal-ai/trellis-2", {
    method: "POST",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageUrl,
      resolution: 1024,
      remesh: true,
      texture_size: 2048,
      decimation_target: 500000,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as FalResult;
  if (!response.ok) {
    throw new Error(
      data.detail || data.error || `Trellis/fal HTTP ${response.status}`
    );
  }

  const remoteUrl = data.model_glb?.url;
  if (!remoteUrl) throw new Error("Trellis model_glb.url missing");

  const file = await fetch(remoteUrl);
  if (!file.ok) throw new Error(`Trellis download failed (${file.status})`);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength < 100) throw new Error("Trellis GLB empty");

  if (buffer.byteLength > 4.5 * 1024 * 1024) {
    return { url: remoteUrl, needsClientBlob: true };
  }
  return {
    url: `data:model/gltf-binary;base64,${buffer.toString("base64")}`,
    needsClientBlob: false,
  };
}

export function attachMeshUrl(concept: ThreeDConcept, meshUrl: string): ThreeDConcept {
  return { ...concept, meshUrl };
}
