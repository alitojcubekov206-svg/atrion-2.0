/**
 * Free "realistic" 3D: text → picture → textured mesh, run from the visitor's
 * browser.
 *
 * The block generator draws everything with primitives, which cannot express a
 * face, hair or a dress. Here the picture comes from our server (Cloudflare's
 * free image model) or, failing that, from the public FLUX demo on Hugging
 * Face; the mesh comes from the public TRELLIS demo there. Both demos run on
 * ZeroGPU, and because the browser calls it directly, every visitor spends
 * their own free daily GPU allowance (about one model a day without a Hugging
 * Face account) — nothing is billed to Atrion.
 *
 * Browser only: import it lazily from a client component.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Client, handle_file } from "@gradio/client";
import { dimensionsOf, groundParts, structureFromGroups } from "@/shared/geometry";
import type { ModelPart, ThreeDConcept } from "@/shared/types";

/** One TRELLIS call: background-free picture in, GLB out, 120 s of GPU requested. */
const TRELLIS_SPACE = "trellis-community/TRELLIS";
/** Picture fallback when our server has none; a few seconds of the visitor's GPU time. */
const FLUX_SPACE = "black-forest-labs/FLUX.1-schnell";
const HF_TOKEN_KEY = "atrion_hf_token";
/** Texture edge in the saved model — enough for a figure, small enough to store. */
const TEXTURE_SIZE = 1024;

export type RealisticStatus = {
  stage: "image" | "queue" | "model" | "convert";
  message: string;
  /** The picture the model is being built from, once it exists. */
  imageUrl?: string;
};

/** The free GPU allowance for today is spent. */
export class RealisticQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RealisticQuotaError";
  }
}

/* ---------------- optional Hugging Face token ---------------- */

/**
 * A free Hugging Face account raises the daily allowance (to ~5 GPU minutes).
 * The token stays in this browser and only goes to Hugging Face.
 */
export function savedHfToken(): `hf_${string}` | null {
  try {
    const value = window.localStorage.getItem(HF_TOKEN_KEY)?.trim();
    return value && value.startsWith("hf_") ? (value as `hf_${string}`) : null;
  } catch {
    return null;
  }
}

export function saveHfToken(token: string | null): void {
  try {
    if (token && token.trim().startsWith("hf_")) window.localStorage.setItem(HF_TOKEN_KEY, token.trim());
    else window.localStorage.removeItem(HF_TOKEN_KEY);
  } catch {
    // Private mode or blocked storage: the token just isn't remembered.
  }
}

/* ---------------- text → picture ---------------- */

/** A picture to build from: bytes we hold, or a file already on a Space. */
type Picture = { input: Blob | string; previewUrl: string };

function token(): { hf_token: `hf_${string}` } | Record<string, never> {
  const saved = savedHfToken();
  return saved ? { hf_token: saved } : {};
}

function quotaError(text: string): RealisticQuotaError | null {
  return /quota/i.test(text) ? new RealisticQuotaError(quotaMessage(text)) : null;
}

async function referencePicture(
  prompt: string,
  answers: { question: string; answer: string }[],
  signal?: AbortSignal
): Promise<Picture> {
  // 1. Our server: the request rewritten into English, and a picture from
  //    Cloudflare's free allocation when it is configured.
  let subject = prompt;
  try {
    const res = await fetch("/api/3d/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, answers }),
      signal,
    });
    if (res.ok) {
      const data = (await res.json()) as { subject?: string; image?: string | null };
      if (data.subject) subject = data.subject;
      if (data.image?.startsWith("data:image/")) {
        const blob = await (await fetch(data.image)).blob();
        return { input: blob, previewUrl: URL.createObjectURL(blob) };
      }
    }
  } catch (error) {
    if (signal?.aborted) throw error;
  }

  // 2. The public FLUX demo, on the visitor's own free GPU allowance.
  const client = await Client.connect(FLUX_SPACE, token());
  try {
    const result = await client.predict<[{ url?: string } | null, number]>("/infer", {
      prompt: `${subject}, single subject, full body, whole object in frame, centered, plain white background, 3D render, soft studio lighting, no text`,
      seed: 0,
      randomize_seed: true,
      width: 768,
      height: 768,
      num_inference_steps: 4,
    });
    const url = result.data?.[0]?.url;
    if (!url) throw new Error("Демо FLUX не вернуло изображение");
    // TRELLIS downloads the file itself, so no cross-origin fetch is needed here.
    return { input: url, previewUrl: url };
  } catch (error) {
    const text = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
    throw quotaError(text) ?? (error instanceof Error ? error : new Error(text));
  }
}

/* ---------------- picture → GLB on the free GPU ---------------- */

function quotaMessage(text: string): string {
  const wait = text.match(/(\d+):(\d+):(\d+)/);
  const when = wait ? ` Попробуйте через ${Number(wait[1])} ч ${Number(wait[2])} мин.` : "";
  return `Бесплатный лимит реалистичных моделей на сегодня исчерпан.${when}`;
}

async function imageTo3D(
  image: Blob | string,
  options: { signal?: AbortSignal; onStatus: (status: RealisticStatus) => void; imageUrl: string }
): Promise<ArrayBuffer> {
  const client = await Client.connect(TRELLIS_SPACE, { ...token(), events: ["data", "status"] });

  // The demo keeps per-visitor files in a session folder created on page load.
  await client.predict("/start_session", {}).catch(() => undefined);
  // Background removal runs on CPU and costs no GPU allowance.
  const prepared = await client.predict<unknown[]>("/preprocess_image", { image: handle_file(image) });
  const preparedImage = prepared.data?.[0];
  if (!preparedImage) throw new Error("Демо не приняло изображение");

  const job = client.submit("/generate_and_extract_glb", {
    image: preparedImage,
    multiimages: [],
    seed: Math.floor(Math.random() * 100_000),
    ss_guidance_strength: 7.5,
    ss_sampling_steps: 12,
    slat_guidance_strength: 3,
    slat_sampling_steps: 12,
    multiimage_algo: "stochastic",
    mesh_simplify: 0.95,
    texture_size: TEXTURE_SIZE,
  });
  options.signal?.addEventListener("abort", () => void job.cancel(), { once: true });

  for await (const message of job) {
    if (message.type === "status") {
      if (message.stage === "pending") {
        const position = typeof message.position === "number" ? message.position + 1 : null;
        options.onStatus({
          stage: "queue",
          imageUrl: options.imageUrl,
          message: position ? `В очереди бесплатного GPU: место ${position}` : "Ждём бесплатный GPU…",
        });
      } else if (message.stage === "generating") {
        options.onStatus({ stage: "model", imageUrl: options.imageUrl, message: "Строим 3D-модель… (около минуты)" });
      } else if (message.stage === "error") {
        const text = `${message.title ?? ""} ${typeof message.message === "string" ? message.message : ""}`;
        throw quotaError(text) ?? new Error(text.trim() || "Демо вернуло ошибку");
      }
    } else if (message.type === "data") {
      const outputs = message.data as ({ url?: string } | null)[];
      const glb = outputs?.[1]?.url ?? outputs?.[2]?.url;
      if (!glb) throw new Error("Демо не вернуло GLB");
      const res = await fetch(glb, { signal: options.signal });
      if (!res.ok) throw new Error(`Не удалось скачать модель (${res.status})`);
      return await res.arrayBuffer();
    }
  }
  throw new Error("Демо закрыло соединение без результата");
}

/* ---------------- GLB → studio parts ---------------- */

/** The image bytes a glTF texture points to, straight from the GLB binary. */
function glbImages(buffer: ArrayBuffer): { json: GltfJson; image: (index: number) => Blob | null } {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("Это не GLB");
  let offset = 12;
  let json: GltfJson = {};
  let bin: Uint8Array | null = null;
  while (offset + 8 <= buffer.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const chunk = new Uint8Array(buffer, offset + 8, length);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk)) as GltfJson;
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  return {
    json,
    image: (index) => {
      const entry = json.images?.[index];
      const bufferView = entry?.bufferView !== undefined ? json.bufferViews?.[entry.bufferView] : undefined;
      if (!entry || !bufferView || !bin) return null;
      const start = bufferView.byteOffset ?? 0;
      return new Blob([bin.slice(start, start + bufferView.byteLength)], { type: entry.mimeType ?? "image/png" });
    },
  };
}

type GltfJson = {
  images?: { bufferView?: number; mimeType?: string }[];
  bufferViews?: { byteOffset?: number; byteLength: number }[];
  textures?: { source?: number }[];
};

/** Re-encode a texture as a JPEG data URL, in its original orientation. */
async function textureDataUrl(blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = Math.min(TEXTURE_SIZE, image.naturalWidth || TEXTURE_SIZE);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = Math.round((size * (image.naturalHeight || size)) / (image.naturalWidth || size));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const round = (digits: number) => {
  const k = 10 ** digits;
  return (n: number) => Math.round(n * k) / k;
};

/**
 * Turn the GLB into mesh parts: world transforms baked in, scaled so its
 * largest side matches `targetSize` metres, standing on y = 0.
 */
export async function glbToParts(buffer: ArrayBuffer, targetSize: number): Promise<ModelPart[]> {
  const gltf: GLTF = await new GLTFLoader().parseAsync(buffer, "");
  const { json, image } = glbImages(buffer);
  gltf.scene.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh);
  });
  if (!meshes.length) throw new Error("В модели нет геометрии");

  const box = new THREE.Box3().setFromObject(gltf.scene);
  const extent = box.getSize(new THREE.Vector3());
  const scale = targetSize / Math.max(extent.x, extent.y, extent.z, 1e-6);
  const p4 = round(4);
  const p3 = round(3);

  const parts: ModelPart[] = [];
  for (const [i, mesh] of meshes.entries()) {
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.scale(scale, scale, scale);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();

    const position = Array.from(geometry.getAttribute("position").array as ArrayLike<number>, p4);
    const normal = Array.from(geometry.getAttribute("normal").array as ArrayLike<number>, p3);
    const uvAttr = geometry.getAttribute("uv");
    const uv = uvAttr ? Array.from(uvAttr.array as ArrayLike<number>, p4) : undefined;
    const index = geometry.getIndex() ? Array.from(geometry.getIndex()!.array as ArrayLike<number>) : undefined;

    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    let texture: string | undefined;
    if (material?.map && uv) {
      const link = gltf.parser.associations.get(material.map) as { textures?: number } | undefined;
      const source = link?.textures !== undefined ? json.textures?.[link.textures]?.source : 0;
      const blob = image(source ?? 0);
      if (blob) texture = await textureDataUrl(blob);
    }

    // Vertices are baked at real size; position/size describe the bounding box.
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    for (let v = 0; v < position.length; v += 3) {
      position[v] = p4(position[v] - center.x);
      position[v + 1] = p4(position[v + 1] - center.y);
      position[v + 2] = p4(position[v + 2] - center.z);
    }

    parts.push({
      id: `scan-${i}`,
      name: meshes.length > 1 ? `Модель ${i + 1}` : "Модель",
      shape: "mesh",
      position: [p4(center.x), p4(center.y), p4(center.z)],
      size: [p4(Math.max(size.x, 0.01)), p4(Math.max(size.y, 0.01)), p4(Math.max(size.z, 0.01))],
      rotation: [0, 0, 0],
      color: material?.color ? `#${material.color.getHexString()}` : "#cccccc",
      material: "Сгенерированная поверхность",
      quantity: 1,
      role: "volume",
      group: "Модель",
      roughness: 0.7,
      metalness: 0.05,
      mesh: {
        position,
        normal,
        ...(index ? { index } : {}),
        ...(uv && texture ? { uv, texture } : {}),
      },
    });
    geometry.dispose();
  }
  return groundParts(parts);
}

/* ---------------- the whole pipeline ---------------- */

/**
 * Build a realistic model for `prompt` and return it as a concept that keeps
 * the block model's name, sizes and metadata. Throws `RealisticQuotaError`
 * when today's free allowance is spent; any other failure leaves the caller's
 * block model in place.
 */
export async function generateRealisticConcept(
  prompt: string,
  base: ThreeDConcept,
  options: {
    answers?: { question: string; answer: string }[];
    signal?: AbortSignal;
    onStatus: (status: RealisticStatus) => void;
  }
): Promise<ThreeDConcept> {
  options.onStatus({ stage: "image", message: "Рисуем референс для 3D…" });
  const picture = await referencePicture(prompt, options.answers ?? [], options.signal);
  const imageUrl = picture.previewUrl;
  options.onStatus({ stage: "queue", imageUrl, message: "Подключаемся к бесплатному GPU…" });

  const glb = await imageTo3D(picture.input, { signal: options.signal, onStatus: options.onStatus, imageUrl });
  options.onStatus({ stage: "convert", imageUrl, message: "Переносим модель в студию…" });

  const target = Math.max(base.dimensions.width, base.dimensions.height, base.dimensions.depth, 0.1);
  const parts = await glbToParts(glb, target);
  return {
    ...base,
    parts,
    structure: structureFromGroups(parts),
    dimensions: dimensionsOf(parts),
    source: "ai",
    description: `${base.description} Реалистичная модель построена бесплатной нейросетью TRELLIS по сгенерированному изображению.`,
  };
}
