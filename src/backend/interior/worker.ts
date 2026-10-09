import {db} from "@/backend/db";
import {DesignError, record, text, number} from "@/shared/design/validation";
import {parseScene} from "@/shared/interior/scene";
import {designWithPlanner} from "./engine";
import {failJob, json, saveVersion} from "./repository";
import {primaryTextProvider, requestTextJSON} from "@/backend/text-ai";
import {analyzePlanImage, getPlanFile} from "./cloudflare";
import {prepareInteriorScene} from "./request";

/** Durable queue claimed with an atomic compare-and-set; safe across multiple workers. */
export async function runDesignJob(): Promise<boolean> {
  const stale = await db.designJob.findMany({where: {status: {in: ["queued", "processing"]}, updatedAt: {lt: new Date(Date.now() - 10 * 60_000)}}, select: {id: true}, take: 20});
  for (const job of stale) await failJob(job.id, "Задача прервана или worker недоступен. Квота возвращена.");
  const job = await db.designJob.findFirst({where: {status: "queued"}, orderBy: {createdAt: "asc"}, include: {project: true}});
  if (!job) return false;
  const claimed = await db.designJob.updateMany({where: {id: job.id, status: "queued"}, data: {status: "processing", stage: "searching_assets", progress: 10}});
  if (!claimed.count) return true;
  try {
    if (job.type === "plan-analysis") {
      const plan = record(job.project.plan, "plan"), key = text(plan.processedKey, "processedKey", 300);
      await db.designJob.update({where: {id: job.id}, data: {stage: "analyzing_plan", progress: 25}});
      const analysis = await analyzePlanImage(await getPlanFile(key));
      await db.$transaction(async tx => {
        const done = await tx.designJob.updateMany({where: {id: job.id, status: "processing"}, data: {status: "completed", stage: "completed", progress: 100, result: json({analysis})}});
        if (!done.count) throw new Error("Job cancelled");
        const updated = await tx.designProject.updateMany({where: {id: job.projectId, revision: job.baseRevision}, data: {plan: json({...plan, analysis}), status: "draft", revision: {increment: 1}}});
        if (!updated.count) throw new Error("Revision conflict");
      });
      return true;
    }
    const input = record(job.input, "job"), prompt = text(input.prompt, "prompt", 1500), variants = number(input.variants, "variants", 1, 3), editing = input.editing === true;
    const original = prepareInteriorScene(parseScene(job.project.scene), prompt, editing);
    // Interior generation never silently opts into a paid compatible provider.
    const provider = process.env.DESIGN_TEXT_PROVIDER === "cloudflare" ? primaryTextProvider({...process.env, AI_TEXT_PROVIDER: "cloudflare"}) : null;
    if (process.env.DESIGN_TEXT_PROVIDER === "cloudflare" && !provider) throw new DesignError("Текстовый Cloudflare AI не настроен", 503, "DESIGN_AI_NOT_CONFIGURED");
    const deadline = Date.now() + 120_000;
    const scenes: Awaited<ReturnType<typeof designWithPlanner>>[] = [];
    for (let i = 0; i < variants; i++) {
      await db.designJob.update({where: {id: job.id}, data: {progress: 15 + Math.round(i * 65 / variants), stage: "placing_furniture"}});
      const base = editing ? original : {...original, objects: original.objects.filter(o => o.locked)};
      const generated = await designWithPlanner(base, prompt, editing, i, provider ? async (system, user) => {
        const remaining = deadline - Date.now(); if (remaining < 1000) throw new Error("deadline");
        return requestTextJSON(provider, system, user, {timeoutMs: Math.min(30_000, remaining), maxTokens: 4096});
      } : undefined);
      scenes.push(generated);
    }
    await db.$transaction(async tx => {
      const p = await tx.designProject.findUniqueOrThrow({where: {id: job.projectId}});
      if (p.revision !== job.baseRevision) throw new DesignError("Сцена изменилась во время генерации. Квота возвращена.", 409, "DESIGN_REVISION_CONFLICT");
      const claimed = await tx.designJob.updateMany({where: {id: job.id, status: "processing"}, data: {status: "completed", progress: 100, stage: "completed", result: json({variants: scenes})}});
      if (!claimed.count) throw new Error("Job cancelled");
      await saveVersion(tx, p, scenes[0].scene, editing ? "ASSISTANT" : "GENERATE", scenes[0].source);
    });
  } catch (error) {
    const message = error instanceof DesignError ? error.message : "Не удалось создать дизайн. Квота возвращена.";
    console.error("Design job failed", {jobId: job.id, kind: error instanceof Error ? error.name : "UnknownError"});
    await failJob(job.id, message);
  }
  return true;
}
