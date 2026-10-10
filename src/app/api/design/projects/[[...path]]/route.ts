import {NextResponse} from "next/server";
import {db} from "@/backend/db";
import {interiorApi, readDesignBody} from "@/backend/interior/http";
import {changeScene, createProject, deleteProject, enqueue, owned, restoreVersion, undoRedo, savePlan, renameProject} from "@/backend/interior/repository";
import {applyActions} from "@/backend/interior/engine";
import {parseScene} from "@/shared/interior/scene";
import {isManualPlacement} from "@/shared/interior/engine";
import {detailedScene,disposeDetailed} from "@/shared/interior/detailed";
import {detailedGlb} from "@/backend/interior/detailed-glb";
import {number, text, DesignError} from "@/shared/design/validation";
import {uploadPlan} from "@/backend/interior/plan-upload";
import {assertVisionConfigured, deletePlanFile, planDownloadUrl} from "@/backend/interior/cloudflare";
export const runtime = "nodejs";
type Context = {params: Promise<{path?: string[]}>};
async function handle(req: Request, context: Context) {
  return interiorApi(async userId => {
    const {path = []} = await context.params, [projectId, action] = path, method = req.method;
    if (path.length > 2) throw new DesignError("Маршрут не найден", 404, "NOT_FOUND");
    if (!projectId) {
      if (method === "GET") return NextResponse.json({projects: await db.designProject.findMany({where: {userId}, orderBy: {updatedAt: "desc"}, take: 100, select: {id: true, name: true, status: true, style: true, roomType: true, updatedAt: true}})});
      if (method === "POST") {const b = await readDesignBody(req); return NextResponse.json({project: await createProject(userId, text(b.name, "Название", 120), parseScene(b.scene))}, {status: 201});}
      throw new DesignError("Метод не поддерживается", 405, "METHOD_NOT_ALLOWED");
    }
    const project = await owned(projectId, userId);
    if (action === "plan" && method === "POST") {
      const revision = Number(req.headers.get("if-match"));
      if (!req.headers.has("if-match") || !Number.isInteger(revision) || revision !== project.revision) throw new DesignError("Обновите проект перед загрузкой плана", 409, "DESIGN_REVISION_CONFLICT");
      if (await db.designJob.count({where: {projectId, status: {in: ["queued", "processing"]}}})) throw new DesignError("Дождитесь текущей задачи", 409, "DESIGN_BUSY");
      const plan = await uploadPlan(req, projectId);
      try {
        const updated = await savePlan(projectId, userId, revision, plan);
        const previous = project.plan as {originalKey?: string; processedKey?: string} | null;
        const removed = await Promise.allSettled([previous?.originalKey, previous?.processedKey].filter((k): k is string => Boolean(k)).map(deletePlanFile));
        if (removed.some(r => r.status === "rejected")) console.warn("Old plan cleanup deferred", {projectId});
        return NextResponse.json({project: updated});
      }
      catch (error) {await Promise.allSettled([deletePlanFile(plan.originalKey), ...(plan.processedKey ? [deletePlanFile(plan.processedKey)] : [])]); throw error;}
    }
    if (method === "GET") {
      if (action === "plan") {const plan = project.plan as {originalKey?: string} | null; if (!plan?.originalKey) throw new DesignError("План не загружен", 404, "NOT_FOUND"); return NextResponse.json({url: await planDownloadUrl(plan.originalKey)});}
      if (!action || action === "scene") return NextResponse.json({project, job: await db.designJob.findFirst({where: {projectId, status: {in: ["queued", "processing"]}}, select: {id: true, status: true, progress: true, stage: true}})});
      if (action === "history") return NextResponse.json({versions: await db.designVersion.findMany({where: {projectId}, orderBy: {createdAt: "desc"}, take: 50, select: {id: true, parentId: true, actionType: true, source: true, createdAt: true}})});
    }
    if (method === "DELETE" && !action) {await deleteProject(projectId, userId); return NextResponse.json({deleted: true});}
    if (method === "POST" || method === "PATCH") {
      const b = await readDesignBody(req);
      if (action === "export" && method === "POST") {
        const scene = parseScene(project.scene);
        if (b.format === "glb") {const model=detailedScene(scene);try{return new Response(await detailedGlb(model) as BodyInit,{headers:{"Content-Type":"model/gltf-binary","Content-Disposition":'attachment; filename="interior.glb"'}});}finally{disposeDetailed(model);}}
        if (b.format === "json") return new Response(JSON.stringify(scene, null, 2), {headers: {"Content-Type": "application/json", "Content-Disposition": 'attachment; filename="interior.json"'}});
        throw new DesignError("Доступны GLB и JSON; PNG сохраняется из просмотрщика", 400, "EXPORT_FORMAT_UNSUPPORTED");
      }
      const revision = number(b.revision, "revision", 0, Number.MAX_SAFE_INTEGER);
      if (!Number.isInteger(revision)) throw new DesignError("Некорректная ревизия");
      if (action === "analyze-plan" && method === "POST") {
        assertVisionConfigured();
        const plan = project.plan as {processedKey?: string} | null;
        if (!plan?.processedKey) throw new DesignError("Для анализа загрузите PNG, JPEG или SVG. Из PDF сохраните нужную страницу как изображение.", 422, "DESIGN_PLAN_NEEDS_IMAGE");
        return NextResponse.json({job: await enqueue(projectId, userId, revision, {prompt: "Анализ плана", variants: 1, editing: true, analysis: true})}, {status: 202});
      }
      if (!action && method === "PATCH") {
        const name = text(b.name, "Название", 120);
        return NextResponse.json({project: await renameProject(projectId, userId, revision, name)});
      }
      if (action === "scene" && method === "PATCH") return NextResponse.json({project: await changeScene(projectId, userId, revision, s => b.actions ? applyActions(s, b) : parseScene(b.scene), "EDIT", !isManualPlacement(b.actions))});
      if (["generate", "regenerate", "assistant"].includes(action) && method === "POST") {
        const editing = action === "assistant", variants = editing ? 1 : number(b.variants ?? 1, "variants", 1, 3);
        if (!Number.isInteger(variants)) throw new DesignError("Число вариантов должно быть целым");
        const prompt = text(b.prompt, "Запрос", 1500);
        return NextResponse.json({job: await enqueue(projectId, userId, revision, {prompt, variants, editing})}, {status: 202});
      }
      if (["undo", "redo"].includes(action) && method === "POST") return NextResponse.json({project: await undoRedo(projectId, userId, revision, action === "redo")});
      if (action === "restore" && method === "POST") return NextResponse.json({project: await restoreVersion(projectId, userId, revision, text(b.versionId, "versionId"))});
      if (action === "variant" && method === "POST") {
        const job = await db.designJob.findFirst({where: {id: text(b.jobId, "jobId"), projectId, status: "completed"}});
        const result = job?.result as {variants?: {scene: unknown}[]} | null;
        const index = number(b.index, "index", 0, 2), variant = result?.variants?.[index];
        if (!variant) throw new DesignError("Вариант не найден", 404, "NOT_FOUND");
        return NextResponse.json({project: await changeScene(projectId, userId, revision, () => parseScene(variant.scene), "VARIANT")});
      }
    }
    throw new DesignError("Маршрут не найден", 404, "NOT_FOUND");
  });
}
export {handle as GET, handle as POST, handle as PATCH, handle as DELETE};
