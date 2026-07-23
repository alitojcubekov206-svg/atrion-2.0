import type { ThreeDConcept } from "@/lib/types";

const TRIPO_BASE = "https://openapi.tripo3d.ai/v3";

export function isTripoConfigured(): boolean {
  return Boolean(process.env.TRIPO_API_KEY?.trim());
}

export function isTripoEnabled(): boolean {
  if (!isTripoConfigured()) return false;
  // Default ON when key exists; set TRIPO_ENABLED=false to disable
  return process.env.TRIPO_ENABLED !== "false";
}

type TripoCreateResponse = {
  code?: number;
  data?: { task_id?: string };
  message?: string;
};

type TripoTask = {
  code?: number;
  data?: {
    task_id?: string;
    type?: string;
    status?: string;
    progress?: number;
    output?: {
      model_url?: string;
      rendered_image_url?: string;
      pbr_model_url?: string;
    };
  };
  message?: string;
};

async function tripoFetch(path: string, init?: RequestInit) {
  const key = process.env.TRIPO_API_KEY?.trim();
  if (!key) throw new Error("TRIPO_API_KEY is not set");

  const response = await fetch(`${TRIPO_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as TripoTask & TripoCreateResponse;
  if (!response.ok) {
    throw new Error(
      typeof data.message === "string" ? data.message : `Tripo HTTP ${response.status}`
    );
  }
  if (typeof data.code === "number" && data.code !== 0) {
    throw new Error(typeof data.message === "string" ? data.message : `Tripo code ${data.code}`);
  }
  return data;
}

async function waitForTask(taskId: string, maxMs = 240_000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const task = await tripoFetch(`/tasks/${taskId}`);
    const status = task.data?.status;
    if (status === "success") return task.data;
    if (status === "failed" || status === "cancelled") {
      throw new Error(`Tripo task ${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Tripo timed out — попробуй ещё раз");
}

/**
 * Text → GLB via Tripo text-to-model.
 * Downloads the file immediately (URLs expire ~5 min) and returns a data URL.
 */
export async function generateTripoGlb(prompt: string): Promise<string> {
  const model = process.env.TRIPO_MODEL?.trim() || "v3.1-20260211";

  const created = (await tripoFetch("/generation/text-to-model", {
    method: "POST",
    body: JSON.stringify({
      prompt: prompt.slice(0, 1024),
      model,
    }),
  })) as TripoCreateResponse;

  const taskId = created.data?.task_id;
  if (!taskId) throw new Error("Tripo task_id missing");

  const done = await waitForTask(taskId);
  const remoteUrl = done?.output?.pbr_model_url || done?.output?.model_url;
  if (!remoteUrl) throw new Error("Tripo model_url missing");

  // Download before URL expires
  const file = await fetch(remoteUrl);
  if (!file.ok) throw new Error(`Tripo download failed (${file.status})`);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength < 100) throw new Error("Tripo GLB empty");
  // Cap ~4.5MB for Vercel response size; otherwise return remote URL (expires ~5 min)
  if (buffer.byteLength > 4.5 * 1024 * 1024) {
    return remoteUrl;
  }
  return `data:model/gltf-binary;base64,${buffer.toString("base64")}`;
}

export function attachMeshUrl(concept: ThreeDConcept, meshUrl: string): ThreeDConcept {
  return { ...concept, meshUrl };
}
