import type { ThreeDConcept } from "@/lib/types";

const TRIPO_BASE = "https://openapi.tripo3d.ai/v3";

/** Normalize Vercel/env paste: trim, strip quotes, keep tsk_ keys */
export function getTripoApiKey(): string | null {
  const raw = process.env.TRIPO_API_KEY?.trim();
  if (!raw) return null;
  const key = raw.replace(/^["']|["']$/g, "").trim();
  return key || null;
}

export function isTripoConfigured(): boolean {
  return Boolean(getTripoApiKey());
}

export function isTripoEnabled(): boolean {
  if (!isTripoConfigured()) return false;
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
    error_message?: string;
  };
  message?: string;
};

async function tripoFetch(path: string, init?: RequestInit) {
  const key = getTripoApiKey();
  if (!key) throw new Error("TRIPO_API_KEY is not set (ожидается tsk_...)");

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
      typeof data.message === "string"
        ? `Tripo ${response.status}: ${data.message}`
        : `Tripo HTTP ${response.status}`
    );
  }
  if (typeof data.code === "number" && data.code !== 0) {
    throw new Error(
      typeof data.message === "string" ? `Tripo: ${data.message}` : `Tripo code ${data.code}`
    );
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
      throw new Error(
        task.data?.error_message || task.message || `Tripo task ${status}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Tripo timed out (120s+) — кредиты/очередь?");
}

/**
 * Text → GLB via Tripo text-to-model.
 * Returns data URL when small enough; otherwise remote URL (client should blob-cache).
 */
export async function generateTripoGlb(prompt: string): Promise<{
  url: string;
  needsClientBlob: boolean;
}> {
  const model = process.env.TRIPO_MODEL?.trim() || "v3.1-20260211";

  const created = (await tripoFetch("/generation/text-to-model", {
    method: "POST",
    body: JSON.stringify({
      prompt: prompt.slice(0, 1024),
      model,
    }),
  })) as TripoCreateResponse;

  const taskId = created.data?.task_id;
  if (!taskId) throw new Error("Tripo task_id missing — проверь ключ tsk_...");

  const done = await waitForTask(taskId);
  const remoteUrl = done?.output?.pbr_model_url || done?.output?.model_url;
  if (!remoteUrl) throw new Error("Tripo model_url missing в ответе");

  const file = await fetch(remoteUrl);
  if (!file.ok) throw new Error(`Tripo download failed (${file.status})`);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength < 100) throw new Error("Tripo GLB empty");

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
