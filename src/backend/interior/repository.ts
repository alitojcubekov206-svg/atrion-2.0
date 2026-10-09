import {Prisma, type DesignProject} from "@prisma/client";
import {db} from "@/backend/db";
import {DesignError, check} from "@/shared/design/validation";
import {parseScene, validateLayout, type InteriorScene} from "@/shared/interior/scene";
export const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type Tx = Prisma.TransactionClient;

export async function owned(projectId: string, userId: string, tx: Tx = db) {
  const project = await tx.designProject.findFirst({where: {id: projectId, userId}});
  if (!project) throw new DesignError("Проект не найден", 404, "DESIGN_NOT_FOUND");
  return project;
}
async function locked(projectId: string, userId: string, tx: Tx) {
  await tx.$queryRaw`SELECT "id" FROM "design_projects" WHERE "id" = ${projectId} AND "userId" = ${userId} FOR UPDATE`;
  return owned(projectId, userId, tx);
}
function expectRevision(project: DesignProject, revision: number) {
  if (project.revision !== revision) throw new DesignError("Проект уже изменён. Обновите сцену перед сохранением.", 409, "DESIGN_REVISION_CONFLICT");
}
async function ensureIdle(tx: Tx, projectId: string) {
  if (await tx.designJob.count({where: {projectId, status: {in: ["queued", "processing"]}}})) throw new DesignError("Дождитесь текущей генерации", 409, "DESIGN_BUSY");
}
export async function createProject(userId: string, name: string, scene: InteriorScene) {
  scene = validateLayout(scene);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    return tx.designProject.create({data: {userId, name, roomType: scene.roomType, style: scene.style, scene: json(scene)}});
  });
}
export async function saveVersion(tx: Tx, project: DesignProject, scene: InteriorScene, actionType: string, source: string) {
  const version = await tx.designVersion.create({data: {projectId: project.id, parentId: project.currentVersionId, before: project.scene as Prisma.InputJsonValue, after: json(scene), actionType, source}});
  return tx.designProject.update({where: {id: project.id}, data: {scene: json(scene), style: scene.style, roomType: scene.roomType, currentVersionId: version.id, redoIds: [], revision: {increment: 1}, status: "ready"}});
}
export async function changeScene(projectId: string, userId: string, revision: number, change: (s: InteriorScene) => InteriorScene, actionType = "EDIT") {
  return db.$transaction(async tx => {
    const p = await locked(projectId, userId, tx); expectRevision(p, revision); await ensureIdle(tx, p.id);
    const next = validateLayout(change(parseScene(p.scene)));
    if (JSON.stringify(next) === JSON.stringify(parseScene(p.scene))) return p;
    return saveVersion(tx, p, next, actionType, "user");
  });
}
export async function undoRedo(projectId: string, userId: string, revision: number, redo: boolean) {
  return db.$transaction(async tx => {
    const p = await locked(projectId, userId, tx); expectRevision(p, revision); await ensureIdle(tx, p.id);
    const stack = Array.isArray(p.redoIds) ? p.redoIds.filter((x): x is string => typeof x === "string") : [];
    const versionId = redo ? stack.pop() : p.currentVersionId;
    if (!versionId) throw new DesignError("Нет изменений для этого действия", 409, "DESIGN_HISTORY_EMPTY");
    const v = await tx.designVersion.findFirst({where: {id: versionId, projectId}});
    check(v && (!redo || v.parentId === p.currentVersionId), "Версия недоступна");
    if (!redo) stack.push(v.id);
    const scene = parseScene(redo ? v.after : v.before);
    return tx.designProject.update({where: {id: p.id}, data: {scene: json(scene), style: scene.style, roomType: scene.roomType, revision: {increment: 1}, currentVersionId: redo ? v.id : v.parentId, redoIds: stack, status: "ready"}});
  });
}
export async function restoreVersion(projectId: string, userId: string, revision: number, versionId: string) {
  const version = await db.designVersion.findFirst({where: {id: versionId, projectId, project: {userId}}});
  if (!version) throw new DesignError("Версия не найдена", 404, "DESIGN_NOT_FOUND");
  return changeScene(projectId, userId, revision, () => parseScene(version.after), "RESTORE");
}
export async function enqueue(projectId: string, userId: string, revision: number, input: {prompt: string; variants: number; editing: boolean; analysis?: boolean}) {
  return db.$transaction(async tx => {
    // Consistent lock ordering for per-user quota reservations and project changes.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const p = await locked(projectId, userId, tx); expectRevision(p, revision); await ensureIdle(tx, p.id);
    const user = await tx.user.findUniqueOrThrow({where: {id: userId}});
    const quotaDay = new Date(new Date().toISOString().slice(0, 10));
    const daily = user.aiCallsDate?.getTime() === quotaDay.getTime() ? user.aiCallsToday : 0;
    const freeCharge = !input.editing ? input.variants : 0;
    await tx.user.update({where: {id: userId}, data: {aiCallsDate: quotaDay, aiCallsToday: daily + 1, threeDGenerations: {increment: freeCharge}}});
    await tx.designProject.update({where: {id: p.id}, data: {status: input.analysis ? "analyzing" : "generating", ...(!input.analysis ? {prompt: input.prompt} : {})}});
    return tx.designJob.create({data: {projectId, type: input.analysis ? "plan-analysis" : input.editing ? "assistant" : "generation", input: json(input), baseRevision: revision, quotaDay, freeCharge}});
  });
}

export async function savePlan(projectId: string, userId: string, revision: number, plan: unknown) {
  return db.$transaction(async tx => {
    const p = await locked(projectId, userId, tx); expectRevision(p, revision); await ensureIdle(tx, p.id);
    return tx.designProject.update({where: {id: p.id}, data: {plan: json(plan), revision: {increment: 1}}});
  });
}
export async function renameProject(projectId: string, userId: string, revision: number, name: string) {
  return db.$transaction(async tx => {
    const p = await locked(projectId, userId, tx); expectRevision(p, revision); await ensureIdle(tx, p.id);
    return tx.designProject.update({where: {id: p.id}, data: {name, revision: {increment: 1}}});
  });
}
export async function failJob(jobId: string, message: string) {
  // Mark + refund in one transaction; repeated failure handling cannot double refund.
  return db.$transaction(async tx => {
    const job = await tx.designJob.findUnique({where: {id: jobId}, include: {project: true}}); if (!job) return;
    const claimed = await tx.designJob.updateMany({where: {id: jobId, refunded: false, status: {in: ["queued", "processing"]}}, data: {status: "failed", stage: "failed", error: message, refunded: true}});
    if (!claimed.count) return;
    await tx.user.updateMany({where: {id: job.project.userId, aiCallsDate: job.quotaDay, aiCallsToday: {gt: 0}}, data: {aiCallsToday: {decrement: 1}}});
    if (job.freeCharge) await tx.user.updateMany({where: {id: job.project.userId, threeDGenerations: {gte: job.freeCharge}}, data: {threeDGenerations: {decrement: job.freeCharge}}});
    await tx.designProject.update({where: {id: job.projectId}, data: {status: "failed"}});
  });
}
export async function deleteProject(projectId: string, userId: string) {
  return db.$transaction(async tx => {const p = await locked(projectId, userId, tx); await ensureIdle(tx, p.id); await tx.designProject.delete({where: {id: p.id}});});
}
