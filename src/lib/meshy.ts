import type { ThreeDConcept } from "@/lib/types";

const MESHY_BASE = "https://api.meshy.ai/openapi/v2/text-to-3d";

export function isMeshyConfigured(): boolean {
  return Boolean(process.env.MESHY_API_KEY?.trim());
}

type MeshyCreateResponse = { result?: string };
type MeshyTask = {
  id?: string;
  status?: string;
  progress?: number;
  model_urls?: { glb?: string };
  task_error?: { message?: string };
};

async function meshyFetch(path: string, init?: RequestInit) {
  const key = process.env.MESHY_API_KEY?.trim();
  if (!key) throw new Error("MESHY_API_KEY is not set");
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : `Meshy error ${response.status}`
    );
  }
  return data;
}

async function waitForTask(taskId: string, maxMs = 180_000): Promise<MeshyTask> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const task = (await meshyFetch(`${MESHY_BASE}/${taskId}`)) as MeshyTask;
    if (task.status === "SUCCEEDED") return task;
    if (task.status === "FAILED") {
      throw new Error(task.task_error?.message || "Meshy generation failed");
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  throw new Error("Meshy timed out — попробуй ещё раз");
}

/**
 * Text → textured GLB via Meshy (preview + refine).
 * Returns signed GLB URL (time-limited).
 */
export async function generateMeshyGlb(prompt: string): Promise<string> {
  const preview = (await meshyFetch(MESHY_BASE, {
    method: "POST",
    body: JSON.stringify({
      mode: "preview",
      prompt: prompt.slice(0, 580),
      ai_model: "latest",
      should_remesh: true,
      target_formats: ["glb"],
    }),
  })) as MeshyCreateResponse;

  const previewId = preview.result;
  if (!previewId) throw new Error("Meshy preview id missing");
  await waitForTask(previewId);

  const refine = (await meshyFetch(MESHY_BASE, {
    method: "POST",
    body: JSON.stringify({
      mode: "refine",
      preview_task_id: previewId,
      target_formats: ["glb"],
    }),
  })) as MeshyCreateResponse;

  const refineId = refine.result;
  if (!refineId) throw new Error("Meshy refine id missing");
  const done = await waitForTask(refineId);
  const glb = done.model_urls?.glb;
  if (!glb) throw new Error("Meshy GLB url missing");
  return glb;
}

export function attachMeshUrl(concept: ThreeDConcept, meshUrl: string): ThreeDConcept {
  return { ...concept, meshUrl };
}
