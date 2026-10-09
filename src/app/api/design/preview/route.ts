import {NextResponse} from "next/server";
import {designAuth, readDesignBody, designFailure} from "@/backend/design/http";
import {prepareDesignPreview, renderDesignPreview} from "@/backend/design/preview";
import {reserveGenerationQuota} from "@/backend/generation-quota";
import {modelProcurement, roomProcurement} from "@/shared/procurement";

export const runtime = "nodejs";
export async function POST(req: Request) {
  const auth = await designAuth();
  if (auth.response) return auth.response;
  try {
    const plan = prepareDesignPreview(await readDesignBody(req));
    if (plan.kind === "clarification") return NextResponse.json(plan);
    const usage = await reserveGenerationQuota(auth.userId);
    if (!usage.ok) return NextResponse.json({error: usage.error, code: usage.code}, {status: usage.status});
    try {
      const result = await renderDesignPreview(plan);
      return NextResponse.json({...result, ...(result.kind === "model" ? {procurement: modelProcurement(result)} : result.kind === "interior" ? {procurement: roomProcurement(result.scene)} : {})});
    }
    catch (error) {await usage.refund(); throw error;}
  } catch (error) {return designFailure(error);}
}
