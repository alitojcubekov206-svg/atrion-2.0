import {NextResponse} from "next/server";
import {readDesignBody} from "@/backend/design/body";
import {generationApi} from "@/backend/generation-http";
import {prepareDesignPreview, renderDesignPreview} from "@/backend/design/preview";
import {reserveGenerationQuota} from "@/backend/generation-quota";
import {modelProcurement, roomProcurement} from "@/shared/procurement";

export const runtime = "nodejs";
export async function POST(req: Request) {
  return generationApi(async userId=>{
    const plan = prepareDesignPreview(await readDesignBody(req));
    if (plan.kind === "clarification") return NextResponse.json(plan);
    const usage = await reserveGenerationQuota(userId);
    if (!usage.ok) return NextResponse.json({error: usage.error, code: usage.code}, {status: usage.status});
    try {
      const result = await renderDesignPreview(plan);
      return NextResponse.json({...result, ...(result.kind === "model" ? {procurement: modelProcurement(result)} : result.kind === "interior" ? {procurement: roomProcurement(result.scene)} : {})});
    }
    catch (error) {await usage.refund(); throw error;}
  });
}
