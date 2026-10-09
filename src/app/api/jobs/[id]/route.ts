import {NextResponse} from "next/server";
import {db} from "@/backend/db";
import {interiorApi} from "@/backend/interior/http";
import {DesignError} from "@/shared/design/validation";
export async function GET(_req: Request, context: {params: Promise<{id: string}>}) {
  return interiorApi(async userId => {
    const {id} = await context.params;
    const job = await db.designJob.findFirst({where: {id, project: {userId}}, select: {id: true, projectId: true, status: true, progress: true, stage: true, error: true, result: true, createdAt: true}});
    if (!job) throw new DesignError("Задача не найдена", 404, "NOT_FOUND");
    return NextResponse.json({job});
  });
}
