/**
 * Realistic 3D: text → picture → coloured mesh, on Atrion's own Modal app
 * (infra/modal_realistic.py).
 *
 * The block generator draws everything with primitives, which cannot express a
 * face, hair or a dress. Here our server starts a job on Modal (TRELLIS on a
 * GPU, paid from the account's free monthly credit) and the browser polls the
 * job until the GLB is ready, then turns it into a studio mesh part. Users need
 * no account, token or quota of their own.
 *
 * Browser only: import it lazily from a client component.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { dimensionsOf, groundParts, structureFromGroups } from "@/shared/geometry";
import type { ModelPart, ThreeDConcept } from "@/shared/types";

/** A GPU job rarely needs more than two minutes, cold start included. */
const JOB_TIMEOUT_MS = 8 * 60_000;
const POLL_MS = 3_000;

export type RealisticStatus = {
  stage: "start" | "work" | "convert";
  message: string;
  /** The picture the model was built from, once it is known. */
  imageUrl?: string;
};

/** Human-readable failure; `code` mirrors the API error codes. */
export class RealisticError extends Error {
  constructor(
    message: string,
    readonly code: string = "REALISTIC_FAILED"
  ) {
    super(message);
    this.name = "RealisticError";
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** What to tell the user while the GPU works — the job reports no progress of its own. */
function progressMessage(elapsedMs: number): string {
  if (elapsedMs < 25_000) return "Запускаем GPU… (первый запуск после паузы — до минуты)";
  if (elapsedMs < 60_000) return "Рисуем референс и строим 3D-модель…";
  if (elapsedMs < 120_000) return "Почти готово: собираем поверхность и цвета…";
  return "Ещё немного — очередь или холодный старт GPU…";
}

/* ---------------- job on Modal ---------------- */

async function runJob(
  prompt: string,
  answers: { question: string; answer: string }[],
  options: { signal?: AbortSignal; onStatus: (status: RealisticStatus) => void }
): Promise<{ glb: ArrayBuffer; imageUrl: string }> {
  options.onStatus({ stage: "start", message: "Отправляем задание…" });
  const res = await fetch("/api/3d/realistic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, answers }),
    signal: options.signal,
  });
  const started = (await res.json().catch(() => ({}))) as { pollUrl?: string; error?: string; code?: string };
  if (!res.ok || !started.pollUrl) {
    throw new RealisticError(started.error ?? "Не удалось запустить реалистичную модель.", started.code);
  }

  const begin = Date.now();
  while (Date.now() - begin < JOB_TIMEOUT_MS) {
    options.onStatus({ stage: "work", message: progressMessage(Date.now() - begin) });
    await sleep(POLL_MS, options.signal);
    const poll = await fetch(started.pollUrl, { signal: options.signal }).catch(() => null);
    if (!poll?.ok) continue; // a dropped poll is retried, the job keeps running
    const data = (await poll.json()) as { status?: string; glb?: string; image?: string; error?: string };
    if (data.status === "done" && data.glb) {
      const imageUrl = data.image ? `data:image/jpeg;base64,${data.image}` : "";
      return { glb: base64ToBytes(data.glb).buffer as ArrayBuffer, imageUrl };
    }
    if (data.status === "error") {
      console.warn("Realistic job failed", data.error);
      throw new RealisticError("GPU не смог построить модель. Попробуйте переформулировать или повторить.");
    }
  }
  throw new RealisticError("GPU слишком долго не отвечает. Попробуйте ещё раз чуть позже.");
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
    const size = Math.min(1024, image.naturalWidth || 1024);
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
 * Turn a GLB into mesh parts: world transforms baked in, scaled so its
 * largest side matches `targetSize` metres, standing on y = 0. Keeps vertex
 * colours and a base-colour texture when the file has them.
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

    // getX/Y/Z undo glTF's normalised integer encoding of COLOR_0. Generated
    // models store display (sRGB) colours there, while three.js and the glTF
    // spec treat vertex colours as linear — left as-is they render washed out.
    const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
    let color: number[] | undefined;
    if (colorAttr && colorAttr.count * 3 === position.length) {
      const linear = (c: number) => p3(c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      color = new Array(colorAttr.count * 3);
      for (let v = 0; v < colorAttr.count; v++) {
        color[v * 3] = linear(colorAttr.getX(v));
        color[v * 3 + 1] = linear(colorAttr.getY(v));
        color[v * 3 + 2] = linear(colorAttr.getZ(v));
      }
    }

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
      roughness: 0.75,
      metalness: 0.02,
      mesh: {
        position,
        normal,
        ...(index ? { index } : {}),
        ...(color ? { color } : {}),
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
 * the block model's name, sizes and metadata. Throws `RealisticError` with a
 * user-facing message; the caller's block model stays as it is.
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
  const { glb, imageUrl } = await runJob(prompt, options.answers ?? [], options);
  options.onStatus({ stage: "convert", imageUrl, message: "Переносим модель в студию…" });

  const target = Math.max(base.dimensions.width, base.dimensions.height, base.dimensions.depth, 0.1);
  const parts = await glbToParts(glb, target);
  return {
    ...base,
    parts,
    structure: structureFromGroups(parts),
    dimensions: dimensionsOf(parts),
    source: "ai",
    description: `${base.description} Реалистичная модель построена нейросетью TRELLIS по сгенерированному изображению.`,
  };
}
